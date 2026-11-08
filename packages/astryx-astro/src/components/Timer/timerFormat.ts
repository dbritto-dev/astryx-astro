/**
 * Timer formatting — port of the pure part of @astryxdesign/core Timer/Timer.tsx
 * (getPresentation, getMillisecondsUntilNextChange), shared by Timer.astro (the server's
 * first paint) and the <ax-timer> element (ticks).
 *
 * Astryx's rules, unchanged: `elapsed` reads "5s", "2m 05s", then "1h 05m" (seconds drop
 * after an hour and the text updates by the minute); `clock` reads "m:ss" / "h:mm:ss" and
 * stays second-precise. The ISO 8601 `dateTime` is "PT<seconds>S" (whole minutes once the
 * elapsed text drops seconds). Port addition: numbers are written with
 * Intl.NumberFormat in the resolved locale (no grouping, 2-digit padding where Astryx
 * pads), so locales with their own digits get them; Latin-digit locales read exactly as
 * Astryx. Unit letters and separators are Astryx's.
 *
 * Temporal: the elapsed time is a `Temporal.Duration` balanced to hours, minutes and seconds,
 * and the `dateTime` is that duration's own ISO string (`Temporal.Duration#toString`, seconds
 * only: "PT125S", as Astryx writes it). Intl.DurationFormat is not used: it never writes
 * Astryx's shapes beyond one case — `digital` pads the leading field ("05:03" where Astryx
 * writes "5:03") and follows the locale's separator (Finnish and Danish "1.05.03"), `narrow`
 * leaves minutes unpadded ("1h 5m" for "1h 05m") — and Node 22 lacks it, so the server's
 * first paint could not use it either. Parity beats novelty here.
 */
import {Temporal} from '../../lib/temporal';

export type TimerFormat = 'elapsed' | 'clock';

export interface TimerPresentation {
  dateTime: string;
  text: string;
}

const ONE_SECOND_MS = 1000;
const ONE_MINUTE_MS = 60 * ONE_SECOND_MS;
const ONE_HOUR_SECONDS = 60 * 60;
const MAX_TIMEOUT_MS = 2_147_483_647;

export function resolveFormat(format: string | null | undefined): TimerFormat {
  return format === 'clock' ? 'clock' : 'elapsed';
}

export interface Digits {
  /** A number as-is. */
  n: (value: number) => string;
  /** A number padded to two digits. */
  p: (value: number) => string;
}

const digitsCache = new Map<string, Digits>();

/** Locale-aware digit writers (falls back to 'en' for an invalid tag). */
export function digitsFor(locale: string | null | undefined): Digits {
  const key = locale || 'en';
  let digits = digitsCache.get(key);
  if (digits) return digits;
  let plain: Intl.NumberFormat;
  let padded: Intl.NumberFormat;
  try {
    plain = new Intl.NumberFormat(key, {useGrouping: false, maximumFractionDigits: 0});
    padded = new Intl.NumberFormat(key, {useGrouping: false, maximumFractionDigits: 0, minimumIntegerDigits: 2});
  } catch {
    plain = new Intl.NumberFormat('en', {useGrouping: false, maximumFractionDigits: 0});
    padded = new Intl.NumberFormat('en', {useGrouping: false, maximumFractionDigits: 0, minimumIntegerDigits: 2});
  }
  digits = {n: (v) => plain.format(v), p: (v) => padded.format(v)};
  digitsCache.set(key, digits);
  return digits;
}

export function getElapsedMilliseconds(now: number, startTime: number): number {
  return Math.max(0, now - startTime);
}

/** The elapsed time in whole seconds, as a Duration balanced to hours (a fraction of a second is dropped). */
function elapsedDuration(elapsedMilliseconds: number): Temporal.Duration {
  return Temporal.Duration.from({milliseconds: Math.floor(elapsedMilliseconds)}).round({
    largestUnit: 'hours',
    smallestUnit: 'seconds',
    roundingMode: 'trunc',
  });
}

/** A duration's ISO 8601 string in seconds only ("PT125S"), Astryx's `dateTime` shape. */
function isoSeconds(duration: Temporal.Duration): string {
  return Temporal.Duration.from({seconds: duration.total('seconds')}).toString();
}

export function getPresentation(elapsedMilliseconds: number, format: TimerFormat, d: Digits = digitsFor('en')): TimerPresentation {
  const elapsed = elapsedDuration(elapsedMilliseconds);
  const {hours, minutes, seconds} = elapsed;
  if (format === 'clock') {
    return {
      dateTime: isoSeconds(elapsed),
      text: hours > 0 ? `${d.n(hours)}:${d.p(minutes)}:${d.p(seconds)}` : `${d.n(minutes)}:${d.p(seconds)}`,
    };
  }
  if (hours === 0 && minutes === 0) {
    return {dateTime: isoSeconds(elapsed), text: `${d.n(seconds)}s`};
  }
  if (hours === 0) {
    return {dateTime: isoSeconds(elapsed), text: `${d.n(minutes)}m ${d.p(seconds)}s`};
  }
  // Past an hour the text drops the seconds, and so does the duration it names.
  const shown = elapsed.round({largestUnit: 'hours', smallestUnit: 'minutes', roundingMode: 'trunc'});
  return {
    dateTime: isoSeconds(shown),
    text: `${d.n(shown.hours)}h ${d.p(shown.minutes)}m`,
  };
}

export function getMillisecondsUntilNextChange(now: number, startTime: number, elapsedMilliseconds: number, format: TimerFormat): number {
  if (now < startTime) return Math.min(startTime - now + ONE_SECOND_MS, MAX_TIMEOUT_MS);
  const precision = format === 'elapsed' && elapsedMilliseconds >= ONE_HOUR_SECONDS * ONE_SECOND_MS ? ONE_MINUTE_MS : ONE_SECOND_MS;
  return precision - (elapsedMilliseconds % precision);
}
