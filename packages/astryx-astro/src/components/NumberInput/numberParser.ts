/**
 * NumberInput's pure logic, shared by the server render and `<ax-number-input>`.
 * Verbatim ports of @astryxdesign/core NumberInput/numberParser.ts (parseLocaleNumber,
 * formatEditableNumber), NumberInput/numberInputCommit.ts (parseNumberInput,
 * resolveNumberInputCommit), utils/unicodeDigits.ts, and NumberInput.tsx's stepping
 * helpers (getDecimalPlaces, getEffectiveStep, getSteppedValue).
 *
 * Locale-aware: the locale's grouping and decimal separators, group sizes and digit script
 * come from Intl; text no reading fits returns null (the field stays visibly invalid
 * instead of committing a guess). Pass the server locale on both sides.
 */

// ── utils/unicodeDigits.ts ──────────────────────────────────────────────────
const DECIMAL_DIGIT = new RegExp('\\p{Nd}', 'u');
export const INVISIBLE_CHARS = /[​-‍‎‏؜⁦-⁩﻿]/g;

export function digitValue(char: string): number | null {
  const codePoint = char.codePointAt(0);
  if (codePoint == null || !DECIMAL_DIGIT.test(char)) return null;
  for (let zero = codePoint; codePoint - zero < 10; zero--) {
    if (!DECIMAL_DIGIT.test(String.fromCodePoint(zero - 1))) return codePoint - zero;
  }
  return null;
}

export function toAsciiDigits(text: string): string | null {
  let out = '';
  for (const char of text) {
    if (!DECIMAL_DIGIT.test(char)) { out += char; continue; }
    const value = digitValue(char);
    if (value == null) return null;
    out += String(value);
  }
  return out;
}

// ── numberParser.ts ─────────────────────────────────────────────────────────
interface LocaleNumberSymbols {
  group: string;
  decimal: string;
  primaryGroupSize: number;
  secondaryGroupSize: number;
}
const symbolsByLocale = new Map<string, LocaleNumberSymbols>();

function getLocaleNumberSymbols(locale: string | undefined): LocaleNumberSymbols {
  const key = locale ?? '';
  let symbols = symbolsByLocale.get(key);
  if (symbols === undefined) {
    let format: Intl.NumberFormat;
    try { format = new Intl.NumberFormat(locale); } catch { format = new Intl.NumberFormat('en'); }
    const parts = format.formatToParts(12345.6);
    const groupSizes = format.formatToParts(11111111111).filter((p) => p.type === 'integer').map((p) => p.value.length);
    const hasGrouping = groupSizes.length > 1;
    symbols = {
      group: (parts.find((p) => p.type === 'group')?.value ?? ',').normalize('NFKC'),
      decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.',
      primaryGroupSize: hasGrouping ? groupSizes[groupSizes.length - 1] : 3,
      secondaryGroupSize: hasGrouping ? groupSizes[groupSizes.length - 2] : 3,
    };
    symbolsByLocale.set(key, symbols);
  }
  return symbols;
}

const CURRENCY = new RegExp('\\p{Sc}', 'u');
const MINUS_SIGNS = '−‒–-';
const SEPARATOR_CHARS = ",.' ’٫٬";
const NUMBER_BODY = new RegExp(`^[0-9${SEPARATOR_CHARS}]+$`);
const MACHINE_NUMBER = /^(?:\d+\.?\d*|\.\d+)$/;

function readUnder(core: string, group: string, decimal: string, primaryGroupSize: number, secondaryGroupSize: number, minGroups: number): string | null {
  let intText = core;
  let fracText: string | null = null;
  if (decimal !== '' && core.includes(decimal)) {
    const at = core.indexOf(decimal);
    if (core.includes(decimal, at + decimal.length)) return null;
    intText = core.slice(0, at);
    fracText = core.slice(at + decimal.length);
    if (!/^\d*$/.test(fracText)) return null;
  }
  let digits: string;
  if (group !== '' && intText.includes(group)) {
    const chunks = intText.split(group);
    if (chunks.length - 1 < minGroups || !chunks.every((c) => /^\d+$/.test(c))) return null;
    const first = chunks[0];
    const last = chunks[chunks.length - 1];
    if (last.length !== primaryGroupSize || first.length > secondaryGroupSize) return null;
    for (let i = 1; i < chunks.length - 1; i++) if (chunks[i].length !== secondaryGroupSize) return null;
    digits = chunks.join('');
  } else {
    if (!/^\d*$/.test(intText)) return null;
    digits = intText;
  }
  if (digits === '' && (fracText == null || fracText === '')) return null;
  return fracText == null ? digits : `${digits}.${fracText}`;
}

