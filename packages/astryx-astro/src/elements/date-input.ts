/**
 * `<ax-date-input>` — the bordered box of DateInput (light DOM, wraps the server markup).
 * Port of the behaviour of @astryxdesign/core DateInput/DateInput.tsx (PointerDateField:
 * fireChange, handleToggle, handleInputClick, handleClear, handleDateSelect,
 * handleFieldBlur, handleInputKeyDown, the popover's onShow/onHide) and
 * DateInput/useTypedDate.ts (components/DateInput/typedDate.ts).
 *
 * Reads (DateInput.astro): `data-ax-config` (typed-date config, placeholder, labels),
 * `data-locale`, `data-ax-default-value`, the status hooks of components/DateInput/statusView.ts.
 * Children: the toggle `[data-ax-date-toggle]`, the text input, the hidden ISO input
 * `[data-ax-date-value]`, the alert region `[data-ax-date-alert]`, the clear button, the
 * `<ax-picker-popover>` with its `<ax-calendar>`.
 *
 * Disabled / busy state is read from the input (`aria-disabled`) each time, so an InputGroup's
 * disabled stamp needs nothing extra.
 *
 * API: `value`, `isOpen`, `open()`, `close()`, `clear()`, `focus()`, `dateConstraints`,
 * `formatValue`. Event: `astryx-change` `{value: ISODateString | undefined}` (cancelable).
 */
import './runtime/disabledInteraction';
import './picker-popover';
import './calendar';
import {isFocusDetached, isImeKeyEvent} from './runtime/dom';
import {noteOutsideDismissal} from './runtime/layerStack';
import {emit, onFormReset} from './field';
import {TypedDate, TypedDateField, type TypedDateConfig} from '../components/DateInput/typedDate';
import {FieldStatusView} from '../components/DateInput/statusView';
import {getInitialFocusDate, resolveShownCalendar} from '../components/Calendar/calendarModel';
import {plainDateToISO, plainDateToday, type ISODateString} from '../lib/date';
import type {AxCalendar} from './calendar';
import type {PickerPopoverElement} from './picker-popover';

interface DateInputConfig {
  typed: TypedDateConfig;
  placeholder: string;
  numberOfMonths: 1 | 2;
  labels: {open: string; close: string};
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const toValue = (v: unknown): ISODateString | undefined => (typeof v === 'string' && ISO_DATE.test(v) ? (v as ISODateString) : undefined);

export class DateInputElement extends HTMLElement {
  #config: DateInputConfig | null = null;
  #input: HTMLInputElement | null = null;
  #hidden: HTMLInputElement | null = null;
  #toggle: HTMLButtonElement | null = null;
  #popover: PickerPopoverElement | null = null;
  #calendar: AxCalendar | null = null;
  #alert: HTMLElement | null = null;
  #status: FieldStatusView | null = null;
  #field: TypedDateField | null = null;
  #value: ISODateString | undefined;
  #constraints: ReadonlyArray<(date: Date) => boolean> = [];
  #formatValue: ((value: ISODateString) => string) | null = null;
  /** Set just before a close that focus already left the field for (onHide keeps it there). */
  #isFocusMovingAway = false;
  #cleanup: Array<() => void> = [];

  // ── API ─────────────────────────────────────────────────────────────────

  /** The committed date (ISO), or undefined. Setting it emits nothing. */
  get value(): ISODateString | undefined {
    return this.#value;
  }
  set value(next: ISODateString | undefined | null) {
    this.#setValue(toValue(next));
  }

  get isOpen(): boolean {
    return this.#popover?.isOpen ?? false;
  }

