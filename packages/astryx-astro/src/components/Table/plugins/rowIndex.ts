/**
 * Row numbers — port of @astryxdesign/core Table/plugins/rowIndex/useTableRowIndex.tsx
 * (0.7.9): a 48px, end-aligned, monospaced "#" column numbering the rendered rows from
 * `startFrom`. The client renumbers the visible rows after a re-sort or a toggle, so the
 * numbers keep following the rendered order (as Astryx's re-render does).
 */
import {withFeature} from '../pipeline';
import {el} from '../node';
import type {TableNode, TablePlugin} from '../types';

export interface UseTableRowIndexConfig<T extends Record<string, unknown>> {
  /** The rows the table renders, in order. */
  data: T[];
  /** Unique key per row when items are not stable by reference. */
  getRowKey?: (item: T) => string;
  /** Header label. @default '#' */
  label?: TableNode;
  /** First number. @default 1 */
  startFrom?: number;
}

export function useTableRowIndex<T extends Record<string, unknown>>(config: UseTableRowIndexConfig<T>): TablePlugin<T> {
  const {data, getRowKey, label = '#', startFrom = 1} = config;
  const map = new Map<unknown, number>();
  data.forEach((item, i) => map.set(getRowKey ? getRowKey(item) : item, i));
  const lookup = (item: T) => map.get(getRowKey ? getRowKey(item) : item);
  return {
    transformColumns(columns) {
      return [
        {
          key: '__rowIndex',
          header: label,
          width: {type: 'pixel', value: 48},
          align: 'end',
          resizable: false,
          renderCell: (item: T) => {
            const idx = lookup(item);
            return idx == null ? null : el('span', {class: 'ax-table-row-index', 'data-ax-row-index': ''}, idx + startFrom);
          },
        },
        ...columns,
      ];
    },
    transformScrollWrapper(props) {
      return {...props, htmlProps: {...withFeature(props.htmlProps, 'row-index'), 'data-ax-row-index-start': startFrom}};
    },
  };
}
