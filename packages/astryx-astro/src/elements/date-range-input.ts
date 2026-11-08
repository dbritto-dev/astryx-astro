/**
 * `<ax-date-range-input>` — the bordered box of DateRangeInput (light DOM, wraps the server
 * markup). Port of the behaviour of @astryxdesign/core DateRangeInput/DateRangeInput.tsx
 * (fireChange, handleRangeSelect, handleClear, the presets, the popover's open state on the
 * trigger); helpers in components/DateRangeInput/rangeModel.ts.
 *
 * The trigger and the icon button open the `popover="auto"` layer natively (`popovertarget`);
 * this element prepares the calendar before it shows (the value's month, no pick in progress:
 * Astryx mounts the Calendar on open), syncs `aria-expanded` / `aria-controls` and the toggle
 * label, commits picks and presets, and keeps the trigger text, the presets' current state
 * and the hidden form inputs in step with the value.
 *
 * API: `value`, `isOpen`, `open()`, `close()`, `clear()`, `focus()`, `dateConstraints`.
 * Event: `astryx-change` `{value: DateRange | null}` (cancelable).
 */
import './runtime/disabledInteraction';
import './picker-popover';
import './calendar';
import {emit, onFormReset} from './field';
import {formatRangeDisplay, isRangeEqual, toRange, type DateRange, type DateRangeValue} from '../components/DateRangeInput/rangeModel';
import {getInitialFocusDate, resolveShownCalendar} from '../components/Calendar/calendarModel';
import {plainDateToISO, plainDateToday, type CalendarSystem, type ISODateString} from '../lib/date';
import type {AxCalendar} from './calendar';
import type {PickerPopoverElement} from './picker-popover';

interface RangeConfig {
  locale: string;
  calendar: CalendarSystem;
  min?: ISODateString;
  max?: ISODateString;
  numberOfMonths: 1 | 2;
  label: string;
  placeholder: string;
  ariaLabel: string | null;
  labels: {open: string; close: string};
}

function parseRange(raw: string | null): DateRange | null {
  if (!raw) return null;
  try {
    return toRange(JSON.parse(raw));
  } catch {
    return null;
  }
}

export class DateRangeInputElement extends HTMLElement {
  #config: RangeConfig | null = null;
  #trigger: HTMLButtonElement | null = null;
  #toggle: HTMLButtonElement | null = null;
  #popover: PickerPopoverElement | null = null;
  #calendar: AxCalendar | null = null;
  #value: DateRange | null = null;
  #cleanup: Array<() => void> = [];

  get value(): DateRange | null {
    return this.#value ? {...this.#value} : null;
  }
  /** Set with ISO dates or `Temporal.PlainDate`s; reads back ISO strings. */
  set value(next: DateRangeValue | null | undefined) {
    this.#setValue(toRange(next));
  }

  get isOpen(): boolean {
    return this.#popover?.isOpen ?? false;
  }

