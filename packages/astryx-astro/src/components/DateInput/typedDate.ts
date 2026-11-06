// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Ported from @astryxdesign/core 0.7.9 src/DateInput/useTypedDate.ts.

/**
 * Typed entry of a date text field, framework-free: the reading of typed text in the field's
 * calendar, its committed text, the format hint, rejection messages, and the typing session
 * state (pending text, a rejection kept on commit, the date typing last reported).
 *
 * Shared by the server render (DateInput.astro / DateTimeInput.astro write the committed text
 * with `formatCommitted`) and the elements (`ax-date-input`, `ax-date-time-input`), so both
 * read and write dates the same way. Every Intl call takes the field's locale.
 *
 * Port of `useTypedDate` (TypedDate) and `useTypedDateField` (TypedDateField): React state
 * becomes fields; the hook's render-time derivations become `view()`; `report` returns the
 * date instead of calling onChange so the owner element decides (cancelable event).
 */
import {createDateDisabled, type ConstraintMask} from '../Calendar/calendarModel';
import {
  formatCalendarDateHint,
  formatCalendarDateText,
  getCalendarDateLexicon,
  isGregorianCalendar,
  nearestAcceptedDate,
  parseCalendarDate,
  parseDateInput,
  plainDateFromISO,
  plainDateIsAfter,
  plainDateIsBefore,
  plainDateToISO,
  plainDateToday,
  type CalendarDateParseResult,
  type CalendarSystem,
  type ISODateString,
  type PlainDate,
  type SharedDateFormat,
} from '../../lib/date';
import type {InputStatus} from '../Field/fieldProps';

/** A rejected typed date, by the message it announces. */
export type TypedDateError = 'unreadable' | 'nonexistent' | 'outOfRange';

/** Server-translated strings the client needs (elements never translate). */
export interface TypedDateMessages {
  /** `@astryx.dateInput.invalidDate` */
  invalid: string;
  /** `@astryx.dateInput.nonexistentDate` with the calendar name filled in. */
  nonexistent: string;
  /** `@astryx.dateInput.outOfRangeDate` for a date inside min/max that a constraint rejects. */
  outOfRangeNone: string;
  /** The same message naming the bounds (only with min or max). */
  outOfRangeBounds?: string;
  /** `@astryx.dateInput.formatHint` with an `⁣example⁣` placeholder (non-Gregorian only). */
  formatHint?: string;
}

export interface TypedDateConfig {
  locale: string;
  calendar: CalendarSystem;
  /** The committed display format; null = a caller function (see `formatValue`). */
  format: SharedDateFormat | null;
  min?: ISODateString;
  max?: ISODateString;
  /** Server-evaluated `dateConstraints` (Calendar's bitmask). */
  mask?: ConstraintMask;
  messages: TypedDateMessages;
  /** A caller placeholder replaces the format hint. */
  hasPlaceholder: boolean;
}

export interface TypedDateHooks {
  /** Client-side constraint functions (`el.dateConstraints`). */
  constraints?: () => ReadonlyArray<(date: Date) => boolean>;
  /**
   * Display function for a `format` function prop (null config format): the server's function,
   * or the element's `formatValue`. A null/undefined result falls back to 'date_long'.
   */
  formatValue?: () => ((value: ISODateString) => string | null | undefined) | null | undefined;
}

