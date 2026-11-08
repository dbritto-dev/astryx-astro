// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Ported from @astryxdesign/core 0.7.9 (see each section for its source file).

/**
 * Calendar's pure logic, shared by the server render (Calendar.astro) and the client element
 * (src/elements/calendar.ts), so both write the same markup from one function
 * (`renderMonthsHtml`). Framework-free: `Intl` with an explicit locale and lib/date only; the
 * date math is Temporal (lib/temporal.ts), native or the `/full` polyfill on both sides, so
 * every calendar system renders the same markup on the server and in the browser.
 *
 * Ports:
 *   Calendar/getWeekdayHeaderNames.ts            → getWeekdayHeaders (verbatim)
 *   Calendar/getInitialFocusDate.ts              → getInitialFocusDate (verbatim)
 *   Calendar/dayCellUtils.ts                     → computeDayCellState … (verbatim)
 *   Calendar/hooks/useCalendarDays.ts            → layOutMonthDays / calendarDays
 *   Calendar/hooks/useCalendarConstraints.ts     → createDateDisabled
 *   i18n/useCalendarSystem.ts                    → resolveShownCalendar
 *   Calendar/Calendar.tsx                        → render (MonthGrid, DayCell), navigateMonth's
 *                                                  target resolution, labels
 */
import {characterCount} from '../../lib/characters';
import {warnOnce} from '../../lib/devWarning';
import {
  DATE_FORMAT_WITH_WEEKDAY,
  normalizeDayOfWeek,
  plainDateAddDays,
  plainDateDayOfWeek,
  plainDateDiffDays,
  plainDateFormatDayNumber,
  plainDateFromISO,
  plainDateGetWeekNumber,
  plainDateIsAfter,
  plainDateIsBefore,
  plainDateIsEqual,
  plainDateIsInRange,
  plainDateToDate,
  plainDateToISO,
  plainDateWeekFieldName,
  plainDateWeekdayNames,
  calendarAddMonths,
  calendarDayOfMonth,
  calendarMonthOf,
  calendarShiftMonths,
  calendarShiftYears,
  formatCalendarDate,
  formatCalendarMonthLabel,
  isCalendarSystem,
  isInCalendarMonth,
  type CalendarMonth,
  type CalendarSystem,
  type DateRange,
  type DayOfWeek,
  type DayOfWeekName,
  type ISODateString,
  type PlainDate,
} from '../../lib/date';
import {weekdayHeaderNamesByLocale, type WeekdayHeaderNames} from './weekdayHeaderNames.generated';

export type {CalendarSystem, DateRange, DayOfWeek, DayOfWeekName, ISODateString, PlainDate};
export type CalendarMode = 'single' | 'range';
export type CalendarValue = ISODateString | DateRange | null;
/** How a month navigation moves the focused day: by its row offset in days, or by whole calendar months or years. */
export type NavigationUnit = 'days' | 'months' | 'years';

// =============================================================================
// i18n/useCalendarSystem.ts
// =============================================================================

/**
 * The calendar a caller names: unknown → `gregory` (warns once). Every known calendar can show:
 * lib/temporal.ts is native Temporal or the `/full` polyfill, both with all of them, so the
 * port has no "this runtime lacks Temporal" fallback.
 */
export function resolveShownCalendar(calendar: string, source: string): CalendarSystem {
  if (isCalendarSystem(calendar)) return calendar;
  warnOnce(`calendar-unsupported:${calendar}`, source, `The calendar "${calendar}" is not supported; showing Gregorian dates.`);
  return 'gregory';
}

/**
 * The calendar a date component shows (Astryx `useCalendarSystem`): its own `calendar`, else the
 * request-global `Astro.locals.astryxCalendar` (the InternationalizationProvider calendar),
 * else `gregory`.
 */
export function calendarFromLocals(explicit: string | undefined, astro: {locals?: unknown}, source: string): CalendarSystem {
  const fromLocals = (astro.locals as Record<string, unknown> | undefined)?.astryxCalendar;
  return resolveShownCalendar(explicit ?? (typeof fromLocals === 'string' ? fromLocals : undefined) ?? 'gregory', source);
}

