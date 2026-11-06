/**
 * Table grouped-rows behaviour — the client half of @astryxdesign/core
 * Table/plugins/groupedRows/useTableGroupedRows.tsx: a click on a section header row (or its
 * chevron, the keyboard control) collapses or expands that section. `astryx-toggle-group`
 * {groupKey, isCollapsed, collapsedGroups} fires first (cancelable); then the chevron's
 * `aria-expanded` and name and the section rows' `hidden` follow.
 * API: `table.collapsedGroups` (get/set).
 */
import {registerTableBehavior, type AxTable} from '../table';

registerTableBehavior('grouped', (table: AxTable) => {
  const headers = () => table.bodyRows().filter((r) => r.hasAttribute('data-ax-group-key'));
  const collapsedGroups = () => headers().filter((r) => r.hasAttribute('data-ax-collapsed')).map((r) => r.getAttribute('data-ax-group-key') ?? '');

  const render = (header: HTMLTableRowElement, isCollapsed: boolean) => {
    header.toggleAttribute('data-ax-collapsed', isCollapsed);
    const toggle = header.querySelector<HTMLButtonElement>('[data-ax-group-toggle]');
    if (toggle) {
      toggle.setAttribute('aria-expanded', String(!isCollapsed));
      const label = toggle.getAttribute(isCollapsed ? 'data-ax-label-expand' : 'data-ax-label-collapse');
      if (label) toggle.setAttribute('aria-label', label);
    }
  };

  const onClick = (event: MouseEvent) => {
    const header = (event.target as Element | null)?.closest<HTMLTableRowElement>('tr[data-ax-group-key]');
    if (!header || !table.owns(header)) return;
    const groupKey = header.getAttribute('data-ax-group-key') ?? '';
    const isCollapsed = !header.hasAttribute('data-ax-collapsed');
    const next = new Set(collapsedGroups());
    if (isCollapsed) next.add(groupKey);
    else next.delete(groupKey);
    if (!table.emit('astryx-toggle-group', {groupKey, isCollapsed, collapsedGroups: [...next]}, true)) return;
    render(header, isCollapsed);
    table.updateVisibility();
  };

  table.addEventListener('click', onClick);
  table.api.set('grouped', {
    get: collapsedGroups,
    set: (value) => {
      const next = new Set(value as Iterable<string>);
      for (const header of headers()) render(header, next.has(header.getAttribute('data-ax-group-key') ?? ''));
      table.updateVisibility();
    },
  });
  return () => {
    table.removeEventListener('click', onClick);
    table.api.delete('grouped');
  };
});
