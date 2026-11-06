# Table — Astro port of `@astryxdesign/core` Table (0.7.9)

## Plan: React → Astro

Astryx's Table is `BaseTable` (an unstyled `<table>` driven by a transform pipeline) wrapped by
`Table` (styles, TableContext, a scroll region) plus plugins built with hooks
(`useTable*`). The port keeps the pipeline and moves it to the server; behaviour that needs the
browser lives in one custom element and small per-feature modules.

| Astryx | Astro |
|---|---|
| `BaseTable` + `useBaseTablePlugins` (8 transforms, canonical plugin order, try/catch per plugin) | `pipeline.ts` `buildTable()` — same transforms and order, run synchronously in Table's frontmatter; output is a `TableNode` tree rendered by `_TableNode.astro` |
| `ReactNode` in render props, `xstyle` | `TableNode` (text, `{html}`, `{tag, attrs, children}`, `{component, props, children}`, `{slot, args}`), `xstyle: string[]` (class names) |
| `Table` + `TableContext` | `Table.astro`; the context is attributes on `<table>` (`data-density`, `data-dividers`, `data-striped`, `data-hover`, `data-vertical-align`, `data-text-overflow`) read by structural CSS, and `data-density` on each cell (theme hook) — stamped (`lib/cascade`, key `table-density`) in children mode |
| `TableScrollWrapper` (`useScrollableArea`, inline axis, overscroll contain, `role=group`, named after the table) | `<ax-table class="astryx-table-scroll-wrapper">` (`elements/table.ts`, extends `<ax-scrollable-area>`) — tab stop only while overflowing, edge flags, container bleed |
| `TableHeader/Body/Footer/Row/Cell/HeaderCell` | same-named `.astro` components (children mode); data mode renders the same markup |
| `useTableSortable` / `useTableSortableState` | `plugins/sortable.ts` (server: initial sort with a numeric `Intl.Collator`, `aria-sort`, Sort control, `table-sort-indicator` icon, per-row ranks) + `elements/table-features/sort.ts` (click/Enter/Space/Shift, re-sort in the DOM, `astryx-sort-change`) |
| `useTableColumnResize` | `plugins/columnResize.ts` (handles in the header `overlay` slot, floors, overrides) + `table-features/resize.ts` (pointer, keyboard, `computeColumnWidths`, height measure, scroll gate, `astryx-column-resize`) |
| `useTableStickyColumns` | `plugins/stickyColumns.ts` — server only; shadows follow the scroll edge flags in CSS (no scroll listener) |
| `useTableRowExpansion` | `plugins/rowExpansion.ts` (chevron column, panels rendered for every expandable row, collapsed ones `hidden`, `table-row-expand` icon) + `table-features/expansion.ts` (`astryx-expanded-change`) |
| `useTableRowStatus` | `plugins/rowStatus.ts` + `_RowStatus.astro` (server only; Tooltip via `attachTooltip`) |
| `useTableGroupedRows` | `plugins/groupedRows.ts` (all rows rendered, collapsed sections `hidden`) + `table-features/grouped.ts` (`astryx-toggle-group`) |
| `useTableTreeState` / `useTableTreeData` | `plugins/tree.ts` (all rows rendered in tree order, collapsed subtrees `hidden`) + `table-features/tree.ts` (`astryx-expanded-ids-change`) |
| `useTableRowIndex` | `plugins/rowIndex.ts` (+ the element renumbers visible rows after a re-sort/toggle) |
| `useTableSelection(State)`, `TableSelectionToolbar` | **deferred** (CheckboxInput, Toolbar) — hook points below |
| `useTableFiltering`, `useTableFilterState` | **deferred** (DateInput, MultiSelector, Tokenizer) |
| `useTablePagination`, `paginateData` | **deferred** (Pagination) |
| `useTableColumnSettings(State)` | **deferred** |
| `tableContextMenu` / `contextMenuActions` | **deferred** (ContextMenu); actions are typed and carried through the pipeline, not rendered |
| `glidingDivider`, `rowDivider` carry, `animatedLayout` | not ported (no glide; rows jump, as Astryx does without a handle) |

The `useTable*` names are kept so Astryx knowledge transfers, but they are plain server
functions: call them in frontmatter and pass the result to `plugins`. Callbacks (`onSortChange`,
`onToggle`, `onColumnResizeEnd` …) become DOM events on the `<ax-table>`; configs take the
initial state.

