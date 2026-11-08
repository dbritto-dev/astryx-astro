// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Framework-free port of @astryxdesign/core 0.7.9 src/PowerSearch/usePowerSearchConfig.ts
// (createPowerSearchConfig + applyFilters) and resolveDateTimeRangePart.ts, re-exported by
// ./powerSearchModel.ts.
//
// The row matcher runs wherever filters apply: PowerSearch, and Table's client filtering
// (elements/table-features/filter.ts), which every filterable table loads. So this module never
// imports Temporal (lib/temporal.ts): a table without date columns must not wait on, or in
// Safari download, the Temporal polyfill. Date rows (`Date`, epoch seconds, and as a port
// addition `Temporal.Instant` / `Temporal.ZonedDateTime`) are read by brand through
// lib/temporalKind.ts; the clock for a relative range is `Date.now()`, a plain number.
import type {
  DateTimeRangePart,
  EnumItem,
  OperatorValue,
  PowerSearchConfig,
  PowerSearchField,
  PowerSearchFilter,
  PowerSearchOperator,
} from './powerSearchModel';
import {exactTimeMilliseconds, plainDateUtcMilliseconds} from '../../lib/temporalKind';

// ── Relative range parts (resolveDateTimeRangePart.ts) ──────────────────────

const SECONDS_BY_UNIT = {second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000} as const;

/** Now in Unix seconds. `Date.now()` here keeps this module free of Temporal (see the header). */
const clockSeconds = () => Date.now() / 1000;

export function resolveDateTimeRangePart(part: DateTimeRangePart, nowSeconds = clockSeconds()): number {
  switch (part.type) {
    case 'NOW': return Math.floor(nowSeconds);
    case 'ABSOLUTE': return part.unixSeconds;
    case 'RELATIVE': return Math.floor(nowSeconds - part.backValue * SECONDS_BY_UNIT[part.unit]);
  }
}

// ── createPowerSearchConfig (usePowerSearchConfig.ts) ───────────────────────

type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'enum_list' | 'string_list';
export interface FieldDefinition<K extends string = string, T extends FieldType = FieldType> {
  readonly key: K;
  readonly type: T;
  readonly label?: string;
  /** Required for 'enum' and 'enum_list'. */
  readonly enumValues?: ReadonlyArray<EnumItem>;
}

const op = (key: string, i18n: string, value: OperatorValue): PowerSearchOperator => ({key, i18nKey: `@astryx.powersearch.operator.${i18n}`, value});

function buildField(def: FieldDefinition): PowerSearchField {
  const label = def.label ?? def.key;
  const values = def.enumValues ?? [];
  switch (def.type) {
    case 'string': return {key: def.key, label, defaultOperator: 'contains', operators: [
      op('contains', 'contains', {type: 'string'}), op('not_contains', 'notContains', {type: 'string'}),
      op('starts_with', 'startsWith', {type: 'string'}), op('not_starts_with', 'notStartsWith', {type: 'string'}),
      op('ends_with', 'endsWith', {type: 'string'}), op('not_ends_with', 'notEndsWith', {type: 'string'}),
      op('is', 'is', {type: 'string'}), op('is_not', 'isNot', {type: 'string'}),
    ]};
    case 'number': return {key: def.key, label, defaultOperator: 'equals', operators: [
      op('equals', 'equals', {type: 'float'}), op('not_equals', 'notEquals', {type: 'float'}),
      op('greater_than', 'greaterThan', {type: 'float'}), op('less_than', 'lessThan', {type: 'float'}),
      op('greater_than_or_equal', 'greaterThanOrEqual', {type: 'float'}), op('less_than_or_equal', 'lessThanOrEqual', {type: 'float'}),
    ]};
    case 'date': return {key: def.key, label, defaultOperator: 'after', operators: [
      op('before', 'before', {type: 'date_absolute'}), op('after', 'after', {type: 'date_absolute'}), op('between', 'between', {type: 'date_range'}),
    ]};
    case 'boolean': return {key: def.key, label, defaultOperator: 'is_true', operators: [
      op('is_true', 'isTrue', {type: 'empty'}), op('is_false', 'isFalse', {type: 'empty'}),
    ]};
    case 'enum': return {key: def.key, label, defaultOperator: 'is', operators: [
      op('is', 'is', {type: 'enum', values}), op('is_not', 'isNot', {type: 'enum', values}),
      op('is_any_of', 'isAnyOf', {type: 'enum_list', values}), op('is_none_of', 'isNoneOf', {type: 'enum_list', values}),
    ]};
    case 'enum_list': return {key: def.key, label, defaultOperator: 'is_any_of', operators: [
      op('is_any_of', 'isAnyOf', {type: 'enum_list', values}), op('is_none_of', 'isNoneOf', {type: 'enum_list', values}),
    ]};
    case 'string_list': return {key: def.key, label, defaultOperator: 'is_any_of', operators: [
      op('is_any_of', 'isAnyOf', {type: 'string_list'}), op('is_none_of', 'isNoneOf', {type: 'string_list'}),
    ]};
  }
}

