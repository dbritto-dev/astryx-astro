// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Ported from @astryxdesign/core 0.7.9 src/utils/plainDate.ts (locale type and characters import paths adjusted;
// the date arithmetic, zone conversion and ISO parsing rewritten on Temporal, same results).

/**
 * @file plainDate.ts
 * @input ISO date strings, year/month/day numbers
 * @output Immutable PlainDate records and pure date arithmetic
 * @position Shared utility; replaces scattered Date usage across Calendar hooks.
 *   Arithmetic, comparison, ISO weeks and zone conversion run on Temporal
 *   (lib/temporal.ts); text comes from Intl, which formats epoch milliseconds.
 */

import type {ISODateString, PlainDate} from './dateTypes';
import type {Locale} from './locale';
import {
  formatCalendarDate,
  isCalendarSystem,
  type CalendarSystem,
} from './calendarSystem';
import {firstCharacter} from '../characters';
import {standaloneMonthCapitalLanguages} from './standaloneMonthCapitals.generated';
import {Temporal, isTemporal} from '../temporal';
import {hostTimeZone, zonedOf, type ExactTime} from './instant';

export type {PlainDate} from './dateTypes';

// =============================================================================
// Temporal bridge (port addition)
// =============================================================================

/**
 * The ISO `Temporal.PlainDate` of a PlainDate. Every function here takes either a
 * `{year, month, day}` record (Gregorian / ISO fields, as Astryx's) or a `Temporal.PlainDate`;
 * a Temporal date in another calendar counts as the ISO day it falls on. The record form
 * throws a RangeError for a day the month lacks.
 */
export function plainDateToTemporal(pd: PlainDate): Temporal.PlainDate {
  if (isTemporal(pd, 'PlainDate')) {
    return pd.calendarId === 'iso8601' ? pd : pd.withCalendar('iso8601');
  }
  return new Temporal.PlainDate(pd.year, pd.month, pd.day);
}

/** The `{year, month, day}` record of a Temporal date (its ISO fields). */
export function plainDateFromTemporal(date: Temporal.PlainDate): PlainDate {
  const iso = date.calendarId === 'iso8601' ? date : date.withCalendar('iso8601');
  return {year: iso.year, month: iso.month, day: iso.day};
}

/** Epoch milliseconds of the date's UTC midnight (what `Intl` formats a date-only PlainDate from). */
function utcMidnight(pd: PlainDate): number {
  return plainDateToTemporal(pd).toZonedDateTime('UTC').epochMilliseconds;
}

/** Epoch milliseconds of the date's start in the host's zone (local midnight, or the first instant after a gap). */
function localMidnight(pd: PlainDate): number {
  return plainDateToTemporal(pd).toZonedDateTime(hostTimeZone()).epochMilliseconds;
}

// =============================================================================
// plainDate.ts
// =============================================================================

export function plainDateCreate(
  year: number,
  month: number,
  day: number,
): PlainDate {
  if (!Number.isInteger(year) || year < 1) {
    throw new RangeError(`year must be a positive integer, got ${year}`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`month must be 1–12, got ${month}`);
  }
  const maxDay = getDaysInMonth(year, month);
  if (!Number.isInteger(day) || day < 1 || day > maxDay) {
    throw new RangeError(
      `day must be 1–${maxDay} for ${year}-${String(month).padStart(2, '0')}, got ${day}`,
    );
  }
  return {year, month, day};
}

/**
 * Reads an ISO 8601 calendar date with `Temporal.PlainDate.from` (a date-time or a calendar
 * annotation reads as its ISO day), then applies Astryx's year ≥ 1 rule.
 */
export function plainDateFromISO(str: ISODateString): PlainDate {
  const {year, month, day} = plainDateFromTemporal(Temporal.PlainDate.from(str));
  return plainDateCreate(year, month, day);
}

export function plainDateToISO(pd: PlainDate): ISODateString {
  return plainDateToTemporal(pd).toString({calendarName: 'never'}) as ISODateString;
}

