/**
 * Column filtering — port of @astryxdesign/core Table/plugins/filtering/useTableFiltering.tsx
 * and useTableFilterState.tsx (0.7.9), as server functions.
 *
 * Columns name a PowerSearch field (`filter: 'status'` or `{field, operator}`) of the plugin's
 * `searchConfig`; the operator's value type picks the control, labelled "Filter by <header>":
 *   string → TextInput · integer / float → NumberInput (integer step 1, the operator's bounds)
 *   enum → Selector ("All") · enum_list → MultiSelector ("All", Select all, no search)
 *   date_absolute → DateInput · time → TimeInput · string_list / entity_list → Tokenizer (the
 *   operator's `searchSource`, else any typed text becomes a token) · other types: no control.
 * Variants: `popover` (default) — a funnel button after the header label (faded until the
 * header is hovered or it is focused; accent while a value is set) opening a Popover with the
 * control and Reset / Apply (the edit is a draft until Apply); `inline` / `inline-compact` —
 * the control (sm, with a clear button) below the header label, a placeholder of its height
 * under columns without a filter, and filter columns without a width widened to proportional(1).
 *
 * Event: `astryx-filter-change` (cancelable) `{columnKey, value, filters}` on the `<ax-table>`
 * — Astryx `onFilterChange(columnKey, value | null)` plus the resulting state; `preventDefault()`
 * keeps the old value. The controls' own events stay inside the table. Element API:
 * `table.filters` (get/set), `table.clearFilters()`.
 *
 * Port extension `hasClientFiltering`: Astryx leaves filtering the data to the caller
 * (`applyFilters(toSearchFilters(filters, columns, config), data)`); here a page can instead
 * pass every row and let the table filter the rendered rows — the server hides the rows the
 * initial filters reject (with the same matcher as PowerSearch's `applyFilters`), the client
 * re-filters on every change, and the table's empty state shows while no row is left.
 */
import {comp, nodeText} from '../node';
import {proportional} from '../columnUtils';
import {withFeature} from '../pipeline';
import FilterSlot from '../_FilterSlot.astro';
import {createPowerSearchConfig, type PowerSearchConfig, type PowerSearchFilter} from '../../PowerSearch/powerSearchModel';
import {resolveFilterField, toSearchFilters, type TableFilterState, type TableFilterValue, type TableFilterVariant} from './filterModel';
import type {TableColumn, TableFilterFieldRef, TablePlugin} from '../types';

export type {TableFilterFieldRef} from '../types';
export {resolveFilterField, tableValueToFilterValue, toSearchFilters} from './filterModel';
export type {TableFilterState, TableFilterValue, TableFilterVariant} from './filterModel';

export interface UseTableFilteringConfig {
  /** Current (initial) filter state — column key → value. */
  filters: TableFilterState;
  /** Astryx callback; not called in Astro — listen for `astryx-filter-change` on the table. */
  onFilterChange?: (columnKey: string, value: TableFilterValue | null) => void;
  /** @default 'popover' */
  variant?: TableFilterVariant;
  /** The PowerSearch fields columns refer to (`createPowerSearchConfig(...)`). */
  searchConfig: PowerSearchConfig;
  /**
   * Port extension: filter the rendered rows in the browser (pass every row as `data`); the
   * server hides the rows the initial filters reject. @default false
   */
  hasClientFiltering?: boolean;
}

export interface UseTableFilterStateResult {
  /** Current filter state — pass to useTableFiltering. */
  filters: TableFilterState;
  /** Astryx setter; returns the next state on the server (the table owns the state afterwards). */
  onFilterChange: (key: string, value: TableFilterValue | null) => TableFilterState;
  /** Astryx reset; returns the empty state on the server (`table.clearFilters()` on the client). */
  clearAll: () => TableFilterState;
}

/** The filter state map and its (server-side, pure) update helpers (Astryx useTableFilterState). */
export function useTableFilterState(initialState?: TableFilterState): UseTableFilterStateResult {
  const filters: TableFilterState = {...(initialState ?? {})};
  for (const key of Object.keys(filters)) if (filters[key] == null) delete filters[key];
  return {
    filters,
    onFilterChange: (key, value) => {
      if (value == null) {
        const {[key]: _removed, ...next} = filters;
        return next;
      }
      return {...filters, [key]: value};
    },
    clearAll: () => ({}),
  };
}