## Data API

```astro
---
import Table from 'astryx-astro/components/Table/Table.astro';
import {proportional, pixel, comp, useTableSortableState, useTableSortable} from 'astryx-astro/components/Table/table';
import Badge from 'astryx-astro/components/Badge/Badge.astro';

const columns = [
  {key: 'name', header: 'Name', width: proportional(2), sortable: true},
  {key: 'salary', header: 'Salary', align: 'end', width: pixel(120), sortable: true,
   format: (v) => usd.format(v)},                                  // text formatter (server)
  {key: 'city', header: 'City', accessor: (p) => p.address.city},  // field accessor (server)
  {key: 'status', header: 'Status',
   renderCell: (p) => comp(Badge, {label: p.status})},             // a component node
  {key: 'avatar', header: 'Person'},                               // filled by the slot below
];
const {sortedData, sortConfig} = useTableSortableState({data: people, defaultSort: [{sortKey: 'name', direction: 'ascending'}]});
---
<Table aria-label="People" data={sortedData} columns={columns} idKey="id"
       density="compact" dividers="grid" isStriped hasHover textOverflow="truncate"
       plugins={{sort: useTableSortable(sortConfig)}}>
  <template slot="cell:avatar">{(p) => <Avatar name={p.name} size="sm" />}</template>
  <Fragment slot="caption">Team directory</Fragment>
</Table>
```

- `columns`: `{key, header?, width?: proportional(n, {minWidth}) | pixel(n), align?, sortable?:
  true | {sortKey}, resizable?, renderCell?: (row) => TableNode, accessor?, format?}`. Omitted →
  generated from the first row (`generateColumns`). Widths, the 60px / 120px floors and the
  table `min-width` follow `columnUtils.ts` exactly.
- Default cells render `String(value)` (Date → ISO); with `textOverflow="truncate"` a non-empty
  default cell is wrapped in `<Text maxLines={1}>`, which adds the full-text tooltip only while
  it is truncated. `renderCell` / slot cells control their own overflow, as in Astryx.
- Render props → slots. **Function slots must be a `<template slot="…">{(args) => …}</template>`**
  (Astro only passes arguments to a slot whose single expression is the function;
  `<Fragment slot>` does not work):
  `cell:<key>` (row), `expanded` (row), `group-header` (groupKey, count, collapsed). Plain slots:
  `caption`, `empty`, `header:<key>`, default (children mode).
- `TableNode` builders: `el(tag, attrs, children)`, `comp(Component, props, children)`,
  `html(trustedMarkup)`, `slot(name, ...args)`.
- Children mode: `<Table aria-label=…><TableHeader><TableRow isHeaderRow><TableHeaderCell>…` —
  cells take density/dividers/alignment from the Table.
- Empty data: the compact "No data" EmptyState; `empty` slot replaces it; `emptyState={false}`
  renders an empty body. Loading: Astryx has no prop — use the `empty` slot (Spinner) with
  `aria-busy`, or skeleton `renderCell`s (see the demo).
- Naming: the scroll region takes `aria-labelledby`, else `aria-label`, else the `caption`
  (port extension), else "Table". `rowIndexStart` / `rowCount` add `aria-rowindex` /
  `aria-rowcount`.
- In a grid or flex item, give the item `min-width: 0` (as for any horizontal scroller) so a
  wide table scrolls instead of widening the track.

### Events (bubbling, composed, from `<ax-table>`)

| Event | detail | Astryx |
|---|---|---|
| `astryx-sort-change` (cancelable) | `{sort}` | `onSortChange(sort)` |
| `astryx-column-resize` | `{updates}` | `onColumnResizeEnd(updates)` |
| `astryx-expanded-change` (cancelable) | `{key, isExpanded, expandedKeys}` | `onToggle(key)` |
| `astryx-toggle-group` (cancelable) | `{groupKey, isCollapsed, collapsedGroups}` | `onToggleGroup(groupKey)` |
| `astryx-expanded-ids-change` (cancelable) | `{ids, id, isExpanded}` | `onExpandedIdsChange(ids)` |

`preventDefault()` keeps the current state (controlled use). Element API: `sort`,
`columnWidths`, `expandedKeys`, `collapsedGroups`, `expandedIds` (get/set).

