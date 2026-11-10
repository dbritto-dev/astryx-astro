/**
 * Table tree behaviour — the client half of @astryxdesign/core Table/plugins/tree
 * (useTableTreeData + useTableTreeState): a row's expander (or, with
 * `hasRowClickExpansion`, a plain click on an expandable row) toggles its subtree; the
 * header's expand-all toggle expands every expandable row, or collapses all once all are
 * open. `astryx-expanded-ids-change` {ids, id, isExpanded} fires first (cancelable); then the
 * rows' `data-ax-tree-expanded`, the expanders' `aria-expanded` and names, and the descendants' `hidden` follow.
 * API: `table.expandedIds` (get/set).
 */
import {registerTableBehavior, type AxTable} from '../table';

registerTableBehavior('tree', (table: AxTable) => {
  const expandable = () => table.bodyRows().filter((r) => r.hasAttribute('data-ax-tree-id') && r.hasAttribute('data-ax-tree-expanded'));
  const expandedIds = () => expandable().filter((r) => r.getAttribute('data-ax-tree-expanded') === 'true').map((r) => r.getAttribute('data-ax-tree-id') ?? '');

  const setLabel = (button: Element | null, isExpanded: boolean) => {
    if (!button) return;
    button.setAttribute('aria-expanded', String(isExpanded));
    const label = button.getAttribute(isExpanded ? 'data-ax-label-collapse' : 'data-ax-label-expand');
    if (label) button.setAttribute('aria-label', label);
  };

  const render = (ids: Set<string>) => {
    for (const row of expandable()) {
      const isExpanded = ids.has(row.getAttribute('data-ax-tree-id') ?? '');
      row.setAttribute('data-ax-tree-expanded', String(isExpanded));
      setLabel(row.querySelector('[data-ax-tree-toggle]'), isExpanded);
    }
    const all = expandable();
    const allExpanded = all.length > 0 && all.every((r) => r.getAttribute('data-ax-tree-expanded') === 'true');
    for (const button of table.querySelectorAll('thead [data-ax-tree-expand-all]')) {
      if (table.owns(button)) setLabel(button, allExpanded);
    }
    table.updateVisibility();
  };

  const commit = (ids: Set<string>, id: string | null, isExpanded: boolean) => {
    if (!table.emit('astryx-expanded-ids-change', {ids: [...ids], id, isExpanded}, true)) return;
    render(ids);
  };

  const toggleRow = (row: HTMLTableRowElement) => {
    const id = row.getAttribute('data-ax-tree-id') ?? '';
    const isExpanded = row.getAttribute('data-ax-tree-expanded') !== 'true';
    const ids = new Set(expandedIds());
    if (isExpanded) ids.add(id);
    else ids.delete(id);
    commit(ids, id, isExpanded);
  };

  const onClick = (event: MouseEvent) => {
    const target = event.target as Element | null;
    const all = target?.closest('[data-ax-tree-expand-all]');
    if (all && table.owns(all)) {
      const isExpanded = all.getAttribute('aria-expanded') !== 'true';
      const ids = new Set(isExpanded ? expandable().map((r) => r.getAttribute('data-ax-tree-id') ?? '') : []);
      commit(ids, null, isExpanded);
      return;
    }
    const toggle = target?.closest('[data-ax-tree-toggle]');
    if (toggle && table.owns(toggle)) {
      const row = toggle.closest('tr');
      if (row) toggleRow(row);
      return;
    }
    const row = target?.closest<HTMLTableRowElement>('tr[data-ax-row-click-expansion="tree"]');
    if (row && table.owns(row) && table.isPlainRowClick(event, row)) toggleRow(row);
  };

  table.addEventListener('click', onClick);
  table.api.set('tree', {get: expandedIds, set: (value) => render(new Set(value as Iterable<string>))});
  return () => {
    table.removeEventListener('click', onClick);
    table.api.delete('tree');
  };
});
