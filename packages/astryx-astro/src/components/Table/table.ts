/**
 * Table's public server API (the non-component exports of @astryxdesign/core Table/index.ts):
 *   import {proportional, pixel, useTableSortableState, useTableSortable} from 'astryx-astro/components/Table/table';
 * The `useTable*` functions are plain server functions with Astryx's names and configs; call
 * them in frontmatter and pass the results to `<Table plugins={{…}}>`.
 */
export {
  proportional,
  pixel,
  generateColumns,
  resolveColumnWidths,
  resolveColumnFloorWidths,
  capitalize,
  DEFAULT_MIN_COLUMN_WIDTH,
  DEFAULT_FLEXIBLE_COLUMN_MIN_WIDTH,
} from './columnUtils';
export {el, comp, html, slot, nodeText} from './node';
export {orderPlugins, withFeature} from './pipeline';
export {useTableSortable, useTableSortableState, resolveSortKey} from './plugins/sortable';
export {useTableColumnResize} from './plugins/columnResize';
export {useTableStickyColumns} from './plugins/stickyColumns';
export {useTableRowExpansion} from './plugins/rowExpansion';
export {useTableRowStatus} from './plugins/rowStatus';
export {useTableGroupedRows} from './plugins/groupedRows';
export {useTableTreeData, useTableTreeState} from './plugins/tree';
export {useTableRowIndex} from './plugins/rowIndex';
export {useTableSelection, useTableSelectionState, SELECTION_COLUMN_KEY} from './plugins/selection';

export type * from './types';
export type {
  TableSortDirection,
  TableSortEntry,
  TableSortState,
  TableSortComparator,
  UseTableSortableConfig,
  UseTableSortableStateConfig,
  UseTableSortableStateResult,
} from './plugins/sortable';
export type {UseTableColumnResizeConfig} from './plugins/columnResize';
export type {UseTableStickyColumnsConfig} from './plugins/stickyColumns';
export type {UseTableRowExpansionConfig} from './plugins/rowExpansion';
export type {UseTableRowStatusConfig, TableRowStatus, TableSemanticRowStatus, TableRowStatusColor} from './plugins/rowStatus';
export type {UseTableGroupedRowsConfig, UseTableGroupedRowsResult} from './plugins/groupedRows';
export type {TableTreeRowMeta, UseTableTreeDataConfig, UseTableTreeStateConfig, UseTableTreeStateResult} from './plugins/tree';
export type {UseTableRowIndexConfig} from './plugins/rowIndex';
export type {
  UseTableSelectionConfig,
  UseTableSelectionStateConfig,
  UseTableSelectionStateResult,
  TableSelectionState,
} from './plugins/selection';
