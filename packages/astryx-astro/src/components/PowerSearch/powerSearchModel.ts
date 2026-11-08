// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Framework-free port of @astryxdesign/core 0.7.9 src/PowerSearch/types.ts,
// useInternalConfig.ts, usePowerSearchSource.ts, resolveOperatorLabel.ts, formatFilterValue.ts,
// formatTokenValue.ts, powerSearchDateZone.ts, resolveDateTimeRangePart.ts,
// usePowerSearchConfig.ts (createPowerSearchConfig + applyFilters) and the relative-date options
// of PowerSearchValueEditor.tsx. Runs on the server (PowerSearch.astro renders tokens, labels
// and editors) and in the browser (elements/power-search.ts reformats them as filters change).
// Dates: ./powerSearchDates.ts (Temporal); the row matcher: ./powerSearchFilters.ts (no Temporal).
//
// Astro adaptations: ReactNode icons are icon names; a `searchSource` on a string /
// string_list / entity_list operator is a server-rendered `createStaticSource(...)` (or absent:
// answer `astryx-query` on that editor's field); `custom` operators keep `getString` for
// server-rendered tokens only (their `Editor` component and the `nested` editor are deferred).
import type {SearchableItem} from '../../lib/searchableItem';
import type {StaticSearchSource} from '../Typeahead/createStaticSource';
import {truncateCharacters} from '../../lib/characters';
import type {CalendarSystem} from '../../lib/date/calendarSystem';
import {groupItems} from '../../lib/groupItems';
import {formatDateAbsolute} from './powerSearchDates';

export {formatDateAbsolute};

// ── Types (types.ts) ─────────────────────────────────────────────────────────

export interface EmptyOperatorValue { readonly type: 'empty' }
export interface StringOperatorValue {
  readonly type: 'string';
  /** A typeahead instead of a text field: a static source, or answer `astryx-query` (`hasSearchSource`). */
  readonly searchSource?: StaticSearchSource;
  /** Client form of `searchSource` (set by the serializer, or yourself for an `astryx-query` source). */
  readonly hasSearchSource?: boolean;
  readonly isArbitraryStringAllowed?: boolean;
}
export interface StringListOperatorValue {
  readonly type: 'string_list';
  readonly searchSource?: StaticSearchSource;
  readonly hasSearchSource?: boolean;
  readonly isArbitraryStringAllowed?: boolean;
  readonly tokenization?: OperatorTokenizationConfig;
}
export interface IntegerOperatorValue { readonly type: 'integer'; readonly minValue?: number; readonly maxValue?: number; readonly units?: string }
export interface FloatOperatorValue { readonly type: 'float'; readonly minValue?: number; readonly maxValue?: number; readonly units?: string }
export interface TimeOperatorValue { readonly type: 'time'; readonly minValue?: string; readonly maxValue?: string }
export interface DateAbsoluteOperatorValue { readonly type: 'date_absolute'; readonly isDateOnly?: boolean }
export interface DateRelativeOperatorValue { readonly type: 'date_relative'; readonly isPastAllowed?: boolean; readonly isFutureAllowed?: boolean }
export interface DateRangeOperatorValue {
  readonly type: 'date_range';
  readonly intervalDatePresets?: ReadonlyArray<DateRangeFilterPreset>;
  readonly relativeDatePresets?: ReadonlyArray<RelativeDateFilterPreset>;
}
export interface EnumItem { readonly value: string; readonly label: string; readonly icon?: string }
export interface EnumOperatorValue { readonly type: 'enum'; readonly values: ReadonlyArray<EnumItem> }
export interface EnumListOperatorValue { readonly type: 'enum_list'; readonly values: ReadonlyArray<EnumItem> }
export interface EntityListOperatorValue {
  readonly type: 'entity_list';
  readonly searchSource?: StaticSearchSource;
  readonly hasSearchSource?: boolean;
  readonly isArbitraryStringAllowed?: boolean;
  readonly tokenization?: OperatorTokenizationConfig;
  /** Server-side row content for the entity typeahead (Astryx `renderItem`). */
  readonly renderItem?: (item: SearchableItem) => unknown;
}
export interface CustomOperatorValue {
  readonly type: 'custom';
  /** Display string of a stored value (server-rendered tokens). */
  readonly getString?: (value: string) => string;
}
export interface NestedOperatorValue { readonly type: 'nested' }

