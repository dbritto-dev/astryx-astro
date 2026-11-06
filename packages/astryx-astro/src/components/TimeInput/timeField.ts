// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Ported from @astryxdesign/core 0.7.9 src/TimeInput/TimeInput.tsx (TimeField's
// typed-entry state and handlers) and src/DateTimeInput/DateTimeInput.tsx (the time segment).

/**
 * The typed time field, framework-free: the pending text while typing, its validity, the
 * placeholder hint, arrow-key stepping (by whole minutes, wrapping midnight, rejected outside
 * min/max) and blur commits. Shared by `<ax-time-input>` and `<ax-date-time-input>`'s time
 * segment. Every Intl call takes the field's locale (lib/date timeFormat).
 */
import {
  adjustTime,
  formatISOTime,
  formatLocaleTime,
  isTimeInRange,
  parseLocaleTime,
  type HourFormat,
  type ISOTimeString,
} from '../../lib/date';

export interface TimeFieldConfig {
  locale: string;
  hourFormat: HourFormat;
  hasSeconds: boolean;
  /** Minutes per ArrowUp/ArrowDown. */
  increment: number;
  placeholder: string;
  /** `@astryx.dateTimeInput.timeHint12h|24h` for the hour format. */
  hint: string;
  /** `@astryx.timeInput.invalidTime` */
  invalid: string;
}

/** The time the arrows start from when there is none: now (the browser's clock). */
export function nowTime(hasSeconds: boolean): ISOTimeString {
  const now = new Date();
  return formatISOTime({hour: now.getHours(), minute: now.getMinutes(), second: now.getSeconds()}, hasSeconds);
}

export class TimeField {
  readonly config: TimeFieldConfig;
  /** Typed text, or null when the field shows the committed value. */
  pendingInput: string | null = null;
  isFocused = false;

  constructor(config: TimeFieldConfig) {
    this.config = config;
  }

  format(time: ISOTimeString): string {
    return formatLocaleTime(time, this.config.locale, this.config.hourFormat, this.config.hasSeconds);
  }

  parse(text: string): ISOTimeString | null {
    return parseLocaleTime(text, this.config.locale, this.config.hasSeconds);
  }

  displayValue(value: ISOTimeString | undefined): string {
    if (this.pendingInput !== null) return this.pendingInput;
    return value ? this.format(value) : '';
  }

  /** Validity of the pending text (styling, aria-invalid, the alert). */
  isValid(min?: ISOTimeString, max?: ISOTimeString): boolean {
    if (this.pendingInput === null || !this.pendingInput.trim()) return true;
    const parsed = this.parse(this.pendingInput);
    return parsed != null && isTimeInRange(parsed, min, max);
  }

  /** The placeholder: the format hint while focused and empty. */
  placeholder(value: ISOTimeString | undefined): string {
    return this.isFocused && !this.displayValue(value) ? this.config.hint : this.config.placeholder;
  }

  /** New text: returns a time to report at once when it parses inside the range. */
  handleChange(text: string, value: ISOTimeString | undefined, min?: ISOTimeString, max?: ISOTimeString): ISOTimeString | null {
    this.pendingInput = text;
    const parsed = this.parse(text);
    return parsed && isTimeInRange(parsed, min, max) && parsed !== value ? parsed : null;
  }

  /**
   * Blur: an empty draft clears (`clear`), a valid one commits (`report`), anything else
   * reverts to the committed value. `isDisabled` drops the draft and keeps the value.
   */
  commit(value: ISOTimeString | undefined, isDisabled: boolean, min?: ISOTimeString, max?: ISOTimeString): {clear?: true; report?: ISOTimeString} {
    const pending = this.pendingInput;
    this.pendingInput = null;
    if (pending === null || isDisabled) return {};
    if (!pending.trim()) return value !== undefined ? {clear: true} : {};
    const parsed = this.parse(pending);
    if (parsed && isTimeInRange(parsed, min, max) && parsed !== value) return {report: parsed};
    return {};
  }

  /** ArrowUp (+1) / ArrowDown (−1): the stepped time, or null outside min/max. */
  step(direction: 1 | -1, value: ISOTimeString | undefined, increment: number, min?: ISOTimeString, max?: ISOTimeString): ISOTimeString | null {
    const current = value ?? nowTime(this.config.hasSeconds);
    const next = adjustTime(current, direction * increment, this.config.hasSeconds);
    return isTimeInRange(next, min, max) ? next : null;
  }
}
