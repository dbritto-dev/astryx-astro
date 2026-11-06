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
| `useTableSelection(State)`, `TableSelectionToolbar` | `plugins/selection.ts` (server: `__xds_selection` column with CheckboxInputs, `aria-selected` + inline wash per selected row, row keys, the complete selected-key set) + `table-features/selection.ts` (toggles, select-all with the frozen set, events, `selectedKeys` / `clearSelection()`) + `TableSelectionToolbar.astro` / `elements/table-selection-toolbar.ts` (follows the table `for` its id) |
| `useTableFiltering`, `useTableFilterState`, `toSearchFilters` | `plugins/filtering.ts` + `plugins/filterModel.ts` (pure, shared with the client) + `_FilterSlot.astro` / `_FilterControl.astro` (funnel + Popover with Reset / Apply, or inline controls; TextInput, NumberInput, Selector, MultiSelector, DateInput, TimeInput, Tokenizer) + `table-features/filter.ts` (draft / commit, `astryx-filter-change`, client row filtering, `filters` / `clearFilters()`) |
| `useTablePagination`, `paginateData` | `plugins/pagination.ts` (`transformTableContext` → `_TablePagination.astro` above / below) + `table-features/paging.ts` (the Paginations kept in step, client paging, `paging`) |
| `useTableColumnSettings`, `useTableColumnSettingsState` | `plugins/columnSettings.ts` (`transformColumns`; inactive settings columns rendered hidden) + `table-features/column-settings.ts` (reorder / hide in the DOM, widths re-resolved, `activeColumnKeys`) + `TableColumnSettings.astro` / `elements/table-column-settings.ts` (port extension: a MultiSelector picker `for` the table) |
| `tableContextMenu` (`wrapInTableContextMenu`, `resolveContextActions`) / `contextMenuActions` | `pipeline.ts` (one ContextMenu trigger + `<ax-menu data-ax-menu-kind="context">` per cell with actions; row templates per distinct action look in `_ContextMenuTemplates.astro`) + `table-features/context-menu.ts` (rows built on open, `astryx-context-action`); sort (`sort-asc`/`sort-desc`/`sort-clear`) and row expansion (`row-expansion-toggle`) contribute theirs. Children mode: TableCell / TableHeaderCell `contextMenuActions` wrap the content in a `<ContextMenu items>` (`contextMenuOptions.ts` `toContextMenuOptions`; rows dispatch `astryx-select` with `data-id` = the action id) |
| `useBaseTablePlugins` | `orderPlugins` (pipeline.ts) |
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

### Row selection

```astro
---
import {useTableSelection, useTableSelectionState} from 'astryx-astro/components/Table/table';
import TableSelectionToolbar from 'astryx-astro/components/Table/TableSelectionToolbar.astro';
const {selectionConfig, selectionState} = useTableSelectionState({
  data: people, idKey: 'id', selectedKeys: savedKeys, getIsItemEnabled: (p) => !p.locked,
});
---
<TableSelectionToolbar for="people" selection={selectionState}>
  <Button slot="startContent" label="Export" variant="secondary" />
</TableSelectionToolbar>
<Table id="people" aria-label="People" data={people} idKey="id" columns={columns}
       plugins={{selection: useTableSelection({...selectionConfig, getRowLabel: (p) => p.name})}} />
```

- `useTableSelection(config)`: Astryx's config (`getIsItemSelected`, `getIsAllSelected`,
  `getIsIndeterminate`, `getIsItemSelectable`, `getIsItemEnabled`, `getRowLabel`,
  `hasRowHighlight`; `onSelectItem` / `onSelectAll` are accepted and never called) plus
  `getRowKey` (default: the Table's `idKey`, via the plugin context's `rowKey(item, index)`) and
  `selectedKeys` (the complete selection, so keys outside the rendered rows survive) — both
  filled by `useTableSelectionState`, whose `setSelectedKeys` is replaced by the events.
- The client recomputes the header with useTableSelectionState's rules (all actionable rows
  selected → checked, some → indeterminate); select-all / deselect-all leave disabled rows and
  keys outside the rendered rows (hidden tree/group rows count as rendered) as they are.
