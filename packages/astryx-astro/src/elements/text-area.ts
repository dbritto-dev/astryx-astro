/**
 * `<ax-text-area>` — the bordered box of TextArea (light DOM). Port of the behaviour in
 * @astryxdesign/core TextArea/TextArea.tsx: handleChange, the grapheme-aware counter
 * (utils/characters.ts), the counter-zone announcements (under → near ≥80% → over: "N
 * characters remaining" politely, "N characters over the limit" assertively, once per zone
 * change, never on load), `aria-invalid` while over the limit (or for an error status), and
 * useInputContainer (disabled while disabled or busy). Strings are server templates
 * (Field/clientMessages.ts) filled with Intl in the server's locale.
 * Events: `astryx-change` `{value, event}` per edit. A form reset re-syncs the counter.
 */
import {announce} from './runtime/announce';
import {emit, fillMessage, fillPlural, forwardContainerClick, formatNumber, onFormReset} from './field';
import {characterCount} from '../lib/characters';

type Zone = 'under' | 'near' | 'over';
const COUNTER_WARNING_THRESHOLD = 0.8;

export class TextAreaElement extends HTMLElement {
  #textarea: HTMLTextAreaElement | null = null;
  #zone: Zone | null = null;
  #cleanup: Array<() => void> = [];

  get textarea(): HTMLTextAreaElement | null { return this.#textarea; }
  get value(): string { return this.#textarea?.value ?? ''; }
  set value(next: string) {
    if (!this.#textarea) return;
    this.#textarea.value = next;
    this.#syncCounter();
  }
  get isDisabled(): boolean { return this.#textarea?.getAttribute('aria-disabled') === 'true'; }

  connectedCallback() {
    const textarea = this.querySelector<HTMLTextAreaElement>(':scope > textarea');
    if (!textarea) return;
    this.#textarea = textarea;
    const click = forwardContainerClick(this, () => this.#textarea, () => this.isDisabled || textarea.getAttribute('aria-busy') === 'true');
    const onInput = (event: Event) => {
      if (this.isDisabled || textarea.readOnly) return;
      const length = this.#syncCounter();
      if (length != null) this.#announceZone(length);
      emit(this, 'astryx-change', {value: textarea.value, event});
    };
    textarea.addEventListener('input', onInput);
    const offReset = onFormReset(textarea, () => this.#syncCounter());
    this.#cleanup = [() => this.removeEventListener('click', click), () => textarea.removeEventListener('input', onInput), offReset];
    this.#syncCounter();
  }

  disconnectedCallback() {
    for (const fn of this.#cleanup) fn();
    this.#cleanup = [];
  }

  get #maxLength(): number | null {
    const raw = this.getAttribute('data-max-length');
    return raw == null || raw === '' ? null : Number(raw);
  }
  get #locale(): string { return this.getAttribute('data-locale') ?? 'en'; }

  /** Update the counter and aria-invalid; returns the character count (null without a counter). */
  #syncCounter(): number | null {
    const textarea = this.#textarea;
    const maxLength = this.#maxLength;
    if (!textarea || maxLength == null) return null;
    const length = characterCount(textarea.value);
    const isOver = length > maxLength;
    const counter = this.querySelector('.astryx-text-area-counter');
    counter?.toggleAttribute('data-ax-over', isOver);
    const text = counter?.querySelector('[data-ax-counter-text]');
    if (text) {
      const filled = fillMessage(this.getAttribute('data-counter-text'), {count: formatNumber(length, this.#locale)});
      if (filled && text.textContent !== filled) text.textContent = filled;
    }
    const statusError = this.getAttribute('data-status') === 'error';
    if (statusError || isOver) textarea.setAttribute('aria-invalid', 'true');
    else textarea.removeAttribute('aria-invalid');
    return length;
  }

  #announceZone(length: number) {
    const maxLength = this.#maxLength;
    if (maxLength == null) return;
    const zone: Zone = length > maxLength ? 'over' : length >= maxLength * COUNTER_WARNING_THRESHOLD ? 'near' : 'under';
    if (zone === this.#zone) return;
    this.#zone = zone;
    if (zone === 'over') {
      const count = length - maxLength;
      announce(fillPlural(this.getAttribute('data-over-text'), this.#locale, count, {count: formatNumber(count, this.#locale)}), {politeness: 'assertive', from: this});
    } else if (zone === 'near') {
      const count = maxLength - length;
      announce(fillPlural(this.getAttribute('data-remaining-text'), this.#locale, count, {count: formatNumber(count, this.#locale)}), {politeness: 'polite', from: this});
    }
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-text-area')) {
  customElements.define('ax-text-area', TextAreaElement);
}

declare global {
  interface HTMLElementTagNameMap { 'ax-text-area': TextAreaElement }
}
