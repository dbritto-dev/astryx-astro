// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Ported from @astryxdesign/core 0.7.9 src/utils/timeParser.ts (times are checked,
// compared, clamped and stepped as Temporal.PlainTime; the typed-text grammar is Astryx's).

/**
 * @file timeParser.ts
 * @input Uses string parsing
 * @output Exports time parsing and formatting utilities
 * @position Shared utility; used by TimeInput and DateTimeInput
 *
 * SYNC: When modified, update this header
 */

import {Temporal, isTemporal} from '../temporal';

/**
 * ISO time string in HH:MM or HH:MM:SS format (24-hour).
 * Examples: "14:30", "09:15:00", "23:59:59"
 */
export type ISOTimeString = string & {readonly __brand: 'ISOTimeString'};

/**
 * Parsed time object for internal manipulation.
 */
export interface ParsedTime {
  hour: number; // 0-23
  minute: number; // 0-59
  second: number; // 0-59
}

/**
 * Validates and creates an ISOTimeString from a string.
 * Returns null if the string is not a valid time format.
 */
export function createISOTimeString(value: string): ISOTimeString | null {
  const parsed = parseISOTime(value);
  if (!parsed) {
    return null;
  }
  return formatISOTime(parsed, value.split(':').length === 3);
}

/**
 * A wall time as a `Temporal.PlainTime`, or null when it is not one. Takes Astryx's lenient
 * `HH:MM[:SS]` text (see `parseISOTime`) or a `Temporal.PlainTime` (port addition).
 */
export function toPlainTime(
  time: string | Temporal.PlainTime | null | undefined,
): Temporal.PlainTime | null {
  if (isTemporal(time, 'PlainTime')) {
    return time;
  }
  if (!time || typeof time !== 'string') {
    return null;
  }

  // Astryx's grammar: two or three colon-separated fields, each read with
  // parseInt (so "7:8" and "14:30abc" are times), then checked by Temporal.
  const parts = time.split(':');
  if (parts.length < 2 || parts.length > 3) {
    return null;
  }
  const hour = parseInt(parts[0], 10);
  const minute = parseInt(parts[1], 10);
  const second = parts.length === 3 ? parseInt(parts[2], 10) : 0;
  return plainTimeOf({hour, minute, second});
}

/** The PlainTime of the fields, or null when any is out of range (or not a number). */
function plainTimeOf(fields: ParsedTime): Temporal.PlainTime | null {
  try {
    return Temporal.PlainTime.from(fields, {overflow: 'reject'});
  } catch {
    return null;
  }
}

function toParsed(time: Temporal.PlainTime): ParsedTime {
  return {hour: time.hour, minute: time.minute, second: time.second};
}

/**
 * Parses an ISO time string into a ParsedTime object.
 * Accepts HH:MM or HH:MM:SS format.
 */
export function parseISOTime(time: string): ParsedTime | null {
  const parsed = toPlainTime(time);
  return parsed ? toParsed(parsed) : null;
}

/**
 * Formats a ParsedTime object (or a `Temporal.PlainTime`) into an ISOTimeString:
 * `Temporal.PlainTime#toString` to the minute or the second. Throws a RangeError
 * for fields that are not a time of day.
 */
export function formatISOTime(
  time: ParsedTime | Temporal.PlainTime,
  includeSeconds: boolean = false,
): ISOTimeString {
  const plain = isTemporal(time, 'PlainTime')
    ? time
    : Temporal.PlainTime.from(time, {overflow: 'reject'});
  return plain.toString({
    smallestUnit: includeSeconds ? 'second' : 'minute',
    roundingMode: 'trunc',
  }) as ISOTimeString;
}

/**
 * Formats a time for display in 12-hour format.
 * Example: "14:30" -> "2:30 PM"
 */
export function formatDisplayTime12h(
  time: ISOTimeString | undefined,
  includeSeconds: boolean = false,
): string {
  if (!time) {
    return '';
  }

  const parsed = toPlainTime(time);
  if (!parsed) {
    return '';
  }

  const hour12 =
    parsed.hour === 0 ? 12 : parsed.hour > 12 ? parsed.hour - 12 : parsed.hour;
  const meridiem = parsed.hour < 12 ? 'AM' : 'PM';
  const mm = parsed.minute.toString().padStart(2, '0');

  if (includeSeconds) {
    const ss = parsed.second.toString().padStart(2, '0');
    return `${hour12}:${mm}:${ss} ${meridiem}`;
  }

  return `${hour12}:${mm} ${meridiem}`;
}