// =============================================================================
// Calendar/getWeekdayHeaderNames.ts
// =============================================================================

const weekdayNamesByLocale: Readonly<Record<string, WeekdayHeaderNames>> = weekdayHeaderNamesByLocale;
const englishWeekdayNames = weekdayNamesByLocale.en;

/** The longest abbreviated name a header row takes; the generator uses the same. */
export const MAX_ABBREVIATED_HEADER_LENGTH = 4;

function fitsHeader(names: ReadonlyArray<string>): boolean {
  return names.every((name) => characterCount(name) <= MAX_ABBREVIATED_HEADER_LENGTH);
}

function sundayFirstNames(locale: string): ReadonlyArray<string> {
  let parsed: Intl.Locale;
  try {
    parsed = new Intl.Locale(locale);
  } catch {
    return englishWeekdayNames;
  }
  const generated = weekdayNamesByLocale[parsed.baseName] ?? weekdayNamesByLocale[parsed.language];
  if (generated != null) return generated;
  const abbreviated = plainDateWeekdayNames(parsed.baseName);
  if (abbreviated == null) return englishWeekdayNames;
  if (fitsHeader(abbreviated)) return abbreviated;
  return plainDateWeekdayNames(parsed.baseName, 'narrow') ?? englishWeekdayNames;
}

export interface WeekdayHeader {
  dayOfWeek: DayOfWeek;
  name: string;
}

/** The seven weekday headers for a locale, in column order for the week that starts on `weekStartsOn`. */
export function getWeekdayHeaders(locale: string, weekStartsOn: DayOfWeek = 0): WeekdayHeader[] {
  const names = sundayFirstNames(locale);
  return Array.from({length: 7}, (_, offset) => {
    const dayOfWeek = ((weekStartsOn + offset) % 7) as DayOfWeek;
    return {dayOfWeek, name: names[dayOfWeek]};
  });
}

// =============================================================================
// Calendar/getInitialFocusDate.ts
// =============================================================================

export interface InitialFocusDateOptions {
  focusDate?: ISODateString;
  value?: ISODateString | DateRange;
  min?: ISODateString;
  max?: ISODateString;
  numberOfMonths: number;
  today: PlainDate;
  calendar?: CalendarSystem;
}

/** Picks the date whose month the calendar opens on (focusDate, value, else today clamped into min/max). */
export function getInitialFocusDate(options: InitialFocusDateOptions): PlainDate {
  const {focusDate, value, min, max, numberOfMonths, today, calendar = 'gregory'} = options;
  if (focusDate) return plainDateFromISO(focusDate);
  if (value) return plainDateFromISO(typeof value === 'string' ? value : value.start);
  const minDate = min ? plainDateFromISO(min) : null;
  const maxDate = max ? plainDateFromISO(max) : null;
  if (minDate && plainDateIsBefore(today, minDate)) return minDate;
  if (maxDate && plainDateIsAfter(today, maxDate)) {
    const lastPaneOffset = Math.max(0, numberOfMonths - 1);
    const shifted = calendarAddMonths(calendar, calendarMonthOf(calendar, maxDate), -lastPaneOffset).start;
    if (minDate && plainDateIsBefore(shifted, calendarMonthOf(calendar, minDate).start)) return minDate;
    return shifted;
  }
  return today;
}

// =============================================================================
// Calendar/dayCellUtils.ts
// =============================================================================

export interface DayCellState {
  effectivelyDisabled: boolean;
  isToday: boolean;
  isSelected: boolean;
  isInRange: boolean;
  isRangeStart: boolean;
  isRangeEnd: boolean;
  isInPreview: boolean;
  isPreviewStart: boolean;
  isPreviewEnd: boolean;
  isFirstColumn: boolean;
  isLastColumn: boolean;
}

export interface DayCellStateInput {
  date: PlainDate;
  dayIndex: number;
  mode: CalendarMode;
  selectedDate: PlainDate | null;
  rangeStart: PlainDate | null;
  rangeEnd: PlainDate | null;
  previewStart: PlainDate | null;
  previewEnd: PlainDate | null;
  today: PlainDate;
  isDisabled: boolean;
  isOutside: boolean;
}

