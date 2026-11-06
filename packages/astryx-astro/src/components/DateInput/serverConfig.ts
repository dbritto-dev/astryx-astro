// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Ported from @astryxdesign/core 0.7.9 src/DateInput/useTypedDate.ts (useTypedDate)
// and src/Calendar/hooks/useCalendarConstraints.ts.

/**
 * Server half of the typed date field (DateInput, DateTimeInput): resolves the strings the
 * browser needs (rejections, the format hint template, the calendar description) in the
 * request locale, and evaluates `dateConstraints` (functions cannot reach the browser) into the
 * same bitmask Calendar ships. Nothing here runs in the browser.
 */
import {translator, type Translate} from '../../lib/i18n';
import {messageTemplate} from '../Field/clientMessages';
import {
  calendarAddMonths,
  createDateDisabled,
  encodeConstraintMask,
  getInitialFocusDate,
  visibleMonths,
  type CalendarConfig,
  type ConstraintMask,
} from '../Calendar/calendarModel';
import {
  calendarDisplayName,
  formatCalendarDateText,
  isGregorianCalendar,
  plainDateDiffDays,
  plainDateFromISO,
  plainDateIsAfter,
  plainDateIsBefore,
  plainDateToday,
  type CalendarSystem,
  type ISODateString,
  type SharedDateFormat,
} from '../../lib/date';
import type {TypedDateConfig} from './typedDate';

export type {Translate};
export {translator};

/**
 * `dateConstraints` → the bitmask over two years either side of the opening months, clipped to
 * min/max (the window Calendar.astro uses), or undefined when nothing is constrained.
 */
export function constraintMask(options: {
  dateConstraints?: ReadonlyArray<(date: Date) => boolean>;
  min?: ISODateString;
  max?: ISODateString;
  value?: ISODateString;
  numberOfMonths: 1 | 2;
  calendar: CalendarSystem;
}): ConstraintMask | undefined {
  const {dateConstraints, min, max, value, numberOfMonths, calendar} = options;
  if (!dateConstraints || dateConstraints.length === 0) return undefined;
  const focusDate = getInitialFocusDate({value, min, max, numberOfMonths, today: plainDateToday(), calendar});
  const opening = visibleMonths({calendar, numberOfMonths} as CalendarConfig, focusDate);
  let start = calendarAddMonths(calendar, opening[0], -24).start;
  let end = calendarAddMonths(calendar, opening[opening.length - 1], 24).end;
  if (min && plainDateIsAfter(plainDateFromISO(min), start)) start = plainDateFromISO(min);
  if (max && plainDateIsBefore(plainDateFromISO(max), end)) end = plainDateFromISO(max);
  const length = plainDateDiffDays(start, end) + 1;
  return length > 0 ? encodeConstraintMask(start, length, createDateDisabled({dateConstraints})) : undefined;
}

export interface TypedDateServerOptions {
  t: Translate;
  locale: string;
  calendar: CalendarSystem;
  /** The request/subtree calendar (InternationalizationProvider), else gregory. */
  providerCalendar: CalendarSystem;
  format: SharedDateFormat | ((value: ISODateString) => string);
  min?: ISODateString;
  max?: ISODateString;
  mask?: ConstraintMask;
  hasPlaceholder: boolean;
}

/** The typed-date config the element reads, plus the calendar description (or null). */
export function typedDateServerConfig(options: TypedDateServerOptions): {config: TypedDateConfig; calendarDescription: string | null} {
  const {t, locale, calendar, providerCalendar, format, min, max, mask, hasPlaceholder} = options;
  const calendarName = calendarDisplayName(calendar, locale);
  const boundFormat: SharedDateFormat = typeof format === 'function' ? 'date_long' : format;
  const writeBound = (bound: ISODateString) => formatCalendarDateText(plainDateFromISO(bound), boundFormat, locale, calendar);
  const bounds = min != null && max != null ? 'both' : min != null ? 'min' : max != null ? 'max' : null;
  const outOfRange = (which: string) => t('@astryx.dateInput.outOfRangeDate', {
    bounds: which,
    min: min != null ? writeBound(min) : '',
    max: max != null ? writeBound(max) : '',
  });
  const isGregorian = isGregorianCalendar(calendar);
  const isProviderCalendar = isGregorian ? isGregorianCalendar(providerCalendar) : calendar === providerCalendar;
  return {
    config: {
      locale,
      calendar,
      format: typeof format === 'function' ? null : format,
      min,
      max,
      mask,
      hasPlaceholder,
      messages: {
        invalid: t('@astryx.dateInput.invalidDate'),
        nonexistent: t('@astryx.dateInput.nonexistentDate', {calendar: calendarName}),
        outOfRangeNone: outOfRange('none'),
        outOfRangeBounds: bounds ? outOfRange(bounds) : undefined,
        formatHint: isGregorian ? undefined : messageTemplate(t, locale, '@astryx.dateInput.formatHint', {}, ['example']),
      },
    },
    calendarDescription: isProviderCalendar ? null : t('@astryx.dateInput.calendarDescription', {calendar: calendarName}),
  };
}

/** The InternationalizationProvider calendar (`Astro.locals.astryxCalendar`), else gregory. */
export function providerCalendarOf(astro: {locals?: unknown}): CalendarSystem {
  const value = (astro.locals as Record<string, unknown> | undefined)?.astryxCalendar;
  return (typeof value === 'string' ? value : 'gregory') as CalendarSystem;
}