/**
 * Formats a time for display in 24-hour format.
 * Example: "14:30" -> "14:30"
 */
export function formatDisplayTime24h(
  time: ISOTimeString | undefined,
  includeSeconds: boolean = false,
): string {
  if (!time) {
    return '';
  }

  const parsed = toPlainTime(time);
  if (!parsed) {
    return '';
  }

  const hh = parsed.hour.toString().padStart(2, '0');
  const mm = parsed.minute.toString().padStart(2, '0');

  if (includeSeconds) {
    const ss = parsed.second.toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  return `${hh}:${mm}`;
}

/**
 * Parses user input into an ISOTimeString.
 * Accepts various formats:
 * - "2:30 PM", "2:30pm", "2:30 pm"
 * - "14:30", "1430"
 * - "2pm", "2 PM"
 */
export function parseTimeInput(
  input: string,
  includeSeconds: boolean = false,
): ISOTimeString | null {
  if (!input) {
    return null;
  }

  const trimmed = input.trim().toLowerCase();

  // Check for AM/PM. hasMeridiem is derived from isPM/isAM so the detection
  // can never drift from them: it previously used its own regex without the
  // optional dots, so dotted meridiems ("2:30 p.m.") skipped the 12h -> 24h
  // conversion and parsed 12 hours off.
  const isPM = /p\.?m?\.?\s*$/i.test(trimmed);
  const isAM = /a\.?m?\.?\s*$/i.test(trimmed);
  const hasMeridiem = isPM || isAM;

  // Remove AM/PM suffix
  const timeStr = trimmed.replace(/\s*[ap]\.?m?\.?\s*$/i, '').trim();

  const convertHourTo24Hour = (hour: number): number | null => {
    if (!hasMeridiem) {
      return hour;
    }
    if (hour < 1 || hour > 12) {
      return null;
    }
    if (isPM && hour !== 12) {
      return hour + 12;
    }
    if (isAM && hour === 12) {
      return 0;
    }
    return hour;
  };

  // Handle formats like "2pm" -> "2"
  if (/^\d{1,2}$/.test(timeStr)) {
    const hour = parseInt(timeStr, 10);
    if (hasMeridiem) {
      const hour24 = convertHourTo24Hour(hour);
      if (hour24 === null) {
        return null;
      }
      return formatISOTime(
        {hour: hour24, minute: 0, second: 0},
        includeSeconds,
      );
    }
    if (hour >= 0 && hour <= 23 && !hasMeridiem) {
      return formatISOTime({hour, minute: 0, second: 0}, includeSeconds);
    }
    return null;
  }

  // Handle "1430" format
  if (/^\d{4}$/.test(timeStr)) {
    const hour = parseInt(timeStr.slice(0, 2), 10);
    const minute = parseInt(timeStr.slice(2, 4), 10);
    const hour24 = convertHourTo24Hour(hour);
    if (
      hour24 !== null &&
      hour24 >= 0 &&
      hour24 <= 23 &&
      minute >= 0 &&
      minute <= 59
    ) {
      return formatISOTime({hour: hour24, minute, second: 0}, includeSeconds);
    }
    return null;
  }

  // Handle "143000" format (with seconds)
  if (/^\d{6}$/.test(timeStr)) {
    const hour = parseInt(timeStr.slice(0, 2), 10);
    const minute = parseInt(timeStr.slice(2, 4), 10);
    const second = parseInt(timeStr.slice(4, 6), 10);
    const hour24 = convertHourTo24Hour(hour);
    if (
      hour24 !== null &&
      hour24 >= 0 &&
      hour24 <= 23 &&
      minute >= 0 &&
      minute <= 59 &&
      second >= 0 &&
      second <= 59
    ) {
      return formatISOTime({hour: hour24, minute, second}, includeSeconds);
    }
    return null;
  }

  // Handle colon-separated formats
  const colonParts = timeStr.split(':');
  if (colonParts.length >= 2 && colonParts.length <= 3) {
    let hour = parseInt(colonParts[0], 10);
    const minute = parseInt(colonParts[1], 10);
    const second = colonParts.length === 3 ? parseInt(colonParts[2], 10) : 0;

    if (isNaN(hour) || isNaN(minute) || isNaN(second)) {
      return null;
    }
    if (minute < 0 || minute > 59 || second < 0 || second > 59) {
      return null;
    }

    // Convert 12h to 24h if meridiem present
    if (hasMeridiem) {
      if (hour < 1 || hour > 12) {
        return null;
      }
      if (isPM && hour !== 12) {
        hour += 12;
      }
      if (isAM && hour === 12) {
        hour = 0;
      }
    } else {
      if (hour < 0 || hour > 23) {
        return null;
      }
    }

    return formatISOTime({hour, minute, second}, includeSeconds);
  }

  return null;
}

/**
 * Compares two times. Returns:
 * - negative if a < b
 * - 0 if a === b
 * - positive if a > b
 */
export function compareTime(
  a: ISOTimeString | undefined,
  b: ISOTimeString | undefined,
): number {
  if (!a && !b) {
    return 0;
  }
  if (!a) {
    return -1;
  }
  if (!b) {
    return 1;
  }

  const parsedA = toPlainTime(a);
  const parsedB = toPlainTime(b);

  if (!parsedA && !parsedB) {
    return 0;
  }
  if (!parsedA) {
    return -1;
  }
  if (!parsedB) {
    return 1;
  }

  return Temporal.PlainTime.compare(parsedA, parsedB);
}

/**
 * Checks if a time is within a min/max range (inclusive).
 */
export function isTimeInRange(
  time: ISOTimeString,
  min?: ISOTimeString,
  max?: ISOTimeString,
): boolean {
  if (min && compareTime(time, min) < 0) {
    return false;
  }
  if (max && compareTime(time, max) > 0) {
    return false;
  }
  return true;
}

/**
 * Clamps a time to a min/max range. Without seconds, a bound that falls
 * between whole minutes gives the nearest whole minute inside the range.
 */
export function clampTime(
  time: ISOTimeString,
  min?: ISOTimeString,
  max?: ISOTimeString,
  includeSeconds: boolean = false,
): ISOTimeString {
  const parsed = toPlainTime(time);
  if (!parsed) {
    return time;
  }

  if (min && compareTime(time, min) < 0) {
    const parsedMin = toPlainTime(min);
    if (parsedMin) {
      return formatISOTime(
        onWholeMinute(parsedMin, 1, includeSeconds, max),
        includeSeconds,
      );
    }
  }
  if (max && compareTime(time, max) > 0) {
    const parsedMax = toPlainTime(max);
    if (parsedMax) {
      return formatISOTime(
        onWholeMinute(parsedMax, -1, includeSeconds, min),
        includeSeconds,
      );
    }
  }

  return time;
}

/**
 * A bound as a time without seconds reaches it: the next whole minute up from
 * a minimum, or the whole minute down from a maximum. With no whole minute
 * before the other bound, the bound stays as it is.
 */
function onWholeMinute(
  bound: Temporal.PlainTime,
  direction: 1 | -1,
  includeSeconds: boolean,
  other: ISOTimeString | undefined,
): Temporal.PlainTime {
  if (includeSeconds || bound.second === 0) {
    return bound;
  }
  // The whole minute down (a maximum) or up (a minimum); none above 23:59.
  const down = bound.round({smallestUnit: 'minute', roundingMode: 'floor'});
  if (direction === 1 && down.hour === 23 && down.minute === 59) {
    return bound;
  }
  const rounded = direction === 1 ? down.add({minutes: 1}) : down;
  const order = compareTime(formatISOTime(rounded, true), other);
  if (other && (direction === 1 ? order > 0 : order < 0)) {
    return bound;
  }
  return rounded;
}

/**
 * Adjusts a time by adding/subtracting minutes.
 *
 * `deltaMinutes` is a whole number of minutes. A fractional delta leaves the
 * time unchanged rather than returning a value that is no longer a time —
 * `HH:MM` has no place for a fraction of a minute.
 */
export function adjustTime(
  time: ISOTimeString,
  deltaMinutes: number,
  includeSeconds: boolean = false,
): ISOTimeString {
  const parsed = toPlainTime(time);
  if (!parsed) {
    return time;
  }

  // A non-finite delta would spin the wrap-around forever (-Infinity) or
  // produce "NaN:NaN" (NaN), and a fractional one is never rounded on the way
  // out — formatISOTime pads "30.5" to two characters and leaves it, so the
  // caller gets back a value that is no longer a time. Steps are whole
  // minutes: return the input unchanged instead.
  if (!Number.isInteger(deltaMinutes)) {
    return time;
  }

  // Temporal.PlainTime arithmetic wraps around midnight. The delta is
  // reduced to one day first, so a huge integer stays exact.
  return formatISOTime(
    parsed.add({minutes: deltaMinutes % (24 * 60)}),
    includeSeconds,
  );
}