/**
 * The date's local midnight as a `Date` (Astryx's API: `dateConstraints` callbacks and
 * Calendar's `valueAsDate` receive one). Built from the Temporal start of day in the host's
 * zone; years 0-99 stay as given.
 */
export function plainDateToDate(pd: PlainDate): Date {
  return new Date(localMidnight(pd));
}

/** The local calendar day of a `Date` (Astryx's API), read through Temporal in the host's zone. */
export function plainDateFromDate(d: Date): PlainDate {
  return plainDateFromTemporal(zonedOf(d).toPlainDate());
}

export function plainDateToday(): PlainDate {
  return plainDateFromTemporal(Temporal.Now.plainDateISO());
}

export function getDaysInMonth(year: number, month: number): number {
  return new Temporal.PlainDate(year, month, 1).daysInMonth;
}

/** Day of the week, 0 (Sunday) to 6 (Saturday); Temporal counts 1 (Monday) to 7 (Sunday). */
export function plainDateDayOfWeek(pd: PlainDate): number {
  return plainDateToTemporal(pd).dayOfWeek % 7;
}

export function plainDateAddMonths(pd: PlainDate, n: number): PlainDate {
  // Temporal.PlainDate.add clamps the day: Jan 31 + 1 month is Feb 28/29, not Mar 2/3.
  return plainDateFromTemporal(plainDateToTemporal(pd).add({months: n}));
}

export function plainDateAddDays(pd: PlainDate, n: number): PlainDate {
  return plainDateFromTemporal(plainDateToTemporal(pd).add({days: n}));
}

/**
 * Whole calendar days from `a` to `b`, ignoring time of day. Positive when
 * `b` is after `a`, negative when before. Calendar dates have no time zone, so
 * DST shifts never add or drop a day.
 */
export function plainDateDiffDays(a: PlainDate, b: PlainDate): number {
  return plainDateToTemporal(a).until(plainDateToTemporal(b)).days;
}

/**
 * The wall-clock fields an instant reads as in a given zone (Temporal's
 * ZonedDateTime fields, ISO calendar), so callers can assemble machine shapes
 * (`YYYY-MM-DD`, `HH:mm:ss`) from them. Exported for Timestamp, whose
 * `system_*` formats are built from these fields rather than through `Intl`
 * formatting.
 */
export function getTimeZoneParts(
  instant: ExactTime,
  timezoneID: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  return wallClockOf(zonedOf(instant, timezoneID));
}

function wallClockOf(zoned: Temporal.ZonedDateTime): WallClock {
  return {
    year: zoned.year,
    month: zoned.month,
    day: zoned.day,
    hour: zoned.hour,
    minute: zoned.minute,
    second: zoned.second,
  };
}

/** The wall-clock fields of an instant: in a zone, or in the viewer's. */
export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/**
 * Wall-clock fields for an instant, in the named zone or in the viewer's
 * zone (`undefined`, `null` or ""). The explicit return type keeps both
 * branches on one shape.
 */
export function getWallClock(
  date: ExactTime,
  timeZone: string | null | undefined,
): WallClock {
  return wallClockOf(zonedOf(date, timeZone));
}

/**
 * The instant (epoch milliseconds) of a wall time on a date in a zone. Temporal's
 * "compatible" disambiguation (AST-067): a wall time that happens twice
 * resolves to its earlier occurrence, and one that never happens is read in
 * the offset before the transition, which moves it forward by the length of
 * the gap. An hour or minute past its range carries into the next field, as
 * the wall time it names does (24:00 is the next midnight).
 */
export function plainDateToInstant(
  date: PlainDate,
  timezoneID: string,
  hour = 0,
  minute = 0,
): number {
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return NaN;
  }
  return plainDateToTemporal(date)
    .toPlainDateTime()
    .add({hours: hour, minutes: minute})
    .toZonedDateTime(timezoneID, {disambiguation: 'compatible'}).epochMilliseconds;
}