/** All visual/interaction states of one day cell; outside days never get selection state (#2715). */
export function computeDayCellState(input: DayCellStateInput): DayCellState {
  const {date, dayIndex, mode, selectedDate, rangeStart, rangeEnd, previewStart, previewEnd, today, isDisabled, isOutside} = input;
  return {
    effectivelyDisabled: isDisabled || isOutside,
    isToday: !isOutside && plainDateIsEqual(date, today),
    isSelected: !!(!isOutside && mode === 'single' && selectedDate && plainDateIsEqual(date, selectedDate)),
    isInRange: !!(!isOutside && mode === 'range' && rangeStart && rangeEnd && plainDateIsInRange(date, [rangeStart, rangeEnd])),
    isRangeStart: !!(!isOutside && mode === 'range' && rangeStart && plainDateIsEqual(date, rangeStart)),
    isRangeEnd: !!(!isOutside && mode === 'range' && rangeEnd && plainDateIsEqual(date, rangeEnd)),
    isInPreview: !!(!isOutside && previewStart && previewEnd && plainDateIsInRange(date, [previewStart, previewEnd])),
    isPreviewStart: !!(!isOutside && previewStart && plainDateIsEqual(date, previewStart)),
    isPreviewEnd: !!(!isOutside && previewEnd && plainDateIsEqual(date, previewEnd)),
    isFirstColumn: dayIndex === 0,
    isLastColumn: dayIndex === 6,
  };
}

function computeHighlightRounding(input: {
  isStart: boolean;
  isEnd: boolean;
  isFirstColumn: boolean;
  isLastColumn: boolean;
  prevContinues?: boolean;
  nextContinues?: boolean;
}) {
  const prevBreaks = input.prevContinues !== undefined ? !input.prevContinues : false;
  const nextBreaks = input.nextContinues !== undefined ? !input.nextContinues : false;
  return {
    roundStart: input.isStart || input.isFirstColumn || prevBreaks,
    roundEnd: input.isEnd || input.isLastColumn || nextBreaks,
  };
}

export function computeRangeRounding(state: DayCellState, neighbors?: {prevInRange?: boolean; nextInRange?: boolean}) {
  return computeHighlightRounding({
    isStart: state.isRangeStart,
    isEnd: state.isRangeEnd,
    isFirstColumn: state.isFirstColumn,
    isLastColumn: state.isLastColumn,
    prevContinues: neighbors?.prevInRange,
    nextContinues: neighbors?.nextInRange,
  });
}

export function computePreviewRounding(state: DayCellState, neighbors?: {prevInPreview?: boolean; nextInPreview?: boolean}) {
  return computeHighlightRounding({
    isStart: state.isPreviewStart,
    isEnd: state.isPreviewEnd,
    isFirstColumn: state.isFirstColumn,
    isLastColumn: state.isLastColumn,
    prevContinues: neighbors?.prevInPreview,
    nextContinues: neighbors?.nextInPreview,
  });
}

/** Whether a day is a selection endpoint (selected, range start, or range end). */
export function isEndpoint(state: DayCellState): boolean {
  return state.isSelected || state.isRangeStart || state.isRangeEnd;
}

function isSpanHighlighted(input: {date: PlainDate; spanStart: PlainDate | null; spanEnd: PlainDate | null; isDisabled: boolean; isOutside: boolean}): boolean {
  const {date, spanStart, spanEnd, isDisabled, isOutside} = input;
  return !!(!isOutside && !isDisabled && spanStart && spanEnd && plainDateIsInRange(date, [spanStart, spanEnd]));
}

export interface DayNeighborContinuity {
  prevInRange: boolean;
  nextInRange: boolean;
  prevInPreview: boolean;
  nextInPreview: boolean;
}

export interface NeighborDay {
  date: PlainDate;
  isOutside: boolean;
}

