// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Framework-free port of @astryxdesign/core 0.7.9 src/PowerSearch/powerSearchDateZone.ts
// and the date part of formatFilterValue.ts, on Temporal (lib/temporal.ts through lib/date).
//
// Filter values hold instants as Unix seconds (Astryx). A calendar day is midnight in the
// filter's zone, else UTC; a date and time is a wall time in the filter's zone, else the
// viewer's. Wall times that a zone skips or repeats resolve as Temporal's 'compatible'
// disambiguation does (as `Date` did in Astryx). Used by PowerSearch's server render, its
// editors and tokens (elements/power-search.ts).
import {formatCalendarInstant, type CalendarSystem} from '../../lib/date/calendarSystem';
import {hostTimeZone, zonedOf} from '../../lib/date/instant';
import {plainDateFromInstant, plainDateFromISO, plainDateFromTemporal, plainDateToInstant, plainDateToISO} from '../../lib/date/plainDate';

/** A calendar day is midnight in `timezoneID` (else UTC); a time of day shows in it (else the viewer's zone). */
export function resolveDateZone(timezoneID: string | undefined, isDateOnly: boolean): string | undefined {
  if (timezoneID) return timezoneID;
  return isDateOnly ? 'UTC' : undefined;
}

/** The ISO date an instant falls on in `zone` (the viewer's zone when undefined). */
export function unixSecondsToISODate(unixSeconds: number, zone: string | undefined): string {
  const instant = unixSeconds * 1000;
  return plainDateToISO(zone == null ? plainDateFromTemporal(zonedOf(instant).toPlainDate()) : plainDateFromInstant(instant, zone));
}

/** The Unix seconds of a date's midnight in `zone` (the viewer's zone when undefined). */
export function isoDateToUnixSeconds(date: string, zone: string | undefined): number {
  return Math.floor(plainDateToInstant(plainDateFromISO(date as never), zone ?? hostTimeZone()) / 1000);
}

/** The ISO wall-clock date and time (`YYYY-MM-DDTHH:MM`) of an instant in `zone` (else the viewer's). */
export function unixSecondsToISODateTime(unixSeconds: number, zone: string | undefined): string {
  return zonedOf(unixSeconds * 1000, zone).toPlainDateTime().toString({smallestUnit: 'minute', roundingMode: 'trunc'});
}

/** The Unix seconds of a wall time `YYYY-MM-DD[THH:MM]` in `zone` (else the viewer's). */
export function isoDateTimeToUnixSeconds(value: string, zone: string | undefined): number {
  const [datePart, timePart = '00:00'] = value.split('T');
  const [hour = 0, minute = 0] = timePart.split(':').map(Number);
  return Math.floor(plainDateToInstant(plainDateFromISO(datePart as never), zone ?? hostTimeZone(), hour, minute) / 1000);
}

/** A `date_absolute` value as the locale writes it, in `calendar` (formatFilterValue's date branch). */
export function formatDateAbsolute(unixSeconds: number, locale: string, timezoneID: string | undefined, isDateOnly = true, calendar: CalendarSystem = 'gregory'): string {
  const options: Intl.DateTimeFormatOptions = isDateOnly
    ? {year: 'numeric', month: 'short', day: 'numeric'}
    : {year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'};
  return formatCalendarInstant(calendar, unixSeconds * 1000, options, locale as never, resolveDateZone(timezoneID, isDateOnly));
}
