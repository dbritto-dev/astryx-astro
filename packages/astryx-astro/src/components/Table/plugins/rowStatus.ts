/**
 * Row status — port of @astryxdesign/core Table/plugins/rowStatus/useTableRowStatus.tsx
 * (0.7.9). Prepends a 28px gutter column (visually hidden "Row status" header) whose cells
 * show a semantic glyph (`{status, label}` → the success / warning / error icon in its tone)
 * or a custom marker (`{color, icon?, label}` → an 8px dot, or the caller's icon), named by
 * `label` (`role="img"`) with the label as a hover tooltip. Server-only.
 */
import {comp} from '../node';
import RowStatus from '../_RowStatus.astro';
import HiddenLabel from '../_HiddenLabel.astro';
import type {IconName} from '../../Icon/iconRegistry';
import type {TableColumn, TablePlugin} from '../types';

export type TableRowStatusColor = 'accent' | 'success' | 'error' | 'warning' | 'red' | 'orange' | 'green' | 'yellow' | 'blue' | 'gray';

/** Custom marker: paint-only color, optional caller icon. */
export interface TableRowStatus {
  color: TableRowStatusColor | (string & {});
  icon?: IconName;
  label: string;
  status?: never;
}

/** Semantic outcome resolved through the active theme. */
export interface TableSemanticRowStatus {
  status: 'success' | 'warning' | 'error';
  color?: never;
  icon?: never;
  label: string;
}

export interface UseTableRowStatusConfig<T extends Record<string, unknown>> {
  /** The row's indicator, or null for none. */
  getStatus: (item: T) => TableRowStatus | TableSemanticRowStatus | null;
}

export const ROW_STATUS_COLUMN_KEY = '__rowStatus';

export function useTableRowStatus<T extends Record<string, unknown>>(config: UseTableRowStatusConfig<T>): TablePlugin<T> {
  const statusColumn: TableColumn<T> = {
    key: ROW_STATUS_COLUMN_KEY,
    header: comp(HiddenLabel, {messageKey: '@astryx.table.rowStatus.columnHeader'}, undefined, {table: true}),
    width: {type: 'pixel', value: 28},
    resizable: false,
    renderCell: (item: T) => {
      const status = config.getStatus(item);
      return status ? comp(RowStatus, {status}, undefined, {table: true}) : null;
    },
  };
  return {
    transformColumns(columns) {
      return [statusColumn, ...columns];
    },
  };
}