export function plainDateFromInstant(
  instant: ExactTime,
  timezoneID: string,
): PlainDate {
  const {year, month, day} = plainDateFromTemporal(zonedOf(instant, timezoneID).toPlainDate());
  return plainDateCreate(year, month, day);
}

function compare(a: PlainDate, b: PlainDate): number {
  return Temporal.PlainDate.compare(plainDateToTemporal(a), plainDateToTemporal(b));
}

export function plainDateIsBefore(a: PlainDate, b: PlainDate): boolean {
  return compare(a, b) < 0;
}

export function plainDateIsAfter(a: PlainDate, b: PlainDate): boolean {
  return compare(a, b) > 0;
}

export function plainDateIsEqual(a: PlainDate, b: PlainDate): boolean {
  return compare(a, b) === 0;
}

export function plainDateMax(a: PlainDate, b: PlainDate): PlainDate {
  return compare(a, b) >= 0 ? a : b;
}

export function plainDateMin(a: PlainDate, b: PlainDate): PlainDate {
  return compare(a, b) <= 0 ? a : b;
}

export function plainDateIsInRange(
  pd: PlainDate,
  range: [PlainDate, PlainDate],
): boolean {
  return compare(pd, range[0]) >= 0 && compare(pd, range[1]) <= 0;
}

export interface NearestAcceptedDateOptions {
  min?: PlainDate | null;
  max?: PlainDate | null;
  /** Rejects a date inside the bounds, such as a date constraint. */
  isDateDisabled?: (date: PlainDate) => boolean;
  /** How many days to search on each side of the clamped date. */
  searchDays?: number;
}

/**
 * The date nearest to `target` that a field accepts. It clamps `target` into
 * [`min`, `max`], then searches outward one day at a time, inside the bounds,
 * for a date that `isDateDisabled` allows. On a tie the later date wins. When
 * no date inside the search window is allowed, it returns the clamped date.
 */
export function nearestAcceptedDate(
  target: PlainDate,
  {min, max, isDateDisabled, searchDays = 366}: NearestAcceptedDateOptions,
): PlainDate {
  let clamped = target;
  if (min != null && compare(clamped, min) < 0) {
    clamped = min;
  }
  if (max != null && compare(clamped, max) > 0) {
    clamped = max;
  }
  if (isDateDisabled == null || !isDateDisabled(clamped)) {
    return clamped;
  }
  const isAccepted = (date: PlainDate) =>
    (min == null || compare(date, min) >= 0) &&
    (max == null || compare(date, max) <= 0) &&
    !isDateDisabled(date);
  const origin = plainDateToTemporal(clamped);
  for (let offset = 1; offset <= searchDays; offset += 1) {
    const later = plainDateFromTemporal(origin.add({days: offset}));
    if (isAccepted(later)) {
      return later;
    }
    const earlier = plainDateFromTemporal(origin.subtract({days: offset}));
    if (isAccepted(earlier)) {
      return earlier;
    }
  }
  return clamped;
}

export function plainDateSetFirstOfMonth(pd: PlainDate): PlainDate {
  return plainDateFromTemporal(plainDateToTemporal(pd).with({day: 1}));
}

export function plainDateSetStartOfWeek(
  pd: PlainDate,
  weekStartsOn: number,
): PlainDate {
  const date = plainDateToTemporal(pd);
  const delta = ((date.dayOfWeek % 7) - weekStartsOn + 7) % 7;
  return plainDateFromTemporal(date.subtract({days: delta}));
}

export function plainDateSetEndOfWeekExclusive(
  pd: PlainDate,
  weekStartsOn: number,
): PlainDate {
  return plainDateAddDays(plainDateSetStartOfWeek(pd, weekStartsOn), 7);
}

/** The ISO 8601 week number (Temporal's `weekOfYear` in the ISO calendar). */
export function plainDateGetWeekNumber(pd: PlainDate): number {
  return plainDateToTemporal(pd).weekOfYear ?? 0;
}

