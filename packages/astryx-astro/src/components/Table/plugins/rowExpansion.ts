/**
 * Row expansion (detail panels) — port of @astryxdesign/core Table/plugins/rowExpansion/
 * useTableRowExpansion.tsx (0.7.9).
 *
 * Adds a leading 40px chevron column (visually hidden "Row expansion" header) and, below
 * every expandable row, its detail panel row: one cell spanning the row, indented to the
 * first real column for the density, carrying the row divider the expanded row gives up.
 * Panels render on the server for every expandable row (collapsed ones `hidden`), so the
 * client toggles them without a round trip. The toggle shows the `table-row-expand
 * {expanded}` component icon, turned a quarter while expanded and mirrored in RTL.
 *
 * Content: `renderExpanded(item)` (a TableNode), or the Table's `expanded` slot function:
 *   <Fragment slot="expanded">{(order) => <OrderDetails order={order} />}</Fragment>
 *
 * Event: `astryx-expanded-change` (cancelable) `{key, isExpanded, expandedKeys}` on the
 * `<ax-table>` — Astryx `onToggle(key)` plus the resulting state; `preventDefault()` keeps
 * the row as it is. Element API: `table.expandedKeys` (get/set).
 * Deferred: the right-click Expand/Collapse action (ContextMenu) and `animatedLayout`
 * (rows jump, as Astryx does without the handle).
 */
import {withFeature} from '../pipeline';
import {comp, el, slot} from '../node';
import {pixel} from '../columnUtils';
import ExpandToggle from '../_ExpandToggle.astro';
import ExpandTemplates from '../_ExpandTemplates.astro';
import HiddenLabel from '../_HiddenLabel.astro';
import type {TableColumn, TableNode, TablePlugin} from '../types';

export interface UseTableRowExpansionConfig<T extends Record<string, unknown>> {
  /** Keys expanded on first render. */
  expandedKeys?: Iterable<string>;
  /** Stable unique key for a row. */
  getRowKey: (item: T) => string;
  /** Detail panel content. @default the Table's `expanded` slot, called with the row */
  renderExpanded?: (item: T) => TableNode;
  /** Row identity for the toggle's name ("Expand Alice"); blank keeps "Expand row". */
  getRowLabel?: (item: T) => string;
  /** Rows that can expand. @default every row */
  getIsItemExpandable?: (item: T) => boolean;
  /** Panel background. @default 'transparent' */
  panelVariant?: 'muted' | 'transparent';
  /** Toggle by clicking anywhere on the row (pointer convenience; the chevron stays the control). @default false */
  hasRowClickExpansion?: boolean;
}

export const EXPANSION_COLUMN_KEY = '__expansion';
const EXPANSION_COLUMN_WIDTH = pixel(40);

export function useTableRowExpansion<T extends Record<string, unknown>>(config: UseTableRowExpansionConfig<T>): TablePlugin<T> {
  const {getRowKey, getRowLabel, getIsItemExpandable, hasRowClickExpansion = false, panelVariant = 'transparent'} = config;
  const expanded = new Set(config.expandedKeys ?? []);
  const renderExpanded = config.renderExpanded ?? ((item: T) => slot('expanded', item));
  const expandable = (item: T) => (getIsItemExpandable ? getIsItemExpandable(item) : true);
  let columnCount = 1;

  const expansionColumn: TableColumn<T> = {
    key: EXPANSION_COLUMN_KEY,
    header: comp(HiddenLabel, {messageKey: '@astryx.tableRowExpansion.columnHeader'}, undefined, {table: true}),
    width: EXPANSION_COLUMN_WIDTH,
    resizable: false,
    renderCell: (item: T) => {
      if (!expandable(item)) return null;
      return comp(ExpandToggle, {rowLabel: getRowLabel?.(item)?.trim() || undefined, isExpanded: expanded.has(getRowKey(item))}, undefined, {table: true});
    },
  };

  return {
    transformColumns(columns) {
      const withExpansion = [expansionColumn, ...columns];
      columnCount = withExpansion.length;
      return withExpansion;
    },

    transformHeaderCell(props, column) {
      return column.key === EXPANSION_COLUMN_KEY ? {...props, xstyle: [...props.xstyle, 'ax-table-expansion-header']} : props;
    },

    transformBodyCell(props, column, item) {
      if (!expandable(item) || column.key !== EXPANSION_COLUMN_KEY) return props;
      return {...props, xstyle: [...props.xstyle, 'ax-table-expansion-cell']};
    },

    transformBodyRow(props, item, _index, ctx) {
      if (!expandable(item)) return props;
      const key = getRowKey(item);
      const isExpanded = expanded.has(key);
      const htmlProps = {
        ...props.htmlProps,
        'data-expansion-key': key,
        'data-ax-expanded': isExpanded ? '' : undefined,
        'data-ax-row-click-expansion': hasRowClickExpansion ? 'expansion' : undefined,
      };
      const panel = el(
        'tr',
        {'data-expansion-panel': '', class: 'ax-table-panel-row', 'data-variant': panelVariant === 'muted' ? 'muted' : undefined, hidden: isExpanded ? undefined : true},
        el('td', {colspan: columnCount, class: 'ax-table-panel-cell', 'data-density': ctx.density}, renderExpanded(item)),
      );
      return {
        ...props,
        htmlProps,
        xstyle: hasRowClickExpansion ? [...props.xstyle, 'ax-table-clickable-row'] : props.xstyle,
        afterRow: props.afterRow != null ? [props.afterRow, panel] : panel,
      };
    },

    transformScrollWrapper(props) {
      return {
        ...props,
        htmlProps: withFeature(props.htmlProps, 'expansion'),
        afterTable: [props.afterTable, comp(ExpandTemplates, {}, undefined, {table: true})],
      };
    },
  };
}