/** The rejection a result shows: errors of complete text, or of committed text. */
export function typedDateError(result: CalendarDateParseResult | null, isCommitted: boolean): TypedDateError | null {
  if (result == null) return null;
  if (result.kind === 'unreadable' || (result.kind === 'incomplete' && isCommitted)) return 'unreadable';
  if ((result.kind === 'nonexistent' || result.kind === 'outOfRange') && (result.isComplete || isCommitted)) return result.kind;
  return null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Typed entry for a date text field in the active calendar (useTypedDate). Values stay Gregorian. */
export class TypedDate {
  readonly config: TypedDateConfig;
  readonly isGregorian: boolean;
  #hooks: TypedDateHooks;

  constructor(config: TypedDateConfig, hooks: TypedDateHooks = {}) {
    this.config = config;
    this.isGregorian = isGregorianCalendar(config.calendar);
    this.#hooks = hooks;
  }

  get calendar(): CalendarSystem {
    return this.config.calendar;
  }

  /** useCalendarConstraints().isDateDisabled for typed dates (min, max, constraints). */
  isDateDisabled = (date: PlainDate): boolean => {
    const fns = this.#hooks.constraints?.() ?? [];
    return createDateDisabled({
      min: this.config.min,
      max: this.config.max,
      mask: this.config.mask,
      dateConstraints: fns.length ? fns : undefined,
    })(date);
  };

  /** Builds the lexicon ahead of the first keystroke. */
  prepare(): void {
    getCalendarDateLexicon(this.config.locale, this.config.calendar);
  }

  parse(text: string): CalendarDateParseResult {
    const {locale, calendar, format} = this.config;
    const result = parseCalendarDate(text, getCalendarDateLexicon(locale, calendar), {
      isoIsGregorian: format === 'system_date',
      isDateDisabled: this.isDateDisabled,
    });
    if (!this.isGregorian || (result.kind !== 'unreadable' && result.kind !== 'nonexistent')) return result;
    // Gregorian text that only parseDateInput reads still commits, on Enter or blur only: it
    // is never complete while the person types. This includes a day-first date in a
    // month-first locale, which parseDateInput reads by swapping the order.
    const date = parseDateInput(text, locale);
    if (date == null) return result;
    return this.isDateDisabled(date) ? {kind: 'outOfRange', date, isComplete: false} : {kind: 'value', date, isComplete: false};
  }

  formatCommitted(value: ISODateString): string {
    const {format, locale, calendar} = this.config;
    if (format == null) {
      const text = this.#hooks.formatValue?.()?.(value);
      if (text != null) return text;
    }
    return formatCalendarDateText(plainDateFromISO(value), format ?? 'date_long', locale, calendar);
  }

  /** An example date for an empty focused field, or null for Gregorian (today, else the nearest accepted date). */
  getFormatHint(): string | null {
    if (this.isGregorian || !this.config.messages.formatHint) return null;
    const {min, max, locale, calendar} = this.config;
    const example = nearestAcceptedDate(plainDateToday(), {
      min: min != null ? plainDateFromISO(min) : null,
      max: max != null ? plainDateFromISO(max) : null,
      isDateDisabled: this.isDateDisabled,
    });
    return this.config.messages.formatHint.split('⁣example⁣').join(formatCalendarDateHint(example, locale, calendar));
  }

  /** The message for a rejected result. */
  errorMessage(result: CalendarDateParseResult): string {
    const {messages, min, max} = this.config;
    if (result.kind === 'nonexistent') return messages.nonexistent;
    if (result.kind === 'outOfRange') {
      const isBeforeMin = min != null && plainDateIsBefore(result.date, plainDateFromISO(min));
      const isAfterMax = max != null && plainDateIsAfter(result.date, plainDateFromISO(max));
      return !isBeforeMin && !isAfterMax ? messages.outOfRangeNone : (messages.outOfRangeBounds ?? messages.outOfRangeNone);
    }
    return messages.invalid;
  }
}

export interface TypedDateView {
  /** The text the input shows. */
  displayValue: string;
  /** The format hint for an empty focused field. */
  formatHint: string | null;
  /** Whether typed text waits to commit. */
  isPending: boolean;
  isInvalid: boolean;
  /** A typed rejection that stays in the field, shown as the field's error status. */
  typedStatus: InputStatus | undefined;
  /** A typed rejection that the field status does not announce. */
  alertMessage: string;
}

/** The typing session of a date text field (useTypedDateField). */
export class TypedDateField {
  readonly typedDate: TypedDate;
  /** Typed text, or null when the field shows the committed value. */
  pendingInput: string | null = null;
  /** Set when Enter or blur keeps rejected text so the person can correct it. */
  isRejectionCommitted = false;
  isFocused = false;
  /** The date that typing last reported, so one typing session reports each date once. */
  lastFired: ISODateString | undefined = undefined;

  constructor(typedDate: TypedDate) {
    this.typedDate = typedDate;
  }

  /** Drops typed text after a date is picked another way. */
  reset(): void {
    this.pendingInput = null;
    this.isRejectionCommitted = false;
  }

  /** A value from outside (not the one typing reported) drops typed text. */
  valueChanged(value: ISODateString | undefined): void {
    if (value !== this.lastFired) {
      this.lastFired = undefined;
      this.reset();
    }
  }

  /** Whether `date` is news: not the committed value and not reported in this session. */
  #report(date: ISODateString, value: ISODateString | undefined): boolean {
    if (date === value || date === this.lastFired) return false;
    this.lastFired = date;
    return true;
  }

  /** New text in the input. Returns a date to report (once more typing cannot change it). */
  handleChange(text: string, value: ISODateString | undefined, isDisabled: boolean): ISODateString | null {
    if (isDisabled) return null;
    this.pendingInput = text;
    this.isRejectionCommitted = false;
    const result = this.typedDate.parse(text);
    if (result.kind === 'value' && result.isComplete) {
      const date = plainDateToISO(result.date);
      if (this.#report(date, value)) return date;
    }
    return null;
  }

  /** Commits typed text on Enter or blur: clear, report a date, or keep a rejection. */
  commit(value: ISODateString | undefined, isDisabled: boolean): {clear?: true; report?: ISODateString} {
    if (this.pendingInput === null || isDisabled) return {};
    if (!this.pendingInput.trim()) {
      this.reset();
      return {clear: true};
    }
    const result = this.typedDate.parse(this.pendingInput);
    if (result.kind === 'incomplete' || result.kind === 'nonexistent' || result.kind === 'outOfRange') {
      // Keep the text and show why it cannot commit; never finish or adjust the date.
      this.isRejectionCommitted = true;
      return {};
    }
    let report: ISODateString | undefined;
    if (result.kind === 'value') {
      const date = plainDateToISO(result.date);
      if (this.#report(date, value)) report = date;
    }
    // A new typing session reports a retyped date again.
    this.lastFired = undefined;
    this.reset();
    return report ? {report} : {};
  }

  focus(): void {
    this.isFocused = true;
    this.typedDate.prepare();
  }

  /** Blur commits (the caller runs `commit` after this). */
  blur(): void {
    this.isFocused = false;
  }

  view(shownValue: ISODateString | undefined, isDisabled: boolean, isStatusAnnounced: boolean): TypedDateView {
    const pending = this.pendingInput;
    const typedResult = pending !== null && pending.trim() ? this.typedDate.parse(pending) : null;
    // A locked field hides the rejection but keeps its state, so the rejection shows again
    // once the field is editable.
    const typedError = isDisabled ? null : typedDateError(typedResult, this.isRejectionCommitted);
    const errorMessage = typedError != null && typedResult != null ? this.typedDate.errorMessage(typedResult) : null;
    // Text that stays in the field shows its reason as well as announcing it.
    const isErrorShown = typedError === 'nonexistent' || typedError === 'outOfRange' || (typedError === 'unreadable' && this.isRejectionCommitted);
    const typedStatus: InputStatus | undefined = isErrorShown && errorMessage != null ? {type: 'error', message: errorMessage} : undefined;
    const displayValue = pending !== null ? pending : shownValue != null && ISO_DATE.test(shownValue) ? this.typedDate.formatCommitted(shownValue) : '';
    return {
      displayValue,
      formatHint: !this.typedDate.config.hasPlaceholder && this.isFocused && !displayValue ? this.typedDate.getFormatHint() : null,
      isPending: pending !== null,
      isInvalid: typedError != null,
      typedStatus,
      alertMessage: isStatusAnnounced && typedStatus != null ? '' : (errorMessage ?? ''),
    };
  }
}
