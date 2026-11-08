/**
 * The one entry for Temporal in astryx-astro: `import {Temporal} from '../lib/temporal'`.
 *
 * It is the platform's own `globalThis.Temporal` where the runtime has one (Chrome / Edge 144+,
 * Firefox 139+), else `temporal-polyfill`'s `/full` build (every calendar Astryx shows), loaded
 * with a dynamic import only then: today in Safari and in Node on the server. The polyfill is a
 * ponyfill here — nothing is installed on `globalThis`, so a page's own Temporal (native or a
 * polyfill it installs itself) is never replaced.
 *
 * Top-level await: a module that imports this one evaluates after Temporal is ready, so every
 * caller uses it synchronously. Only date / time code imports it (lib/date, the date components,
 * Timer), so the scripts of pages without dates never wait on it, and where Temporal is native
 * the polyfill chunk is never requested.
 *
 * Formatting: never hand a Temporal object to `Intl.DateTimeFormat` (or call `toLocaleString`
 * on one). Both the polyfill's `Intl.DateTimeFormat` and the native one derive a different
 * pattern for Temporal objects than for an instant (ja-JP `{month: 'long'}` prints "2026/3/21"
 * instead of "2026年3月21日"; en-GB drops `hour: 'numeric'` for "07:00"). lib/date formats the
 * epoch milliseconds of a Temporal value with the native formatter instead, which is
 * byte-identical under native and polyfilled Temporal. See lib/date/README.md.
 */
import type {Temporal as TemporalSpec} from 'temporal-polyfill';
import {temporalKind, type TemporalKind} from './temporalKind';

export {temporalKind, type TemporalKind};

type TemporalNamespace = typeof TemporalSpec;

const native = (globalThis as {Temporal?: TemporalNamespace}).Temporal;

/** True when the runtime has its own Temporal (no polyfill loaded). */
export const isNativeTemporal = native !== undefined;

/** The Temporal namespace: native when the runtime has it, else the `/full` polyfill. */
export const Temporal: TemporalNamespace = native ?? (await import('temporal-polyfill/full')).Temporal;

/** The Temporal types (`Temporal.PlainDate`, `Temporal.Instant` …), from the spec typings. */
export declare namespace Temporal {
  export type PlainDate = TemporalSpec.PlainDate;
  export type PlainTime = TemporalSpec.PlainTime;
  export type PlainDateTime = TemporalSpec.PlainDateTime;
  export type PlainYearMonth = TemporalSpec.PlainYearMonth;
  export type PlainMonthDay = TemporalSpec.PlainMonthDay;
  export type ZonedDateTime = TemporalSpec.ZonedDateTime;
  export type Instant = TemporalSpec.Instant;
  export type Duration = TemporalSpec.Duration;
  export type DurationLike = TemporalSpec.DurationLike;
  export type PlainDateLike = TemporalSpec.PlainDateLike;
  export type PlainTimeLike = TemporalSpec.PlainTimeLike;
}

/** The Temporal type of each kind `temporalKind()` names. */
export interface TemporalKinds {
  PlainDate: Temporal.PlainDate;
  PlainTime: Temporal.PlainTime;
  PlainDateTime: Temporal.PlainDateTime;
  PlainYearMonth: Temporal.PlainYearMonth;
  PlainMonthDay: Temporal.PlainMonthDay;
  ZonedDateTime: Temporal.ZonedDateTime;
  Instant: Temporal.Instant;
  Duration: Temporal.Duration;
}

/** Whether a value is a Temporal object of the given kind (`'PlainDate'`, `'Instant'` …). */
export function isTemporal<K extends TemporalKind>(value: unknown, kind: K): value is TemporalKinds[K] {
  return temporalKind(value) === kind;
}
