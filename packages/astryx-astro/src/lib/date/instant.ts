/**
 * Exact times for lib/date (port addition). Astryx passes instants around as `Date`s; the
 * Temporal port accepts a `Date`, epoch milliseconds, a `Temporal.Instant` or a
 * `Temporal.ZonedDateTime` (read as its instant) wherever Astryx takes a `Date`, and works on
 * `Temporal.Instant` inside.
 *
 * Intl formats an instant from its epoch milliseconds (`epochMillisecondsOf`), never from the
 * Temporal object: see lib/temporal.ts for why.
 */
import {Temporal, temporalKind} from '../temporal';

/** An exact time: a `Date`, epoch milliseconds, a `Temporal.Instant` or a `Temporal.ZonedDateTime`. */
export type ExactTime = Date | number | Temporal.Instant | Temporal.ZonedDateTime;

/**
 * The epoch milliseconds of an exact time. NaN for an invalid `Date` or a non-finite number,
 * which `Intl` rejects with the RangeError a `Date` would give. A fractional number is
 * truncated, as `new Date(n)` does.
 */
export function epochMillisecondsOf(value: ExactTime): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : NaN;
  // `Date` is Astryx's own input type here: read it, never build one.
  if (value instanceof Date) return value.getTime();
  return value.epochMilliseconds;
}

/** An exact time as a `Temporal.Instant` (a ZonedDateTime gives its instant). Throws a RangeError when it is invalid. */
export function toInstant(value: ExactTime): Temporal.Instant {
  const kind = temporalKind(value);
  if (kind === 'Instant') return value as Temporal.Instant;
  if (kind === 'ZonedDateTime') return (value as Temporal.ZonedDateTime).toInstant();
  return Temporal.Instant.fromEpochMilliseconds(epochMillisecondsOf(value as Date | number));
}

/**
 * The viewer's (host's) time zone, read on every call: it can change while a page is open, and
 * Astryx's zone-less paths follow it, as `Date`'s local-time getters do.
 */
export function hostTimeZone(): string {
  return Temporal.Now.timeZoneId();
}

/** The exact time in a zone, or in the host's zone when `timeZone` is omitted. */
export function zonedOf(value: ExactTime, timeZone?: string | null): Temporal.ZonedDateTime {
  return toInstant(value).toZonedDateTimeISO(timeZone || hostTimeZone());
}

/** Whole seconds from `from` to `to` (positive when `to` is later), rounded as `Math.round` rounds. */
export function secondsBetween(from: ExactTime, to: ExactTime): number {
  return Math.round(toInstant(from).until(toInstant(to)).total('seconds'));
}
