// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Ported from @astryxdesign/core 0.7.9 src/Timestamp/Timestamp.tsx — the pure
// types and formatting utilities only (the React component is ported separately).
// `effectiveTimestampFormat` lifts the inline format-resolution expression of the
// component's render into a function; the other helpers are verbatim and exported.

// =============================================================================
// Types
// =============================================================================

export type TimestampFormat =
  | 'relative'
  | 'relative_short'
  | 'auto'
  | 'date'
  | 'date_long'
  | 'date_weekday'
  | 'date_time'
  | 'time'
  | 'system_date'
  | 'system_date_time'
  | 'system_time'
  | 'unix_seconds';

// =============================================================================
// Formatting utilities
// =============================================================================

export const MINUTE = 60;
export const HOUR = 3600;
export const DAY = 86400;

/** Default auto threshold: 7 days in seconds */
export const DEFAULT_AUTO_THRESHOLD = 7 * DAY;

export function parseValue(value: string | number): Date {
  if (typeof value === 'number') {
    // Heuristic: if the number is less than 1e12, treat as seconds; otherwise ms.
    // Unix timestamps in seconds are < 1e12 until ~2286.
    return new Date(value < 1e12 ? value * 1000 : value);
  }
  return new Date(value);
}

/** Returns the interval (in ms) at which a relative timestamp should update. */
export function getLiveInterval(diffSeconds: number): number {
  const absDiff = Math.abs(diffSeconds);
  if (absDiff < MINUTE) {
    return 1000;
  } // every second
  if (absDiff < HOUR) {
    return 30_000;
  } // every 30s
  if (absDiff < DAY) {
    return 60_000;
  } // every minute
  return 300_000; // every 5 minutes
}

/** Whether a format is non-relative (i.e. shows a fixed date/time). */
export function isAbsoluteFormat(
  format: TimestampFormat,
): format is Exclude<TimestampFormat, 'relative' | 'relative_short' | 'auto'> {
  return (
    format !== 'relative' && format !== 'relative_short' && format !== 'auto'
  );
}

/**
 * Whether a format renders a relative phrase ("2 hours ago" / "2h ago") rather
 * than a fixed instant. Both the long and short relative forms share the same
 * treatment: they get the accessible full-date name, the hover tooltip, and
 * live updates.
 */
export function isRelativeFormat(
  format: TimestampFormat,
): format is 'relative' | 'relative_short' {
  return format === 'relative' || format === 'relative_short';
}

/**
 * The format a Timestamp renders right now (Timestamp.tsx render). Until the
 * clock is read (`now === null`: server renders, static prerenders and the
 * hydration pass) a clock-dependent format renders as the full date and time;
 * `auto` is relative within `autoThreshold` seconds of `now`, else `date_time`.
 * Absolute formats never read the clock.
 */
export function effectiveTimestampFormat(
  format: TimestampFormat,
  date: Date,
  now: Date | null,
  autoThreshold: number = DEFAULT_AUTO_THRESHOLD,
): TimestampFormat {
  const needsClock = !isAbsoluteFormat(format);
  const isClockPending = needsClock && now === null;
  const diffSeconds =
    now === null ? 0 : Math.round((now.getTime() - date.getTime()) / 1000);
  return isClockPending
    ? 'date_time'
    : format === 'auto'
      ? Math.abs(diffSeconds) <= autoThreshold
        ? 'relative'
        : 'date_time'
      : format;
}
