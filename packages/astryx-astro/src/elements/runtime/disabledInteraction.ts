/**
 * Disabled-but-focusable controls stay inert (AST-085, contract #2).
 *
 * Port of @astryxdesign/core utils/disabledInteraction.ts (disabledInteractionProps) and
 * Button's aria-disabled click/keydown guards (family:buttons FR3) as ONE capture-phase
 * document listener instead of props on every control: a click on (or inside) an
 * `aria-disabled="true"` control is cancelled and stopped before any handler runs — native
 * `disabled` dispatches no click at all — and Enter/Space keydowns are cancelled so they
 * never synthesize one (that click would reach a wrapping invoker such as a popover trigger,
 * and `popovertarget` activation is cancelled with it). Other keys (Escape, arrows, Tab) still
 * reach the control. `aria-disabled` is read at event time, so a state set later by script (a
 * runtime busy state, a group stamp) is covered too.
 *
 * Applies to controls only: native controls (`button, a, input, select, textarea, summary`),
 * focusable elements (`[tabindex]`), widget roles (`[role=button|link|checkbox|tab|…]`) and
 * any element that opts in with `data-ax-disabled-interaction` (the attribute the former
 * per-element behaviour used). An `aria-disabled` landmark or group (`role="group"`,
 * `toolbar`, `region` …) does not swallow its content's clicks.
 *
 * Import once from any component that renders `aria-disabled` controls (e.g. Thumbnail's
 * Open / Remove actions, Button with a tooltip or a busy state); it is idempotent and
 * SSR-safe.
 */
const WIDGET_ROLES = [
  'button', 'checkbox', 'combobox', 'gridcell', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'option', 'radio', 'scrollbar', 'searchbox', 'slider', 'spinbutton', 'switch', 'tab', 'textbox', 'treeitem',
];
const CONTROL = [
  'button', 'a', 'input', 'select', 'textarea', 'summary', '[tabindex]', '[data-ax-disabled-interaction]',
  ...WIDGET_ROLES.map((role) => `[role="${role}"]`),
].join(', ');
const LISTENING = Symbol.for('astryx-astro/disabled-interaction/v1');

/** The aria-disabled control `target` is in, if any. */
export function disabledControlOf(target: EventTarget | null): HTMLElement | null {
  // By node type, not `instanceof`: a target from another document's window fails this
  // window's constructor checks.
  const node = target as Node | null;
  const el = node && node.nodeType === Node.ELEMENT_NODE
    ? (node as Element).closest<HTMLElement>('[aria-disabled="true"]')
    : node?.parentElement?.closest<HTMLElement>('[aria-disabled="true"]') ?? null;
  return el && el.matches(CONTROL) ? el : null;
}

function onClick(event: MouseEvent) {
  if (!disabledControlOf(event.target)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  if (!disabledControlOf(event.target)) return;
  event.preventDefault();
}

/** Install the listeners on a document (the page's own document is installed on import). */
export function installDisabledInteraction(doc: Document = document): void {
  const holder = doc as Document & {[LISTENING]?: true};
  if (holder[LISTENING]) return;
  Object.defineProperty(holder, LISTENING, {value: true});
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('keydown', onKeyDown, true);
}

if (typeof document !== 'undefined') installDisabledInteraction(document);