const isGroupOnlySeparator = (s: string) => /^[\s'’]$/.test(s);

function toPlainNumber(core: string, locale: string | undefined): string | null {
  if (!NUMBER_BODY.test(core)) return null;
  const {group, decimal, primaryGroupSize, secondaryGroupSize} = getLocaleNumberSymbols(locale);
  const inLocale = readUnder(core, group, decimal, primaryGroupSize, secondaryGroupSize, 1);
  if (inLocale != null) return inLocale;
  if (MACHINE_NUMBER.test(core)) return core;
  const separators = [...new Set(core.replace(/\d/g, ''))];
  if (separators.length === 0 || separators.length > 2) return null;
  for (const candidate of separators) {
    const occurrences = core.split(candidate).length - 1;
    const minGroups = isGroupOnlySeparator(candidate) ? 1 : 2;
    if (occurrences < minGroups) continue;
    const other = separators.find((s) => s !== candidate) ?? '';
    if (other !== '' && core.split(other).length - 1 !== 1) continue;
    const read = readUnder(core, candidate, other, 3, 3, minGroups);
    if (read != null) return read;
  }
  return null;
}

function stripCurrency(text: string): string {
  let out = text.trim();
  if (CURRENCY.test(out.charAt(0))) out = out.slice(1).trim();
  if (CURRENCY.test(out.charAt(out.length - 1))) out = out.slice(0, -1).trim();
  return out;
}

/** Read a number the way a person in `locale` writes one; null rather than a guess. */
export function parseLocaleNumber(text: string, locale?: string): number | null {
  const normalized = toAsciiDigits(text.normalize('NFKC').replace(INVISIBLE_CHARS, ''));
  if (normalized == null) return null;
  let rest = normalized.trim();
  let sign = 1;
  const accounting = /^\((.*)\)$/s.exec(rest);
  if (accounting) { sign = -1; rest = accounting[1].trim(); }
  rest = stripCurrency(rest);
  let hasWrittenSign = false;
  const leadingSign = new RegExp(`^([+${MINUS_SIGNS}])\\s*`).exec(rest);
  if (leadingSign) {
    hasWrittenSign = true;
    sign = leadingSign[1] === '+' ? sign : -sign;
    rest = rest.slice(leadingSign[0].length);
  } else {
    const trailingSign = new RegExp(`\\s*([+${MINUS_SIGNS}])$`).exec(rest);
    if (trailingSign) {
      hasWrittenSign = true;
      sign = trailingSign[1] === '+' ? sign : -sign;
      rest = rest.slice(0, rest.length - trailingSign[0].length);
    }
  }
  if (accounting && hasWrittenSign) return null;
  rest = stripCurrency(rest);
  let exponent = 0;
  const exponentMatch = /\s*[eE]\s*([+-]?\d+)$/.exec(rest);
  if (exponentMatch) {
    exponent = Number(exponentMatch[1]);
    rest = rest.slice(0, rest.length - exponentMatch[0].length);
  }
  const core = rest.trim();
  if (core === '') return null;
  const plain = toPlainNumber(core, locale);
  if (plain == null) return null;
  const magnitude = Number(plain);
  if (!Number.isFinite(magnitude)) return null;
  const scaled = exponent === 0 ? magnitude : Number((magnitude * 10 ** exponent).toPrecision(15));
  if (!Number.isFinite(scaled)) return null;
  const result = sign * scaled;
  return Object.is(result, -0) ? 0 : result;
}

/** The text shown while focused: the machine number with the locale's decimal separator. */
export function formatEditableNumber(value: number, locale?: string): string {
  const {decimal} = getLocaleNumberSymbols(locale);
  const raw = String(value);
  return decimal === '.' ? raw : raw.replace('.', decimal);
}

// ── numberInputCommit.ts ────────────────────────────────────────────────────
export interface NumberInputValidationOptions {
  min?: number | null;
  max?: number | null;
  isIntegerOnly?: boolean;
  locale?: string;
}
export type NumberInputCommitDecision =
  | {type: 'commit'; value: number; didClamp: boolean}
  | {type: 'clear'}
  | {type: 'revert'};

function parseNumericInput(input: string, options: Pick<NumberInputValidationOptions, 'isIntegerOnly' | 'locale'>): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const value = parseLocaleNumber(trimmed, options.locale);
  if (value == null || !Number.isFinite(value)) return null;
  if (options.isIntegerOnly && !Number.isInteger(value)) return null;
  return value;
}

