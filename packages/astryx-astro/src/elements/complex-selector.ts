/**
 * `<ax-complex-selector>` — ComplexSelector's control box (or, with a caller trigger, a
 * `display: contents` wrapper around it). Port of the behaviour in @astryxdesign/core
 * ComplexSelector/ComplexSelector.tsx: ArrowDown opens the closed trigger, a press on the
 * box's chrome goes through the trigger, the value and its commit boundary (blocked while
 * disabled, also from an open popup), the chevron state, the imperative handle.
 *
 * The popup is an `<ax-popover>` (runtime/popover.ts): `popover="auto"` light dismiss, Escape
 * through the shared stack, initial focus into the content, Tab containment (`aria-modal`),
 * focus return, `aria-expanded` on the trigger (`data-ax-popover-trigger`).
 *
 * Commit protocol (content is caller markup, see components/ComplexSelector):
 *   [data-ax-commit="<json|text>"] click → commit; [data-ax-commit-label] → trigger text;
 *   [data-ax-close] click → close; `astryx-commit` {value, label?, close?} from the content;
 *   `el.commit(value, {label, close})`.
 */
import './runtime/disabledInteraction';
import './runtime/popover';
import {PopoverElement} from './runtime/popover';
import {emit, hasTextSelection} from './field';

const Base: typeof HTMLElement = typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement;

export interface CommitOptions {
  /** New trigger text. */
  label?: string;
  /** Close the popup after committing. @default false */
  close?: boolean;
}

function parseValue(raw: string | null): unknown {
  if (raw == null) return undefined;
  try { return JSON.parse(raw); } catch { return raw; }
}

const sameValue = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

export class ComplexSelectorElement extends Base {
  #value: unknown = undefined;
  #cleanup: Array<() => void> = [];

  get layer(): PopoverElement | null {
    const id = this.getAttribute('data-ax-layer');
    const el = id ? this.ownerDocument.getElementById(id) : null;
    return el instanceof PopoverElement ? el : null;
  }

  get trigger(): HTMLElement | null {
    return this.querySelector<HTMLElement>('[data-ax-complex-trigger]');
  }

  get content(): HTMLElement | null {
    const id = this.getAttribute('data-ax-content');
    return id ? this.ownerDocument.getElementById(id) : null;
  }

  get isDisabled(): boolean {
    return this.hasAttribute('data-ax-disabled') || this.trigger?.getAttribute('aria-disabled') === 'true';
  }

  get isOpen(): boolean { return this.layer?.isOpen ?? false; }

