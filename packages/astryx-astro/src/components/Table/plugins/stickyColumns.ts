/**
 * Sticky columns — port of @astryxdesign/core Table/plugins/stickyColumns/
 * useTableStickyColumns.tsx (0.7.9). Server-only: pinned cells get `position: sticky`, their
 * cumulative inline offset (the widths the columns take at the table's minimum width, which
 * is the width an overflowing table renders at), an opaque base that replays the row's
 * striping/hover (`--table-row-overlay`), their own row divider, and a soft shadow over the
 * scrolling content. The shadows follow the scroll position through CSS: the scroll wrapper
 * (`<ax-table>`) keeps `data-scroll-inline-start|end` current, so no scroll listener is added.
 *
 * Deferred: `syncPinnedDividers` (carrying an app's row/next-row border override onto the
 * pinned divider) and the gliding-row stand-in — the pinned divider follows the cell's own
 * border in CSS, which covers the tokens and theme `table-cell` borders.
 */
import {withFeature} from '../pipeline';
import {resolveColumnFloorWidths} from '../columnUtils';
import type {TableColumn, TablePlugin} from '../types';

export interface UseTableStickyColumnsConfig {
  /** Keys pinned to the inline-start edge: the run from the first column through the last listed key. */
  startKeys?: string[];
  /** Keys pinned to the inline-end edge: the run from the first listed key through the last column. */
  endKeys?: string[];
}

type Columns = ReadonlyArray<TableColumn<Record<string, unknown>>>;

function computeStartOffsets(columns: Columns | undefined, startKeys: string[]): Map<string, number> | null {
  if (!columns || columns.length === 0 || startKeys.length === 0) return null;
  let last = -1;
  for (let i = 0; i < columns.length; i++) if (startKeys.includes(columns[i].key)) last = i;
  if (last === -1) return null;
  const widths = resolveColumnFloorWidths(columns);
  const offsets = new Map<string, number>();
  let cumulative = 0;
  for (let i = 0; i <= last; i++) {
    offsets.set(columns[i].key, cumulative);
    cumulative += widths.get(columns[i].key) ?? 0;
  }
  return offsets;
}

function computeEndOffsets(columns: Columns | undefined, endKeys: string[]): Map<string, number> | null {
  if (!columns || columns.length === 0 || endKeys.length === 0) return null;
  let first = -1;
  for (let i = 0; i < columns.length; i++) {
    if (endKeys.includes(columns[i].key)) {
      first = i;
      break;
    }
  }
  if (first === -1) return null;
  const widths = resolveColumnFloorWidths(columns);
  const offsets = new Map<string, number>();
  let cumulative = 0;
  for (let i = columns.length - 1; i >= first; i--) {
    offsets.set(columns[i].key, cumulative);
    cumulative += widths.get(columns[i].key) ?? 0;
  }
  return offsets;
}

function resolveStickySide(columns: Columns | undefined, key: string, start: string[], end: string[]): {edge: 'start' | 'end'; offset: number} | null {
  const s = computeStartOffsets(columns, start);
  if (s?.has(key)) return {edge: 'start', offset: s.get(key) ?? 0};
  const e = computeEndOffsets(columns, end);
  if (e?.has(key)) return {edge: 'end', offset: e.get(key) ?? 0};
  return null;
}

/** Pin contiguous column runs to the start and/or end edge. `{}` is a valid no-op. */
export function useTableStickyColumns<T extends Record<string, unknown>>(config: UseTableStickyColumnsConfig): TablePlugin<T> {
  const start = config.startKeys ?? [];
  const end = config.endKeys ?? [];
  const objectStyle = (s: unknown) => (typeof s === 'object' && s != null ? (s as Record<string, string>) : {});

  return {
    transformHeaderCell(props, column) {
      const side = resolveStickySide(props.columns, column.key, start, end);
      if (!side) return props;
      // Inline, so composition with the resize plugin (position: relative) cannot unpin it.
      const offset = side.edge === 'start' ? {position: 'sticky', insetInlineStart: `${side.offset}px`} : {position: 'sticky', insetInlineEnd: `${side.offset}px`};
      return {
        ...props,
        htmlProps: {...props.htmlProps, 'data-astryx-table-pinned': '', style: {...objectStyle(props.htmlProps.style), ...offset}},
        xstyle: [...props.xstyle, 'ax-table-pinned', side.edge === 'start' ? 'ax-table-pinned-start' : 'ax-table-pinned-end'],
      };
    },

    transformBodyCell(props, column) {
      const side = resolveStickySide(props.columns, column.key, start, end);
      if (!side) return props;
      const offset = side.edge === 'start' ? {insetInlineStart: `${side.offset}px`} : {insetInlineEnd: `${side.offset}px`};
      return {
        ...props,
        htmlProps: {...props.htmlProps, 'data-astryx-table-pinned': '', style: {...objectStyle(props.htmlProps.style), ...offset}},
        xstyle: [...props.xstyle, 'ax-table-pinned', side.edge === 'start' ? 'ax-table-pinned-start' : 'ax-table-pinned-end'],
      };
    },

    transformScrollWrapper(props) {
      if (start.length === 0 && end.length === 0) return props;
      return {
        ...props,
        htmlProps: {
          ...withFeature(props.htmlProps, 'sticky'),
          'data-ax-sticky-start': start.length > 0 ? '' : undefined,
          'data-ax-sticky-end': end.length > 0 ? '' : undefined,
        },
      };
    },
  };
}
