/**
 * `<ax-time-input>` — the bordered box of TimeInput (light DOM, wraps the server markup).
 * Port of the behaviour of @astryxdesign/core TimeInput/TimeInput.tsx (TimeField:
 * handleInputChange, handleFocus, handleBlur, handleInputKeyDown, handleClear,
 * preventDisabledEnter) and hooks/useInputContainer.ts; the typed-entry state is
 * components/TimeInput/timeField.ts.
 *
 * Reads (TimeInput.astro): `data-ax-config` (locale, resolved hour format, seconds, increment,
 * min/max, placeholder, hint, invalid text), `data-ax-default-value`. Disabled state is read
 * from the input (`aria-disabled`) each time, so an InputGroup's disabled stamp needs nothing.
 *
 * API: `value`, `clear()`, `focus()`, `stepUp()`, `stepDown()`.
 * Event: `astryx-change` `{value: ISOTimeString | undefined}` (cancelable).
 */
import './runtime/disabledInteraction';
import {isImeKeyEvent} from './runtime/dom';
import {announce} from './runtime/announce';
import {emit, forwardContainerClick, onFormReset} from './field';
import {TimeField, type TimeFieldConfig} from '../components/TimeInput/timeField';
import {isoTimeOf, parseISOTime, type ISOTimeString, type TimeValue} from '../lib/date';

interface TimeInputConfig extends TimeFieldConfig {
  min?: ISOTimeString;
  max?: ISOTimeString;
}

const toValue = (v: unknown): ISOTimeString | undefined => {
  const time = isoTimeOf(v as TimeValue | null | undefined);
  return typeof time === 'string' && parseISOTime(time) ? time : undefined;
};

export class TimeInputElement extends HTMLElement {
  #config: TimeInputConfig | null = null;
  #input: HTMLInputElement | null = null;
  #hidden: HTMLInputElement | null = null;
  #alert: HTMLElement | null = null;
  #field: TimeField | null = null;
  #value: ISOTimeString | undefined;
  #cleanup: Array<() => void> = [];

  get value(): ISOTimeString | undefined {
    return this.#value;
  }
  /** Set with `HH:MM[:SS]` or a `Temporal.PlainTime`. */
  set value(next: TimeValue | undefined | null) {
    this.#setValue(toValue(next));
  }

  get isDisabled(): boolean {
    return this.#input?.getAttribute('aria-disabled') === 'true';
  }

  clear(): void {
    if (this.isDisabled) return;
    this.#fire(undefined);
    this.#input?.focus();
  }

  focus(options?: FocusOptions): void {
    this.#input?.focus(options);
  }

  stepUp(): void {
    this.#step(1);
  }

  stepDown(): void {
    this.#step(-1);
  }

