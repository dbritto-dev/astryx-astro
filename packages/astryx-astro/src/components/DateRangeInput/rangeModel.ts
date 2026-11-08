// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Ported from @astryxdesign/core 0.7.9 src/DateRangeInput/DateRangeInput.tsx
// (formatRangeDisplay, isRangeEqual, isRangeWithinSpan).

/**
 * DateRangeInput's pure helpers, shared by the server render and `<ax-date-range-input>`.
 * Every Intl call takes the field's locale; the date math is Temporal (lib/date).
 */
import {
  isoDateOf,
  DATE_FORMAT_SHORT,
  DATE_FORMAT_SHORT_WITH_YEAR,
  calendarMonthOf,
  calendarYearMonthOf,
  formatCalendarDate,
  plainDateDiffDays,
  plainDateFromISO,
  plainDateToday,
  type CalendarSystem,
  type DateRange,
  type DateValue,
  type PlainDate,
} from '../../lib/date';

export type {DateRange};

/** A range of ISO dates or `Temporal.PlainDate`s (port addition: the Temporal form). */
export interface DateRangeValue {
  start: DateValue;
  end: DateValue;
}

/** "Mar 3 – Mar 9" in the current year, "Dec 28, 2025 – Jan 3, 2026" otherwise ('' for none). */
export function formatRangeDisplay(range: DateRange | null, locale: string, calendar: CalendarSystem, today: PlainDate = plainDateToday()): string {
  if (!range) return '';
  const start = plainDateFromISO(range.start);
  const end = plainDateFromISO(range.end);
  const yearOf = (pd: PlainDate) => calendarYearMonthOf(calendar, calendarMonthOf(calendar, pd)).year;
  const currentYear = yearOf(today);
  const sameYear = yearOf(start) === yearOf(end) && yearOf(start) === currentYear;
  const fmt = sameYear ? DATE_FORMAT_SHORT : DATE_FORMAT_SHORT_WITH_YEAR;
  return `${formatCalendarDate(calendar, start, fmt, locale)} – ${formatCalendarDate(calendar, end, fmt, locale)}`;
}

export function isRangeEqual(a: DateRange | null, b: DateRange | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.start === b.start && a.end === b.end;
}

/**
 * A preset that would land outside the span bounds is disabled rather than allowed to
 * override them. Spans count both endpoints.
 */
export function isRangeWithinSpan(range: DateRange, maxRangeSpan: number | undefined, minRangeSpan: number | undefined): boolean {
  if (maxRangeSpan == null && minRangeSpan == null) return true;
  const span = Math.abs(plainDateDiffDays(plainDateFromISO(range.start), plainDateFromISO(range.end))) + 1;
  if (maxRangeSpan != null && span > maxRangeSpan) return false;
  if (minRangeSpan != null && span < minRangeSpan) return false;
  return true;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A `{start, end}` of ISO dates (from ISO strings or `Temporal.PlainDate`s), or null. */
export function toRange(value: unknown): DateRange | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as {start?: unknown; end?: unknown};
  const [start, end] = [raw.start, raw.end].map((v) => isoDateOf(v as DateValue));
  return typeof start === 'string' && typeof end === 'string' && ISO_DATE.test(start) && ISO_DATE.test(end)
    ? ({start, end} as DateRange)
    : null;
}
