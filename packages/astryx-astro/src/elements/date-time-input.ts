/**
 * `<ax-date-time-input>` — the segment row of DateTimeInput (light DOM, wraps the server
 * markup). Port of the behaviour of @astryxdesign/core DateTimeInput/DateTimeInput.tsx
 * (PointerDateTimeField: fireChange, handleDateChange, the typed date field, the calendar
 * popover, the time handlers, the preset-time combobox with useHighlightedOptionScroll,
 * handleClear, useInputContainer on the time segment). Shared logic:
 * components/DateInput/typedDate.ts, components/TimeInput/timeField.ts,
 * components/DateTimeInput/dateTimeModel.ts, components/DateInput/statusView.ts.
 *
 * API: `value`, `isOpen` (calendar), `open()`, `close()`, `clear()`, `focus()`,
 * `dateConstraints`. Event: `astryx-change` `{value: ISODateTimeString | undefined}` (cancelable).
 */
import './runtime/disabledInteraction';
import './picker-popover';
import './calendar';
import {isFocusDetached, isImeKeyEvent} from './runtime/dom';
import {announce} from './runtime/announce';
import {noteOutsideDismissal} from './runtime/layerStack';
import {emit, forwardContainerClick, onFormReset} from './field';
import {TypedDate, TypedDateField, type TypedDateConfig} from '../components/DateInput/typedDate';
import {FieldStatusView} from '../components/DateInput/statusView';
import {TimeField, nowTime, type TimeFieldConfig} from '../components/TimeInput/timeField';
import {
  closestOptionIndex,
  combineDateTime,
  normalizeDateTime,
  normalizeOptionTime,
  splitDateTime,
  timeBoundsFor,
  timeForDate,
  type DateTimeParts,
  type ISODateTimeString,
} from '../components/DateTimeInput/dateTimeModel';
import {getInitialFocusDate, resolveShownCalendar} from '../components/Calendar/calendarModel';
import {adjustTime, isTimeInRange, plainDateToISO, plainDateToday, type ISODateString, type ISOTimeString} from '../lib/date';
import type {AxCalendar} from './calendar';
import type {PickerPopoverElement} from './picker-popover';

interface DateTimeConfig {
  typed: TypedDateConfig;
  placeholder: string;
  numberOfMonths: 1 | 2;
  labels: {open: string; close: string};
  time: TimeFieldConfig;
  min?: string;
  max?: string;
  popover: string;
  listPopover?: string;
}

export class DateTimeInputElement extends HTMLElement {
  #config: DateTimeConfig | null = null;
  #dateInput: HTMLInputElement | null = null;
  #timeInput: HTMLInputElement | null = null;
  #dateSegment: HTMLElement | null = null;
  #timeSegment: HTMLElement | null = null;
  #toggle: HTMLButtonElement | null = null;
  #hidden: HTMLInputElement | null = null;
  #dateAlert: HTMLElement | null = null;
  #timeAlert: HTMLElement | null = null;
  #popover: PickerPopoverElement | null = null;
  #calendar: AxCalendar | null = null;
  #list: PickerPopoverElement | null = null;
  #listbox: HTMLElement | null = null;
  #status: FieldStatusView | null = null;
  #dateField: TypedDateField | null = null;
  #timeField: TimeField | null = null;
  #value: ISODateTimeString | undefined;
  #min: DateTimeParts = {date: undefined, time: undefined};
  #max: DateTimeParts = {date: undefined, time: undefined};
  #constraints: ReadonlyArray<(date: Date) => boolean> = [];
  /** The active option of the time list (index into the visible options), -1 for none. */
  #highlight = -1;
  /** Whether the highlight is still the one typing derived (Enter then honours typed text). */
  #highlightFollowsTyping = true;
  #cleanup: Array<() => void> = [];

  // ── API ─────────────────────────────────────────────────────────────────

  get value(): ISODateTimeString | undefined {
    return this.#value;
  }
  set value(next: string | undefined | null) {
    this.#setValue(normalizeDateTime(next));
  }

  get isOpen(): boolean {
    return this.#popover?.isOpen ?? false;
  }

