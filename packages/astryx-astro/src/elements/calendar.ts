/**
 * <ax-calendar> — the client half of Calendar (port of the state, effects and handlers of
 * @astryxdesign/core Calendar/Calendar.tsx, with hooks/useGridFocus.ts via
 * components/Calendar/gridFocus.ts). Light DOM: it wraps the server-rendered header and
 * months; every state change re-renders the months with the same pure function the server
 * used (`renderMonthsHtml`) and morphs them in place, so focused and hovered days survive.
 *
 * Reads (rendered by Calendar.astro): `data-ax-config` (JSON CalendarConfig: mode, bounds,
 * spans, layout flags, calendar system, locale, translated message templates, constraint
 * mask), `data-ax-value`, `data-ax-focus-date`, `data-ax-today`, `data-ax-today-focus`.
 * Reflects `data-ax-value` and `data-ax-focus-date`.
 *
 * API: `value`, `focusDate`, `rangeSelectionStart`, `navigateTo(iso)`, `focusDay(iso?)`,
 * `cancelRangeSelection()`, `dateConstraints`, `configure(partial)`.
 * Events (bubbling, composed): `astryx-change` (cancelable) — single `{value, valueAsDate}`,
 * range `{value: {start, end}}`; `astryx-focus-date-change` `{focusDate}`.
 */
import {announce} from './runtime/announce';
import {createGridFocus, type GridFocus} from '../components/Calendar/gridFocus';
import {morphChildren} from '../components/Calendar/morph';
import {
  calendarAddMonths,
  calendarMonthOf,
  createDateDisabled,
  fillMessage,
  formatDateLabel,
  getInitialFocusDate,
  isInCalendarMonth,
  monthYearLabel,
  navigationAvailability,
  plainDateFromISO,
  plainDateIsBefore,
  plainDateIsEqual,
  plainDateToDate,
  plainDateToISO,
  rangeAnchorOf,
  renderMonthsHtml,
  resolveKeyNavigation,
  resolveShownCalendar,
  visibleMonths,
  type CalendarConfig,
  type CalendarValue,
  type CalendarViewState,
  type DateRange,
  type ISODateString,
  type NavigationUnit,
  type PlainDate,
} from '../components/Calendar/calendarModel';
import {plainDateToday} from '../lib/date';

const DAY_BUTTON = 'button[data-date]';
const ENABLED_DAY = 'button[data-date]:not([disabled]):not([aria-disabled="true"])';

function parseValueAttr(raw: string | null): CalendarValue {
  if (!raw) return null;
  if (raw.startsWith('{')) {
    try {
      const v = JSON.parse(raw) as DateRange;
      return v && typeof v.start === 'string' && typeof v.end === 'string' ? {start: v.start, end: v.end} : null;
    } catch {
      return null;
    }
  }
  return raw;
}

const serializeValue = (v: CalendarValue) => (v == null ? null : typeof v === 'string' ? v : JSON.stringify({start: v.start, end: v.end}));

export class AxCalendar extends HTMLElement {
  #config: CalendarConfig | null = null;
  #state: CalendarViewState | null = null;
  #grids = new WeakMap<HTMLElement, GridFocus>();
  #clientConstraints: ReadonlyArray<(date: Date) => boolean> = [];
  #label = '';
  #renderQueued = false;
  #wired = false;