// e.g. "Wednesday, May 21, 2026" (locale-dependent)
export const DATE_FORMAT_WITH_WEEKDAY: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
};

// e.g. "Wed, May 21, 2026" (locale-dependent) — short weekday + short month.
// Backs the shared `date_weekday` format used by both Timestamp and DateInput.
export const DATE_FORMAT_SHORT_WITH_WEEKDAY: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

// e.g. "May 21, 2026" (locale-dependent)
export const DATE_FORMAT_LONG: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
};

// e.g. "January 2026" (locale-dependent)
export const DATE_FORMAT_MONTH_YEAR: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'long',
};

/**
 * The month and year as a label that stands alone, such as a calendar heading
 * or a month grid's name. `Intl` formats the month for running text; where
 * CLDR titlecases a stand-alone month name (its `contextTransforms`), the
 * label starts with a capital, as Calendar's weekday headers use CLDR's
 * stand-alone forms (`component:Calendar` FR1). Internal: not re-exported from
 * `utils/index.ts`.
 */
export function plainDateFormatStandaloneMonthYear(
  pd: PlainDate,
  locale: Locale,
  calendar: Intl.DateTimeFormatOptions['calendar'] = 'gregory',
): string {
  const label = plainDateFormat(
    pd,
    {...DATE_FORMAT_MONTH_YEAR, calendar},
    locale,
  );
  let language: string;
  try {
    language = new Intl.Locale(locale).language;
  } catch {
    return label;
  }
  if (!standaloneMonthCapitalLanguages.has(language)) {
    return label;
  }
  const first = firstCharacter(label);
  return first.toLocaleUpperCase(locale) + label.slice(first.length);
}

// e.g. "Sun" (locale-dependent) — the weekday on its own, abbreviated.
//
// This is CLDR's `abbreviated` width. Weekday headers prefer a generated
// table, because `Intl` has no short width.
export const DATE_FORMAT_WEEKDAY_ONLY: Intl.DateTimeFormatOptions = {
  weekday: 'short',
};

/**
 * The platform's weekday names for a locale, Sunday first, in `Intl`'s
 * `short` width (CLDR's abbreviated) or its `narrow` width. Returns `null`
 * when the platform has no data for the locale's language, so a caller uses
 * its own fallback instead of the host's default locale.
 */
export function plainDateWeekdayNames(
  locale: Locale,
  width: 'short' | 'narrow' = 'short',
): string[] | null {
  const options: Intl.DateTimeFormatOptions = {weekday: width};
  // A language the platform lacks resolves to the host's default locale.
  const resolved = dateTimeFormatFor(locale, {
    ...options,
    calendar: 'gregory',
  }).resolvedOptions().locale;
  if (new Intl.Locale(resolved).language !== new Intl.Locale(locale).language) {
    return null;
  }
  // January 4, 1970 was a Sunday.
  return Array.from({length: 7}, (_, day) =>
    plainDateFormat({year: 1970, month: 1, day: 4 + day}, options, locale),
  );
}

// e.g. "January" (locale-dependent) — the month on its own, for a control
// that shows a list of months and carries the year separately.
export const DATE_FORMAT_MONTH_ONLY: Intl.DateTimeFormatOptions = {
  month: 'long',
};

// e.g. "Jan 25" (locale-dependent)
export const DATE_FORMAT_SHORT: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
};

// e.g. "Jan 25, 2026" (locale-dependent)
export const DATE_FORMAT_SHORT_WITH_YEAR: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

/**
 * Format a `PlainDate` for display.
 *
 * The locale defaults to the same `'en'` fallback as `useLocale()`, avoiding
 * runtime-dependent output when no provider locale is available. Astryx date
 * APIs currently model Gregorian dates, so this helper defaults to Gregorian
 * when `options.calendar` is omitted. The explicit option remains supported for
 * compatibility with the public `Intl.DateTimeFormatOptions` signature; it is a
 * display-only escape hatch and does not change PlainDate arithmetic, parsing,
 * serialization, or any Astryx component's calendar semantics. Another
 * calendar names the month and day that Calendar shows in it.
 */