  open({autoFocus = true}: {autoFocus?: boolean} = {}): void {
    if (this.#isDisabled || this.isOpen) return;
    this.#prepareCalendar();
    this.#popover?.showPicker({autoFocus});
  }

  close(): void {
    this.#popover?.hide('api');
  }

  clear(): void {
    if (this.#isDisabled) return;
    this.#fire(undefined);
    this.#dateInput?.focus();
  }

  focus(options?: FocusOptions): void {
    this.#dateInput?.focus(options);
  }

  get dateConstraints(): ReadonlyArray<(date: Date) => boolean> {
    return this.#constraints;
  }
  set dateConstraints(fns: ReadonlyArray<(date: Date) => boolean> | null) {
    this.#constraints = fns ?? [];
    if (this.#calendar) this.#calendar.dateConstraints = this.#constraints;
    this.#render();
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  connectedCallback(): void {
    if (this.#cleanup.length) return;
    let config: DateTimeConfig;
    try {
      config = JSON.parse(this.getAttribute('data-ax-config') ?? '') as DateTimeConfig;
    } catch {
      return;
    }
    const dateInput = this.querySelector<HTMLInputElement>('input[data-ax-date-input]');
    const timeInput = this.querySelector<HTMLInputElement>('input[data-ax-time-input]');
    if (!dateInput || !timeInput) return;
    config.typed.calendar = resolveShownCalendar(config.typed.calendar, 'DateTimeInput');
    this.#config = config;
    this.#dateInput = dateInput;
    this.#timeInput = timeInput;
    this.#dateSegment = this.querySelector<HTMLElement>('[data-ax-date-segment]');
    this.#timeSegment = this.querySelector<HTMLElement>('[data-ax-time-segment]');
    this.#toggle = this.querySelector<HTMLButtonElement>('[data-ax-date-toggle]');
    this.#hidden = this.querySelector<HTMLInputElement>(':scope > input[data-ax-date-time-value]');
    this.#dateAlert = this.querySelector<HTMLElement>('[data-ax-date-alert]');
    this.#timeAlert = this.querySelector<HTMLElement>('[data-ax-time-alert]');
    const doc = this.ownerDocument;
    this.#popover = doc.getElementById(config.popover) as PickerPopoverElement | null;
    this.#calendar = this.#popover?.querySelector<AxCalendar>('ax-calendar') ?? null;
    this.#list = config.listPopover ? (doc.getElementById(config.listPopover) as PickerPopoverElement | null) : null;
    this.#listbox = this.#list?.querySelector<HTMLElement>('[role="listbox"]') ?? null;
    this.#min = splitDateTime(config.min);
    this.#max = splitDateTime(config.max);
    this.#value = normalizeDateTime(this.getAttribute('data-ax-default-value'));
    const typedBoxTemplate = doc.querySelector<HTMLTemplateElement>(`template[data-ax-typed-status="${CSS.escape(this.id)}"]`);
    this.#status = new FieldStatusView({
      box: this,
      statusTargets: this.#dateSegment ? [this.#dateSegment] : [],
      input: dateInput,
      describedTargets: [timeInput],
      iconSlot: null,
      typedIconTemplate: null,
      typedBoxTemplate,
      boxAnchor: typedBoxTemplate ?? this,
    });
    this.#dateField = new TypedDateField(new TypedDate(config.typed, {constraints: () => this.#constraints}));
    this.#timeField = new TimeField(config.time);

    const on = (target: EventTarget, type: string, fn: (e: Event) => void) => {
      target.addEventListener(type, fn);
      this.#cleanup.push(() => target.removeEventListener(type, fn));
    };

    // Date segment (useTypedDateField + the calendar popover).
    on(dateInput, 'input', () => {
      const date = this.#dateField!.handleChange(dateInput.value, this.#parts.date, this.#isDisabled);
      if (date) {
        this.#changeDate(date, 'input');
        this.#calendar?.navigateTo(date);
      }
      this.#render();
    });
    on(dateInput, 'focus', () => {
      this.#dateField!.focus();
      this.#render();
    });
    on(dateInput, 'blur', () => {
      this.#dateField!.blur();
      this.#commitDate();
    });
    on(dateInput, 'click', () => {
      if (!this.#isDisabled && !this.isOpen) this.open({autoFocus: false});
    });
    on(dateInput, 'keydown', (event) => this.#onDateKeyDown(event as KeyboardEvent));
    if (this.#toggle) {
      on(this.#toggle, 'click', () => {
        if (this.#isDisabled) return;
        if (this.isOpen) this.close();
        else this.open({autoFocus: true});
      });
    }
    if (this.#calendar) {
      on(this.#calendar, 'astryx-change', (event) => {
        const e = event as CustomEvent;
        e.stopPropagation();
        if (e.target !== this.#calendar) return;
        if (this.#isDisabled) {
          e.preventDefault();
          return;
        }
        const iso = (e.detail as {value?: unknown})?.value;
        if (typeof iso !== 'string') return;
        if (!this.#changeDate(iso as ISODateString, 'calendar')) e.preventDefault();
        this.#dateField?.reset();
        this.#render();
      });
    }
    if (this.#popover) {
      const popover = this.#popover;
      on(popover, 'astryx-open-change', (event) => {
        if (event.target === popover) this.#onCalendarOpenChange((event as CustomEvent<{isOpen: boolean}>).detail.isOpen);
      });
    }

    // Time segment.
    on(timeInput, 'input', () => this.#onTimeInput());
    on(timeInput, 'focus', () => {
      if (this.#isDisabled) return;
      this.#timeField!.isFocused = true;
      this.#render();
    });
    on(timeInput, 'blur', (event) => this.#onTimeBlur(event as FocusEvent));
    on(timeInput, 'keydown', (event) => this.#onTimeKeyDown(event as KeyboardEvent));
    if (this.#list) on(timeInput, 'click', () => this.#showTimeOptions());
    if (this.#timeSegment) {
      const segment = this.#timeSegment;
      const click = forwardContainerClick(segment, () => this.#timeInput, () => this.#isDisabled);
      this.#cleanup.push(() => segment.removeEventListener('click', click));
    }
    if (this.#list && this.#listbox) {
      const list = this.#list;
      const listbox = this.#listbox;
      on(list, 'astryx-open-change', (event) => {
        if (event.target === list) this.#onListOpenChange((event as CustomEvent<{isOpen: boolean}>).detail.isOpen);
      });
      // Pointer-down commit: the input must not lose focus to the option (blur would commit first).
      on(listbox, 'pointerdown', (event) => event.preventDefault());
      on(listbox, 'mousedown', (event) => event.preventDefault());
      on(listbox, 'click', (event) => {
        const option = (event.target as Element | null)?.closest<HTMLElement>('[role="option"]');
        if (option?.dataset.time) this.#commitTimeOption(option.dataset.time as ISOTimeString);
      });
      on(listbox, 'mouseover', (event) => {
        const option = (event.target as Element | null)?.closest<HTMLElement>('[role="option"]');
        if (!option) return;
        const index = this.#visibleOptions().indexOf(option);
        // A hover highlight never scrolls.
        if (index >= 0 && index !== this.#highlight) {
          this.#highlight = index;
          this.#renderList();
        }
      });
    }

    // Clear (InputClearButton never takes focus).
    const keepFocus = (e: Event) => {
      if ((e.target as Element | null)?.closest('[data-ax-input-clear]')) e.preventDefault();
    };
    on(this, 'pointerdown', keepFocus);
    on(this, 'mousedown', keepFocus);
    on(this, 'click', (event) => {
      const e = event as MouseEvent;
      if (!(e.target as Element | null)?.closest('[data-ax-input-clear]')) return;
      this.#fire(undefined);
      if (e.detail === 0) dateInput.focus();
      else requestAnimationFrame(() => dateInput.focus({preventScroll: true}));
    });

    this.#cleanup.push(onFormReset(dateInput, () => {
      this.#dateField?.reset();
      this.#timeField!.pendingInput = null;
      this.#setValue(normalizeDateTime(this.getAttribute('data-ax-default-value')));
      this.#render();
    }));
    this.#render();
  }

  disconnectedCallback(): void {
    for (const fn of this.#cleanup.splice(0)) fn();
  }

  // ── State ───────────────────────────────────────────────────────────────

  get #isDisabled(): boolean {
    return this.#dateInput?.getAttribute('aria-disabled') === 'true';
  }

  get #parts(): DateTimeParts {
    return splitDateTime(this.#value);
  }

  get #timeBounds() {
    return timeBoundsFor(this.#parts.date, this.#min, this.#max);
  }

  get #selectedOptionTime(): ISOTimeString | undefined {
    return normalizeOptionTime(this.#parts.time, this.#config?.time.hasSeconds ?? false);
  }

  #fire(next: ISODateTimeString | undefined): boolean {
    if (this.#isDisabled) return false;
    if (!emit(this, 'astryx-change', {value: next})) return false;
    this.#setValue(next);
    return true;
  }

  #setValue(next: ISODateTimeString | undefined) {
    if (next === this.#value) return;
    const before = this.#parts.date;
    this.#value = next;
    const after = this.#parts.date;
    // A date from outside drops typed date text (not the one typing just reported).
    if (after !== before) this.#dateField?.valueChanged(after);
    if (this.#hidden) this.#hidden.value = next ?? '';
    if (this.#calendar) this.#calendar.value = after ?? null;
    this.#render();
  }

  /** handleDateChange: keep the time (or take now), clamped on a boundary day. */
  #changeDate(newDate: ISODateString, source: 'calendar' | 'input'): boolean {
    const hasSeconds = this.#config!.time.hasSeconds;
    const current = this.#parts.time ?? nowTime(hasSeconds);
    const combined = combineDateTime(newDate, timeForDate(newDate, current, this.#min, this.#max));
    const ok = combined ? this.#fire(combined) : false;
    if (source === 'calendar') this.close();
    return ok;
  }

  #commitDate() {
    const result = this.#dateField!.commit(this.#parts.date, this.#isDisabled);
    if (result.clear) {
      if (this.#value !== undefined) this.#fire(undefined);
    } else if (result.report) this.#changeDate(result.report, 'input');
    this.#render();
  }

  #onDateKeyDown(e: KeyboardEvent) {
    if (isImeKeyEvent(e)) return;
    if (e.key === 'Escape' && this.isOpen) {
      e.preventDefault();
      this.close();
    } else if (e.key === 'ArrowDown' && !this.isOpen) {
      e.preventDefault();
      if (!this.#isDisabled) this.open({autoFocus: false});
    } else if (e.key === 'Enter' && (this.#dateField!.pendingInput !== null || this.#isDisabled)) {
      e.preventDefault();
      this.#commitDate();
    }
  }

  #prepareCalendar() {
    const calendar = this.#calendar;
    const config = this.#config;
    if (!calendar || !config) return;
    const date = this.#parts.date;
    calendar.value = date ?? null;
    const focus = getInitialFocusDate({
      value: date,
      min: this.#min.date,
      max: this.#max.date,
      numberOfMonths: config.numberOfMonths,
      today: plainDateToday(),
      calendar: config.typed.calendar,
    });
    calendar.navigateTo(plainDateToISO(focus));
  }

  #onCalendarOpenChange(isOpen: boolean) {
    const input = this.#dateInput!;
    const {labels} = this.#config!;
    input.setAttribute('aria-expanded', String(isOpen));
    if (isOpen && this.#popover) input.setAttribute('aria-controls', this.#popover.id);
    else input.removeAttribute('aria-controls');
    this.#toggle?.setAttribute('aria-label', isOpen ? labels.close : labels.open);
    this.#toggle?.querySelector('.astryx-date-time-input-toggle-icon')?.setAttribute('data-state', isOpen ? 'expanded' : 'collapsed');
    // onHide: only a dismiss that left focus nowhere returns it to the date input.
    if (!isOpen && isFocusDetached(this.ownerDocument)) input.focus({preventScroll: true});
  }

  // ── Time ────────────────────────────────────────────────────────────────

  #onTimeInput() {
    if (this.#isDisabled) return;
    const field = this.#timeField!;
    const text = this.#timeInput!.value;
    field.pendingInput = text;
    const parsed = field.parse(text);
    // Typing narrows nothing: the list follows the typed value so Enter lands where expected.
    if (this.#list?.isOpen && parsed) {
      this.#highlightFollowsTyping = true;
      this.#highlight = closestOptionIndex(this.#visibleTimes(), parsed);
    }
    const {timeMin, timeMax} = this.#timeBounds;
    const {date, time} = this.#parts;
    if (parsed && isTimeInRange(parsed, timeMin, timeMax) && parsed !== time && date) this.#fire(combineDateTime(date, parsed));
    this.#render();
  }

  #onTimeBlur(e: FocusEvent) {
    const field = this.#timeField!;
    field.isFocused = false;
    // Focus leaving by any route (Tab handled elsewhere, programmatic) closes the list.
    const next = e.relatedTarget as Node | null;
    if (this.#list?.isOpen && !(next && (this.#timeSegment?.contains(next) || this.#list.contains(next)))) {
      noteOutsideDismissal(this.ownerDocument);
      this.#list.hide('outside');
    }
    const pending = field.pendingInput;
    field.pendingInput = null;
    // An emptied time reverts (a partial datetime is never emitted).
    if (pending !== null && pending.trim()) {
      const parsed = field.parse(pending);
      const {timeMin, timeMax} = this.#timeBounds;
      const {date, time} = this.#parts;
      if (parsed && isTimeInRange(parsed, timeMin, timeMax) && parsed !== time && date) this.#fire(combineDateTime(date, parsed));
    }
    this.#render();
  }

  #onTimeKeyDown(e: KeyboardEvent) {
    // A disabled or busy field steps nothing; an IME candidate window uses the arrows.
    if (isImeKeyEvent(e) || this.#isDisabled) return;
    const list = this.#list;
    if (list) {
      if (e.key === 'Escape' && list.isOpen) {
        e.preventDefault();
        list.hide('escape');
        return;
      }
      if (e.key === 'ArrowDown' && e.altKey) {
        e.preventDefault();
        this.#showTimeOptions();
        return;
      }
      const options = this.#visibleOptions();
      if (list.isOpen && options.length > 0) {
        const active = Math.min(this.#highlight, options.length - 1);
        const move = (index: number) => {
          e.preventDefault();
          this.#highlightFollowsTyping = false;
          this.#highlight = index;
          this.#renderList();
          options[index]?.scrollIntoView({block: 'nearest'});
        };
        switch (e.key) {
          case 'ArrowDown':
            move(active < options.length - 1 ? active + 1 : active);
            return;
          case 'ArrowUp':
            move(active > 0 ? active - 1 : active);
            return;
          case 'Home':
            move(0);
            return;
          case 'End':
            move(options.length - 1);
            return;
          case 'Enter': {
            e.preventDefault();
            // Typed text wins over the highlight (it only tracks the option at or before it).
            const field = this.#timeField!;
            const typed = this.#highlightFollowsTyping && field.pendingInput !== null ? field.parse(field.pendingInput) : null;
            const option = options[active]?.dataset.time as ISOTimeString | undefined;
            if (typed) this.#commitTimeOption(typed);
            else if (option) this.#commitTimeOption(option);
            return;
          }
          case 'Tab':
            // Focus leaves; blur commits typed text as usual.
            list.hide('toggle');
            return;
          default:
            break;
        }
      }
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const config = this.#config!.time;
      const {date, time} = this.#parts;
      const current = time ?? nowTime(config.hasSeconds);
      const next = adjustTime(current, (e.key === 'ArrowUp' ? 1 : -1) * config.increment, config.hasSeconds);
      const {timeMin, timeMax} = this.#timeBounds;
      if (isTimeInRange(next, timeMin, timeMax) && date && this.#fire(combineDateTime(date, next))) {
        // Screen readers do not announce the programmatic rewrite (WCAG 4.1.2).
        announce(this.#timeField!.format(next), {from: this});
      }
    }
  }

  #visibleOptions(): HTMLElement[] {
    return [...(this.#listbox?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])].filter((o) => !o.hidden);
  }

  #visibleTimes(): ISOTimeString[] {
    return this.#visibleOptions().map((o) => o.dataset.time as ISOTimeString);
  }

  #showTimeOptions() {
    const list = this.#list;
    if (!list || this.#isDisabled || list.isOpen) return;
    this.#syncOptions();
    const times = this.#visibleTimes();
    // A min/max window narrower than the cadence survives no option: nothing to open.
    if (times.length === 0) return;
    this.#highlight = closestOptionIndex(times, this.#selectedOptionTime);
    this.#highlightFollowsTyping = true;
    // aria-activedescendant needs DOM focus on the input.
    this.#timeInput?.focus();
    list.showPicker({autoFocus: false});
    this.#renderList();
    this.#visibleOptions()[this.#highlight]?.scrollIntoView({block: 'nearest'});
  }

  /** The single commit path for a listed time: the same checks as typing it. */
  #commitTimeOption(time: ISOTimeString) {
    const {timeMin, timeMax} = this.#timeBounds;
    if (this.#isDisabled || !isTimeInRange(time, timeMin, timeMax)) return;
    this.#timeField!.pendingInput = null;
    const {date} = this.#parts;
    if (time !== this.#selectedOptionTime && date) this.#fire(combineDateTime(date, time));
    this.#list?.hide('toggle');
    this.#timeInput?.focus();
    this.#render();
  }

  #onListOpenChange(isOpen: boolean) {
    const input = this.#timeInput!;
    input.setAttribute('aria-expanded', String(isOpen));
    if (isOpen && this.#listbox) input.setAttribute('aria-controls', this.#listbox.id);
    else input.removeAttribute('aria-controls');
    if (!isOpen) this.#highlight = -1;
    this.#renderList();
  }

  /** Options outside the boundary day's time window are not offered. */
  #syncOptions() {
    if (!this.#listbox) return;
    const {timeMin, timeMax} = this.#timeBounds;
    const selected = this.#selectedOptionTime;
    for (const option of this.#listbox.querySelectorAll<HTMLElement>('[role="option"]')) {
      const time = option.dataset.time as ISOTimeString;
      option.hidden = !isTimeInRange(time, timeMin, timeMax);
      option.setAttribute('aria-selected', String(time === selected));
    }
  }

  #renderList() {
    const list = this.#list;
    const input = this.#timeInput;
    if (!list || !input) return;
    this.#syncOptions();
    const options = this.#visibleOptions();
    // A list that empties or a field that locks while open closes.
    if (list.isOpen && (options.length === 0 || this.#isDisabled)) {
      list.hide('api');
      return;
    }
    const active = Math.min(this.#highlight, options.length - 1);
    for (const option of this.#listbox!.querySelectorAll<HTMLElement>('[role="option"]')) option.removeAttribute('data-ax-highlighted');
    const current = list.isOpen && active >= 0 ? options[active] : null;
    current?.setAttribute('data-ax-highlighted', '');
    if (current) input.setAttribute('aria-activedescendant', current.id);
    else input.removeAttribute('aria-activedescendant');
  }

  // ── Render ──────────────────────────────────────────────────────────────

  #render() {
    const config = this.#config;
    const dateInput = this.#dateInput;
    const timeInput = this.#timeInput;
    const dateField = this.#dateField;
    const timeField = this.#timeField;
    if (!config || !dateInput || !timeInput || !dateField || !timeField) return;
    const isDisabled = this.#isDisabled;
    const {date, time} = this.#parts;

    const view = dateField.view(date, isDisabled, true);
    if (dateInput.value !== view.displayValue) dateInput.value = view.displayValue;
    const datePlaceholder = view.formatHint ?? config.placeholder;
    if (dateInput.placeholder !== datePlaceholder) dateInput.placeholder = datePlaceholder;
    dateInput.toggleAttribute('data-ax-invalid', view.isInvalid);
    this.#status?.apply(view.typedStatus, view.isInvalid);
    if (this.#dateAlert && this.#dateAlert.textContent !== view.alertMessage) this.#dateAlert.textContent = view.alertMessage;

    const timeDisplay = timeField.displayValue(time);
    if (timeInput.value !== timeDisplay) timeInput.value = timeDisplay;
    const timePlaceholder = timeField.placeholder(time);
    if (timeInput.placeholder !== timePlaceholder) timeInput.placeholder = timePlaceholder;
    const {timeMin, timeMax} = this.#timeBounds;
    const isTimeValid = timeField.isValid(timeMin, timeMax);
    timeInput.toggleAttribute('data-ax-invalid', !isTimeValid);
    const callerError = this.#timeSegment?.getAttribute('data-status') === 'error';
    if (callerError || !isTimeValid) timeInput.setAttribute('aria-invalid', 'true');
    else timeInput.removeAttribute('aria-invalid');
    const timeAlert = isTimeValid ? '' : config.time.invalid;
    if (this.#timeAlert && this.#timeAlert.textContent !== timeAlert) this.#timeAlert.textContent = timeAlert;

    const clear = this.querySelector<HTMLButtonElement>('.ax-input-clear-slot [data-ax-input-clear]');
    if (clear) clear.hidden = this.#value === undefined;
    this.#renderList();
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-date-time-input')) {
  customElements.define('ax-date-time-input', DateTimeInputElement);
}

declare global {
  interface HTMLElementTagNameMap { 'ax-date-time-input': DateTimeInputElement }
}