/**
 * A row's date value in Unix seconds: a number as given, a `Date` (Astryx), or (port addition) a
 * `Temporal.Instant` / `Temporal.ZonedDateTime`, or a `Temporal.PlainDate` at its UTC midnight
 * (the instant a date-only filter value names), recognized by brand; null for anything else.
 */
function unixSecondsOf(value: unknown): number | null {
  if (typeof value === 'number') return value;
  // `Date` is Astryx's row type: read, never built (an invalid one stays NaN, as in Astryx).
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  const ms = exactTimeMilliseconds(value) ?? plainDateUtcMilliseconds(value);
  return ms === null ? null : Math.floor(ms / 1000);
}
const toStringValues = (value: unknown): string[] | null =>
  typeof value === 'string' ? [value] : Array.isArray(value) && value.every((v) => typeof v === 'string') ? value : null;

const STRING_OPS: Record<string, (s: string, t: string) => boolean> = {
  contains: (s, t) => s.includes(t), not_contains: (s, t) => !s.includes(t),
  starts_with: (s, t) => s.startsWith(t), not_starts_with: (s, t) => !s.startsWith(t),
  ends_with: (s, t) => s.endsWith(t), not_ends_with: (s, t) => !s.endsWith(t),
  is: (s, t) => s === t, is_not: (s, t) => s !== t,
};
const NUMBER_OPS: Record<string, (n: number, t: number) => boolean> = {
  equals: (n, t) => n === t, not_equals: (n, t) => n !== t, greater_than: (n, t) => n > t,
  less_than: (n, t) => n < t, greater_than_or_equal: (n, t) => n >= t, less_than_or_equal: (n, t) => n <= t,
};

function matchesFilter(row: Record<string, unknown>, filter: PowerSearchFilter): boolean {
  const fieldValue = row[filter.field];
  const {operator, value} = filter;
  switch (value.type) {
    case 'empty':
      if (operator === 'is_true') return Boolean(fieldValue) === true;
      if (operator === 'is_false') return Boolean(fieldValue) === false;
      return true;
    case 'string':
      if (typeof fieldValue !== 'string') return false;
      return STRING_OPS[operator]?.(fieldValue.toLowerCase(), value.value.toLowerCase()) ?? true;
    case 'integer':
    case 'float':
      if (typeof fieldValue !== 'number') return false;
      return NUMBER_OPS[operator]?.(fieldValue, value.value) ?? true;
    case 'date_absolute': {
      const ts = unixSecondsOf(fieldValue);
      if (ts === null) return false;
      if (operator === 'before') return ts < value.unixSeconds;
      if (operator === 'after') return ts > value.unixSeconds;
      return true;
    }
    case 'date_range': {
      const ts = unixSecondsOf(fieldValue);
      if (ts === null) return false;
      if (operator !== 'between') return true;
      const now = clockSeconds();
      return ts >= resolveDateTimeRangePart(value.value.start, now) && ts <= resolveDateTimeRangePart(value.value.end, now);
    }
    case 'enum':
      if (typeof fieldValue !== 'string') return false;
      if (operator === 'is') return fieldValue === value.value;
      if (operator === 'is_not') return fieldValue !== value.value;
      return true;
    case 'enum_list':
    case 'string_list': {
      const values = toStringValues(fieldValue);
      if (values == null) return false;
      if (operator === 'is_any_of') return values.some((v) => value.value.includes(v));
      if (operator === 'is_none_of') return values.every((v) => !value.value.includes(v));
      return true;
    }
    default:
      return true;
  }
}

/**
 * A PowerSearchConfig (with the default operators per field type) and an `applyFilters`
 * function for client- or server-side filtering. Usable anywhere (no hooks in Astro).
 */
export function createPowerSearchConfig<D extends ReadonlyArray<FieldDefinition>>(definitions: D, configName?: string) {
  const config: PowerSearchConfig = {name: configName ?? 'PowerSearchConfig', fields: definitions.map(buildField)};
  function applyFilters<T extends Record<string, unknown>>(filters: ReadonlyArray<PowerSearchFilter>, data: ReadonlyArray<T>): T[] {
    if (filters.length === 0) return [...data];
    return data.filter((row) => filters.every((f) => matchesFilter(row, f)));
  }
  return {config, applyFilters};
}
