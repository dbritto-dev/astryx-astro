/**
 * Field family client helpers + two delegated document behaviours (installed once on import).
 *
 * Ports of @astryxdesign/core hooks/useInputContainer.ts, hooks/useClickableContainer.ts
 * (interactive-descendant and text-selection guards), the description click forwarding of
 * Field/FieldLabel.tsx and Layer/useTouchTrigger.ts useTapStop (label info icon).
 *
 *  - `[data-ax-field-description="<control id>"]`: a click forwards to the control the way the
 *    label does — text-like inputs / textareas are focused, popup triggers and other controls
 *    are clicked — unless it lands on nested interactive content, text is being selected, or
 *    the field uses horizontal labels (Astryx renders that description as plain Text).
 *  - `[data-ax-label-tip]`: a touch tap on the label's info icon opens the help (tooltip
 *    runtime) without activating the label's control; a mouse click keeps the native activation.
 *
 * Helpers for the input elements: `forwardContainerClick`, `emit`, `onFormReset`,
 * `fillMessage` (server-rendered message templates, see Field/clientMessages.ts).
 */
import {getLastPointerType} from './runtime/modality';
import {globalSingleton} from './runtime/global';

export const INTERACTIVE_SELECTOR = [
  'button', 'a', 'input', 'select', 'textarea', '[role="button"]', '[role="link"]', '[role="checkbox"]',
  '[role="radio"]', '[role="switch"]', '[role="tab"]', '[role="menuitem"]', '[role="option"]',
  '[role="combobox"]', '[role="listbox"]', '[role="slider"]', '[role="spinbutton"]', '[data-pressable-container]',
].join(',');

/** Whether `el` sits in (or is) interactive content nested inside `root` (or a layer surface). */
export function hasInteractiveAncestor(el: Element, root: Element): boolean {
  let node: Element | null = el;
  while (node && node !== root && node !== node.ownerDocument.body) {
    if ((node.matches(INTERACTIVE_SELECTOR) && !node.matches('[aria-readonly="true"]')) || node.hasAttribute('data-astryx-layer-root')) return true;
    node = node.parentElement;
  }
  return false;
}

export function hasTextSelection(node: Element): boolean {
  const selection = node.ownerDocument.getSelection();
  return !!selection && !selection.isCollapsed && node.contains(selection.anchorNode);
}

const FOCUS_INPUT_TYPES = new Set(['text', 'password', 'email', 'number', 'search', 'tel', 'url', 'date', 'datetime-local', 'month', 'time', 'week']);
const HASPOPUP = new Set(['true', 'menu', 'listbox', 'tree', 'grid', 'dialog']);

/** useInputContainer's activation: focus text entry, click popup triggers and everything else. */
export function activateControl(control: HTMLElement): void {
  const popup = control.getAttribute('role') === 'combobox' || HASPOPUP.has(control.getAttribute('aria-haspopup') ?? '');
  if (popup) control.click();
  else if (control instanceof HTMLInputElement && FOCUS_INPUT_TYPES.has(control.type)) control.focus();
  else if (control instanceof HTMLTextAreaElement) control.focus();
  else control.click();
}

/**
 * A click on the control box's chrome (padding, icons, units, status glyph) goes to its
 * control. Returns the listener so the element can remove it on disconnect.
 */
export function forwardContainerClick(
  container: HTMLElement,
  getControl: () => HTMLElement | null,
  isDisabled: () => boolean,
): (event: MouseEvent) => void {
  const listener = (event: MouseEvent) => {
    if (isDisabled() || hasTextSelection(container)) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target !== container && hasInteractiveAncestor(target, container)) return;
    const control = getControl();
    if (control) activateControl(control);
  };
  container.addEventListener('click', listener);
  return listener;
}

/** Dispatch a bubbling, composed `astryx-<name>` CustomEvent. */
export function emit<T>(target: EventTarget, name: string, detail: T): boolean {
  return target.dispatchEvent(new CustomEvent(name, {detail, bubbles: true, composed: true, cancelable: true}));
}

/**
 * Run `callback` after the owning form has been reset (the `reset` event fires before the
 * browser restores the defaults). Returns the cleanup.
 */
export function onFormReset(control: HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement, callback: () => void): () => void {
  // The form is resolved per event: the control may have moved, or use a `form` attribute.
  const listener = (event: Event) => {
    if (control.form == null || event.target !== control.form) return;
    setTimeout(callback, 0);
  };
  const doc = control.ownerDocument;
  doc.addEventListener('reset', listener, true);
  return () => doc.removeEventListener('reset', listener, true);
}

/**
 * Fill a server-rendered message template. Placeholders are `⁣name⁣` runs the
 * server inserted where ICU arguments go (Field/clientMessages.ts); plural templates are a
 * JSON map `{category: template}` chosen with Intl.PluralRules in the server's locale.
 */
export function fillMessage(template: string | null | undefined, values: Record<string, string>): string {
  if (!template) return '';
  return template.replace(/⁣([a-zA-Z]+)⁣/g, (_, name: string) => values[name] ?? '');
}

export function fillPlural(templates: string | null | undefined, locale: string, count: number, values: Record<string, string>): string {
  if (!templates) return '';
  let map: Record<string, string>;
  try { map = JSON.parse(templates); } catch { return ''; }
  let category = 'other';
  try { category = new Intl.PluralRules(locale).select(count); } catch { /* keep other */ }
  return fillMessage(map[category] ?? map.other, values);
}

export function formatNumber(value: number, locale: string, options?: Intl.NumberFormatOptions): string {
  try { return new Intl.NumberFormat(locale, options).format(value); } catch { return String(value); }
}

// ── Delegated behaviours ────────────────────────────────────────────────────
/** Documents with the delegated listener, page-wide (shared by every copy of this module). */
const installed = globalSingleton('field', () => new WeakSet<Document>());

function onDocumentClick(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const tip = target.closest('[data-ax-label-tip]');
  if (tip && getLastPointerType(target.ownerDocument) === 'touch') {
    // useTapStop: the tap asks for the help only; it does not activate the label's control.
    event.preventDefault();
    return;
  }

  const description = target.closest<HTMLElement>('[data-ax-field-description]');
  if (!description || description.closest('[data-form-direction="horizontal-labels"], [data-layout="horizontal-labels"]')) return;
  if (hasTextSelection(description)) return;
  if (target !== description && hasInteractiveAncestor(target, description)) return;
  const id = description.getAttribute('data-ax-field-description');
  const control = id ? description.ownerDocument.getElementById(id) : null;
  // Like the label itself: an aria-disabled control still takes focus (its own guards hold).
  if (!control || (control as HTMLInputElement).disabled) return;
  activateControl(control);
}

export function installFieldBehaviors(doc: Document = document): void {
  if (installed.has(doc)) return;
  installed.add(doc);
  doc.addEventListener('click', onDocumentClick);
}

if (typeof document !== 'undefined') installFieldBehaviors(document);
