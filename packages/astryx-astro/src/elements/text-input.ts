/**
 * `<ax-text-input>` — the bordered box of TextInput (light DOM, wraps the server markup).
 * Port of the behaviour in @astryxdesign/core TextInput/TextInput.tsx (handleChange,
 * handleClear, onEnter/IME guard), hooks/useInputContainer.ts and utils/ime.ts.
 *
 *  - a click on the box's chrome focuses the input (not on the clear/status buttons, not
 *    while selecting text, not while disabled);
 *  - every edit dispatches `astryx-change` `{value, event}`; the clear button (shown while
 *    there is a value) empties the input, fires a native `input` event and `astryx-change`,
 *    and keeps focus in the field (its pointerdown never blurs the input);
 *  - Enter dispatches `astryx-enter` unless an IME is composing (#6082) or the field is
 *    disabled (runtime/disabledInteraction cancels Enter on aria-disabled controls, so a
 *    disabled field never submits its form);
 *  - a form reset restores the default value and re-syncs the clear button.
 * Disabled / read-only state is read from the input (`aria-disabled`, `readOnly`) each time,
 * so an InputGroup's disabled stamp needs nothing extra.
 */
import './runtime/disabledInteraction';
import {isImeKeyEvent} from './runtime/dom';
import {emit, forwardContainerClick, onFormReset} from './field';

export class TextInputElement extends HTMLElement {
  #input: HTMLInputElement | null = null;
  #cleanup: Array<() => void> = [];

  get input(): HTMLInputElement | null { return this.#input; }
  get value(): string { return this.#input?.value ?? ''; }
  set value(next: string) {
    if (!this.#input) return;
    this.#input.value = next;
    this.#sync();
  }

  get isDisabled(): boolean { return this.#input?.getAttribute('aria-disabled') === 'true'; }

  connectedCallback() {
    const input = this.querySelector<HTMLInputElement>(':scope > input');
    if (!input) return;
    this.#input = input;
    const click = forwardContainerClick(this, () => this.#input, () => this.isDisabled);
    const onInput = (event: Event) => {
      this.#sync();
      if (this.isDisabled) return;
      emit(this, 'astryx-change', {value: input.value, event});
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || this.isDisabled || isImeKeyEvent(event)) return;
      emit(this, 'astryx-enter', {});
    };
    const onClearDown = (event: Event) => {
      if ((event.target as Element | null)?.closest('[data-ax-input-clear]')) event.preventDefault();
    };
    const onClearClick = (event: MouseEvent) => {
      if (!(event.target as Element | null)?.closest('[data-ax-input-clear]')) return;
      this.clear(event);
    };
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKeyDown);
    this.addEventListener('pointerdown', onClearDown);
    this.addEventListener('mousedown', onClearDown);
    this.addEventListener('click', onClearClick);
    const offReset = onFormReset(input, () => this.#sync());
    this.#cleanup = [
      () => this.removeEventListener('click', click),
      () => input.removeEventListener('input', onInput),
      () => input.removeEventListener('keydown', onKeyDown),
      () => this.removeEventListener('pointerdown', onClearDown),
      () => this.removeEventListener('mousedown', onClearDown),
      () => this.removeEventListener('click', onClearClick),
      offReset,
    ];
    this.#sync();
  }

  disconnectedCallback() {
    for (const fn of this.#cleanup) fn();
    this.#cleanup = [];
  }

  /** Empty the field as the clear button does (focus returns to the input). */
  clear(event?: MouseEvent) {
    const input = this.#input;
    if (!input || this.isDisabled || input.readOnly) return;
    input.value = '';
    input.dispatchEvent(new Event('input', {bubbles: true}));
    // Focus inside the press (iOS shows its keyboard only then); keep a scrolled page put.
    if (!event || event.detail === 0) input.focus();
    else input.focus({preventScroll: true});
  }

  #sync() {
    const input = this.#input;
    if (!input) return;
    const clear = this.querySelector<HTMLButtonElement>('[data-ax-input-clear]');
    if (clear) clear.hidden = input.value === '';
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-text-input')) {
  customElements.define('ax-text-input', TextInputElement);
}

declare global {
  interface HTMLElementTagNameMap { 'ax-text-input': TextInputElement }
}