export type OperatorValue =
  | EmptyOperatorValue | StringOperatorValue | StringListOperatorValue | IntegerOperatorValue | FloatOperatorValue
  | TimeOperatorValue | DateAbsoluteOperatorValue | DateRelativeOperatorValue | DateRangeOperatorValue
  | EnumOperatorValue | EnumListOperatorValue | EntityListOperatorValue | CustomOperatorValue | NestedOperatorValue;

export interface FilterValueEmpty { readonly type: 'empty' }
export interface FilterValueString { readonly type: 'string'; readonly value: string }
export interface FilterValueStringList { readonly type: 'string_list'; readonly value: ReadonlyArray<string> }
export interface FilterValueInteger { readonly type: 'integer'; readonly value: number }
export interface FilterValueFloat { readonly type: 'float'; readonly value: number }
export interface FilterValueTime { readonly type: 'time'; readonly value: string }
export interface FilterValueDateAbsolute { readonly type: 'date_absolute'; readonly unixSeconds: number }
export interface FilterValueDateRelative { readonly type: 'date_relative'; readonly value: string }
export interface FilterValueDateRange { readonly type: 'date_range'; readonly value: DateTimeRange }
export interface FilterValueEnum { readonly type: 'enum'; readonly value: string }
export interface FilterValueEnumList { readonly type: 'enum_list'; readonly value: ReadonlyArray<string> }
export interface PowerSearchEntity { readonly id: string; readonly label: string; readonly photo?: string }
export interface FilterValueEntityList { readonly type: 'entity_list'; readonly value: ReadonlyArray<PowerSearchEntity> }
export interface FilterValueCustom { readonly type: 'custom'; readonly value: string }
export interface FilterValueNested { readonly type: 'nested'; readonly value: ReadonlyArray<PowerSearchFilter> }

export type FilterValue =
  | FilterValueEmpty | FilterValueString | FilterValueStringList | FilterValueInteger | FilterValueFloat
  | FilterValueTime | FilterValueDateAbsolute | FilterValueDateRelative | FilterValueDateRange
  | FilterValueEnum | FilterValueEnumList | FilterValueEntityList | FilterValueCustom | FilterValueNested;