/** Whether the previous/next day in the same week row continues the highlighted run. */
export function computeDayNeighborContinuity(input: {
  week: ReadonlyArray<NeighborDay>;
  dayIndex: number;
  mode: CalendarMode;
  rangeStart: PlainDate | null;
  rangeEnd: PlainDate | null;
  previewStart: PlainDate | null;
  previewEnd: PlainDate | null;
  isDisabled: (date: PlainDate) => boolean;
}): DayNeighborContinuity {
  const {week, dayIndex, mode, rangeStart, rangeEnd, previewStart, previewEnd, isDisabled} = input;
  const prev = week[dayIndex - 1];
  const next = week[dayIndex + 1];
  const rangeContinues = (day: NeighborDay | undefined): boolean =>
    day != null && mode === 'range' && isSpanHighlighted({date: day.date, spanStart: rangeStart, spanEnd: rangeEnd, isDisabled: isDisabled(day.date), isOutside: day.isOutside});
  const previewContinues = (day: NeighborDay | undefined): boolean =>
    day != null && isSpanHighlighted({date: day.date, spanStart: previewStart, spanEnd: previewEnd, isDisabled: isDisabled(day.date), isOutside: day.isOutside});
  return {
    prevInRange: rangeContinues(prev),
    nextInRange: rangeContinues(next),
    prevInPreview: previewContinues(prev),
    nextInPreview: previewContinues(next),
  };
}

// =============================================================================
// Calendar/hooks/useCalendarDays.ts
// =============================================================================

export interface CalendarDay {
  date: PlainDate;
  iso: ISODateString;
  isOutside: boolean;
  dayNumber: number;
}

/** The day grid of one calendar month (6 fixed rows, or only the rows it needs). */
export function calendarDays(calendar: CalendarSystem, month: CalendarMonth, weekStartsOn: DayOfWeek, hasVariableRowCount: boolean): {days: CalendarDay[]; weeks: CalendarDay[][]} {
  const first = month.start;
  const length = month.length;
  let startingDayOfWeek = plainDateDayOfWeek(first) - weekStartsOn;
  if (startingDayOfWeek < 0) startingDayOfWeek += 7;
  const totalRows = hasVariableRowCount ? Math.ceil((length + startingDayOfWeek) / 7) : 6;
  const days: CalendarDay[] = [];
  for (let i = 0; i < totalRows * 7; i++) {
    const offset = i - startingDayOfWeek;
    const pd = plainDateAddDays(first, offset);
    days.push({
      date: pd,
      iso: plainDateToISO(pd),
      isOutside: offset < 0 || offset >= length,
      dayNumber: offset >= 0 && offset < length ? offset + 1 : calendarDayOfMonth(calendar, pd),
    });
  }
  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return {days, weeks};
}

// =============================================================================
// Calendar/hooks/useCalendarConstraints.ts (+ the server-evaluated constraint mask)
// =============================================================================

/**
 * `dateConstraints` are functions, which cannot cross from the server to the browser. The
 * server evaluates them once per day over a window and ships the result as a bitmask
 * (`{start, bits}`: bit i set = `start + i` days is disabled, base64). Days outside the window
 * fall back to the element's client-side `dateConstraints` property (if any), else enabled.
 */
export interface ConstraintMask {
  start: ISODateString;
  length: number;
  bits: string;
}

export function encodeConstraintMask(start: PlainDate, length: number, isDisabled: (pd: PlainDate) => boolean): ConstraintMask | undefined {
  const bytes = new Uint8Array(Math.ceil(length / 8));
  let any = false;
  for (let i = 0; i < length; i++) {
    if (isDisabled(plainDateAddDays(start, i))) {
      bytes[i >> 3] |= 1 << (i & 7);
      any = true;
    }
  }
  if (!any) return undefined;
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return {start: plainDateToISO(start), length, bits: btoa(binary)};
}

/** `(pd) => true | false | undefined` — undefined outside the mask's window. */
export function decodeConstraintMask(mask: ConstraintMask | undefined): (pd: PlainDate) => boolean | undefined {
  if (!mask) return () => undefined;
  const start = plainDateFromISO(mask.start);
  const binary = atob(mask.bits);
  return (pd) => {
    const i = plainDateDiffDays(start, pd);
    if (i < 0 || i >= mask.length) return undefined;
    return ((binary.charCodeAt(i >> 3) >> (i & 7)) & 1) === 1;
  };
}

