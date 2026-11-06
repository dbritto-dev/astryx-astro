/**
 * Sorting — port of @astryxdesign/core Table/plugins/sortable/useTableSortable.tsx and
 * useTableSortableState.tsx (0.7.9), as server functions.
 *
 * `useTableSortableState()` sorts in-page data on the server (Intl.Collator, numeric) and
 * hands `useTableSortable()` what the client needs to re-sort the rendered rows: each body
 * row gets `data-ax-sort-rank` (its rank per sortable key under the same comparators, then
 * its original position), so a header click reorders rows in the DOM exactly as the server
 * would. `useTableSortable({sort})` alone is headless: the client updates `aria-sort` and the
 * indicators and fires `astryx-sort-change`; the page re-renders the data (e.g. a navigation).
 *
 * Event: `astryx-sort-change` (cancelable) `{sort}` on the `<ax-table>` — the payload of
 * Astryx `onSortChange`. `preventDefault()` keeps the current state (controlled).
 * Deferred: the header context-menu sort actions (ContextMenu not ported).
 */
import {withFeature} from '../pipeline';
import {comp} from '../node';
import SortButton from '../_SortButton.astro';
import SortTemplates from '../_SortTemplates.astro';
import type {HeaderCellRenderProps, TableColumn, TablePlugin, TablePluginContext} from '../types';

export type TableSortDirection = 'ascending' | 'descending';

export interface TableSortEntry<TSortKey extends string = string> {
  sortKey: TSortKey;
  direction: TableSortDirection;
}

/** Ordered sort entries: the first is primary, the rest break ties. Empty = unsorted. */
export type TableSortState<TSortKey extends string = string> = TableSortEntry<TSortKey>[];

/** Ascending comparator for one sort key (the direction is applied for you). */
export type TableSortComparator<T> = (a: T, b: T) => number;

interface LocalSort<T> {
  data: readonly T[];
  comparators?: Partial<Record<string, TableSortComparator<T>>>;
  locale?: string;
}

export interface UseTableSortableConfig<TSortKey extends string = string> {
  /** Current (initial) sort state. */
  sort: TableSortState<TSortKey>;
  /** A third click returns the column to unsorted (else ascending again). @default true */
  allowUnsortedState?: boolean;
  /** Shift+click adds or steps a secondary sort key. @default false */
  isMultiSortEnabled?: boolean;
  /** Set by useTableSortableState: the client reorders the rendered rows itself. */
  local?: LocalSort<never>;
}

export interface UseTableSortableStateConfig<T extends Record<string, unknown>, TSortKey extends string = string> {
  /** Rows to sort; never mutated. */
  data: T[];
  /** Initial sort state (ignored when `sort` is passed). @default [] */
  defaultSort?: TableSortState<TSortKey>;
  /** Controlled sort state (e.g. read from the URL). */
  sort?: TableSortState<TSortKey>;
  /** Ascending comparators per sort key; others use a numeric Intl.Collator. */
  comparators?: Partial<Record<TSortKey, TableSortComparator<T>>>;
  allowUnsortedState?: boolean;
  isMultiSortEnabled?: boolean;
  /** Collation locale (Astryx uses the provider locale). @default 'en' */
  locale?: string;
}

export interface UseTableSortableStateResult<T extends Record<string, unknown>, TSortKey extends string = string> {
  sortedData: T[];
  sort: TableSortState<TSortKey>;
  /** Pass to useTableSortable. */
  sortConfig: UseTableSortableConfig<TSortKey>;
  /** Apply the current sort to other rows (e.g. tree siblings). */
  applySort: (data: T[]) => T[];
}

// =============================================================================
// Comparison (useTableSortableState)
// =============================================================================

function toSortableString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  return '';
}

function defaultCompare(aVal: unknown, bVal: unknown, collator: Intl.Collator): number {
  const aMissing = aVal == null || (typeof aVal === 'number' && Number.isNaN(aVal));
  const bMissing = bVal == null || (typeof bVal === 'number' && Number.isNaN(bVal));
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  if (typeof aVal === 'number' && typeof bVal === 'number') return aVal - bVal;
  return collator.compare(toSortableString(aVal), toSortableString(bVal));
}

const collators = new Map<string, Intl.Collator>();
function collatorFor(locale = 'en'): Intl.Collator {
  let c = collators.get(locale);
  if (!c) collators.set(locale, (c = new Intl.Collator(locale, {numeric: true})));
  return c;
}

function comparatorFor<T extends Record<string, unknown>>(
  sortKey: string,
  comparators: Partial<Record<string, TableSortComparator<T>>> | undefined,
  collator: Intl.Collator,
): TableSortComparator<T> {
  const custom = comparators?.[sortKey];
  if (custom) return custom;
  return (a, b) => defaultCompare(a[sortKey], b[sortKey], collator);
}

function sortData<T extends Record<string, unknown>>(
  data: readonly T[],
  sort: TableSortState,
  comparators: Partial<Record<string, TableSortComparator<T>>> | undefined,
  collator: Intl.Collator,
): T[] {
  if (sort.length === 0) return [...data];
  const cmps = sort.map((e) => [comparatorFor(e.sortKey, comparators, collator), e.direction] as const);
  return [...data].sort((a, b) => {
    for (const [cmp, direction] of cmps) {
      const r = cmp(a, b);
      if (r !== 0) return direction === 'ascending' ? r : -r;
    }
    return 0;
  });
}