/** Header text for the control names (Astryx getHeaderString: a string header, else the key). */
function headerString<T extends Record<string, unknown>>(column: TableColumn<T>): string {
  if (typeof column.header === 'string') return column.header;
  const text = column.header != null && typeof column.header === 'object' ? nodeText(column.header).trim() : '';
  return text || column.key;
}

/** A row value as the client matcher reads it (Dates as unix seconds, as applyFilters compares them). */
function clientValue(value: unknown): unknown {
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(clientValue);
  return null;
}

const matcher = createPowerSearchConfig([]);

/** Column filter controls (Astryx useTableFiltering) — see the file header. */
export function useTableFiltering<T extends Record<string, unknown>>(config: UseTableFilteringConfig): TablePlugin<T> {
  const {filters, searchConfig, hasClientFiltering = false} = config;
  const variant: TableFilterVariant = config.variant ?? 'popover';
  // Per render: the filter columns (key → resolved field / operator).
  let filterColumns: Array<{key: string; filter: TableFilterFieldRef | string; field: string; operator: string; type: string}> = [];
  let searchFilters: PowerSearchFilter[] = [];

  return {
    transformColumns(columns) {
      filterColumns = [];
      for (const col of columns) {
        if (col.filter == null) continue;
        const resolved = resolveFilterField(col.filter, searchConfig);
        if (resolved) filterColumns.push({key: col.key, filter: col.filter, field: resolved.field.key, operator: resolved.operator.key, type: resolved.operator.value.type});
      }
      searchFilters = toSearchFilters(filters, columns, searchConfig);
      // Inline variants give filter columns without a width a proportional(1) floor, so the
      // controls cannot collapse.
      if (variant === 'inline' || variant === 'inline-compact') {
        return columns.map((col) => (col.filter != null && col.width == null ? {...col, width: proportional(1)} : col));
      }
      return columns;
    },

    transformHeaderCell(props, column, columnIndex, _columns, ctx) {
      const resolved = column.filter ? resolveFilterField(column.filter, searchConfig) : undefined;
      const header = headerString(column);
      const value = filters[column.key];
      if (variant === 'popover') {
        if (!resolved) return props;
        const slot = comp(
          FilterSlot,
          {variant, columnKey: column.key, header, operatorValue: resolved.operator.value, value, idBase: `${ctx.idBase}-filter-${columnIndex}`},
          undefined,
          {table: true},
        );
        return {...props, after: props.after != null ? [props.after, slot] : slot};
      }
      const slot = comp(
        FilterSlot,
        {variant, columnKey: column.key, header, operatorValue: resolved?.operator.value, value, idBase: `${ctx.idBase}-filter-${columnIndex}`},
        undefined,
        {table: true},
      );
      return {...props, below: props.below != null ? [props.below, slot] : slot};
    },

    transformBodyRow(props, item) {
      if (!hasClientFiltering || filterColumns.length === 0) return props;
      const values: Record<string, unknown> = {};
      for (const col of filterColumns) values[col.field] = clientValue(item[col.field]);
      const accepted = searchFilters.length === 0 || matcher.applyFilters(searchFilters, [item]).length > 0;
      return {
        ...props,
        htmlProps: {
          ...props.htmlProps,
          'data-ax-filter-values': JSON.stringify(values),
          // Server only: the pager skips rejected rows (the client re-derives both).
          'data-ax-filter-rejected': accepted ? undefined : '',
          hidden: accepted ? props.htmlProps.hidden : true,
        },
      };
    },

    transformScrollWrapper(props) {
      const state: TableFilterState = {};
      for (const [key, value] of Object.entries(filters)) if (value != null) state[key] = value;
      return {
        ...props,
        htmlProps: {
          ...(hasClientFiltering ? withFeature(withFeature(props.htmlProps, 'filter'), 'filter-rows') : withFeature(props.htmlProps, 'filter')),
          'data-ax-filters': JSON.stringify(state),
          'data-ax-filter-config': JSON.stringify({variant, isClient: hasClientFiltering, columns: filterColumns.map(({key, field, operator, type}) => ({key, field, operator, type}))}),
        },
      };
    },
  };
}