Sticky header: Astryx has no prop. Either put the table in a block-scrolling container and pin
`.astryx-table-header-cell` with caller CSS (works while the columns fit), or let the region
scroll both ways with a tiny plugin (demo "Sticky header"):
`{transformScrollWrapper: (p) => ({...p, htmlProps: {...p.htmlProps, 'data-scroll-axis': 'both', style: 'max-block-size:260px'}})}`.

## Plugin hook points

A plugin is `{transformColumns?, transformTable?, transformHeaderCell?, transformHeaderRow?,
transformBodyCell?, transformBodyRow?, transformScrollWrapper?, transformTableContext?}`; each
transform gets the render context last (`{density, dividers, …, locale, t, idBase, data,
hasSlot}`). Header cells have Astryx's named slots `before | content | after | overlay | below`
(label-row and `aria-labelledby` handling ported). Component nodes created with
`comp(…, {table: true})` receive the render context as a `table` prop. Client behaviour:
write `withFeature(htmlProps, '<name>')` in `transformScrollWrapper`, load a module from the
plugin's component, and in it call `registerTableBehavior('<name>', (table) => cleanup)`
(`elements/table.ts`). `<ax-table>` helpers: `bodyRows()`, `headerCells()`, `owns()`, `emit()`,
`template()`, `isPlainRowClick()`, `reorderBody()`, `updateVisibility()`, `addRowFilter()`,
`renumber()`, `api`.

Deferred plugins — where they plug in:

- **Selection** (`useTableSelection`, `useTableSelectionState`): name `selection` is already in
  the canonical order (after sort/tree, before pagination). `transformColumns` prepends
  `__xds_selection` (`pixel(36)`, `resizable: false`) with `comp(CheckboxInput, …)` in the
  header (select all; `indeterminate`) and per row (`@astryx.table.selection.selectRowNamed`);
  `transformBodyRow` writes `aria-selected="true"` and, with `hasRowHighlight`,
  `background-color` + `--table-row-overlay: var(--color-accent-muted)` (pinned cells already
  replay that variable) plus a row key (`rowKeyOf()` in pipeline.ts); `transformScrollWrapper`
  adds `withFeature('selection')` and the selected keys. Client:
  `table-features/selection.ts` → delegated `change`, select-all/indeterminate, events
  `astryx-select-item` {key, isSelected} / `astryx-select-all` {isAllSelected}, `table.api`
  entry. **TableSelectionToolbar** (Toolbar + Button) listens for those events on the table it
  is `for`.
- **Filtering** (`useTableFiltering`): `column.filter` is already typed; the trigger goes in the
  header `after` slot, inline editors in `below` (ids and naming handled). Client filtering:
  `table.addRowFilter(row => …)` hides rejected rows (and their panels) and renumbers.
- **Pagination** (`useTablePagination`, `paginateData`): `transformTableContext(children)` returns
  `[top?, children, bottom?]` with `comp(Pagination, …)`; pass `rowIndexStart`/`rowCount` for
  ARIA. Server-driven pages (links) fit the server pipeline; in-page paging would add a row filter.
- **Column settings**: `transformColumns` (server) — reorder/filter columns.
- **Context menus**: `contextMenuActions` is typed on header/body cell render props and survives
  the pipeline. When ContextMenu lands, TableCell/TableHeaderCell wrap their content in its
  trigger (density padding moves onto it — restore the subtraction noted on
  `.ax-table-expand-toggle` in Table.css) and the client maps action ids (`sort-asc`,
  `sort-desc`, `sort-clear`, `row-expansion-toggle`) to the feature modules.

## Deviations

- Plugins render on the server; client changes come from the rendered DOM: panels, grouped and
  tree rows are all rendered (hidden while collapsed) instead of mounted on demand, so
  `renderExpanded` runs for every expandable row and `useTableTreeState().visibleData` holds
  every row.
- Local re-sort compares server-computed ranks (same comparators, ties by original position);
  custom comparators never run in the browser. Sorting by `accessor` needs a comparator.
- Column resize skips every `resizable: false` column in its snapshot (Astryx's comment intent;
  its code only skipped the ones in `config.columns`).
- Not ported: the gliding row/divider animation (`animatedLayout`), the pinned-divider carry of
  app border overrides (`syncPinnedDividers`), context-menu actions, and the theme/mode watchers
  (CSS already follows token changes).
- Port extensions: `accessor`, `format`, the `caption` slot, `locale`.