export interface ConstraintOptions {
  min?: ISODateString;
  max?: ISODateString;
  maxRangeSpan?: number;
  minRangeSpan?: number;
  rangeAnchor?: PlainDate | null;
  /**
   * Custom constraints: the date is disabled if ANY returns false. Astryx's API hands each one
   * the day's local midnight as a `Date` (`plainDateToDate`), so `Date` stays at this boundary.
   */
  dateConstraints?: ReadonlyArray<(date: Date) => boolean>;
  /** The server-evaluated constraint mask (see ConstraintMask). */
  mask?: ConstraintMask;
}

/** useCalendarConstraints().isDateDisabled */
export function createDateDisabled(options: ConstraintOptions): (date: PlainDate) => boolean {
  const {min, max, maxRangeSpan, minRangeSpan, rangeAnchor, dateConstraints, mask} = options;
  const minDate = min ? plainDateFromISO(min) : null;
  const maxDate = max ? plainDateFromISO(max) : null;
  const masked = decodeConstraintMask(mask);
  return (date) => {
    if (minDate && plainDateIsBefore(date, minDate)) return true;
    if (maxDate && plainDateIsAfter(date, maxDate)) return true;
    if (rangeAnchor) {
      const distance = Math.abs(plainDateDiffDays(rangeAnchor, date));
      if (maxRangeSpan != null && distance > maxRangeSpan - 1) return true;
      if (minRangeSpan != null && distance > 0 && distance < minRangeSpan - 1) return true;
    }
    if (masked(date) === true) return true;
    if (dateConstraints) {
      for (const constraint of dateConstraints) if (!constraint(plainDateToDate(date))) return true;
    }
    return false;
  };
}

export function firstEnabledDayOfMonth(month: CalendarMonth, isDisabled: (pd: PlainDate) => boolean): PlainDate | null {
  for (let offset = 0; offset < month.length; offset += 1) {
    const pd = plainDateAddDays(month.start, offset);
    if (!isDisabled(pd)) return pd;
  }
  return null;
}

// =============================================================================
// Calendar/Calendar.tsx
// =============================================================================

/**
 * Translated strings the render and the announcements need. Each is the server translation
 * with `` standing for `{date}` / `{start}` and `` for `{end}`, so the browser fills
 * them without a message formatter (elements never translate, AGENTS.md i18n).
 */
export interface CalendarMessages {
  daySelected: string;
  dayRangeStart: string;
  dayRangeEnd: string;
  dayRangeStartAndEnd: string;
  dayInRange: string;
  rangeStartAnnounce: string;
  rangeCompleteAnnounce: string;
  rangeClearedAnnounce: string;
}

export const ARG_A = '';
export const ARG_B = '';

export function fillMessage(template: string, a: string, b = ''): string {
  return template.split(ARG_A).join(a).split(ARG_B).join(b);
}

/** What the element reads from `data-ax-config` (rendered by Calendar.astro). */
export interface CalendarConfig {
  mode: CalendarMode;
  numberOfMonths: 1 | 2;
  min?: ISODateString;
  max?: ISODateString;
  maxRangeSpan?: number;
  minRangeSpan?: number;
  hasOutsideDays: boolean;
  hasWeekNumbers: boolean;
  hasVariableRowCount: boolean;
  weekStartsOn: DayOfWeek;
  calendar: CalendarSystem;
  locale: string;
  messages: CalendarMessages;
  mask?: ConstraintMask;
}

export interface CalendarViewState {
  /** A date in the first visible month. */
  focusDate: PlainDate;
  value: CalendarValue;
  /** Range mode: the first pick, awaiting the second. */
  rangeSelectionStart: ISODateString | null;
  /** Range mode: the hovered day (preview). */
  hoveredDate: ISODateString | null;
  today: PlainDate;
}

/** A day's full label, such as "Friday, Aban 8, 1405 AP", in the calendar. */
export function formatDateLabel(date: PlainDate, calendar: CalendarSystem, locale: string): string {
  return formatCalendarDate(calendar, date, DATE_FORMAT_WITH_WEEKDAY, locale);
}

