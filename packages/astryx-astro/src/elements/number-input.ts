/**
 * `<ax-number-input>` — the bordered box of NumberInput (light DOM). Port of the state
 * machine in @astryxdesign/core NumberInput/NumberInput.tsx: draft vs committed value
 * (pendingInput / value), editable text while focused, formatted text at rest, commit on
 * blur/Enter (numberInputCommit), arrow/wheel stepping on the step grid, the held-stepper
 * repeat (STEPPER_HOLD) committing once on release, the clear button, the invalid-entry
 * alert, and the ARIA value attributes. Parsing/stepping: components/NumberInput/numberParser.ts.
 *
 * Reads its configuration from the server render: data-value, data-min, data-max, data-step,
 * data-integer, data-clearable, data-wheel, data-locale, data-format (Intl options JSON or
 * "function"), data-text (server-formatted initial text), data-invalid-text, data-readonly.
 * Disabled = the input's `aria-disabled` (also when an InputGroup stamped it).
 *
 * Port additions (APG spinbutton): PageUp/PageDown step ×10; Home/End go to min/max when set.
 * Events: `astryx-change` {value} on commit, `astryx-enter` {} on Enter.
 */
import './runtime/disabledInteraction';
import {isImeKeyEvent} from './runtime/dom';
import {emit, forwardContainerClick, onFormReset} from './field';
import {
  formatEditableNumber,
  getSteppedValue,
  parseNumberInput,
  resolveNumberInputCommit,
  type StepDirection,
} from '../components/NumberInput/numberParser';

const STEPPER_HOLD = {delayMs: 500, firstIntervalMs: 250, acceleration: 0.9, minIntervalMs: 50} as const;
const PAGE_STEPS = 10;

interface StepperHold {
  pointerId: number;
  timer: ReturnType<typeof setTimeout> | null;
  held: number | null;
  intervalMs: number;
  isFrozen: boolean;
}

