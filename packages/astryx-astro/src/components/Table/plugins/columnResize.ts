/**
 * Column resizing — port of @astryxdesign/core Table/plugins/columnResize/
 * useTableColumnResize.tsx (0.7.9). Server side: the handles (WAI-ARIA window splitter
 * separators in each resizable header's `overlay` slot), width overrides and the per-column
 * floors; client side: elements/table-features/resize.ts (pointer drag, arrow keys ±10px,
 * Shift ±50px, Home → min, End → max, RTL, the table-height measurement and the scroll
 * gate that holds the hover reveal while the region scrolls).
 *
 * With `columns`, a proportional column resizes its next neighbour inversely (the table
 * keeps its width) and the last proportional column has no handle; without it every column
 * resizes directly. The last snapshot column always takes the remainder.
 *
 * Event: `astryx-column-resize` `{updates}` on the `<ax-table>` when a resize completes
 * (pointerup / each key step) — every column whose width changed, Astryx
 * `onColumnResizeEnd(updates)`. The element keeps the widths (`table.columnWidths`).
 */
import {withFeature} from '../pipeline';
import {comp, nodeText} from '../node';
import {DEFAULT_FLEXIBLE_COLUMN_MIN_WIDTH, DEFAULT_MIN_COLUMN_WIDTH} from '../columnUtils';
import ResizeHandle from '../_ResizeHandle.astro';
import type {ColumnWidth, TableColumn, TablePlugin} from '../types';

export interface UseTableColumnResizeConfig {
  /** Pixel width overrides by column key (e.g. restored from storage). */
  columnWidths?: Record<string, number>;
  /** Global minimum width (px); overrides the per-column floors. */
  minWidth?: number;
  /** Global maximum width (px). @default Infinity */
  maxWidth?: number;
  /** Column definitions: per-column floors and proportional (neighbour) behaviour. */
  columns?: TableColumn<Record<string, unknown>>[];
}

const FALLBACK_MIN_WIDTH = 50;

export function resolveColumnMinWidth(colWidth: ColumnWidth | undefined, globalOverride: number | undefined): number {
  if (globalOverride != null) return globalOverride;
  if (!colWidth) return DEFAULT_FLEXIBLE_COLUMN_MIN_WIDTH;
  if (colWidth.type === 'proportional') return colWidth.minWidth ?? DEFAULT_MIN_COLUMN_WIDTH;
  if (colWidth.type === 'pixel') return colWidth.value;
  return FALLBACK_MIN_WIDTH;
}

const isProportional = (w: ColumnWidth | undefined) => !w || w.type === 'proportional';

export function useTableColumnResize<T extends Record<string, unknown>>(config: UseTableColumnResizeConfig): TablePlugin<T> {
  const {columnWidths, minWidth: globalMinWidth, columns} = config;
  const maxWidth = config.maxWidth ?? Infinity;
  const resizableColumns = columns?.filter((c) => c.resizable !== false);
  const byKey = new Map(columns?.map((c) => [c.key, c]));

  return {
    transformHeaderRow(props) {
      return {...props, xstyle: [...props.xstyle, 'ax-table-resize-row']};
    },

    transformScrollWrapper(props) {
      return {
        ...props,
        htmlProps: {...withFeature(props.htmlProps, 'resize'), 'data-ax-column-widths': JSON.stringify(columnWidths ?? {})},
      };
    },

    transformHeaderCell(props, column) {
      if (column.resizable === false) return {...props, htmlProps: {...props.htmlProps, 'data-ax-resizable': 'false'}};
      const configured = byKey.get(column.key);
      // Snapshot floor of this column (the dragged handle's own floor when it is unknown).
      const floorAttr = configured ? {'data-ax-resize-min': resolveColumnMinWidth(configured.width, globalMinWidth)} : {};
      const overrideWidth = columnWidths?.[column.key];
      const effectiveMinWidth = resolveColumnMinWidth(column.width, globalMinWidth);

      let neighborKey: string | null = null;
      if (resizableColumns && isProportional(column.width)) {
        const i = resizableColumns.findIndex((c) => c.key === column.key);
        if (i >= 0 && i < resizableColumns.length - 1) neighborKey = resizableColumns[i + 1].key;
      }
      // The last proportional column flexes: no handle (and, as in Astryx, no override).
      if (resizableColumns) {
        const i = resizableColumns.findIndex((c) => c.key === column.key);
        if (i === resizableColumns.length - 1 && isProportional(column.width)) {
          return {...props, htmlProps: {...props.htmlProps, ...floorAttr}};
        }
      }
      const widthStyle = overrideWidth != null ? {width: `${overrideWidth}px`, minWidth: `${overrideWidth}px`, maxWidth: `${overrideWidth}px`} : null;
      const style = widthStyle ? {...(typeof props.htmlProps.style === 'object' ? props.htmlProps.style : {}), ...widthStyle} : props.htmlProps.style;

      const handle = comp(
        ResizeHandle,
        {
          columnKey: column.key,
          columnLabel: nodeText(column.header ?? column.key) || column.key,
          currentWidth: overrideWidth,
          minWidth: effectiveMinWidth,
          maxWidth,
          neighborKey,
        },
        undefined,
        {table: true},
      );
      return {
        ...props,
        htmlProps: {...props.htmlProps, ...floorAttr, style},
        overlay: [props.overlay, handle],
        xstyle: [...props.xstyle, 'ax-table-resizable-cell'],
      };
    },
  };
}