export function plainDateFormat(
  pd: PlainDate,
  options: Intl.DateTimeFormatOptions,
  locale: Locale = 'en',
): string {
  const calendar = options.calendar ?? 'gregory';
  if (calendar !== 'gregory' && isCalendarSystem(calendar)) {
    return formatCalendarDate(calendar, pd, options, locale);
  }
  const [format, date] = plainDateFormatInput(pd, options, locale);
  return format.format(date);
}

/**
 * The parts of `plainDateFormat`'s output, from the same formatter and date.
 * Internal: not re-exported from `utils/index.ts`.
 */
export function plainDateFormatToParts(
  pd: PlainDate,
  options: Intl.DateTimeFormatOptions,
  locale: Locale,
): Intl.DateTimeFormatPart[] {
  const [format, date] = plainDateFormatInput(pd, options, locale);
  return format.formatToParts(date);
}

function plainDateFormatInput(
  pd: PlainDate,
  options: Intl.DateTimeFormatOptions,
  locale: Locale,
): [Intl.DateTimeFormat, number] {
  const calendar = options.calendar ?? 'gregory';
  if (options.timeZone != null) {
    return [
      dateTimeFormatFor(locale, {...options, calendar}),
      localMidnight(pd),
    ];
  }
  if (TIME_OF_DAY_FIELDS.some(field => options[field] != null)) {
    // A zone name or a time of day reads local midnight in the zone current
    // at the call. A cached formatter would keep the zone it was built in,
    // so this one is built for the call.
    return [
      new Intl.DateTimeFormat(locale, {...options, calendar}),
      localMidnight(pd),
    ];
  }
  // Date fields alone: UTC midnight formatted in UTC, so neither the cached
  // formatter nor the instant depends on the host's zone, which can change while
  // a page is open. Intl formats the instant's epoch milliseconds: a Temporal
  // object would get another pattern (see lib/temporal.ts).
  return [
    dateTimeFormatFor(locale, {...options, calendar, timeZone: 'UTC'}),
    utcMidnight(pd),
  ];
}

/** Options that print a time of day or a zone, which a PlainDate lacks. */
const TIME_OF_DAY_FIELDS = [
  'timeZoneName',
  'hour',
  'minute',
  'second',
  'fractionalSecondDigits',
  'dayPeriod',
  'timeStyle',
] as const satisfies ReadonlyArray<keyof Intl.DateTimeFormatOptions>;

/**
 * One `Intl.DateTimeFormat` per locale and options, built on first use.
 * Building a formatter costs far more than formatting with it, and a calendar
 * formats each of a month's 42 day labels with the same options on every
 * render. The options are keyed in a fixed order, so the same options written
 * in another order share a formatter.
 */
const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();

/** @internal plainDateFormat's formatter cache; not part of the public API. */
export function dateTimeFormatFor(
  locale: Locale,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = JSON.stringify([
    locale,
    Object.entries(options).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  ]);
  let format = dateTimeFormats.get(key);
  if (format == null) {
    format = new Intl.DateTimeFormat(locale, options);
    dateTimeFormats.set(key, format);
  }
  return format;
}

/**
 * @internal `dateTimeFormatFor`, except that without `options.timeZone` it
 * builds a formatter for the call. A cached formatter keeps the host zone it
 * was built in.
 */
export function dateTimeFormatAtCall(
  locale: Locale,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  return options.timeZone === undefined
    ? new Intl.DateTimeFormat(locale, options)
    : dateTimeFormatFor(locale, options);
}

/**
 * The locale's name for the "week of year" date field ("week", "Woche", "週"),
 * from CLDR through `Intl.DisplayNames`. Calendar names its week-number
 * column header with it, so no catalog string is needed for a word the
 * platform already carries in every locale.
 *
 * `Intl.DisplayNames` with `type: 'dateTimeField'` is inside the Baseline − 2
 * support tier (Chrome 106, Safari 15.4, Firefox 110). Should a host lack it
 * or return nothing, the field's English CLDR name stands in rather than an
 * empty header.
 */