export function normalizeWeekStart(value: DayOfWeek | DayOfWeekName | undefined): DayOfWeek {
  return normalizeDayOfWeek(value ?? 0);
}

export function visibleMonths(config: CalendarConfig, focusDate: PlainDate): CalendarMonth[] {
  const base = calendarMonthOf(config.calendar, focusDate);
  return Array.from({length: config.numberOfMonths}, (_, i) => calendarAddMonths(config.calendar, base, i));
}

/** Each month is its own stand-alone label (FR1), joined with an en dash. */
export function monthYearLabel(config: CalendarConfig, months: CalendarMonth[]): string {
  return months.map((m) => formatCalendarMonthLabel(config.calendar, m, config.locale)).join(' – ');
}

/** A month button is available while a day past the shown months is in range. */
export function navigationAvailability(config: CalendarConfig, months: CalendarMonth[]): {canPrevious: boolean; canNext: boolean} {
  const min = config.min ? plainDateFromISO(config.min) : null;
  const max = config.max ? plainDateFromISO(config.max) : null;
  return {
    canPrevious: min == null || plainDateIsBefore(min, months[0].start),
    canNext: max == null || plainDateIsAfter(max, months[months.length - 1].end),
  };
}

export function rangeAnchorOf(config: CalendarConfig, state: Pick<CalendarViewState, 'rangeSelectionStart'>): PlainDate | null {
  return config.mode === 'range' && state.rangeSelectionStart ? plainDateFromISO(state.rangeSelectionStart) : null;
}

/**
 * navigateMonth for a key with a focused day: resolve the TARGET day first and decide by it,
 * so a boundary blocks only out-of-range targets (ArrowUp from Feb 3 reaches Jan 27 at a
 * January minimum), and a direction with no enabled day left changes nothing.
 * Returns the target and the new first-visible-month date when the view must move.
 */
export function resolveKeyNavigation(
  config: CalendarConfig,
  focusDate: PlainDate,
  isDisabled: (pd: PlainDate) => boolean,
  delta: number,
  focusedIso: ISODateString,
  offset: number | undefined,
  unit: NavigationUnit = 'days',
): {target: PlainDate; focusDate: PlainDate | null} | null {
  const {calendar, numberOfMonths} = config;
  const minDate = config.min ? plainDateFromISO(config.min) : null;
  const maxDate = config.max ? plainDateFromISO(config.max) : null;
  const months = visibleMonths(config, focusDate);
  const baseMonth = months[0];
  const lastVisibleMonth = months[months.length - 1];
  const currentPd = plainDateFromISO(focusedIso);
  const inRange = (pd: PlainDate) => !(minDate && plainDateIsBefore(pd, minDate)) && !(maxDate && plainDateIsAfter(pd, maxDate));
  let targetPd: PlainDate;
  if (unit === 'months' || unit === 'years') {
    const candidate = unit === 'years' ? calendarShiftYears(calendar, currentPd, delta) : calendarShiftMonths(calendar, currentPd, delta);
    if (!inRange(candidate)) return null;
    if (isDisabled(candidate)) {
      const firstEnabled = firstEnabledDayOfMonth(calendarMonthOf(calendar, candidate), isDisabled);
      if (firstEnabled == null) return null;
      targetPd = firstEnabled;
    } else targetPd = candidate;
  } else {
    const step = delta * (offset ?? 7);
    let candidate = plainDateAddDays(currentPd, step);
    let found: PlainDate | null = null;
    while (Math.abs(plainDateDiffDays(currentPd, candidate)) <= 366) {
      if (!inRange(candidate)) return null;
      if (!isDisabled(candidate)) {
        found = candidate;
        break;
      }
      candidate = plainDateAddDays(candidate, step);
    }
    if (found == null) return null;
    targetPd = found;
  }
  const isBeforeShown = plainDateIsBefore(targetPd, baseMonth.start);
  if (!isBeforeShown && !plainDateIsAfter(targetPd, lastVisibleMonth.end)) return {target: targetPd, focusDate: null};
  const targetMonth = calendarMonthOf(calendar, targetPd);
  const next = isBeforeShown ? targetMonth.start : calendarAddMonths(calendar, targetMonth, -(numberOfMonths - 1)).start;
  return {target: targetPd, focusDate: next};
}

