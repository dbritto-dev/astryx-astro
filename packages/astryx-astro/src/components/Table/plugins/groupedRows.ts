/**
 * Grouped rows — port of @astryxdesign/core Table/plugins/groupedRows/useTableGroupedRows.tsx
 * (0.7.9). Each distinct `groupBy` value becomes a full-width section header row (chevron
 * toggle, label and member count; clicking the row toggles too); collapsing hides that
 * section's rows. Every row is rendered (rows of collapsed groups `hidden`) so the client
 * toggles without a round trip.
 *
 * Header content: `renderGroupHeader(groupKey, count, collapsed)`, or the Table's
 * `group-header` slot function, else `<groupKey> (<count>)`.
 *
 * Event: `astryx-toggle-group` (cancelable) `{groupKey, isCollapsed, collapsedGroups}` on the
 * `<ax-table>` — Astryx `onToggleGroup(groupKey)` plus the resulting state.
 * Element API: `table.collapsedGroups` (get/set).
 */
import {withFeature} from '../pipeline';
import {comp, el, slot} from '../node';
import GroupToggle from '../_GroupToggle.astro';
import type {TableNode, TablePlugin} from '../types';

const GROUP_HEADER = Symbol('tableGroupHeader');

interface GroupHeader {
  [GROUP_HEADER]: true;
  groupKey: string;
  count: number;
}

function isGroupHeader(item: unknown): item is GroupHeader {
  return typeof item === 'object' && item !== null && (item as Record<symbol, unknown>)[GROUP_HEADER] === true;
}

// Field access beyond the marker fields resolves to '' (keeps other plugins off undefined).
const HEADER_PROXY_HANDLER: ProxyHandler<Record<string | symbol, unknown>> = {
  get(t, prop) {
    if (prop === GROUP_HEADER || prop === 'groupKey' || prop === 'count') return t[prop];
    return prop in t ? t[prop] : '';
  },
};

function makeHeader<T>(groupKey: string, count: number): T {
  return new Proxy({[GROUP_HEADER]: true, groupKey, count} as Record<string | symbol, unknown>, HEADER_PROXY_HANDLER) as unknown as T;
}

export interface UseTableGroupedRowsConfig<T extends Record<string, unknown>> {
  data: T[];
  /** Group key of a row. */
  groupBy: (item: T) => string;
  /** Groups collapsed on first render. */
  collapsedGroups?: Iterable<string>;
  /** Header content right of the chevron. @default the `group-header` slot, else `<groupKey> (<count>)` */
  renderGroupHeader?: (groupKey: string, count: number, collapsed: boolean) => TableNode;
  /** Stable key for a real row (positional otherwise). */
  getRowKey?: (item: T) => string;
  /** Explicit group order; unlisted groups follow in first-seen order. */
  groupOrder?: string[];
}

export interface UseTableGroupedRowsResult<T extends Record<string, unknown>> {
  plugin: TablePlugin<T>;
  /** `[header, ...rows, header, ...rows]` (every row; the collapsed ones render hidden). */
  data: T[];
  /** Row keys (headers are `__group_<key>`); pass as the Table's `idKey`. */
  idKey: (item: T) => string;
}

export function useTableGroupedRows<T extends Record<string, unknown>>(config: UseTableGroupedRowsConfig<T>): UseTableGroupedRowsResult<T> {
  const {data, groupBy, renderGroupHeader, getRowKey, groupOrder} = config;
  const collapsed = new Set(config.collapsedGroups ?? []);

  const groups = new Map<string, T[]>();
  for (const item of data) {
    const key = groupBy(item);
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  let keys = [...groups.keys()];
  if (groupOrder && groupOrder.length > 0) {
    keys = [...groupOrder.filter((k) => groups.has(k)), ...keys.filter((k) => !groupOrder.includes(k))];
  }
  const groupOf = new Map<T, string>();
  const flattened: T[] = [];
  for (const key of keys) {
    const rows = groups.get(key) ?? [];
    flattened.push(makeHeader<T>(key, rows.length));
    for (const row of rows) {
      groupOf.set(row, key);
      flattened.push(row);
    }
  }
  const position = new Map<T, number>(flattened.map((item, i) => [item, i]));
  const idKey = (item: T): string => {
    if (isGroupHeader(item)) return `__group_${item.groupKey}`;
    if (getRowKey) return getRowKey(item);
    return String(position.get(item) ?? -1);
  };

  const plugin: TablePlugin<T> = {
    transformBodyCell(props, _column, item) {
      return isGroupHeader(item) ? {...props, isContentSuppressed: true} : props;
    },

    transformBodyRow(props, item, _index, ctx) {
      if (!isGroupHeader(item)) {
        const key = groupOf.get(item);
        return key != null && collapsed.has(key) ? {...props, htmlProps: {...props.htmlProps, hidden: true}} : props;
      }
      const header = item as unknown as GroupHeader;
      const isCollapsed = collapsed.has(header.groupKey);
      const custom = renderGroupHeader
        ? renderGroupHeader(header.groupKey, header.count, isCollapsed)
        : ctx.hasSlot('group-header')
          ? slot('group-header', header.groupKey, header.count, isCollapsed)
          : null;
      const content: TableNode =
        custom ?? el('span', {class: 'ax-table-group-label'}, [header.groupKey, ' ', el('span', {class: 'ax-table-group-count'}, `(${header.count})`)]);
      return {
        ...props,
        htmlProps: {...props.htmlProps, 'data-ax-group-key': header.groupKey, 'data-ax-collapsed': isCollapsed ? '' : undefined},
        xstyle: [...props.xstyle, 'ax-table-group-header'],
        children: el(
          'td',
          {colspan: 999, class: 'ax-table-group-cell'},
          el('span', {class: 'ax-table-group-inner', 'data-custom': custom != null ? '' : undefined}, [
            comp(GroupToggle, {groupKey: header.groupKey, isCollapsed}, undefined, {table: true}),
            content,
          ]),
        ),
      };
    },

    transformScrollWrapper(props) {
      return {...props, htmlProps: withFeature(props.htmlProps, 'grouped')};
    },
  };

  return {plugin, data: flattened, idKey};
}