export interface OperatorTokenizationConfig { readonly regex?: string; readonly sort?: boolean }
export type DateTimeRangePart =
  | {readonly type: 'NOW'}
  | {readonly type: 'ABSOLUTE'; readonly unixSeconds: number}
  | {readonly type: 'RELATIVE'; readonly backValue: number; readonly unit: 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'; readonly anchorKey?: string};
export interface DateTimeRange { readonly start: DateTimeRangePart; readonly end: DateTimeRangePart }
export interface DateRangeFilterPreset { readonly label: string; readonly value: DateTimeRange }
export interface RelativeDateFilterPreset { readonly label: string; readonly value: string }

/** An operator names itself with raw `label` text or an `i18nKey` (catalog lookup). */
export interface PowerSearchOperator {
  readonly key: string;
  readonly value: OperatorValue;
  readonly label?: string;
  readonly i18nKey?: string;
}

export interface PowerSearchField {
  readonly key: string;
  readonly label: string;
  readonly operators: ReadonlyArray<PowerSearchOperator>;
  /** Icon name shown next to the field in the typeahead. */
  readonly icon?: string;
  readonly defaultOperator?: string;
  readonly group?: string;
  readonly description?: string;
  readonly typeaheadAliases?: ReadonlyArray<string>;
  readonly typeaheadMinQueryLength?: number;
  /** @default true */
  readonly isValueMatchAllowed?: boolean;
}

export interface PowerSearchConfig {
  readonly name: string;
  readonly fields: ReadonlyArray<PowerSearchField>;
  /** Key of the field free text searches. */
  readonly contentSearchFieldKey?: string;
}

export interface PowerSearchFilter {
  readonly field: string;
  readonly operator: string;
  readonly value: FilterValue;
  readonly isReadOnly?: boolean;
}

export interface PartialFilter {
  readonly field: string;
  readonly operator?: string;
  readonly value?: FilterValue;
  readonly isReadOnly?: boolean;
}

export type PowerSearchChangeType = 'add' | 'edit' | 'remove';

export interface PowerSearchAuxData {
  readonly fieldKey: string;
  readonly operatorKey?: string;
  readonly filterValue?: FilterValue;
  readonly filterIndex?: number;
  readonly group?: string;
}
export type PowerSearchItem = SearchableItem<PowerSearchAuxData>;

// ── Internal config (useInternalConfig.ts) ──────────────────────────────────

export interface InternalConfig {
  readonly config: PowerSearchConfig;
  getField(key: string): PowerSearchField | undefined;
  getOperator(fieldKey: string, operatorKey: string): PowerSearchOperator | undefined;
  getDefaultOperator(fieldKey: string): PowerSearchOperator | undefined;
  getVisibleFields(): ReadonlyArray<PowerSearchField>;
  getVisibleOperators(fieldKey: string): ReadonlyArray<PowerSearchOperator>;
}

export function createInternalConfig(config: PowerSearchConfig): InternalConfig {
  const fieldMap = new Map<string, PowerSearchField>();
  const operatorMap = new Map<string, Map<string, PowerSearchOperator>>();
  for (const field of config.fields) {
    fieldMap.set(field.key, field);
    operatorMap.set(field.key, new Map(field.operators.map((op) => [op.key, op])));
  }
  return {
    config,
    getField: (key) => fieldMap.get(key),
    getOperator: (fieldKey, operatorKey) => operatorMap.get(fieldKey)?.get(operatorKey),
    getDefaultOperator(fieldKey) {
      const field = fieldMap.get(fieldKey);
      if (!field) return undefined;
      if (field.defaultOperator) return operatorMap.get(fieldKey)?.get(field.defaultOperator);
      return field.operators[0];
    },
    getVisibleFields: () => config.fields,
    getVisibleOperators: (fieldKey) => fieldMap.get(fieldKey)?.operators ?? [],
  };
}

export type TranslatorFn = (key: string, values?: Record<string, unknown>) => string;

/** resolveOperatorLabel.ts: raw `label`, else the catalog text of `i18nKey`. */
export function resolveOperatorLabel(operator: PowerSearchOperator, t?: TranslatorFn): string {
  if (operator.label !== undefined) return operator.label;
  return operator.i18nKey ? (t ? t(operator.i18nKey) : operator.i18nKey) : '';
}

/** The config with every operator's `label` resolved (server-side formatting keeps the functions). */
export function withResolvedLabels(config: PowerSearchConfig, t?: TranslatorFn): PowerSearchConfig {
  return {
    ...config,
    fields: config.fields.map((field) => ({...field, operators: field.operators.map((op) => ({...op, label: resolveOperatorLabel(op, t)}))})),
  };
}

/** The JSON-safe config the browser gets: labels resolved, sources reduced to `hasSearchSource`. */
export function toClientConfig(config: PowerSearchConfig, t?: TranslatorFn): PowerSearchConfig {
  return {
    name: config.name,
    contentSearchFieldKey: config.contentSearchFieldKey,
    fields: config.fields.map((field) => ({
      key: field.key,
      label: field.label,
      icon: typeof field.icon === 'string' ? field.icon : undefined,
      defaultOperator: field.defaultOperator,
      group: field.group,
      description: field.description,
      typeaheadAliases: field.typeaheadAliases,
      typeaheadMinQueryLength: field.typeaheadMinQueryLength,
      isValueMatchAllowed: field.isValueMatchAllowed,
      operators: field.operators.map((op) => {
        const {searchSource, renderItem: _r, getString: _g, ...value} = op.value as OperatorValue & {searchSource?: unknown; renderItem?: unknown; getString?: unknown};
        return {
          key: op.key,
          label: resolveOperatorLabel(op, t),
          value: (searchSource != null ? {...value, hasSearchSource: true} : value) as OperatorValue,
        };
      }),
    })),
  };
}

// ── The field typeahead's source (usePowerSearchSource.ts) ──────────────────

interface ValueMatch { displayValue: string; filterValue: FilterValue; quoted: boolean }

function resolveValueMatches(op: PowerSearchOperator, rawValue: string): ValueMatch[] {
  const v = op.value;
  if (v.type === 'string') return [{displayValue: rawValue, filterValue: {type: 'string', value: rawValue}, quoted: true}];
  if (v.type === 'string_list') return [{displayValue: rawValue, filterValue: {type: 'string_list', value: [rawValue]}, quoted: true}];
  if (v.type === 'enum') {
    const lower = rawValue.toLowerCase();
    return v.values.filter((item) => item.label.toLowerCase().includes(lower))
      .map((item) => ({displayValue: item.label, filterValue: {type: 'enum', value: item.value}, quoted: false}));
  }
  if (v.type === 'enum_list') {
    const lower = rawValue.toLowerCase();
    return v.values.filter((item) => item.label.toLowerCase().includes(lower))
      .map((item) => ({displayValue: item.label, filterValue: {type: 'enum_list', value: [item.value]}, quoted: false}));
  }
  return [];
}

export function buildFieldItems(config: InternalConfig): PowerSearchItem[] {
  const items: PowerSearchItem[] = config.getVisibleFields().map((field) => ({
    id: field.key,
    label: field.label,
    auxiliaryData: {fieldKey: field.key, operatorKey: config.getDefaultOperator(field.key)?.key, group: field.group},
  }));
  return groupItems(items, {ungroupedFirst: true}).flatMap((group) => group.items);
}

export interface PowerSearchSource {
  search(query: string): PowerSearchItem[];
  bootstrap(): PowerSearchItem[];
}

/** `maxTypedResults` caps ranked results of a non-empty query; browsing is never truncated here. */
export function createPowerSearchSource(config: InternalConfig, maxTypedResults: number, t?: TranslatorFn): PowerSearchSource {
  const allItems = buildFieldItems(config);
  const opLabel = (op: PowerSearchOperator) => resolveOperatorLabel(op, t);
  return {
    bootstrap: () => allItems,
    search(query: string): PowerSearchItem[] {
      const lower = query.toLowerCase().trim();
      if (lower === '') return allItems;
      const results: PowerSearchItem[] = [];
      const seen = new Set<string>();
      const push = (item: PowerSearchItem) => {
        if (seen.has(item.id)) return;
        seen.add(item.id);
        results.push(item);
      };
      for (const field of config.getVisibleFields()) {
        if (field.typeaheadMinQueryLength != null && lower.length < field.typeaheadMinQueryLength) continue;
        const fieldMatches = field.label.toLowerCase().includes(lower)
          || field.typeaheadAliases?.some((alias) => alias.toLowerCase().includes(lower));
        if (fieldMatches) {
          push({id: field.key, label: field.label, auxiliaryData: {fieldKey: field.key, operatorKey: config.getDefaultOperator(field.key)?.key}});
        }
        for (const op of field.operators) {
          const combined = `${field.label} ${opLabel(op)}`;
          if (combined.toLowerCase().includes(lower)) {
            push({id: `${field.key}:${op.key}`, label: combined, auxiliaryData: {fieldKey: field.key, operatorKey: op.key}});
          }
        }
      }
      // Field + operator + value suggestions ("title foo", "title contains foo", "genre fiction").
      for (const field of config.getVisibleFields()) {
        if (field.isValueMatchAllowed === false) continue;
        const fieldLabel = field.label.toLowerCase();
        let hasExactOperatorMatch = false;
        for (const op of field.operators) {
          const prefix = `${fieldLabel} ${opLabel(op).toLowerCase()} `;
          if (lower.startsWith(prefix) && lower.length > prefix.length) {
            const matches = resolveValueMatches(op, query.slice(prefix.length));
            if (matches.length > 0) hasExactOperatorMatch = true;
            for (const match of matches) {
              push({
                id: `${field.key}:${op.key}:value:${match.displayValue}`,
                label: `${field.label} ${opLabel(op)} ${match.quoted ? `"${match.displayValue}"` : match.displayValue}`,
                auxiliaryData: {fieldKey: field.key, operatorKey: op.key, filterValue: match.filterValue},
              });
            }
          }
        }
        const fieldPrefix = `${fieldLabel} `;
        if (!hasExactOperatorMatch && lower.startsWith(fieldPrefix) && lower.length > fieldPrefix.length) {
          const remainder = lower.slice(fieldPrefix.length);
          const isOperatorPrefix = field.operators.some((op) => opLabel(op).toLowerCase().startsWith(remainder));
          if (!isOperatorPrefix) {
            const rawValue = query.slice(fieldPrefix.length);
            for (const op of field.operators) {
              for (const match of resolveValueMatches(op, rawValue)) {
                push({
                  id: `${field.key}:${op.key}:value:${match.displayValue}`,
                  label: `${field.label} ${opLabel(op)} ${match.quoted ? `"${match.displayValue}"` : match.displayValue}`,
                  auxiliaryData: {fieldKey: field.key, operatorKey: op.key, filterValue: match.filterValue},
                });
              }
            }
          }
        }
      }
      // Content search: unstructured text goes to `contentSearchFieldKey` unless a field or
      // field + operator matches the query exactly.
      const contentFieldKey = config.config.contentSearchFieldKey;
      const hasExactMatch = config.getVisibleFields().some((f) =>
        f.label.toLowerCase() === lower || f.operators.some((op) => `${f.label} ${opLabel(op)}`.toLowerCase() === lower));
      if (contentFieldKey && !hasExactMatch) {
        const contentField = config.getField(contentFieldKey);
        const contentOp = config.getDefaultOperator(contentFieldKey);
        if (contentField && contentOp) {
          results.unshift({
            id: `__content_search__:${query}`,
            label: `"${query}"`,
            auxiliaryData: {fieldKey: contentFieldKey, operatorKey: contentOp.key, filterValue: {type: 'string', value: query}},
          });
        }
      }
      return results.slice(0, maxTypedResults);
    },
  };
}

// ── Dates (powerSearchDateZone.ts, resolveDateTimeRangePart.ts) ─────────────
// On Temporal in ./powerSearchDates.ts; the range parts with the row matcher in
// ./powerSearchFilters.ts (which tables without date columns load, so it never loads Temporal).

export {
  isoDateTimeToUnixSeconds,
  isoDateToUnixSeconds,
  resolveDateZone,
  unixSecondsToISODate,
  unixSecondsToISODateTime,
} from './powerSearchDates';
export {resolveDateTimeRangePart} from './powerSearchFilters';

// ── Formatting (formatFilterValue.ts, formatTokenValue.ts) ──────────────────

/** Words the formatters need, resolved in the request locale (server t() / client templates). */
export interface FormatMessages {
  itemsCount(count: number): string;
  entitiesCount(count: number): string;
  filtersCount(count: number): string;
  dateRange: string;
}

export interface FormatContext {
  locale: string;
  calendar?: CalendarSystem;
  timezoneID?: string;
  messages: FormatMessages;
}

export function formatSharedNumber(value: number, locale: string, options?: Pick<Intl.NumberFormatOptions, 'useGrouping' | 'maximumFractionDigits'>): string {
  try { return new Intl.NumberFormat(locale, options).format(value); } catch { return String(value); }
}

const enumLabel = (values: ReadonlyArray<EnumItem>, value: string) => values.find((v) => v.value === value)?.label ?? value;
const isDateOnlyOf = (op: OperatorValue) => op.type !== 'date_absolute' || op.isDateOnly !== false;

/** formatFilterValue: the value part of a tokenizer item's label (and the editor's name). */
export function formatFilterValue(operatorValue: OperatorValue, filterValue: FilterValue, maxLength: number, ctx: FormatContext): string {
  const truncate = (s: string) => truncateCharacters(s, maxLength);
  const number = (value: number, units?: string) => {
    const formatted = formatSharedNumber(value, ctx.locale);
    return units ? `${formatted} ${units}` : formatted;
  };
  switch (filterValue.type) {
    case 'empty': return '';
    case 'string': return truncate(filterValue.value);
    case 'integer': return number(filterValue.value, operatorValue.type === 'integer' ? operatorValue.units : undefined);
    case 'float': return number(filterValue.value, operatorValue.type === 'float' ? operatorValue.units : undefined);
    case 'enum': return truncate(operatorValue.type === 'enum' ? enumLabel(operatorValue.values, filterValue.value) : filterValue.value);
    case 'string_list': {
      const items = filterValue.value;
      if (items.length === 0) return '';
      if (items.length === 1) return truncate(items[0]);
      const joined = items.join(', ');
      return joined.length <= maxLength ? joined : ctx.messages.itemsCount(items.length);
    }
    case 'enum_list': {
      const items = filterValue.value;
      if (items.length === 0) return '';
      if (operatorValue.type === 'enum_list') {
        const labels = items.map((v) => enumLabel(operatorValue.values, v));
        if (labels.length === 1) return truncate(labels[0]);
        const joined = labels.join(', ');
        return joined.length <= maxLength ? joined : ctx.messages.itemsCount(labels.length);
      }
      return items.length === 1 ? truncate(items[0]) : ctx.messages.itemsCount(items.length);
    }
    case 'entity_list': {
      const entities = filterValue.value;
      if (entities.length === 0) return '';
      if (entities.length === 1) return truncate(entities[0].label);
      const joined = entities.map((e) => e.label).join(', ');
      return joined.length <= maxLength ? joined : ctx.messages.entitiesCount(entities.length);
    }
    case 'time': return filterValue.value;
    case 'date_absolute': return truncate(formatDateAbsolute(filterValue.unixSeconds, ctx.locale, ctx.timezoneID, isDateOnlyOf(operatorValue), ctx.calendar));
    case 'date_relative': return filterValue.value;
    case 'date_range': return ctx.messages.dateRange;
    case 'custom':
      return operatorValue.type === 'custom' && operatorValue.getString ? truncate(operatorValue.getString(filterValue.value)) : filterValue.value;
    case 'nested': return ctx.messages.filtersCount(filterValue.value.length);
    default: return '';
  }
}

/** formatTokenValueText (popover token, no translator): the bold value a filter token shows. */
export function formatTokenValueText(operatorValue: OperatorValue, filterValue: FilterValue, maxLength: number, ctx: Omit<FormatContext, 'messages'>): string | null {
  const truncate = (s: string) => truncateCharacters(s, maxLength + 3, '...');
  const list = (labels: ReadonlyArray<string>): string | null => {
    if (labels.length === 0) return null;
    if (labels.length === 1) return truncate(labels[0]);
    const total = labels.reduce((sum, s) => sum + s.length, 0);
    return total > maxLength ? `${labels.length} items` : labels.join(', ');
  };
  switch (filterValue.type) {
    case 'empty': return null;
    case 'string': return truncate(filterValue.value);
    case 'integer':
    case 'float': return String(filterValue.value);
    case 'enum': return truncate(operatorValue.type === 'enum' ? enumLabel(operatorValue.values, filterValue.value) : filterValue.value);
    case 'string_list': return list(filterValue.value);
    case 'enum_list': {
      const items = filterValue.value;
      if (items.length === 0) return null;
      if (operatorValue.type === 'enum_list') return list(items.map((v) => enumLabel(operatorValue.values, v)));
      return items.length === 1 ? truncate(items[0]) : `${items.length} items`;
    }
    case 'entity_list': return list(filterValue.value.map((e) => e.label));
    case 'time': return filterValue.value;
    case 'date_absolute': return truncate(formatDateAbsolute(filterValue.unixSeconds, ctx.locale, ctx.timezoneID, isDateOnlyOf(operatorValue), ctx.calendar));
    case 'date_relative': return truncate(filterValue.value);
    case 'date_range': return 'date range';
    case 'custom':
      return operatorValue.type === 'custom' && operatorValue.getString ? truncate(operatorValue.getString(filterValue.value)) : filterValue.value;
    case 'nested': return filterValue.value.length === 1 ? '1 filter' : `${filterValue.value.length} filters`;
    default: return null;
  }
}

/** A filter token's visible text: label ("Field: operator") and value; `full` names its remove button and editor. */
export function tokenText(config: InternalConfig, filter: PowerSearchFilter, maxTokenLength: number, ctx: FormatContext): {label: string; value: string | null; full: string} {
  const field = config.getField(filter.field);
  const operator = config.getOperator(filter.field, filter.operator);
  const fieldLabel = field?.label ?? '';
  const operatorLabel = operator ? resolveOperatorLabel(operator) : '';
  const label = `${fieldLabel}: ${operatorLabel}`.trim();
  const value = operator
    ? formatTokenValueText(operator.value, filter.value, Math.max(maxTokenLength - fieldLabel.length - operatorLabel.length, 10), ctx)
    : null;
  return {label, value, full: value != null ? `${label} ${value}` : label};
}

/** The tokenizer items for `filters` (PowerSearch tokenizerValue). */
export function filtersToItems(config: InternalConfig, filters: ReadonlyArray<PowerSearchFilter>, maxTokenLength: number, ctx: FormatContext): PowerSearchItem[] {
  return filters.map((filter, index) => {
    const field = config.getField(filter.field);
    const operator = config.getOperator(filter.field, filter.operator);
    const resolvedOp = operator ? resolveOperatorLabel(operator) : '';
    const operatorLabel = resolvedOp ? `: ${resolvedOp}` : '';
    const valueStr = operator ? formatFilterValue(operator.value, filter.value, maxTokenLength, ctx) : '';
    const name = field?.label ?? filter.field;
    return {
      id: `filter-${index}-${filter.field}-${filter.operator}`,
      label: valueStr ? `${name}${operatorLabel} ${valueStr}` : `${name}${operatorLabel}`,
      auxiliaryData: {fieldKey: filter.field, operatorKey: filter.operator, filterValue: filter.value, filterIndex: index},
    };
  });
}

/** An `empty` operator with no editor commits on a press instead of opening one. */
export function commitsWithoutEditor(operator: PowerSearchOperator | undefined): boolean {
  return operator?.value.type === 'empty';
}

/** OPERATOR_VALUE_TYPE_TO_ICON: the typeahead row icon of a field without its own. */
export const OPERATOR_VALUE_TYPE_TO_ICON: Record<string, string> = {
  string: 'search', string_list: 'search', integer: 'search', float: 'search', date_absolute: 'calendar',
  date_range: 'calendar', date_relative: 'calendar', time: 'clock', enum: 'menu', enum_list: 'menu',
  entity_list: 'search', custom: 'search', empty: 'search', nested: 'search',
};

// ── Relative dates (PowerSearchValueEditor.tsx buildRelativeDateOptions) ────

const RELATIVE_DATE_UNITS = [
  {unit: 'day', plural: 'days', amounts: [1, 3, 7, 14, 30]},
  {unit: 'week', plural: 'weeks', amounts: [1, 2, 4]},
  {unit: 'month', plural: 'months', amounts: [1, 3, 6, 12]},
] as const;

export function buildRelativeDateOptions(operatorValue: DateRelativeOperatorValue): {value: string; label: string}[] {
  const result: {value: string; label: string}[] = [];
  for (const {unit, plural, amounts} of RELATIVE_DATE_UNITS) {
    for (const amount of amounts) {
      const word = amount === 1 ? unit : plural;
      if (operatorValue.isPastAllowed !== false) result.push({value: `${amount}${unit[0]}_ago`, label: `${amount} ${word} ago`});
      if (operatorValue.isFutureAllowed !== false) result.push({value: `${amount}${unit[0]}_from_now`, label: `${amount} ${word} from now`});
    }
  }
  return result;
}

/** One editor template serves every (field, operator) with the same configuration. */
export function editorSignature(field: PowerSearchField, op: PowerSearchOperator): string {
  const value = op.value as OperatorValue & {searchSource?: unknown};
  if (value.searchSource != null || value.type === 'entity_list') return `${field.key}\u0000${op.key}`;
  return JSON.stringify(value);
}

// ── createPowerSearchConfig (usePowerSearchConfig.ts) ───────────────────────
// In ./powerSearchFilters.ts, re-exported here.

export {createPowerSearchConfig, type FieldDefinition} from './powerSearchFilters';