  /** Open the calendar (focus moves into it unless `autoFocus` is false). */
  open({autoFocus = true}: {autoFocus?: boolean} = {}): void {
    if (this.#isDisabled || this.isOpen) return;
    this.#prepareCalendar();
    this.#popover?.showPicker({autoFocus});
  }

  close(): void {
    this.#popover?.hide('api');
  }

  /** Clear the value as the clear button does (focus returns to the input). */
  clear(): void {
    if (this.#isDisabled) return;
    this.#fire(undefined);
    this.#input?.focus();
  }

  focus(options?: FocusOptions): void {
    this.#input?.focus(options);
  }

  /** Client-side constraint functions (a date is disabled if ANY returns false). */
  get dateConstraints(): ReadonlyArray<(date: Date) => boolean> {
    return this.#constraints;
  }
  set dateConstraints(fns: ReadonlyArray<(date: Date) => boolean> | null) {
    this.#constraints = fns ?? [];
    if (this.#calendar) this.#calendar.dateConstraints = this.#constraints;
    this.#render();
  }

  /** Display function for a `format` function prop (client commits). */
  get formatValue(): ((value: ISODateString) => string) | null {
    return this.#formatValue;
  }
  set formatValue(fn: ((value: ISODateString) => string) | null) {
    this.#formatValue = fn;
    this.#render();
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  connectedCallback(): void {
    if (this.#cleanup.length) return;
    const input = this.querySelector<HTMLInputElement>(':scope > input.ax-input-native');
    let config: DateInputConfig;
    try {
      config = JSON.parse(this.getAttribute('data-ax-config') ?? '') as DateInputConfig;
    } catch {
      return;
    }
    if (!input) return;
    config.typed.calendar = resolveShownCalendar(config.typed.calendar, 'DateInput');
    this.#config = config;
    this.#input = input;
    this.#hidden = this.querySelector<HTMLInputElement>(':scope > input[data-ax-date-value]');
    this.#toggle = this.querySelector<HTMLButtonElement>(':scope > [data-ax-date-toggle]');
    this.#popover = this.querySelector<PickerPopoverElement>(':scope > ax-picker-popover');
    this.#calendar = this.#popover?.querySelector<AxCalendar>('ax-calendar') ?? null;
    this.#alert = this.querySelector<HTMLElement>(':scope > [data-ax-date-alert]');
    this.#value = toValue(this.getAttribute('data-ax-default-value'));
    const typedBoxTemplate = this.ownerDocument.querySelector<HTMLTemplateElement>(`template[data-ax-typed-status="${CSS.escape(this.id)}"]`);
    this.#status = new FieldStatusView({
      box: this,
      input,
      iconSlot: this.querySelector<HTMLElement>(':scope > [data-ax-status-slot]'),
      typedIconTemplate: this.querySelector<HTMLTemplateElement>(':scope > template[data-ax-typed-icon]'),
      typedBoxTemplate,
      boxAnchor: typedBoxTemplate ?? this,
    });
    // A `format` function ran on the server: its text stands for the server value until the
    // page sets `formatValue`; other values fall back to 'date_long'.
    const serverValue = this.#value;
    const serverText = input.value;
    const typedDate = new TypedDate(config.typed, {
      constraints: () => this.#constraints,
      formatValue: () => this.#formatValue ?? ((v: ISODateString) => (v === serverValue && serverText ? serverText : null)),
    });
    this.#field = new TypedDateField(typedDate);

    const on = <K extends keyof HTMLElementEventMap>(target: EventTarget, type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      target.addEventListener(type, fn as EventListener);
      this.#cleanup.push(() => target.removeEventListener(type, fn as EventListener));
    };
    on(input, 'input', () => this.#onInput());
    on(input, 'focus', () => {
      this.#field!.focus();
      this.#render();
    });
    on(input, 'blur', () => {
      this.#field!.blur();
      this.#commit();
    });
    on(input, 'click', () => {
      if (!this.#isDisabled && !this.isOpen) this.open({autoFocus: false});
    });
    on(input, 'keydown', (e) => this.#onKeyDown(e));
    if (this.#toggle) on(this.#toggle, 'click', () => this.#onToggle());
    on(this, 'focusout', (e) => this.#onFieldBlur(e));
    // The clear button never takes focus from the input (InputClearButton).
    const keepFocus = (e: Event) => {
      if ((e.target as Element | null)?.closest('[data-ax-input-clear]')) e.preventDefault();
    };
    on(this, 'pointerdown', keepFocus);
    on(this, 'mousedown', keepFocus);
    on(this, 'click', (e) => {
      if ((e.target as Element | null)?.closest('[data-ax-input-clear]')) this.#onClear(e);
    });
    if (this.#calendar) on(this.#calendar, 'astryx-change' as keyof HTMLElementEventMap, (e) => this.#onCalendarChange(e as unknown as CustomEvent));
    if (this.#popover) {
      on(this.#popover, 'astryx-open-change' as keyof HTMLElementEventMap, (e) => {
        if (e.target === this.#popover) this.#onOpenChange((e as unknown as CustomEvent<{isOpen: boolean}>).detail.isOpen);
      });
    }
    this.#cleanup.push(onFormReset(input, () => {
      this.#field?.reset();
      this.#setValue(toValue(this.getAttribute('data-ax-default-value')));
      this.#render();
    }));
    this.#render();
  }

  disconnectedCallback(): void {
    for (const fn of this.#cleanup.splice(0)) fn();
  }

  // ── State ───────────────────────────────────────────────────────────────

  /** aria-disabled covers isDisabled, isLoading and a disabled InputGroup. */
  get #isDisabled(): boolean {
    return this.#input?.getAttribute('aria-disabled') === 'true';
  }

  /** The Field status announces itself; inside an InputGroup the alert region speaks instead. */
  get #isStatusAnnounced(): boolean {
    return this.#status?.hasStatusBox ?? false;
  }

  /** fireChange: report the change; false when disabled or a listener cancelled it. */
  #fire(next: ISODateString | undefined): boolean {
    if (this.#isDisabled) return false;
    if (!emit(this, 'astryx-change', {value: next})) return false;
    this.#setValue(next);
    return true;
  }

  #setValue(next: ISODateString | undefined) {
    if (next === this.#value) return;
    this.#value = next;
    // A value from outside drops typed text (not the one typing just reported).
    this.#field?.valueChanged(next);
    if (this.#hidden) this.#hidden.value = next ?? '';
    if (this.#calendar) this.#calendar.value = next ?? null;
    this.#render();
  }

  #onInput() {
    const field = this.#field!;
    const date = field.handleChange(this.#input!.value, this.#value, this.#isDisabled);
    if (date) {
      this.#fire(date);
      // Typing completed a new date: show its month.
      this.#calendar?.navigateTo(date);
    }
    this.#render();
  }

  #commit() {
    const result = this.#field!.commit(this.#value, this.#isDisabled);
    if (result.clear) {
      if (this.#value !== undefined) this.#fire(undefined);
    } else if (result.report) this.#fire(result.report);
    this.#render();
  }

  #onKeyDown(e: KeyboardEvent) {
    // An IME uses Enter to commit a candidate and Escape to cancel it.
    if (isImeKeyEvent(e)) return;
    if (e.key === 'Escape' && this.isOpen) {
      e.preventDefault();
      this.close();
    } else if (e.key === 'ArrowDown' && !this.isOpen) {
      // APG combobox: ArrowDown (and Alt+ArrowDown) opens the calendar, focus stays here.
      e.preventDefault();
      if (!this.#isDisabled) this.open({autoFocus: false});
    } else if (e.key === 'Enter' && (this.#field!.pendingInput !== null || this.#isDisabled)) {
      // Typed text holds Enter back, or a form would submit the value from before the commit.
      e.preventDefault();
      this.#commit();
    }
  }

  #onToggle() {
    if (this.#isDisabled) return;
    if (this.isOpen) this.close();
    else this.open({autoFocus: true});
  }

  #onClear(e: MouseEvent) {
    this.#fire(undefined);
    if (!e || e.detail === 0) this.#input?.focus();
    // Past the button's own task so touch browsers don't jump the page scroll.
    else requestAnimationFrame(() => this.#input?.focus({preventScroll: true}));
  }

  /** handleDateSelect */
  #onCalendarChange(e: CustomEvent) {
    // The calendar's change is this field's business; consumers hear the field's own event.
    e.stopPropagation();
    if (e.target !== this.#calendar) return;
    // An open calendar can outlive an enabled owner: reject the whole selection, focus stays.
    if (this.#isDisabled) {
      e.preventDefault();
      return;
    }
    const date = toValue((e.detail as {value?: unknown})?.value);
    if (!this.#fire(date)) e.preventDefault();
    this.#field?.reset();
    this.#render();
    this.close();
  }

  /** handleFieldBlur: a manual popover has no auto exclusivity; focus leaving closes it. */
  #onFieldBlur(e: FocusEvent) {
    const next = e.relatedTarget as Node | null;
    if (!this.isOpen || next == null) return;
    if (this.contains(next) || this.#popover?.contains(next)) return;
    this.#isFocusMovingAway = true;
    noteOutsideDismissal(this.ownerDocument);
    this.close();
  }

  #onOpenChange(isOpen: boolean) {
    const input = this.#input!;
    const labels = this.#config!.labels;
    input.setAttribute('aria-expanded', String(isOpen));
    if (isOpen && this.#popover) input.setAttribute('aria-controls', this.#popover.id);
    else input.removeAttribute('aria-controls');
    this.#toggle?.setAttribute('aria-label', isOpen ? labels.close : labels.open);
    this.#toggle?.querySelector('.astryx-date-input-toggle-icon')?.setAttribute('data-state', isOpen ? 'expanded' : 'collapsed');
    // A bottom sheet is modal: focus moves into it, onto the calendar's focus day.
    if (isOpen && this.#popover?.getAttribute('data-ax-surface') === 'bottom-sheet') this.#calendar?.focusDay();
    if (isOpen) return;
    // onHide: return focus to the input only when the dismiss left focus nowhere.
    const isFocusMovingAway = this.#isFocusMovingAway;
    this.#isFocusMovingAway = false;
    if (!isFocusMovingAway && isFocusDetached(this.ownerDocument)) input.focus({preventScroll: true});
  }

  /** The calendar mounts on open in Astryx: it opens on the current value's month. */
  #prepareCalendar() {
    const calendar = this.#calendar;
    const config = this.#config;
    if (!calendar || !config) return;
    calendar.value = this.#value ?? null;
    const focus = getInitialFocusDate({
      value: this.#value,
      min: config.typed.min,
      max: config.typed.max,
      numberOfMonths: config.numberOfMonths,
      today: plainDateToday(),
      calendar: config.typed.calendar,
    });
    calendar.navigateTo(plainDateToISO(focus));
  }

  #render() {
    const input = this.#input;
    const field = this.#field;
    const config = this.#config;
    if (!input || !field || !config) return;
    const isDisabled = this.#isDisabled;
    const view = field.view(this.#value, isDisabled, this.#isStatusAnnounced);
    if (input.value !== view.displayValue) input.value = view.displayValue;
    const placeholder = view.formatHint ?? config.placeholder;
    if (input.placeholder !== placeholder) input.placeholder = placeholder;
    input.toggleAttribute('data-ax-invalid', view.isInvalid);
    this.#status?.apply(view.typedStatus, view.isInvalid);
    if (this.#alert && this.#alert.textContent !== view.alertMessage) this.#alert.textContent = view.alertMessage;
    const clear = this.querySelector<HTMLButtonElement>(':scope > .ax-input-clear-slot [data-ax-input-clear]');
    if (clear) clear.hidden = this.#value === undefined;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-date-input')) {
  customElements.define('ax-date-input', DateInputElement);
}

declare global {
  interface HTMLElementTagNameMap { 'ax-date-input': DateInputElement }
}