  get value(): unknown { return this.#value; }
  set value(next: unknown) { this.#setValue(next); }

  open(): void {
    if (this.isDisabled || this.isOpen) return;
    this.layer?.show({source: this.trigger, reason: 'api'});
  }

  close(): void { this.layer?.hide('api'); }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  /** Commit a value from the content (Astryx's `onChange` helper); `close` hides the popup. */
  commit(value: unknown, options: CommitOptions = {}): void {
    // The availability is read now, not when the popup opened (Astryx isDisabledRef).
    if (this.isDisabled) return;
    this.#setValue(value);
    if (options.label != null) this.#setLabel(options.label);
    emit(this, 'astryx-change', {value});
    if (options.close) this.close();
  }

  connectedCallback(): void {
    this.#value = parseValue(this.getAttribute('data-ax-value'));
    const trigger = this.trigger;
    const layer = this.layer;
    const content = this.content;
    const cleanup: Array<() => void> = [];
    if (trigger) {
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'ArrowDown' || event.defaultPrevented || this.isOpen || this.isDisabled) return;
        event.preventDefault();
        this.open();
      };
      // The press that light-dismissed the popup (on the label or the box) never reopens it.
      const onClick = (event: MouseEvent) => { if (layer?.wasJustDismissed()) event.preventDefault(); };
      trigger.addEventListener('keydown', onKeyDown);
      trigger.addEventListener('click', onClick);
      cleanup.push(() => trigger.removeEventListener('keydown', onKeyDown), () => trigger.removeEventListener('click', onClick));
    }
    if (!this.hasAttribute('data-ax-custom-trigger')) {
      // A press elsewhere in the control box goes through the trigger (caller onClick included).
      const onBoxClick = (event: MouseEvent) => {
        const target = event.target as Element | null;
        if (!target || !trigger || trigger.contains(target)) return;
        if (this.isDisabled) { event.stopPropagation(); return; }
        // The status info-tip is its own control: it shows the message without opening.
        if (target.closest('[data-ax-complex-status] button, [popover]') || hasTextSelection(this) || layer?.wasJustDismissed()) return;
        trigger.click();
      };
      this.addEventListener('click', onBoxClick);
      cleanup.push(() => this.removeEventListener('click', onBoxClick));
    }
    if (layer) {
      const onOpenChange = (event: Event) => {
        if (event.target !== layer) return;
        const {isOpen} = (event as CustomEvent<{isOpen: boolean}>).detail;
        this.querySelector('.ax-complex-selector-chevron')?.setAttribute('data-state', isOpen ? 'expanded' : 'collapsed');
      };
      layer.addEventListener('astryx-open-change', onOpenChange);
      cleanup.push(() => layer.removeEventListener('astryx-open-change', onOpenChange));
    }
    if (content) {
      const onContentClick = (event: MouseEvent) => {
        const target = event.target as Element | null;
        if (!target || event.defaultPrevented) return;
        const committer = target.closest<HTMLElement>('[data-ax-commit]');
        const closer = target.closest<HTMLElement>('[data-ax-close]');
        if (committer && content.contains(committer) && committer.getAttribute('aria-disabled') !== 'true') {
          this.commit(parseValue(committer.getAttribute('data-ax-commit')), {
            label: committer.getAttribute('data-ax-commit-label') ?? undefined,
          });
        }
        if (closer && content.contains(closer)) this.close();
      };
      const onCommit = (event: Event) => {
        const detail = (event as CustomEvent<{value: unknown} & CommitOptions>).detail ?? {value: undefined};
        event.stopPropagation();
        this.commit(detail.value, {label: detail.label, close: detail.close});
      };
      content.addEventListener('click', onContentClick);
      content.addEventListener('astryx-commit', onCommit);
      cleanup.push(() => content.removeEventListener('click', onContentClick), () => content.removeEventListener('astryx-commit', onCommit));
      this.#syncCommitTargets();
    }
    this.#cleanup = cleanup;
  }

  disconnectedCallback(): void {
    for (const fn of this.#cleanup) fn();
    this.#cleanup = [];
  }

  #setValue(value: unknown) {
    this.#value = value;
    if (value === undefined) this.removeAttribute('data-ax-value');
    else this.setAttribute('data-ax-value', JSON.stringify(value));
    this.#syncCommitTargets();
  }

  #setLabel(label: string) {
    const slot = this.querySelector<HTMLElement>('[data-ax-trigger-label]');
    if (!slot) return;
    slot.textContent = label;
    this.toggleAttribute('data-ax-placeholder', label === '');
    if (label === '') {
      const tpl = this.querySelector<HTMLTemplateElement>(':scope > template[data-ax-placeholder-template]');
      if (tpl) slot.textContent = tpl.content.textContent ?? '';
    }
  }

  /** Commit targets with a pressed/checked/selected state follow the value. */
  #syncCommitTargets() {
    const content = this.content;
    if (!content) return;
    for (const el of content.querySelectorAll<HTMLElement>('[data-ax-commit]')) {
      const isCurrent = sameValue(parseValue(el.getAttribute('data-ax-commit')), this.#value);
      for (const name of ['aria-pressed', 'aria-checked', 'aria-selected']) {
        if (el.hasAttribute(name)) el.setAttribute(name, String(isCurrent));
      }
    }
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-complex-selector')) {
  customElements.define('ax-complex-selector', ComplexSelectorElement);
}

declare global {
  interface HTMLElementTagNameMap { 'ax-complex-selector': ComplexSelectorElement }
}