/** A draft that parses AND lies within the bounds (validity styling), else null. */
export function parseNumberInput(input: string, options: NumberInputValidationOptions): number | null {
  const value = parseNumericInput(input, options);
  if (value === null) return null;
  if (options.min != null && value < options.min) return null;
  if (options.max != null && value > options.max) return null;
  return value;
}

/** Commit, clear or revert the whole draft; out-of-range entries clamp to the bound. */
export function resolveNumberInputCommit(input: string, options: NumberInputValidationOptions & {hasClear: boolean}): NumberInputCommitDecision {
  if (input.trim() === '') return options.hasClear ? {type: 'clear'} : {type: 'revert'};
  const value = parseNumericInput(input, options);
  if (value === null) return {type: 'revert'};
  const min = options.min == null ? null : options.isIntegerOnly ? Math.ceil(options.min) : options.min;
  const max = options.max == null ? null : options.isIntegerOnly ? Math.floor(options.max) : options.max;
  if (min != null && max != null && min > max) return {type: 'revert'};
  const committedValue = min != null && value < min ? min : max != null && value > max ? max : value;
  return {type: 'commit', value: committedValue, didClamp: committedValue !== value};
}

// ── NumberInput.tsx stepping ────────────────────────────────────────────────
export type StepDirection = -1 | 1;

function getDecimalPlaces(value: number): number {
  const [coefficient, exponentText] = String(value).toLowerCase().split('e');
  const fractionLength = coefficient.split('.')[1]?.length ?? 0;
  const exponent = exponentText == null ? 0 : Number(exponentText);
  return Math.max(0, fractionLength - exponent);
}

export function getEffectiveStep(step: number | null | undefined, isIntegerOnly: boolean): number {
  if (step == null || !Number.isFinite(step) || step <= 0 || (isIntegerOnly && !Number.isInteger(step))) return 1;
  return step;
}

/** The next value on the step grid (anchored at `min`), clamped to the bounds. */
export function getSteppedValue({currentValue, direction, min, max, step, isIntegerOnly}: {
  currentValue: number | null;
  direction: StepDirection;
  min?: number | null;
  max?: number | null;
  step?: number | null;
  isIntegerOnly: boolean;
}): number | null {
  const effectiveStep = getEffectiveStep(step, isIntegerOnly);
  const stepBase = min != null && (!isIntegerOnly || Number.isInteger(min)) ? min : 0;
  let nextValue: number;
  if (currentValue == null) {
    nextValue = direction === 1 ? (min ?? 0) : (max ?? 0);
    if (isIntegerOnly) nextValue = direction === 1 ? Math.ceil(nextValue) : Math.floor(nextValue);
  } else {
    const stepPosition = (currentValue - stepBase) / effectiveStep;
    const tolerance = Number.EPSILON * Math.max(1, Math.abs(stepPosition)) * 4;
    const nextStepPosition = direction === 1 ? Math.floor(stepPosition + tolerance) + 1 : Math.ceil(stepPosition - tolerance) - 1;
    nextValue = stepBase + nextStepPosition * effectiveStep;
  }
  const precision = Math.min(12, Math.max(getDecimalPlaces(effectiveStep), getDecimalPlaces(stepBase)));
  nextValue = Number(nextValue.toFixed(precision));
  if (min != null) nextValue = Math.max(min, nextValue);
  if (max != null) nextValue = Math.min(max, nextValue);
  if (!Number.isFinite(nextValue)) return currentValue;
  if (isIntegerOnly && !Number.isInteger(nextValue)) return currentValue;
  return Object.is(nextValue, -0) ? 0 : nextValue;
}
