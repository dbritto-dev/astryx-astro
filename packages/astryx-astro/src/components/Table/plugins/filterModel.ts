/**
 * Pure filter model shared by the server plugin (plugins/filtering.ts) and the browser
 * (elements/table-features/filter.ts) — port of the resolution helpers of @astryxdesign/core
 * Table/plugins/filtering/useTableFiltering.tsx (resolveOperator, resolveFilterConfig,
 * toSearchFilters, tableValueToFilterValue). No Astro imports: it ships to the client.
 */
import type {FilterValue, OperatorValue, PowerSearchConfig, PowerSearchField, PowerSearchFilter, PowerSearchOperator} from '../../PowerSearch/powerSearchModel';
import type {TableFilterFieldRef} from '../types';

/** Union of all filter value types (text = string, number = number, enum / list = string[]). */
export type TableFilterValue = string | number | string[];

/** Column key → filter value; a missing key or `undefined` means no filter on that column. */
export type TableFilterState = Record<string, TableFilterValue | undefined>;

/** `popover`: funnel + popover · `inline`: controls below the header · `inline-compact`: compact placeholder. */
export type TableFilterVariant = 'popover' | 'inline' | 'inline-compact';

// =============================================================================
// PowerSearch → table filter resolution
// =============================================================================

function resolveOperator(field: PowerSearchField, operatorKey?: string): PowerSearchOperator | undefined {
  if (operatorKey) return field.operators.find((o) => o.key === operatorKey);
  if (field.defaultOperator) return field.operators.find((o) => o.key === field.defaultOperator);
  return field.operators[0];
}

/** The field and operator a column's `filter` reference resolves to. */
export function resolveFilterField(
  filter: TableFilterFieldRef | string,
  searchConfig: PowerSearchConfig,
): {field: PowerSearchField; operator: PowerSearchOperator} | undefined {
  const fieldKey = typeof filter === 'string' ? filter : filter.field;
  const operatorKey = typeof filter === 'string' ? undefined : filter.operator;
  const field = searchConfig.fields.find((f) => f.key === fieldKey);
  if (!field) return undefined;
  const operator = resolveOperator(field, operatorKey);
  return operator ? {field, operator} : undefined;
}

/** A table filter value as a PowerSearch FilterValue for the operator's value type. */
export function tableValueToFilterValue(value: TableFilterValue, opValue: OperatorValue): FilterValue | undefined {
  switch (opValue.type) {
    case 'string':
      return typeof value === 'string' ? {type: 'string', value} : undefined;
    case 'integer':
      return typeof value === 'number' ? {type: 'integer', value} : undefined;
    case 'float':
      return typeof value === 'number' ? {type: 'float', value} : undefined;
    case 'enum':
      return typeof value === 'string' ? {type: 'enum', value} : undefined;
    case 'enum_list':
      return Array.isArray(value) ? {type: 'enum_list', value} : undefined;
    case 'date_absolute':
      // `Date` parses the filter's date string (the ISO day a DateInput reports, at UTC
      // midnight, or any string Astryx's Date reading takes) because this module ships to every
      // filterable table, which must not load Temporal (lib/temporal.ts) without a date column.
      return typeof value === 'string' ? {type: 'date_absolute', unixSeconds: Math.floor(new Date(value).getTime() / 1000)} : undefined;
    case 'time':
      return typeof value === 'string' ? {type: 'time', value} : undefined;
    case 'string_list':
      return Array.isArray(value) ? {type: 'string_list', value} : undefined;
    case 'entity_list':
      return Array.isArray(value) ? {type: 'entity_list', value: value.map((id) => ({id, label: id}))} : undefined;
    default:
      return undefined;
  }
}

/**
 * Table filter state → PowerSearchFilter[] for `applyFilters` (Astryx toSearchFilters): one
 * filter per column with a `filter` reference and a value, resolved through `searchConfig`.
 */
export function toSearchFilters(
  filters: TableFilterState,
  columns: ReadonlyArray<{key: string; filter?: TableFilterFieldRef | string}>,
  searchConfig: PowerSearchConfig,
): PowerSearchFilter[] {
  const result: PowerSearchFilter[] = [];
  for (const col of columns) {
    if (!col.filter) continue;
    const value = filters[col.key];
    if (value == null) continue;
    const resolved = resolveFilterField(col.filter, searchConfig);
    if (!resolved) continue;
    const filterValue = tableValueToFilterValue(value, resolved.operator.value);
    if (!filterValue) continue;
    result.push({field: resolved.field.key, operator: resolved.operator.key, value: filterValue});
  }
  return result;
}

