/**
 * Pagination — port of @astryxdesign/core Table/plugins/pagination/useTablePagination.tsx and
 * paginateData.ts (0.7.9), as server functions.
 *
 * `useTablePagination(config)` renders Pagination around the table through
 * `transformTableContext`: `position` below (default) / above / both (the two landmarks named
 * "<label> (top)" / "<label> (bottom)") / none, in a flex wrapper aligned start / center
 * (default) / end with spacing-2 toward the table; nothing while there is a single page and no
 * `hasMore`. `pageSize` (default 10) is coerced to a positive integer; `totalItems` wins over
 * `totalPages`; `pageSizeOptions` adds the page-size Selector; `variant` / `size` / `label` pass
 * through (default label "Table pagination").
 *
 * Events: the Pagination's own — `astryx-change` {page} (Astryx `onPageChange`) and
 * `astryx-page-size-change` {pageSize} (`onPageSizeChange`, then `astryx-change` {page: 1}), both
 * cancelable, from the `<ax-pagination>` (a sibling of the `<ax-table>`). With `position: 'both'`
 * the other Pagination follows. `href` (port extension, Pagination links mode) makes the pages
 * links for server-driven paging.
 *
 * Port extension `hasClientPaging`: pass every row as `data` (Astryx slices it with
 * `paginateData`); the server hides the rows outside `page`, the client shows the chosen page
 * (counting the rows a client filter accepts) and keeps `totalItems` current. API:
 * `table.paging` ({page, pageSize}, get/set).
 */
import {comp} from '../node';
import {bodyRowNodes, withFeature} from '../pipeline';
import TablePagination from '../_TablePagination.astro';
import type {TableNode, TablePlugin} from '../types';

export interface UseTablePaginationConfig {
  /** Current (initial) page, 1-based. */
  page: number;
  /** Astryx callback; not called in Astro — listen for the Pagination's `astryx-change` {page}. */
  onPageChange?: (page: number) => void;
  /** Total items across all pages (wins over totalPages). With `hasClientPaging`: the rendered rows the filters accept. */
  totalItems?: number;
  /** Total pages, when the item count is unknown. */
  totalPages?: number;
  /** More pages exist (cursor paging; total unknown). */
  hasMore?: boolean;
  /** @default 10 */
  pageSize?: number;
  /** Astryx callback; not called in Astro — listen for `astryx-page-size-change` {pageSize}. */
  onPageSizeChange?: (pageSize: number) => void;
  /** Shows the page-size Selector. */
  pageSizeOptions?: number[];
  /** @default 'pages' */
  variant?: 'pages' | 'count' | 'compact' | 'dots' | 'none';
  /** @default 'md' */
  size?: 'sm' | 'md';
  /** @default 'below' */
  position?: 'below' | 'above' | 'both' | 'none';
  /** @default 'center' */
  align?: 'start' | 'center' | 'end';
  /** Accessible name of the navigation landmark. @default translated "Table pagination" */
  label?: string;
  /** Port extension: page the rendered rows in the browser (pass every row as `data`). @default false */
  hasClientPaging?: boolean;
  /** Port extension: Pagination links mode — the URL of a page (server-driven paging). */
  href?: (page: number) => string | URL;
}

/**
 * Slice a data array for the current page (Astryx paginateData): `pageSize` coerced to a
 * positive integer (non-finite → 10), `page` to an integer ≥ 1.
 */
export function paginateData<T>(data: T[], page: number, pageSize: number): T[] {
  const size = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 10;
  const p = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
  const start = (p - 1) * size;
  return data.slice(start, start + size);
}

const isDataRow = (attrs: Record<string, unknown> | undefined) =>
  !(attrs && (attrs['data-expansion-panel'] != null || attrs['data-ax-group-key'] != null || attrs['data-ax-empty-row'] != null));

/** Pagination controls around the table (Astryx useTablePagination) — see the file header. */
export function useTablePagination<T extends Record<string, unknown>>(config: UseTablePaginationConfig): TablePlugin<T> {
  const {
    page,
    totalItems,
    totalPages: totalPagesProp,
    hasMore,
    pageSize: pageSizeConfig = 10,
    pageSizeOptions,
    variant = 'pages',
    size = 'md',
    position = 'below',
    align = 'center',
    label: labelProp,
    hasClientPaging = false,
    href,
  } = config;
  const pageSize = Number.isFinite(pageSizeConfig) ? Math.max(1, Math.floor(pageSizeConfig)) : 10;

  return {
    transformScrollWrapper(props, ctx) {
      return {
        ...props,
        htmlProps: {
          ...withFeature(props.htmlProps, 'paging'),
          'data-ax-paging': JSON.stringify({id: ctx.idBase, page, pageSize, isClient: hasClientPaging, hasMore: hasMore === true}),
        },
      };
    },

    transformTableContext(children: TableNode, ctx) {
      if (position === 'none') return children;
      let items = totalItems;
      if (hasClientPaging) {
        // The rows the filters accept (a tree row's descendants share its page), then hide
        // every row outside the page — the server half of the client pager.
        const rows = bodyRowNodes(children).filter((r) => isDataRow(r.attrs));
        let unit = -1;
        let inPage = true;
        const start = (Math.max(1, Math.floor(page)) - 1) * pageSize;
        for (const row of rows) {
          const attrs = (row.attrs ??= {});
          if (attrs['data-ax-filter-rejected'] != null) continue;
          const level = Number(attrs['data-ax-tree-level'] ?? 1);
          if (level <= 1) {
            unit++;
            inPage = unit >= start && unit < start + pageSize;
          }
          if (!inPage) attrs.hidden = true;
        }
        items = unit + 1;
      }
      const resolvedTotalPages = hasClientPaging ? Math.ceil((items ?? 0) / pageSize) : (totalPagesProp ?? (items != null ? Math.ceil(items / pageSize) : undefined));
      const isSinglePage = (hasClientPaging ? (resolvedTotalPages ?? 0) <= 1 : resolvedTotalPages === 1) && hasMore !== true;
      // A client-paged table keeps its controls (hidden) so a filter change can bring them back.
      if (isSinglePage && !hasClientPaging) return children;

      const label = labelProp ?? ctx.t('@astryx.table.pagination.label');
      const makeWrapper = (side: 'above' | 'below') =>
        comp(TablePagination, {
          side,
          align,
          tableId: ctx.idBase,
          isHidden: isSinglePage,
          pagination: {
            page,
            totalItems: items,
            totalPages: resolvedTotalPages,
            hasMore,
            pageSize,
            pageSizeOptions,
            variant,
            size,
            href,
            locale: ctx.locale,
            // position 'both': two landmarks need distinct names (axe landmark-unique).
            label:
              position === 'both'
                ? ctx.t(side === 'above' ? '@astryx.table.pagination.labelAbove' : '@astryx.table.pagination.labelBelow', {label})
                : label,
          },
        });
      return [
        position === 'above' || position === 'both' ? makeWrapper('above') : null,
        children,
        position === 'below' || position === 'both' ? makeWrapper('below') : null,
      ];
    },
  };
}
