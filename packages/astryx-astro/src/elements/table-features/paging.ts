/**
 * Table pagination — the client half of @astryxdesign/core
 * Table/plugins/pagination/useTablePagination.tsx: the Pagination(s) the plugin rendered around
 * the table (`[data-ax-pagination-of="<id>"]`, siblings of the `<ax-table>`) stay in step — a
 * page or page-size change on one (its own cancelable `astryx-change` {page} /
 * `astryx-page-size-change` {pageSize}; a prevented change leaves the element's page, which
 * this reads afterwards) moves the other one of `position: 'both'`.
 *
 * Client paging (`hasClientPaging`, Astryx paginateData on the rendered rows): the table shows
 * the chosen page (`table.setRowPager`), counting only the rows a client filter accepts; when
 * that count changes the Paginations' `totalItems` follow (a filter change returns to page 1,
 * a page past the end is clamped) and they hide while a single page is left (Astryx renders
 * none for one page without `hasMore`).
 * API: `table.paging` — `{page, pageSize}` (get/set; setting dispatches nothing).
 */
import {registerTableBehavior, type AxTable} from '../table';

interface PagingConfig {
  id?: string;
  page?: number;
  pageSize?: number;
  isClient?: boolean;
  hasMore?: boolean;
}
type PaginationEl = HTMLElement & {page: number; pageSize: number; totalItems: number | undefined; totalPages: number | undefined};

function parse(raw: string | null): PagingConfig {
  try {
    return raw ? (JSON.parse(raw) as PagingConfig) : {};
  } catch {
    return {};
  }
}

registerTableBehavior('paging', (table: AxTable) => {
  const config = parse(table.getAttribute('data-ax-paging'));
  const id = config.id ?? '';
  let page = Math.max(1, Math.floor(config.page ?? 1));
  let pageSize = Math.max(1, Math.floor(config.pageSize ?? 10));
  let total: number | null = null;
  const doc = table.ownerDocument;
  const wrappers = () => Array.from(doc.querySelectorAll<HTMLElement>(`[data-ax-pagination-of="${CSS.escape(id)}"]`));
  const paginations = () => wrappers().map((w) => w.querySelector<PaginationEl>('ax-pagination')).filter((p): p is PaginationEl => p != null);

  const pageCount = () => (total == null ? null : Math.max(1, Math.ceil(total / pageSize)));
  const sync = (except?: Element | null) => {
    void customElements.whenDefined('ax-pagination').then(() => {
      for (const p of paginations()) {
        if (p === except) continue;
        if (p.pageSize !== pageSize) p.pageSize = pageSize;
        if (config.isClient && total != null && p.totalItems !== total) p.totalItems = total;
        if (p.page !== page) p.page = page;
      }
    });
    if (config.isClient && total != null) {
      const single = (pageCount() ?? 1) <= 1 && config.hasMore !== true;
      for (const w of wrappers()) w.hidden = single;
    }
  };
  const apply = () => {
    if (config.isClient) table.setRowPager({page, pageSize});
  };

  // A Pagination's change: read its state once every listener had its say (a consumer may
  // prevent it), then move the other Pagination and the rows.
  const onChange = (event: Event) => {
    const p = (event.target as Element | null)?.closest?.('ax-pagination') as PaginationEl | null;
    if (!p) return;
    queueMicrotask(() => {
      if (p.page === page && p.pageSize === pageSize) return;
      page = p.page;
      pageSize = p.pageSize;
      sync(p);
      apply();
    });
  };
  const bound: Array<() => void> = [];
  for (const w of wrappers()) {
    w.addEventListener('astryx-change', onChange);
    w.addEventListener('astryx-page-size-change', onChange);
    bound.push(() => {
      w.removeEventListener('astryx-change', onChange);
      w.removeEventListener('astryx-page-size-change', onChange);
    });
  }

  // Client paging: the accepted-row count drives the totals; a filter change returns to page 1.
  const onRows = (event: Event) => {
    total = (event as CustomEvent<{count: number}>).detail?.count ?? table.matchCount;
    const count = pageCount() ?? 1;
    if (page > count) {
      page = count;
      apply();
    }
    sync();
  };
  const onFilterChange = (event: Event) => {
    if (!config.isClient) return;
    queueMicrotask(() => {
      if (event.defaultPrevented || page === 1) return;
      page = 1;
      apply();
      sync();
    });
  };
  table.addEventListener('ax-table-rows', onRows);
  table.addEventListener('astryx-filter-change', onFilterChange);
  apply();
  if (config.isClient && table.matchCount >= 0) {
    total = table.matchCount;
    sync();
  }

  table.api.set('paging', {
    get: () => ({page, pageSize}),
    set: (value) => {
      const v = (value ?? {}) as {page?: number; pageSize?: number};
      if (v.pageSize != null && Number.isFinite(v.pageSize)) pageSize = Math.max(1, Math.floor(v.pageSize));
      if (v.page != null && Number.isFinite(v.page)) page = Math.max(1, Math.floor(v.page));
      apply();
      sync();
    },
  });
  return () => {
    for (const off of bound.splice(0)) off();
    table.removeEventListener('ax-table-rows', onRows);
    table.removeEventListener('astryx-filter-change', onFilterChange);
    table.api.delete('paging');
  };
});
