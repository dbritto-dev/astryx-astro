/**
 * Component values (port addition). Astryx's date components take ISO strings; the port's also
 * take the matching Temporal type — a `Temporal.PlainDate` for a date, a `Temporal.PlainTime`
 * for a time, a `Temporal.PlainDateTime` or `Temporal.ZonedDateTime` for a date and time.
 * These turn either into the ISO string the component works with. A string passes through
 * unchanged (each component validates it as before), so string props render exactly as they
 * did; event `detail`s stay Astryx's ISO strings.
 */
import {Temporal, temporalKind} from '../temporal';
import type {ISODateString} from './dateTypes';
import type {ISOTimeString} from './timeParser';
import {plainDateToISO} from './plainDate';
import {formatISOTime} from './timeParser';

/** A date value: `YYYY-MM-DD` or a `Temporal.PlainDate` (another calendar counts as its ISO day). */
export type DateValue = ISODateString | Temporal.PlainDate;

/** A time value: `HH:MM[:SS]` or a `Temporal.PlainTime`. */
export type TimeValue = ISOTimeString | string | Temporal.PlainTime;

/**
 * A date-and-time value: `YYYY-MM-DDTHH:MM[:SS]`, a `Temporal.PlainDateTime`, or a
 * `Temporal.ZonedDateTime` (its wall-clock date and time in its own zone).
 */
export type DateTimeValue = string | Temporal.PlainDateTime | Temporal.ZonedDateTime;

/** The ISO date of a date value (a string as given; null and undefined too). */
export function isoDateOf(value: DateValue): ISODateString;
export function isoDateOf<N extends null | undefined>(value: DateValue | N): ISODateString | N;
export function isoDateOf(value: DateValue | null | undefined): ISODateString | null | undefined {
  return temporalKind(value) === 'PlainDate' ? plainDateToISO(value as Temporal.PlainDate) : (value as ISODateString | null | undefined);
}

/** A PlainTime as `HH:MM`, or `HH:MM:SS` when it has seconds: the string one would write for it. */
function isoTimeText(time: Temporal.PlainTime): ISOTimeString {
  return formatISOTime(time, time.second !== 0);
}

/**
 * The ISO time of a time value (a string as given; null and undefined too). A PlainTime is
 * written to the minute, or to the second when it has seconds (sub-seconds are dropped).
 */
export function isoTimeOf(value: TimeValue): ISOTimeString;
export function isoTimeOf<N extends null | undefined>(value: TimeValue | N): ISOTimeString | N;
export function isoTimeOf(value: TimeValue | null | undefined): ISOTimeString | null | undefined {
  return temporalKind(value) === 'PlainTime' ? isoTimeText(value as Temporal.PlainTime) : (value as ISOTimeString | null | undefined);
}

/**
 * The ISO date and time (`YYYY-MM-DDTHH:MM[:SS]`, seconds when it has them) of a
 * date-and-time value (a string as given; null and undefined too). A ZonedDateTime gives its
 * wall-clock date and time in its own zone.
 */
export function isoDateTimeOf(value: DateTimeValue): string;
export function isoDateTimeOf<N extends null | undefined>(value: DateTimeValue | N): string | N;
export function isoDateTimeOf(value: DateTimeValue | null | undefined): string | null | undefined {
  const kind = temporalKind(value);
  if (kind !== 'PlainDateTime' && kind !== 'ZonedDateTime') return value as string | null | undefined;
  const dateTime = kind === 'ZonedDateTime' ? (value as Temporal.ZonedDateTime).toPlainDateTime() : (value as Temporal.PlainDateTime);
  return `${plainDateToISO(dateTime.toPlainDate())}T${isoTimeText(dateTime.toPlainTime())}`;
}
