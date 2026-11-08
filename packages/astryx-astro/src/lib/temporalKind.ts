/**
 * Recognizing Temporal values without loading Temporal. Code that every page of a kind ships
 * (the Table plugins and their client features, PowerSearch's row matcher) reads Temporal
 * values through these helpers instead of importing lib/temporal, so a page whose tables hold
 * no dates never waits on (or, in Safari, downloads) the Temporal polyfill. Works for native
 * and polyfilled objects alike: both brand their prototypes with `Symbol.toStringTag`.
 */

/** The Temporal types a value can be, by the name its `Symbol.toStringTag` carries. */
export type TemporalKind =
  | 'PlainDate'
  | 'PlainTime'
  | 'PlainDateTime'
  | 'PlainYearMonth'
  | 'PlainMonthDay'
  | 'ZonedDateTime'
  | 'Instant'
  | 'Duration';

const KINDS: ReadonlySet<string> = new Set<TemporalKind>(['PlainDate', 'PlainTime', 'PlainDateTime', 'PlainYearMonth', 'PlainMonthDay', 'ZonedDateTime', 'Instant', 'Duration']);

/** The kind of a Temporal object (`"Temporal.PlainDate"` → `'PlainDate'`), or null for anything else. */
export function temporalKind(value: unknown): TemporalKind | null {
  if (value === null || typeof value !== 'object') return null;
  const tag = (value as {[Symbol.toStringTag]?: unknown})[Symbol.toStringTag];
  if (typeof tag !== 'string' || !tag.startsWith('Temporal.')) return null;
  const kind = tag.slice('Temporal.'.length);
  return KINDS.has(kind) ? (kind as TemporalKind) : null;
}

/**
 * The epoch milliseconds of an exact time: a `Temporal.Instant` or `Temporal.ZonedDateTime`, or
 * a `Date` (Astryx's own input type, accepted as given). Null for anything else, including an
 * invalid Date.
 */
export function exactTimeMilliseconds(value: unknown): number | null {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? null : time;
  }
  const kind = temporalKind(value);
  return kind === 'Instant' || kind === 'ZonedDateTime' ? (value as {epochMilliseconds: number}).epochMilliseconds : null;
}

/** A Temporal value's static `compare` (every kind but Duration has one that needs no options). */
export function compareTemporal(a: unknown, b: unknown): number | null {
  const kind = temporalKind(a);
  if (kind === null || kind === 'Duration' || kind === 'PlainMonthDay' || kind !== temporalKind(b)) return null;
  const compare = (a as {constructor?: {compare?: (x: unknown, y: unknown) => number}}).constructor?.compare;
  return typeof compare === 'function' ? compare(a, b) : null;
}

/**
 * The epoch milliseconds a date filter compares a `Temporal.PlainDate` by: its UTC midnight,
 * the instant a date-only filter value names (Astryx reads `YYYY-MM-DD` as UTC midnight).
 * Null for anything else. Uses the value's own methods, so Temporal is not loaded here.
 */
export function plainDateUtcMilliseconds(value: unknown): number | null {
  return temporalKind(value) === 'PlainDate'
    ? (value as {toZonedDateTime(zone: string): {epochMilliseconds: number}}).toZonedDateTime('UTC').epochMilliseconds
    : null;
}