// ── Render (MonthGrid + DayCell) ─────────────────────────────────────────────

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function attrs(map: Record<string, string | number | boolean | null | undefined>): string {
  let out = '';
  for (const [key, value] of Object.entries(map)) {
    if (value == null || value === false) continue;
    out += value === true ? ` ${key}` : ` ${key}="${escapeHtml(String(value))}"`;
  }
  return out;
}

function parseValue(mode: CalendarMode, value: CalendarValue): {selectedDate: PlainDate | null; rangeStart: PlainDate | null; rangeEnd: PlainDate | null} {
  if (mode === 'single' && typeof value === 'string' && value) return {selectedDate: plainDateFromISO(value), rangeStart: null, rangeEnd: null};
  if (mode === 'range' && value && typeof value === 'object') return {selectedDate: null, rangeStart: plainDateFromISO(value.start), rangeEnd: plainDateFromISO(value.end)};
  return {selectedDate: null, rangeStart: null, rangeEnd: null};
}

/**
 * The months container's inner HTML: one `.ax-calendar-month` per visible month, each an APG
 * grid (a header row of columnheaders + week rows of gridcells holding the day buttons).
 * Identical on the server and in the browser for the same config, state and locale.
 */
export function renderMonthsHtml(config: CalendarConfig, state: CalendarViewState, isDisabled: (pd: PlainDate) => boolean): string {
  const {mode, calendar, locale, messages, hasOutsideDays, hasWeekNumbers, hasVariableRowCount, weekStartsOn} = config;
  const months = visibleMonths(config, state.focusDate);
  let {selectedDate, rangeStart, rangeEnd} = parseValue(mode, state.value);
  if (state.rangeSelectionStart) {
    rangeStart = plainDateFromISO(state.rangeSelectionStart);
    rangeEnd = rangeStart;
  }
  let previewStart: PlainDate | null = null;
  let previewEnd: PlainDate | null = null;
  if (mode === 'range' && state.rangeSelectionStart && state.hoveredDate) {
    const startPd = plainDateFromISO(state.rangeSelectionStart);
    const hoverPd = plainDateFromISO(state.hoveredDate);
    if (!plainDateIsEqual(startPd, hoverPd)) {
      [previewStart, previewEnd] = plainDateIsBefore(hoverPd, startPd) ? [hoverPd, startPd] : [startPd, hoverPd];
    }
  }
  const headers = getWeekdayHeaders(locale, weekStartsOn);
  const isRangeSelectionInProgress = state.rangeSelectionStart !== null;
  let html = '';
  for (const month of months) {
    const {days, weeks} = calendarDays(calendar, month, weekStartsOn, hasVariableRowCount);
    // Seed of this grid's roving tab stop: selected (visible, enabled) > today > first enabled.
    let seed: ISODateString | null = null;
    if (selectedDate && isInCalendarMonth(selectedDate, month) && !isDisabled(selectedDate)) seed = plainDateToISO(selectedDate);
    else if (isInCalendarMonth(state.today, month) && !isDisabled(state.today)) seed = plainDateToISO(state.today);
    else seed = days.find((d) => !d.isOutside && !isDisabled(d.date))?.iso ?? null;

    html += `<div class="ax-calendar-month"><div${attrs({
      role: 'grid',
      class: 'ax-calendar-grid',
      'aria-label': formatCalendarMonthLabel(calendar, month, locale),
      'aria-multiselectable': mode === 'range' ? 'true' : undefined,
      'data-week-numbers': hasWeekNumbers ? '' : undefined,
    })}>`;
    html += '<div role="row" class="ax-calendar-row">';
    if (hasWeekNumbers) html += `<div role="columnheader" class="ax-calendar-day-name" data-week-number=""><span class="ax-visually-hidden">${escapeHtml(plainDateWeekFieldName(locale))}</span></div>`;
    for (const {name} of headers) html += `<div role="columnheader" class="ax-calendar-day-name">${escapeHtml(name)}</div>`;
    html += '</div>';
    for (const week of weeks) {
      const weekDate = week.find((d) => !d.isOutside)?.date ?? week[0].date;
      html += '<div role="row" class="ax-calendar-row">';
      if (hasWeekNumbers) html += `<div role="rowheader" class="ax-calendar-week-number">${escapeHtml(plainDateFormatDayNumber(plainDateGetWeekNumber(weekDate), locale))}</div>`;
      week.forEach((day, dayIndex) => {
        if (day.isOutside && !hasOutsideDays) {
          html += '<div role="gridcell" class="ax-calendar-cell"></div>';
          return;
        }
        const disabled = isDisabled(day.date);
        const neighbors = computeDayNeighborContinuity({week, dayIndex, mode, rangeStart, rangeEnd, previewStart, previewEnd, isDisabled});
        const s = computeDayCellState({date: day.date, dayIndex, mode, selectedDate, rangeStart, rangeEnd, previewStart, previewEnd, today: state.today, isDisabled: disabled, isOutside: day.isOutside});
        const endpoint = isEndpoint(s);
        const showsTodayRing = s.isToday && !s.isSelected && !s.isInRange;
        const showsTodayInRangeRing = s.isToday && !s.isSelected && s.isInRange;
        const dateLabel = formatDateLabel(day.date, calendar, locale);
        const label = s.isSelected
          ? fillMessage(messages.daySelected, dateLabel)
          : s.isRangeStart && s.isRangeEnd
            ? fillMessage(isRangeSelectionInProgress ? messages.dayRangeStart : messages.dayRangeStartAndEnd, dateLabel)
            : s.isRangeStart
              ? fillMessage(messages.dayRangeStart, dateLabel)
              : s.isRangeEnd
                ? fillMessage(messages.dayRangeEnd, dateLabel)
                : s.isInRange
                  ? fillMessage(messages.dayInRange, dateLabel)
                  : dateLabel;
        html += `<div${attrs({role: 'gridcell', class: 'ax-calendar-cell', 'aria-selected': s.isSelected || s.isInRange ? 'true' : undefined})}>`;
        if (s.isInRange) {
          const r = computeRangeRounding(s, {prevInRange: neighbors.prevInRange, nextInRange: neighbors.nextInRange});
          html += `<div${attrs({class: 'ax-calendar-range-bg', 'data-round-start': r.roundStart ? '' : undefined, 'data-round-end': r.roundEnd ? '' : undefined})}></div>`;
        }
        if (s.isInPreview) {
          const r = computePreviewRounding(s, {prevInPreview: neighbors.prevInPreview, nextInPreview: neighbors.nextInPreview});
          html += `<div${attrs({class: 'ax-calendar-preview-bg', 'data-round-start': r.roundStart || s.isPreviewStart ? '' : undefined, 'data-round-end': r.roundEnd || s.isPreviewEnd ? '' : undefined})}></div>`;
        }
        html += `<button${attrs({
          type: 'button',
          class: 'astryx-calendar-day ax-focus-visible ax-overlay-image',
          'data-selected': endpoint ? 'selected' : undefined,
          'data-today': s.isToday ? 'today' : undefined,
          'data-disabled': s.effectivelyDisabled ? 'disabled' : undefined,
          'data-in-range': s.isInRange ? 'in-range' : undefined,
          'data-marker': showsTodayRing ? 'today-only' : showsTodayInRangeRing ? 'today-in-range' : undefined,
          'data-ax-outside': day.isOutside ? '' : undefined,
          'data-date': day.iso,
          'aria-label': label,
          'aria-disabled': s.effectivelyDisabled ? 'true' : undefined,
          'aria-current': s.isToday ? 'date' : undefined,
          tabindex: day.iso === seed && !day.isOutside ? 0 : -1,
        })}>${escapeHtml(plainDateFormatDayNumber(day.dayNumber, locale))}</button></div>`;
      });
      html += '</div>';
    }
    html += '</div></div>';
  }
  return html;
}

export {plainDateFromISO, plainDateToISO, plainDateToDate, plainDateIsBefore, plainDateIsEqual, isInCalendarMonth, calendarMonthOf, calendarAddMonths};