export function plainDateWeekFieldName(locale: Locale = 'en'): string {
  try {
    const name = new Intl.DisplayNames(locale, {type: 'dateTimeField'}).of(
      'weekOfYear',
    );
    if (name != null && name !== '') {
      return name;
    }
  } catch {
    // Fall through to the English CLDR value.
  }
  return 'week';
}

const dayNumberFormats = new Map<string, Intl.NumberFormat>();

/**
 * A day of the month or a week number in the locale's own digits: `15` in
 * English, `۱۵` in Persian, `١٥` in Egyptian Arabic. A `numberingSystem`
 * replaces the locale's digits. Only the digits change. The number stays the
 * value that it is given, so no calendar applies, and no grouping separator or
 * unit word is added.
 * Internal: not re-exported from `utils/index.ts`.
 */
export function plainDateFormatDayNumber(
  value: number,
  locale: Locale,
  numberingSystem?: string,
): string {
  const key = `${locale}|${numberingSystem ?? ''}`;
  let format = dayNumberFormats.get(key);
  if (format == null) {
    format = new Intl.NumberFormat(locale, {
      useGrouping: false,
      numberingSystem,
    });
    dayNumberFormats.set(key, format);
  }
  return format.format(value);
}

// =============================================================================
// Shared date-only format vocabulary
// =============================================================================

/**
 * The date-only members of Timestamp's `format` vocabulary that a
 * calendar-date field (no time-of-day) can render. Both Timestamp and
 * DateInput share these string literals and the mapping below so that the same
 * literal renders the same date shape in either component.
 *
 * - `date`: locale short-month date, e.g. "Mar 21, 2026"
 * - `date_long`: locale long-month date, e.g. "March 21, 2026"
 * - `date_weekday`: short weekday + short-month date, e.g. "Wed, Mar 21, 2026"
 * - `system_date`: ISO 8601 calendar date, e.g. "2026-03-21"
 */
export type SharedDateFormat =
  'date' | 'date_long' | 'date_weekday' | 'system_date';

/**
 * Intl option bags for the locale-aware shared date members. `system_date` is
 * intentionally absent — it is emitted as a fixed ISO `YYYY-MM-DD` string, not
 * via `Intl` — and is handled directly by {@link formatSharedDate}.
 *
 * This is the single source of truth consumed by both Timestamp's
 * `formatTimestamp` switch and DateInput's display path, so the two never
 * drift for the members they share.
 */
export const SHARED_DATE_FORMAT_OPTIONS: Record<
  Exclude<SharedDateFormat, 'system_date'>,
  Intl.DateTimeFormatOptions
> = {
  date: DATE_FORMAT_SHORT_WITH_YEAR,
  date_long: DATE_FORMAT_LONG,
  date_weekday: DATE_FORMAT_SHORT_WITH_WEEKDAY,
};

/**
 * Renders a {@link PlainDate} using one of the {@link SharedDateFormat}
 * members. The shared entry point DateInput uses for the named-format path;
 * Timestamp maps the same members onto {@link SHARED_DATE_FORMAT_OPTIONS} in
 * its own `formatTimestamp` switch (its input is a `Date`, not a `PlainDate`).
 * The locale-aware members write the date in `calendar`, which defaults to
 * Gregorian. `system_date` stays the Gregorian ISO date in every calendar.
 */
export function formatSharedDate(
  pd: PlainDate,
  format: SharedDateFormat,
  locale: Locale = 'en',
  calendar: CalendarSystem = 'gregory',
): string {
  if (format === 'system_date') {
    return plainDateToISO(pd);
  }
  return plainDateFormat(
    pd,
    {...SHARED_DATE_FORMAT_OPTIONS[format], calendar},
    locale,
  );
}
