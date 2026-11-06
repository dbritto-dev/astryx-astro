// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Ported from @astryxdesign/core 0.7.9 src/DateTimeInput/DateTimeInput.tsx
// (splitDateTime, combineDateTime, getDefaultTime's use, the timeOptions memo,
// selectedOptionTime, closestOptionIndex, handleDateChange's boundary clamp, timeMin/timeMax).

/** DateTimeInput's pure helpers, shared by the server render and `<ax-date-time-input>`. */
import {formatISOTime, isTimeInRange, parseISOTime, type ISODateString, type ISOTimeString} from '../../lib/date';

export type ISODateTimeString = string & {readonly __brand?: 'ISODateTimeString'};

export interface DateTimeParts {
  date: ISODateString | undefined;
  time: ISOTimeString | undefined;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DDTHH:MM[:SS]" → its parts (a value without a T is all date). */
export function splitDateTime(dt: string | undefined | null): DateTimeParts {
  if (!dt) return {date: undefined, time: undefined};
  const tIndex = dt.indexOf('T');
  if (tIndex === -1) return {date: ISO_DATE.test(dt) ? (dt as ISODateString) : undefined, time: undefined};
  const date = dt.slice(0, tIndex);
  const time = dt.slice(tIndex + 1);
  return {
    date: ISO_DATE.test(date) ? (date as ISODateString) : undefined,
    time: parseISOTime(time) ? (time as ISOTimeString) : undefined,
  };
}

/** Both parts, or undefined (a datetime is reported only once both exist). */
export function combineDateTime(date: ISODateString | undefined, time: ISOTimeString | undefined): ISODateTimeString | undefined {
  if (!date || !time) return undefined;
  return `${date}T${time}` as ISODateTimeString;
}

/** A value the field can show: an ISO date with an optional valid time. */
export function normalizeDateTime(value: unknown): ISODateTimeString | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const {date, time} = splitDateTime(value);
  if (!date) return undefined;
  return (value.includes('T') ? (time ? value : date) : value) as ISODateTimeString;
}

/** The time bounds on `date`: min/max times apply only on their own days. */
export function timeBoundsFor(date: ISODateString | undefined, min: DateTimeParts, max: DateTimeParts): {timeMin?: ISOTimeString; timeMax?: ISOTimeString} {
  return {
    timeMin: min.date && min.time && date && date === min.date ? min.time : undefined,
    timeMax: max.date && max.time && date && date === max.date ? max.time : undefined,
  };
}

/** handleDateChange: the time a newly chosen date keeps, clamped on a boundary day. */
export function timeForDate(newDate: ISODateString, time: ISOTimeString, min: DateTimeParts, max: DateTimeParts): ISOTimeString {
  let effective = time;
  if (min.date && newDate === min.date && min.time && !isTimeInRange(effective, min.time, undefined)) effective = min.time;
  if (max.date && newDate === max.date && max.time && !isTimeInRange(effective, undefined, max.time)) effective = max.time;
  return effective;
}

const MINUTES_PER_DAY = 24 * 60;

/** Every time of day at `interval` minutes (before min/max filtering). */
export function timeOptions(interval: number, hasSeconds: boolean): ISOTimeString[] {
  const out: ISOTimeString[] = [];
  for (let minutes = 0; minutes < MINUTES_PER_DAY; minutes += interval) {
    out.push(formatISOTime({hour: Math.floor(minutes / 60), minute: minutes % 60, second: 0}, hasSeconds));
  }
  return out;
}

/** The selected time in the shape the options carry ("14:00:00" without seconds → "14:00"). */
export function normalizeOptionTime(time: ISOTimeString | undefined, hasSeconds: boolean): ISOTimeString | undefined {
  if (!time) return undefined;
  const parsed = parseISOTime(time);
  return parsed ? formatISOTime(parsed, hasSeconds) : undefined;
}

/**
 * Index of the option at or immediately before `time`, 0 with no time or below every option,
 * -1 with no options (closestOptionIndex).
 */
export function closestOptionIndex(options: ReadonlyArray<ISOTimeString>, time: ISOTimeString | undefined | null): number {
  if (options.length === 0) return -1;
  if (!time) return 0;
  let candidate = -1;
  for (let i = 0; i < options.length; i++) {
    if (options[i] <= time) candidate = i;
    else break;
  }
  return candidate === -1 ? 0 : candidate;
}