- `TableSelectionToolbar`: `selection`, `for` (the Table's id), `label`, `clearLabel`, `size`
  (sm), `variant` (muted), `startContent` slot, `selectionLabel` function slot (count) with
  `[data-selected-count]` kept current. Hidden while nothing is selected.
- Astryx has no Shift-range or row-click selection; keyboard is the checkboxes' own.

### Filtering

```astro
---
import {createPowerSearchConfig} from 'astryx-astro/components/PowerSearch/powerSearchModel';
import {useTableFilterState, useTableFiltering} from 'astryx-astro/components/Table/table';
const {config} = createPowerSearchConfig([{key: 'name', type: 'string'}, {key: 'status', type: 'enum', enumValues}]);
const {filters} = useTableFilterState({status: 'active'});
const filter = useTableFiltering({filters, searchConfig: config, variant: 'popover', hasClientFiltering: true});
---
<Table data={rows} columns={[{key: 'name', header: 'Name', filter: 'name'}, {key: 'status', header: 'Status', filter: {field: 'status', operator: 'is_any_of'}}]} plugins={{filter}} />
```

- `column.filter` names a PowerSearch field (its default operator) or `{field, operator}`; the
  operator's value type picks the control: string → TextInput, integer / float → NumberInput
  (integer step 1, the operator's bounds, live while the draft parses), enum → Selector ("All"),
  enum_list → MultiSelector ("All", Select all, no search), date_absolute → DateInput, time →
  TimeInput, string_list / entity_list → Tokenizer (the operator's static `searchSource`, else any
  typed text becomes a token); nested / empty / date_relative / date_range / custom → none. Every
  control is named "Filter <header>" (hidden label).
- `variant`: `popover` (funnel after the label: faded to 0.35 until the header is hovered or it is
  focused, accent while a value is set; its Popover holds the md control and Reset / Apply — the
  control edits a draft seeded on open), `inline` / `inline-compact` (sm control with a clear
  button below the label, an aria-hidden 32 / 28px placeholder under unfiltered columns, filter
  columns without a width get `proportional(1)`).
- `toSearchFilters(filters, columns, config)` + PowerSearch's `applyFilters` filter on the server
  (Astryx's model: the page re-renders with the filtered data). Port extension
  `hasClientFiltering`: pass every row; the server hides the rows the initial filters reject (same
  matcher) and the client re-filters on every change (`table.addRowFilter`); the table's empty
  state (default "No data" or the `empty` slot) shows while no row is left, and a group header
  whose rows are all rejected hides too.
- `useTableFilterState(initial)` returns `{filters, onFilterChange, clearAll}`; on the server the
  last two return the next state (the table owns it on the client: `table.filters`,
  `table.clearFilters()`).

### Pagination

- `useTablePagination({page, totalItems | totalPages | hasMore, pageSize = 10, pageSizeOptions,
  variant = 'pages', size = 'md', position = 'below' | 'above' | 'both' | 'none', align =
  'center', label})` renders Pagination around the table (nothing for a single page without
  `hasMore`; `both` names the landmarks "<label> (top)" / "(bottom)"). Events are the
  Pagination's: `astryx-change` {page}, `astryx-page-size-change` {pageSize} (then
  `astryx-change` {page: 1}), cancelable, from the `<ax-pagination>`; the other Pagination of
  `both` follows.
- Server-driven paging: `paginateData(rows, page, pageSize)` (Astryx's coercions) + `href: (page)
  => url` (port extension, Pagination links mode).
- Port extension `hasClientPaging`: pass every row; the server hides the rows outside `page`, the
  client pages the rendered rows (after client filters: the total follows the matching rows, a
  filter change returns to page 1, the controls hide while one page is left). `table.paging`
  ({page, pageSize}, get/set).

### Column settings

- `useTableColumnSettingsState({columns, activeColumnKeys, defaultColumnKeys})` → Astryx's
  helper; with no React state `toggleColumn` / `showAllColumns` / `resetToDefault` /
  `setActiveColumnKeys` return the next key list. `useTableColumnSettings(config)` shows the
  active columns in order (first in the canonical plugin order).
- Port extension: inactive settings columns render hidden after the active ones, so
  `table.activeColumnKeys = [...]` (silent) or `TableColumnSettings` (`for` the table id,
  `settings` = `columnSettingsConfig`; a MultiSelector with groups as sections and always-visible
  columns disabled; toggling hides a column or re-shows it at the end) reorders and hides columns
  in the DOM and re-resolves the widths over the visible ones. The picker's change dispatches
  `astryx-columns-change` {activeColumnKeys} (cancelable).

### Context menus

- Plugins append `contextMenuActions` (`{id, label, icon, group, checked, disabled, variant}`, or a
  getter) in `transformHeaderCell` / `transformBodyCell`, composing with
  `resolveContextActions(props.contextMenuActions)`. A cell with actions wraps its content in a
  ContextMenu trigger (body cells: the trigger fills the cell and carries its padding, so a
  right-click anywhere in it opens the menu; Shift+F10 / the Menu key from a focused control in
  the cell; a 500ms touch hold) and owns a context `<ax-menu>` whose rows are built when it opens:
  groups in first-seen order with dividers, a check mark replacing the icon of a `checked` action.
- `onSelect` cannot cross to the browser: choosing a row dispatches `astryx-context-action`
  (cancelable) {id, columnKey, rowKey, kind} on the `<ax-table>`, then — unless prevented — the
  first-party action runs: sortable headers (Sort ascending / Sort descending with the active one
  checked, Clear sort while sorted) and every cell of an expandable row (Expand row / Collapse
  row). Their looks follow client state (`table.registerContextAction(id, {state, select})`);
  other getters are resolved on the server.

### Events (bubbling, composed, from `<ax-table>`)

| Event | detail | Astryx |
|---|---|---|
| `astryx-sort-change` (cancelable) | `{sort}` | `onSortChange(sort)` |
| `astryx-column-resize` | `{updates}` | `onColumnResizeEnd(updates)` |
| `astryx-expanded-change` (cancelable) | `{key, isExpanded, expandedKeys}` | `onToggle(key)` |
| `astryx-toggle-group` (cancelable) | `{groupKey, isCollapsed, collapsedGroups}` | `onToggleGroup(groupKey)` |
| `astryx-expanded-ids-change` (cancelable) | `{ids, id, isExpanded}` | `onExpandedIdsChange(ids)` |
| `astryx-select-item` (cancelable) | `{key, isSelected}` | `onSelectItem({item, isSelected})` |
| `astryx-select-all` (cancelable) | `{isAllSelected}` | `onSelectAll({isAllSelected})` |
| `astryx-selection-change` | `{selectedKeys, selectedCount, hasSelection}` | `setSelectedKeys(next)` |
| `astryx-filter-change` (cancelable) | `{columnKey, value, filters}` (`value: null` clears) | `onFilterChange(columnKey, value)` |
| `astryx-context-action` (cancelable) | `{id, columnKey, rowKey?, kind: 'header' \| 'body'}` | `action.onSelect()` |
| `astryx-columns-change` (cancelable) | `{activeColumnKeys}` | `onChangeActiveColumnKeys(keys)` |

Pagination's events come from its `<ax-pagination>` (a sibling of the `<ax-table>`):
`astryx-change` {page} (`onPageChange`), `astryx-page-size-change` {pageSize} (`onPageSizeChange`).

`preventDefault()` keeps the current state (controlled use). Element API: `sort`,
`columnWidths`, `expandedKeys`, `collapsedGroups`, `expandedIds`, `selectedKeys`, `filters`,
`paging`, `activeColumnKeys` (get/set; setters dispatch no astryx event), `clearSelection()`,
`clearFilters()`.

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
`template()`, `isPlainRowClick()`, `reorderBody()`, `updateVisibility()`, `addRowFilter(accept)`,
`setRowPager({page, pageSize})`, `matchCount` (+ internal `ax-table-rows` {count}),
`registerContextAction(id, {state, select})`, `renumber()`, `api`. Server helpers in
`pipeline.ts`: `resolveContextActions`, `bodyRowNodes(root)` (post-process rows in
`transformTableContext`). Row filters, the pager and the empty-state row (`data-ax-empty-row`,
rendered when a plugin adds the `filter-rows` feature) all go through `updateVisibility()`.

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
  app border overrides (`syncPinnedDividers`), and the theme/mode watchers (CSS already follows
  token changes).
- Context menus: a header's overlay (resize handle) stays outside the trigger, so the header cell
  stays its containing block (Astryx wraps it too); a body cell's container-edge padding moves
  onto the trigger as well (Astryx leaves it on the `<td>` and doubles the inset of the first and
  last column). Action getters other than the first-party ones resolve when the cell renders on
  the server, not when the menu opens. The menu rows' own `astryx-select` stays inside the table.
- Filtering: the funnel and inline slots set `title=""` so the header's `title` tooltip does not
  reach their layers (DOM descendants here, portalled in Astryx). An unchanged inline value fires
  no event (popover Apply / Reset always do, as Astryx). Controls' own `astryx-change` events stay
  inside the table.
- Column settings render inactive settings columns hidden instead of dropping them (port
  extension above); after a client change the table's `min-width` is the new column floor (a
  consumer `min-width` is not merged again), and resize overrides are reset to the width specs.
- Port extensions: `accessor`, `format`, the `caption` slot, `locale`, `hasClientFiltering`,
  `hasClientPaging`, Pagination `href`, `TableColumnSettings`, `table.activeColumnKeys` /
  `filters` / `paging`.