  connectedCallback(): void {
    if (this.#cleanup.length) return;
    const input = this.querySelector<HTMLInputElement>(':scope > input.ax-input-native');
    if (!input) return;
    try {
      this.#config = JSON.parse(this.getAttribute('data-ax-config') ?? '') as TimeInputConfig;
    } catch {
      return;
    }
    this.#input = input;
    this.#hidden = this.querySelector<HTMLInputElement>(':scope > input[data-ax-time-value]');
    this.#alert = this.querySelector<HTMLElement>(':scope > [data-ax-time-alert]');
    this.#field = new TimeField(this.#config);
    this.#value = toValue(this.getAttribute('data-ax-default-value'));

    const on = (target: EventTarget, type: string, fn: (e: Event) => void) => {
      target.addEventListener(type, fn);
      this.#cleanup.push(() => target.removeEventListener(type, fn));
    };
    on(input, 'input', () => {
      // Never natively disabled (AST-085 FR1): guard value mutation (readonly blocks typing too).
      if (this.isDisabled) return;
      const {min, max} = this.#config!;
      const time = this.#field!.handleChange(input.value, this.#value, min, max);
      if (time) this.#fire(time);
      this.#render();
    });
    on(input, 'focus', () => {
      // A disabled input stays focusable but presents no editing affordance (no hint).
      if (this.isDisabled) return;
      this.#field!.isFocused = true;
      this.#render();
    });
    on(input, 'blur', () => {
      const field = this.#field!;
      field.isFocused = false;
      const {min, max} = this.#config!;
      const result = field.commit(this.#value, this.isDisabled, min, max);
      if (result.clear) this.#fire(undefined);
      else if (result.report) this.#fire(result.report);
      this.#render();
    });
    on(input, 'keydown', (event) => {
      const e = event as KeyboardEvent;
      // Enter in a focused disabled field would submit a surrounding form.
      if (this.isDisabled && e.key === 'Enter') e.preventDefault();
      // An IME candidate window uses the same arrows.
      if (isImeKeyEvent(e) || this.isDisabled) return;
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        this.#step(e.key === 'ArrowUp' ? 1 : -1);
      }
    });
    // A click on the box chrome (icon, padding, status) focuses the input.
    const click = forwardContainerClick(this, () => this.#input, () => this.isDisabled);
    this.#cleanup.push(() => this.removeEventListener('click', click));
    // The clear button never takes focus from the input.
    const keepFocus = (e: Event) => {
      if ((e.target as Element | null)?.closest('[data-ax-input-clear]')) e.preventDefault();
    };
    on(this, 'pointerdown', keepFocus);
    on(this, 'mousedown', keepFocus);
    on(this, 'click', (event) => {
      const e = event as MouseEvent;
      if (!(e.target as Element | null)?.closest('[data-ax-input-clear]')) return;
      this.#fire(undefined);
      if (e.detail === 0) input.focus();
      else requestAnimationFrame(() => input.focus({preventScroll: true}));
    });
    this.#cleanup.push(onFormReset(input, () => {
      this.#field!.pendingInput = null;
      this.#setValue(toValue(this.getAttribute('data-ax-default-value')));
      this.#render();
    }));
    this.#render();
  }

  disconnectedCallback(): void {
    for (const fn of this.#cleanup.splice(0)) fn();
  }

  #step(direction: 1 | -1) {
    const config = this.#config;
    const field = this.#field;
    if (!config || !field || this.isDisabled) return;
    const next = field.step(direction, this.#value, config.increment, config.min, config.max);
    if (!next) return;
    this.#fire(next);
    // Stepping rewrites a plain textbox programmatically, which screen readers do not
    // announce: speak the new value (WCAG 4.1.2).
    announce(field.format(next), {from: this});
  }

  #fire(next: ISOTimeString | undefined): boolean {
    if (!emit(this, 'astryx-change', {value: next})) return false;
    this.#setValue(next);
    return true;
  }

  #setValue(next: ISOTimeString | undefined) {
    if (next === this.#value) return;
    this.#value = next;
    if (this.#hidden) this.#hidden.value = next ?? '';
    this.#render();
  }

  #render() {
    const input = this.#input;
    const field = this.#field;
    const config = this.#config;
    if (!input || !field || !config) return;
    const display = field.displayValue(this.#value);
    if (input.value !== display) input.value = display;
    const placeholder = field.placeholder(this.#value);
    if (input.placeholder !== placeholder) input.placeholder = placeholder;
    const isValid = field.isValid(config.min, config.max);
    input.toggleAttribute('data-ax-invalid', !isValid);
    if (this.getAttribute('data-status') === 'error' || !isValid) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    const alert = isValid ? '' : config.invalid;
    if (this.#alert && this.#alert.textContent !== alert) this.#alert.textContent = alert;
    const clear = this.querySelector<HTMLButtonElement>(':scope > .ax-input-clear-slot [data-ax-input-clear]');
    if (clear) clear.hidden = !this.#value;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-time-input')) {
  customElements.define('ax-time-input', TimeInputElement);
}

declare global {
  interface HTMLElementTagNameMap { 'ax-time-input': TimeInputElement }
}