  connectedCallback(): void {
    if (!this.#config) this.#init();
    if (!this.#config || this.#wired) return;
    this.#wired = true;
    this.addEventListener('click', this);
    this.addEventListener('keydown', this);
    this.addEventListener('focusin', this);
    this.addEventListener('mouseover', this);
    this.addEventListener('mouseout', this);
  }

  disconnectedCallback(): void {
    if (!this.#wired) return;
    this.#wired = false;
    this.removeEventListener('click', this);
    this.removeEventListener('keydown', this);
    this.removeEventListener('focusin', this);
    this.removeEventListener('mouseover', this);
    this.removeEventListener('mouseout', this);
  }

  #init() {
    let config: CalendarConfig;
    try {
      config = JSON.parse(this.getAttribute('data-ax-config') ?? '') as CalendarConfig;
    } catch {
      return;
    }
    // The server already resolved the calendar; a browser that cannot show it shows Gregorian.
    config.calendar = resolveShownCalendar(config.calendar, 'Calendar');
    this.#config = config;
    const serverToday = this.getAttribute('data-ax-today');
    const today = plainDateToday();
    const value = parseValueAttr(this.getAttribute('data-ax-value'));
    let focusDate = plainDateFromISO((this.getAttribute('data-ax-focus-date') ?? plainDateToISO(today)) as ISODateString);
    const todayChanged = serverToday !== plainDateToISO(today);
    if (todayChanged && this.hasAttribute('data-ax-today-focus')) {
      focusDate = getInitialFocusDate({min: config.min, max: config.max, numberOfMonths: config.numberOfMonths, today, calendar: config.calendar});
    }
    this.#state = {focusDate, value, rangeSelectionStart: null, hoveredDate: null, today};
    this.#label = this.querySelector('.ax-calendar-month-label')?.textContent ?? '';
    for (const grid of this.#gridEls()) this.#gridFocus(grid).syncTabStops();
    if (todayChanged) this.#render({silent: true});
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** The selected date (single), range, or null. Setting it re-renders without an event. */
  get value(): CalendarValue {
    return this.#state?.value ?? null;
  }
  set value(next: CalendarValue) {
    if (!this.#state) return;
    this.#state.value = next && typeof next === 'object' ? {start: next.start, end: next.end} : (next || null);
    this.#render();
  }

  /** ISO date of the first visible month's first day. */
  get focusDate(): ISODateString | null {
    if (!this.#state || !this.#config) return null;
    return plainDateToISO(calendarMonthOf(this.#config.calendar, this.#state.focusDate).start);
  }
  set focusDate(iso: ISODateString | null) {
    if (iso) this.navigateTo(iso);
  }

  /** Range mode: the first pick awaiting the second, or null. */
  get rangeSelectionStart(): ISODateString | null {
    return this.#state?.rangeSelectionStart ?? null;
  }

  /** Show the month containing `iso` (Astryx handleRef.navigateTo). */
  navigateTo(iso: ISODateString): void {
    if (!this.#state) return;
    this.#state.focusDate = plainDateFromISO(iso);
    this.#render();
  }

  /** Client-side constraint functions (a date is disabled if ANY returns false). */
  get dateConstraints(): ReadonlyArray<(date: Date) => boolean> {
    return this.#clientConstraints;
  }
  set dateConstraints(fns: ReadonlyArray<(date: Date) => boolean> | null) {
    this.#clientConstraints = fns ?? [];
    this.#render();
  }

  /** Change bounds or layout after render (DateInput / DateRangeInput). */
  configure(partial: Partial<Pick<CalendarConfig, 'min' | 'max' | 'minRangeSpan' | 'maxRangeSpan' | 'numberOfMonths' | 'hasOutsideDays' | 'hasWeekNumbers' | 'hasVariableRowCount' | 'weekStartsOn'>>): void {
    if (!this.#config) return;
    Object.assign(this.#config, partial);
    this.setAttribute('data-ax-config', JSON.stringify(this.#config));
    this.#render();
  }

  /** Cancel a range selection in progress (the first pick). */
  cancelRangeSelection(): void {
    if (!this.#state?.rangeSelectionStart) return;
    this.#state.rangeSelectionStart = null;
    this.#render();
  }

  /**
   * Move focus into the grid: onto `iso` (showing its month first), else onto the current tab
   * stop of the first grid. DateInput calls this when its popover opens.
   */
  focusDay(iso?: ISODateString): void {
    if (!this.#state || !this.#config) return;
    if (iso) {
      const pd = plainDateFromISO(iso);
      const months = visibleMonths(this.#config, this.#state.focusDate);
      if (!months.some((m) => isInCalendarMonth(pd, m))) {
        this.#state.focusDate = pd;
        this.#render();
      }
      this.#focusTarget(pd);
      return;
    }
    const stop = this.querySelector<HTMLElement>(`${DAY_BUTTON}[tabindex="0"]`) ?? this.querySelector<HTMLElement>(ENABLED_DAY);
    stop?.focus();
  }

  // ── Events ────────────────────────────────────────────────────────────────

  handleEvent(event: Event): void {
    if (!this.#state || !this.#config) return;
    switch (event.type) {
      case 'click': {
        const nav = (event.target as Element).closest<HTMLButtonElement>('.astryx-calendar-nav');
        if (nav && this.contains(nav)) {
          if (!nav.disabled) this.#navigate(nav.dataset.nav === 'prev' ? -1 : 1);
          return;
        }
        const day = (event.target as Element).closest<HTMLButtonElement>(DAY_BUTTON);
        if (!day || !this.contains(day) || day.getAttribute('aria-disabled') === 'true') return;
        this.#pick(plainDateFromISO(day.dataset.date as ISODateString));
        return;
      }
      case 'keydown':
        this.#onKeyDown(event as KeyboardEvent);
        return;
      case 'focusin': {
        const grid = (event.target as Element).closest<HTMLElement>('[role="grid"]');
        if (grid && this.contains(grid)) this.#gridFocus(grid).handleFocus();
        return;
      }
      case 'mouseover':
      case 'mouseout': {
        const e = event as MouseEvent;
        const day = (e.target as Element).closest<HTMLButtonElement>(DAY_BUTTON);
        if (!day) return;
        if (e.type === 'mouseout') {
          if (e.relatedTarget instanceof Node && day.contains(e.relatedTarget)) return;
          this.#hover(null);
        } else if (day.getAttribute('aria-disabled') !== 'true') this.#hover(day.dataset.date as ISODateString);
        return;
      }
    }
  }

  #onKeyDown(e: KeyboardEvent) {
    const grid = (e.target as Element).closest<HTMLElement>('[role="grid"]');
    if (grid && this.contains(grid)) {
      this.#gridFocus(grid).handleKeyDown(e);
      if (e.defaultPrevented) return;
    }
    if (this.#config!.mode === 'range' && this.#state!.rangeSelectionStart !== null && e.key === 'Escape') {
      this.#state!.rangeSelectionStart = null;
      e.preventDefault();
      e.stopPropagation();
      this.#render();
    }
  }

  #hover(iso: ISODateString | null) {
    const state = this.#state!;
    if (state.hoveredDate === iso) return;
    state.hoveredDate = iso;
    // Only the range preview depends on the hovered day.
    if (this.#config!.mode === 'range' && state.rangeSelectionStart) this.#queueRender();
  }

  #isDisabled(): (pd: PlainDate) => boolean {
    const config = this.#config!;
    return createDateDisabled({
      min: config.min,
      max: config.max,
      maxRangeSpan: config.maxRangeSpan,
      minRangeSpan: config.minRangeSpan,
      rangeAnchor: rangeAnchorOf(config, this.#state!),
      mask: config.mask,
      dateConstraints: this.#clientConstraints.length ? this.#clientConstraints : undefined,
    });
  }

  #gridEls(): HTMLElement[] {
    return [...this.querySelectorAll<HTMLElement>('.ax-calendar-months [role="grid"]')];
  }

  #gridFocus(grid: HTMLElement): GridFocus {
    let focus = this.#grids.get(grid);
    if (!focus) {
      const focusedIso = () => (this.ownerDocument.activeElement?.getAttribute('data-date') ?? null) as ISODateString | null;
      focus = createGridFocus(grid, {
        columns: 7,
        cellSelector: '[role="gridcell"]',
        // An adjacent-month day is aria-disabled: the keyboard skips it and crosses into that
        // month through the grid edge instead (FR5).
        isCellFocusable: (cell) => cell.querySelector(ENABLED_DAY) !== null,
        getFocusTarget: (cell) => cell.querySelector<HTMLElement>('button'),
        hasRovingTabIndex: true,
        onNavigateBefore: (_column, offset) => {
          const iso = focusedIso();
          if (iso) this.#navigate(-1, iso, offset);
        },
        onNavigateAfter: (_column, offset) => {
          const iso = focusedIso();
          if (iso) this.#navigate(1, iso, offset);
        },
        // PageUp/PageDown move by a month, and with Shift by a year (APG date picker dialog).
        onPageUp: (e) => {
          const iso = focusedIso();
          if (iso) this.#navigate(-1, iso, 1, e.shiftKey ? 'years' : 'months');
        },
        onPageDown: (e) => {
          const iso = focusedIso();
          if (iso) this.#navigate(1, iso, 1, e.shiftKey ? 'years' : 'months');
        },
      });
      this.#grids.set(grid, focus);
    }
    return focus;
  }

  // ── Navigation and selection (Calendar.tsx navigateMonth, handleDayClick) ──

  #navigate(delta: number, focusedIso?: ISODateString, offset?: number, unit: NavigationUnit = 'days') {
    const config = this.#config!;
    const state = this.#state!;
    if (!focusedIso) {
      // The Previous/Next buttons move the month with no focused day.
      const months = visibleMonths(config, state.focusDate);
      const {canPrevious, canNext} = navigationAvailability(config, months);
      if ((delta < 0 && !canPrevious) || (delta > 0 && !canNext)) return;
      this.#setFocusDate(calendarAddMonths(config.calendar, months[0], delta).start);
      return;
    }
    const resolved = resolveKeyNavigation(config, state.focusDate, this.#isDisabled(), delta, focusedIso, offset, unit);
    if (!resolved) return;
    if (resolved.focusDate) this.#setFocusDate(resolved.focusDate);
    this.#focusTarget(resolved.target);
  }

  #setFocusDate(pd: PlainDate) {
    const state = this.#state!;
    state.focusDate = pd;
    this.#render();
    this.dispatchEvent(new CustomEvent('astryx-focus-date-change', {detail: {focusDate: this.focusDate}, bubbles: true, composed: true}));
  }

  /**
   * Focus the target's real day in the grid that shows its month (never an adjacent-month
   * copy); when it is disabled, that month's first enabled day; with none, any day button that
   * can take focus, so focus stays in the grid. The target becomes the grid's one tab stop.
   */
  #focusTarget(target: PlainDate) {
    const config = this.#config!;
    const months = visibleMonths(config, this.#state!.focusDate);
    const index = months.findIndex((m) => isInCalendarMonth(target, m));
    const grid = this.#gridEls()[index];
    if (!grid) return;
    const iso = plainDateToISO(target);
    const buttons = [...grid.querySelectorAll<HTMLElement>(ENABLED_DAY)];
    const button = buttons.find((b) => b.getAttribute('data-date') === iso) ?? buttons[0] ?? grid.querySelector<HTMLElement>(`${DAY_BUTTON}:not([disabled])`);
    if (!button) return;
    for (const b of grid.querySelectorAll<HTMLElement>(DAY_BUTTON)) b.tabIndex = b === button ? 0 : -1;
    button.focus();
  }

  #pick(date: PlainDate) {
    const config = this.#config!;
    const state = this.#state!;
    const iso = plainDateToISO(date);
    const label = (pd: PlainDate) => formatDateLabel(pd, config.calendar, config.locale);
    if (config.mode === 'single') {
      if (this.#emitChange({value: iso, valueAsDate: plainDateToDate(date)})) state.value = iso;
      this.#render();
      return;
    }
    if (state.rangeSelectionStart === null) {
      // First pick: nothing else about it is perceivable non-visually, so speak the progress.
      state.rangeSelectionStart = iso;
      this.#render();
      announce(fillMessage(config.messages.rangeStartAnnounce, label(date)), {from: this});
      return;
    }
    const startPd = plainDateFromISO(state.rangeSelectionStart);
    // The anchor again: a one-day range when the minimum allows it, else cancel the start.
    if (plainDateIsEqual(date, startPd) && (config.minRangeSpan ?? 1) > 1) {
      state.rangeSelectionStart = null;
      this.#render();
      announce(fillMessage(config.messages.rangeClearedAnnounce, label(date)), {from: this});
      return;
    }
    const [start, end] = plainDateIsBefore(date, startPd) ? [iso, state.rangeSelectionStart] : [state.rangeSelectionStart, iso];
    const range: DateRange = {start, end};
    state.rangeSelectionStart = null;
    if (this.#emitChange({value: range})) state.value = range;
    this.#render();
    announce(fillMessage(config.messages.rangeCompleteAnnounce, label(plainDateFromISO(start)), label(plainDateFromISO(end))), {from: this});
  }

  /** Dispatch `astryx-change`; false when a listener cancelled it (a controlled owner). */
  #emitChange(detail: Record<string, unknown>): boolean {
    return this.dispatchEvent(new CustomEvent('astryx-change', {detail, bubbles: true, composed: true, cancelable: true}));
  }

  // ── Render ────────────────────────────────────────────────────────────────

  #queueRender() {
    if (this.#renderQueued) return;
    this.#renderQueued = true;
    queueMicrotask(() => {
      this.#renderQueued = false;
      this.#render();
    });
  }

  #render({silent = false}: {silent?: boolean} = {}) {
    const config = this.#config;
    const state = this.#state;
    if (!config || !state) return;
    const container = this.querySelector<HTMLElement>('.ax-calendar-months');
    if (!container) return;
    const isDisabled = this.#isDisabled();
    morphChildren(container, renderMonthsHtml(config, state, isDisabled), {preserve: ['tabindex']});
    for (const grid of this.#gridEls()) this.#gridFocus(grid).syncTabStops();

    const months = visibleMonths(config, state.focusDate);
    const label = monthYearLabel(config, months);
    const labelEl = this.querySelector('.ax-calendar-month-label');
    if (labelEl && labelEl.textContent !== label) labelEl.textContent = label;
    // Announce the newly visible month (the label has no live semantics); never on mount.
    if (label !== this.#label) {
      this.#label = label;
      if (!silent) announce(label, {from: this});
    }
    const {canPrevious, canNext} = navigationAvailability(config, months);
    for (const nav of this.querySelectorAll<HTMLButtonElement>('.astryx-calendar-nav')) {
      const enabled = nav.dataset.nav === 'prev' ? canPrevious : canNext;
      nav.disabled = !enabled;
      nav.toggleAttribute('data-ax-disabled', !enabled);
      if (enabled) nav.removeAttribute('data-disabled');
      else nav.setAttribute('data-disabled', 'disabled');
    }
    const valueAttr = serializeValue(state.value);
    if (valueAttr == null) this.removeAttribute('data-ax-value');
    else this.setAttribute('data-ax-value', valueAttr);
    this.setAttribute('data-ax-focus-date', this.focusDate ?? '');
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-calendar')) customElements.define('ax-calendar', AxCalendar);