  open(): void {
    if (this.#isDisabled || this.isOpen) return;
    this.#popover?.showPicker({autoFocus: true, source: this.#trigger});
  }

  close(): void {
    this.#popover?.hide('api');
  }

  clear(): void {
    if (this.#isDisabled) return;
    this.#fire(null);
    this.#trigger?.focus();
  }

  focus(options?: FocusOptions): void {
    this.#trigger?.focus(options);
  }

  get dateConstraints(): ReadonlyArray<(date: Date) => boolean> {
    return this.#calendar?.dateConstraints ?? [];
  }
  set dateConstraints(fns: ReadonlyArray<(date: Date) => boolean> | null) {
    if (this.#calendar) this.#calendar.dateConstraints = fns ?? [];
  }

  connectedCallback(): void {
    if (this.#cleanup.length) return;
    try {
      this.#config = JSON.parse(this.getAttribute('data-ax-config') ?? '') as RangeConfig;
    } catch {
      return;
    }
    this.#config.calendar = resolveShownCalendar(this.#config.calendar, 'DateRangeInput');
    this.#trigger = this.querySelector<HTMLButtonElement>(':scope > [data-ax-range-trigger]');
    this.#toggle = this.querySelector<HTMLButtonElement>(':scope > [data-ax-range-toggle]');
    const popoverId = this.getAttribute('data-ax-popover');
    this.#popover = popoverId ? (this.ownerDocument.getElementById(popoverId) as PickerPopoverElement | null) : null;
    this.#calendar = this.#popover?.querySelector<AxCalendar>('ax-calendar') ?? null;
    this.#value = parseRange(this.getAttribute('data-ax-default-value'));
    const trigger = this.#trigger;
    if (!trigger) return;

    const on = (target: EventTarget, type: string, fn: (e: Event) => void) => {
      target.addEventListener(type, fn);
      this.#cleanup.push(() => target.removeEventListener(type, fn));
    };
    // The clear button never takes focus from the trigger.
    const keepFocus = (e: Event) => {
      if ((e.target as Element | null)?.closest('[data-ax-input-clear]')) e.preventDefault();
    };
    on(this, 'pointerdown', keepFocus);
    on(this, 'mousedown', keepFocus);
    on(this, 'click', (event) => {
      const e = event as MouseEvent;
      if (!(e.target as Element | null)?.closest('[data-ax-input-clear]')) return;
      e.stopPropagation();
      this.#fire(null);
      // A keyboard press leaves focus on the button, which hides with the value: hand it on.
      if (e.detail === 0) trigger.focus();
    });
    const popover = this.#popover;
    if (popover) {
      // The Calendar mounts on open in Astryx: reopen on the value's month, no pick pending.
      on(popover, 'beforetoggle', (event) => {
        if (event.target === popover && (event as ToggleEvent).newState === 'open') this.#prepareCalendar();
      });
      on(popover, 'astryx-open-change', (event) => {
        if (event.target === popover) this.#onOpenChange((event as CustomEvent<{isOpen: boolean}>).detail.isOpen);
      });
      on(popover, 'click', (event) => {
        const preset = (event.target as Element | null)?.closest<HTMLButtonElement>('.ax-date-range-input-preset');
        if (!preset || !popover.contains(preset) || preset.getAttribute('aria-disabled') === 'true') return;
        const range = toRange({start: preset.dataset.start, end: preset.dataset.end});
        if (range) this.#select(range);
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
        const range = toRange((e.detail as {value?: unknown})?.value);
        if (range && !this.#select(range)) e.preventDefault();
      });
    }
    this.#cleanup.push(onFormReset(trigger, () => this.#setValue(parseRange(this.getAttribute('data-ax-default-value')))));
    this.#render();
  }

  disconnectedCallback(): void {
    for (const fn of this.#cleanup.splice(0)) fn();
  }

  get #isDisabled(): boolean {
    return this.#trigger?.getAttribute('aria-disabled') === 'true';
  }

  /** handleRangeSelect: commit and close; false when cancelled. */
  #select(range: DateRange): boolean {
    if (this.#isDisabled) return false;
    const ok = this.#fire(range);
    this.close();
    return ok;
  }

  #fire(next: DateRange | null): boolean {
    if (this.#isDisabled) return false;
    if (!emit(this, 'astryx-change', {value: next ? {...next} : null})) return false;
    this.#setValue(next);
    return true;
  }

  #setValue(next: DateRange | null) {
    if (isRangeEqual(next, this.#value)) return;
    this.#value = next ? {...next} : null;
    if (this.#calendar) this.#calendar.value = this.#value;
    this.#render();
  }

  #prepareCalendar() {
    const calendar = this.#calendar;
    const config = this.#config;
    if (!calendar || !config) return;
    calendar.cancelRangeSelection();
    calendar.value = this.#value;
    const focus = getInitialFocusDate({
      value: this.#value ?? undefined,
      min: config.min,
      max: config.max,
      numberOfMonths: config.numberOfMonths,
      today: plainDateToday(),
      calendar: config.calendar,
    });
    calendar.navigateTo(plainDateToISO(focus));
  }

  #onOpenChange(isOpen: boolean) {
    const trigger = this.#trigger!;
    const {labels} = this.#config!;
    trigger.setAttribute('aria-expanded', String(isOpen));
    if (isOpen && this.#popover) trigger.setAttribute('aria-controls', this.#popover.id);
    else trigger.removeAttribute('aria-controls');
    this.#toggle?.setAttribute('aria-label', isOpen ? labels.close : labels.open);
    this.#toggle?.querySelector('.astryx-date-range-input-toggle-icon')?.setAttribute('data-state', isOpen ? 'expanded' : 'collapsed');
  }

  #render() {
    const trigger = this.#trigger;
    const config = this.#config;
    if (!trigger || !config) return;
    const value = this.#value;
    const display = formatRangeDisplay(value, config.locale, config.calendar);
    const text = value ? display : config.placeholder;
    if (trigger.textContent !== text) trigger.textContent = text;
    trigger.toggleAttribute('data-ax-placeholder', !value);
    const name = config.ariaLabel ?? `${config.label}: ${text}`;
    trigger.setAttribute('aria-label', name);
    const hiddenName = this.querySelector(':scope > [data-ax-range-name]');
    if (hiddenName && hiddenName.textContent !== name) hiddenName.textContent = name;
    const clear = this.querySelector<HTMLButtonElement>(':scope > .ax-input-clear-slot [data-ax-input-clear]');
    if (clear) clear.hidden = !value;
    for (const input of this.querySelectorAll<HTMLInputElement>(':scope > input[data-ax-range-value]')) {
      input.value = (input.dataset.axRangeValue === 'end' ? value?.end : value?.start) ?? '';
    }
    for (const preset of this.#popover?.querySelectorAll<HTMLElement>('.ax-date-range-input-preset') ?? []) {
      const isActive = !!value && preset.dataset.start === value.start && preset.dataset.end === value.end;
      if (isActive) {
        preset.setAttribute('aria-current', 'true');
        preset.setAttribute('data-selected', 'selected');
      } else {
        preset.removeAttribute('aria-current');
        preset.removeAttribute('data-selected');
      }
    }
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-date-range-input')) {
  customElements.define('ax-date-range-input', DateRangeInputElement);
}

declare global {
  interface HTMLElementTagNameMap { 'ax-date-range-input': DateRangeInputElement }
}