const num = (v: string | null): number | null => {
  if (v == null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export class NumberInputElement extends HTMLElement {
  #input: HTMLInputElement | null = null;
  #value: number | null = null;
  #initial: number | null = null;
  #pending: string | null = null;
  #holdDraft: number | null = null;
  #focused = false;
  #hold: StepperHold | null = null;
  #clickAfterHold = false;
  #cancelledHoldPointer: number | null = null;
  #cleanup: Array<() => void> = [];

  // ── configuration ──
  get #min() { return num(this.getAttribute('data-min')); }
  get #max() { return num(this.getAttribute('data-max')); }
  get #step() { return num(this.getAttribute('data-step')); }
  get #isIntegerOnly() { return this.hasAttribute('data-integer'); }
  get #hasClear() { return this.hasAttribute('data-clearable'); }
  get #locale() { return this.getAttribute('data-locale') ?? undefined; }
  get isDisabled() { return this.#input?.getAttribute('aria-disabled') === 'true'; }
  get isReadOnly() { return this.hasAttribute('data-readonly'); }

  get input(): HTMLInputElement | null { return this.#input; }
  get value(): number | null { return this.#value; }
  set value(next: number | null) {
    this.#value = next == null || !Number.isFinite(next) ? null : next;
    this.#pending = null;
    this.#render();
  }

  stepUp() { this.#stepValue(1); }
  stepDown() { this.#stepValue(-1); }

  connectedCallback() {
    const input = this.querySelector<HTMLInputElement>(':scope > input[role="spinbutton"]');
    if (!input) return;
    this.#input = input;
    this.#value = num(this.getAttribute('data-value'));
    this.#initial = this.#value;
    const on = <K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, opts);
      this.#cleanup.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };
    const click = forwardContainerClick(this, () => this.#input, () => this.isDisabled);
    this.#cleanup.push(() => this.removeEventListener('click', click));

    on(input, 'input', () => {
      if (this.isDisabled || this.isReadOnly) return;
      this.#pending = input.value;
      this.#render();
    });
    on(input, 'focus', () => this.#onFocus());
    on(input, 'blur', () => {
      this.#commit('blur');
      this.#focused = false;
      this.#render();
    });
    on(input, 'keydown', (e) => this.#onKeyDown(e));
    on(input, 'wheel', (e) => this.#onWheel(e), {passive: false});

    // Clear button: never blurs the field; empties it (null with hasClear).
    on(this, 'pointerdown', (e) => {
      if ((e.target as Element).closest?.('[data-ax-input-clear]')) e.preventDefault();
    });
    on(this, 'mousedown', (e) => {
      if ((e.target as Element).closest?.('[data-ax-input-clear]')) e.preventDefault();
    });
    on(this, 'click', (e) => {
      if (!(e.target as Element).closest?.('[data-ax-input-clear]')) return;
      if (this.#hasClear) this.#setValue(null);
      this.#pending = null;
      this.#render();
      if (e.detail === 0) input.focus();
      else input.focus({preventScroll: true});
    });

    for (const button of this.querySelectorAll<HTMLButtonElement>('[data-ax-step]')) {
      const direction = (Number(button.getAttribute('data-ax-step')) === -1 ? -1 : 1) as StepDirection;
      on(button, 'pointerdown', (e) => {
        e.preventDefault();
        this.#startHold(direction, button, e);
      });
      on(button, 'contextmenu', (e) => this.#onStepperContextMenu(e));
      on(button, 'pointerup', (e) => this.#endHold('release', e.pointerId));
      on(button, 'pointercancel', (e) => this.#endHold('cancel', e.pointerId));
      on(button, 'lostpointercapture', (e) => this.#endHold('cancel', e.pointerId));
      on(button, 'click', (e) => {
        const isAfterHold = this.#clickAfterHold;
        this.#clickAfterHold = false;
        // A pointer's click after a held press's release steps nothing; a screen reader's does.
        if (isAfterHold && e.detail > 0) { input.focus(); return; }
        if (this.isDisabled || this.isReadOnly || !this.#canStep(direction)) return;
        input.focus();
        this.#stepValue(direction);
      });
    }
    this.#cleanup.push(onFormReset(input, () => {
      this.#cancelHold();
      this.#value = this.#initial;
      this.#pending = null;
      this.#render();
    }));
    this.#render();
  }

  disconnectedCallback() {
    this.#cancelHold();
    for (const fn of this.#cleanup) fn();
    this.#cleanup = [];
  }

  // ── derived state ──
  #format(v: number): string {
    const format = this.getAttribute('data-format');
    if (format && format !== 'function') {
      try { return new Intl.NumberFormat(this.#locale, JSON.parse(format)).format(v); } catch { /* fall through */ }
    }
    // A server-side format function only formatted the initial value.
    if (format === 'function' && v === this.#initial) return this.getAttribute('data-text') ?? String(v);
    return String(v);
  }
  #parse(text: string) {
    return parseNumberInput(text, {min: this.#min, max: this.#max, isIntegerOnly: this.#isIntegerOnly, locale: this.#locale});
  }
  #displayValue(): string {
    if (this.#holdDraft !== null) return formatEditableNumber(this.#holdDraft, this.#locale);
    if (this.#pending !== null) return this.#pending;
    if (this.#value == null) return '';
    return this.#focused ? formatEditableNumber(this.#value, this.#locale) : this.#format(this.#value);
  }
  #isInputValid(): boolean {
    if (this.#holdDraft !== null) return true;
    if (this.#pending === null || !this.#pending.trim()) return true;
    return this.#parse(this.#pending) !== null;
  }
  #valueForStepping(): number | null {
    if (this.#pending === null) return this.#value;
    if (this.#pending.trim() === '') return null;
    return this.#parse(this.#pending) ?? this.#value;
  }
  #grid(currentValue: number | null) {
    return {currentValue, min: this.#min, max: this.#max, step: this.#step, isIntegerOnly: this.#isIntegerOnly};
  }
  #nextValue(direction: StepDirection, from = this.#valueForStepping()): number | null {
    return getSteppedValue({...this.#grid(from), direction});
  }
  #canStep(direction: StepDirection): boolean {
    const base = this.#holdDraft ?? this.#valueForStepping();
    return getSteppedValue({...this.#grid(base), direction}) !== base;
  }

  #render() {
    const input = this.#input;
    if (!input) return;
    const display = this.#displayValue();
    if (input.value !== display) input.value = display;
    const valid = this.#isInputValid();
    const statusError = this.getAttribute('data-status') === 'error';
    if (statusError || !valid) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    input.toggleAttribute('data-ax-invalid', !valid);
    const alert = this.querySelector('[data-ax-number-alert]');
    const alertText = valid ? '' : (this.getAttribute('data-invalid-text') ?? '');
    if (alert && alert.textContent !== alertText) alert.textContent = alertText;
    if (this.#value == null) {
      input.removeAttribute('aria-valuenow');
      input.removeAttribute('aria-valuetext');
    } else {
      input.setAttribute('aria-valuenow', String(this.#value));
      if (this.hasAttribute('data-format')) input.setAttribute('aria-valuetext', this.#format(this.#value));
    }
    const hidden = this.querySelector<HTMLInputElement>('[data-ax-number-value]');
    if (hidden) hidden.value = this.#value == null ? '' : String(this.#value);
    const clear = this.querySelector<HTMLButtonElement>('[data-ax-input-clear]');
    if (clear) clear.hidden = this.#value == null;
    const off = this.isDisabled || this.isReadOnly;
    for (const button of this.querySelectorAll<HTMLButtonElement>('[data-ax-step]')) {
      const direction = (Number(button.getAttribute('data-ax-step')) === -1 ? -1 : 1) as StepDirection;
      if (off || !this.#canStep(direction)) button.setAttribute('aria-disabled', 'true');
      else button.removeAttribute('aria-disabled');
    }
  }

  #setValue(next: number | null) {
    if (Object.is(next, this.#value)) return;
    this.#value = next;
    emit(this, 'astryx-change', {value: next});
  }

  #commit(trigger: 'blur' | 'Enter') {
    if (this.#pending === null) return;
    if (this.isDisabled) { this.#pending = null; this.#render(); return; }
    const decision = resolveNumberInputCommit(this.#pending, {
      min: this.#min, max: this.#max, isIntegerOnly: this.#isIntegerOnly, locale: this.#locale, hasClear: this.#hasClear,
    });
    if (trigger === 'blur' || (decision.type === 'commit' && decision.didClamp)) this.#pending = null;
    if (decision.type === 'clear') {
      if (this.#hasClear && this.#value != null) this.#setValue(null);
    } else if (decision.type === 'commit' && decision.value !== this.#value) {
      this.#setValue(decision.value);
    }
    this.#render();
  }

  #stepValue(direction: StepDirection, times = 1) {
    if (this.isDisabled || this.isReadOnly) return;
    let next = this.#valueForStepping();
    for (let i = 0; i < times; i++) {
      const stepped = this.#nextValue(direction, next);
      if (stepped == null || stepped === next) break;
      next = stepped;
    }
    if (next == null) return;
    this.#pending = null;
    if (next !== this.#value) this.#setValue(next);
    this.#render();
  }

  #jumpTo(bound: number) {
    if (this.isDisabled || this.isReadOnly) return;
    const target = this.#isIntegerOnly ? (bound === this.#min ? Math.ceil(bound) : Math.floor(bound)) : bound;
    this.#pending = null;
    if (target !== this.#value) this.#setValue(target);
    this.#render();
  }

  #onFocus() {
    const input = this.#input!;
    const editableText = this.#pending ?? (this.#value == null ? '' : formatEditableNumber(this.#value, this.#locale));
    const shouldReselect = input.value.length > 0 && input.value !== editableText &&
      input.selectionStart === 0 && input.selectionEnd === input.value.length;
    this.#focused = true;
    this.#render();
    // Tab-in selected the formatted text; select the editable text that replaced it.
    if (shouldReselect) input.setSelectionRange(0, input.value.length);
  }

  #onKeyDown(e: KeyboardEvent) {
    if (this.isDisabled) return; // runtime/disabledInteraction cancels Enter (no form submit)
    // type="text" lets an IME compose: Enter/arrows then drive the candidate window.
    if (isImeKeyEvent(e)) return;
    const hasModifier = e.altKey || e.ctrlKey || e.metaKey || e.shiftKey;
    if (!hasModifier && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      this.#stepValue(e.key === 'ArrowUp' ? 1 : -1);
      return;
    }
    if (!hasModifier && (e.key === 'PageUp' || e.key === 'PageDown')) {
      e.preventDefault();
      this.#stepValue(e.key === 'PageUp' ? 1 : -1, PAGE_STEPS);
      return;
    }
    if (!hasModifier && (e.key === 'Home' || e.key === 'End')) {
      const bound = e.key === 'Home' ? this.#min : this.#max;
      if (bound == null) return; // no bound: Home/End keep moving the caret
      e.preventDefault();
      this.#jumpTo(bound);
      return;
    }
    if (e.key === 'Enter') {
      this.#commit('Enter');
      emit(this, 'astryx-enter', {});
    }
  }

  #onWheel(e: WheelEvent) {
    const input = this.#input!;
    if (this.getAttribute('data-wheel') === 'false') return;
    if (input.ownerDocument.activeElement !== input || this.isDisabled || this.isReadOnly || e.deltaY === 0 ||
      e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    this.#stepValue(e.deltaY < 0 ? 1 : -1);
  }

  // ── held stepper ──
  #cancelHold() {
    const hold = this.#hold;
    if (!hold) return;
    this.#hold = null;
    this.#cancelledHoldPointer = hold.held != null ? hold.pointerId : null;
    if (hold.timer != null) clearTimeout(hold.timer);
    this.#holdDraft = null;
    this.#render();
  }

  #startHold(direction: StepDirection, button: HTMLButtonElement, e: PointerEvent) {
    this.#clickAfterHold = false;
    if (this.#cancelledHoldPointer === e.pointerId) this.#cancelledHoldPointer = null;
    this.#cancelHold();
    if (e.button !== 0 || e.pointerType === 'touch' || !this.#canStep(direction) || this.isDisabled || this.isReadOnly) return;
    const first = this.#nextValue(direction);
    if (first == null) return;
    button.setPointerCapture(e.pointerId);
    const hold: StepperHold = {pointerId: e.pointerId, timer: null, held: null, intervalMs: STEPPER_HOLD.firstIntervalMs, isFrozen: false};
    const repeat = () => {
      if (this.isDisabled || this.isReadOnly) { hold.isFrozen = true; hold.timer = null; return; }
      const next = hold.held == null ? first : getSteppedValue({...this.#grid(hold.held), direction});
      if (next == null || next === hold.held) { hold.timer = null; return; } // at a bound
      hold.held = next;
      this.#holdDraft = next;
      this.#render();
      hold.timer = setTimeout(repeat, hold.intervalMs);
      hold.intervalMs = Math.max(STEPPER_HOLD.minIntervalMs, hold.intervalMs * STEPPER_HOLD.acceleration);
    };
    hold.timer = setTimeout(repeat, STEPPER_HOLD.delayMs);
    this.#hold = hold;
  }

  #onStepperContextMenu(e: MouseEvent) {
    const hold = this.#hold;
    if (!hold) return;
    this.#cancelHold();
    this.#cancelledHoldPointer = hold.pointerId;
    this.#clickAfterHold = true;
    void e;
  }

  #endHold(end: 'release' | 'cancel', pointerId: number) {
    const hold = this.#hold;
    if (!hold || hold.pointerId !== pointerId) {
      if (this.#cancelledHoldPointer === pointerId) {
        this.#cancelledHoldPointer = null;
        if (end === 'release') this.#clickAfterHold = true;
      }
      return;
    }
    this.#hold = null;
    if (hold.timer != null) clearTimeout(hold.timer);
    if (hold.held == null) return; // released before the first repeat: the click steps
    this.#clickAfterHold = end === 'release';
    this.#holdDraft = null;
    if (hold.isFrozen || this.isDisabled || this.isReadOnly) { this.#render(); return; }
    this.#pending = null;
    if (hold.held !== this.#value) this.#setValue(hold.held);
    this.#render();
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-number-input')) {
  customElements.define('ax-number-input', NumberInputElement);
}

declare global {
  interface HTMLElementTagNameMap { 'ax-number-input': NumberInputElement }
}