/** Sort in-page data and build the config for `useTableSortable` (Astryx useTableSortableState). */
export function useTableSortableState<T extends Record<string, unknown>, TSortKey extends string = string>(
  config: UseTableSortableStateConfig<T, TSortKey>,
): UseTableSortableStateResult<T, TSortKey> {
  const {data, defaultSort = [], sort: controlled, comparators, allowUnsortedState, isMultiSortEnabled, locale} = config;
  const sort = controlled ?? defaultSort;
  const collator = collatorFor(locale);
  const cmpMap = comparators as Partial<Record<string, TableSortComparator<T>>> | undefined;
  return {
    sortedData: sortData(data, sort, cmpMap, collator),
    sort,
    sortConfig: {sort, allowUnsortedState, isMultiSortEnabled, local: {data, comparators: cmpMap, locale} as LocalSort<never>},
    applySort: (rows: T[]) => sortData(rows, sort, cmpMap, collator),
  };
}

// =============================================================================
// Plugin (useTableSortable)
// =============================================================================

export function resolveSortKey<T extends Record<string, unknown>>(column: TableColumn<T>): string | null {
  const {sortable} = column;
  if (!sortable) return null;
  if (sortable === true) return column.key;
  return sortable.sortKey ?? column.key;
}

/** Ranks per key over the rendered rows (ties share a rank), so the client compares integers. */
function computeRanks<T extends Record<string, unknown>>(rows: readonly T[], keys: string[], local: LocalSort<T>): Map<T, number[]> {
  const collator = collatorFor(local.locale);
  const original = new Map<T, number>();
  local.data.forEach((item, i) => original.set(item, i));
  const out = new Map<T, number[]>();
  rows.forEach((item) => out.set(item, []));
  for (const key of keys) {
    const cmp = comparatorFor<T>(key, local.comparators, collator);
    const safe = (a: T, b: T) => {
      try {
        return cmp(a, b) || 0;
      } catch {
        return 0;
      }
    };
    const order = [...rows].sort(safe);
    let rank = 0;
    order.forEach((item, i) => {
      if (i > 0 && safe(order[i - 1], item) !== 0) rank++;
      out.get(item)!.push(rank);
    });
  }
  rows.forEach((item, i) => out.get(item)!.push(original.get(item) ?? local.data.length + i));
  return out;
}

/**
 * Sortable column headers (Astryx useTableSortable): the label becomes a button that cycles
 * the column's direction (Shift+click adds a secondary key when multi-sort is on), the header
 * carries `aria-sort`, and the `table-sort-indicator` component icon shows the direction.
 */
export function useTableSortable<T extends Record<string, unknown>, TSortKey extends string = string>(
  config: UseTableSortableConfig<TSortKey>,
): TablePlugin<T> {
  const {sort, allowUnsortedState = true, isMultiSortEnabled = false} = config;
  const local = config.local as LocalSort<T> | undefined;
  // Per render (the pipeline is synchronous): the sortable keys seen and the row ranks.
  let keys: string[] = [];
  let ranks: Map<T, number[]> | null = null;

  return {
    transformColumns(columns) {
      keys = [];
      ranks = null;
      for (const column of columns) {
        const key = resolveSortKey(column);
        if (key != null && !keys.includes(key)) keys.push(key);
      }
      return columns;
    },

    transformHeaderCell(props: HeaderCellRenderProps, column: TableColumn<T>, columnIndex: number, _columns, ctx: TablePluginContext<T>) {
      const sortKey = resolveSortKey(column);
      if (sortKey == null) return props;
      const entryIndex = sort.findIndex((e) => e.sortKey === sortKey);
      const entry = entryIndex >= 0 ? sort[entryIndex] : null;
      const rank = isMultiSortEnabled && sort.length > 1 && entryIndex >= 0 ? entryIndex + 1 : null;
      return {
        ...props,
        htmlProps: {...props.htmlProps, ...(entry != null ? {'aria-sort': entry.direction} : {})},
        content: comp(
          SortButton,
          {
            sortKey,
            direction: entry?.direction ?? null,
            align: column.align,
            rank,
            total: sort.length,
            priorityId: `${ctx.idBase}-sort-priority-${columnIndex}`,
          },
          props.content,
          {table: true},
        ),
      };
    },

    transformBodyRow(props, item, _index, ctx) {
      if (!local || keys.length === 0) return props;
      ranks ??= computeRanks((ctx.data ?? []) as readonly T[], keys, local);
      const r = ranks.get(item);
      return r ? {...props, htmlProps: {...props.htmlProps, 'data-ax-sort-rank': r.join(' ')}} : props;
    },

    transformScrollWrapper(props, ctx) {
      const priority: Record<string, string> = {};
      if (isMultiSortEnabled) {
        for (let total = 2; total <= keys.length; total++) {
          for (let rank = 1; rank <= total; rank++) priority[`${rank}/${total}`] = ctx.t('@astryx.table.sort.priority', {rank, total});
        }
      }
      return {
        ...props,
        htmlProps: {
          ...withFeature(props.htmlProps, 'sort'),
          'data-ax-sort': JSON.stringify(sort),
          'data-ax-sort-config': JSON.stringify({
            allowUnsortedState,
            isMultiSortEnabled,
            isLocal: local != null,
            keys,
            ...(isMultiSortEnabled ? {priority} : {}),
          }),
        },
        afterTable: [props.afterTable, comp(SortTemplates, {}, undefined, {table: true})],
      };
    },
  };
}
