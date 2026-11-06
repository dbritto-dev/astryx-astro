/**
 * Table row-expansion behaviour — the client half of @astryxdesign/core
 * Table/plugins/rowExpansion/useTableRowExpansion.tsx: the chevron (and, with
 * `hasRowClickExpansion`, a plain click on the row — not on its controls, an editable
 * region or a text selection) toggles the row's detail panel. `astryx-expanded-change`
 * {key, isExpanded, expandedKeys} fires first (cancelable); then the row's `data-ax-expanded`
 * (its cells hand their divider to the panel), the toggle's `aria-expanded`, name and glyph
 * (from the server-rendered templates) and the panel's `hidden` follow.
 * API: `table.expandedKeys` (get/set).
 */
import {registerTableBehavior, type AxTable} from '../table';

registerTableBehavior('expansion', (table: AxTable) => {
  const rows = () => table.bodyRows().filter((r) => r.hasAttribute('data-expansion-key'));
  const expandedKeys = () => rows().filter((r) => r.hasAttribute('data-ax-expanded')).map((r) => r.getAttribute('data-expansion-key') ?? '');

  const render = (row: HTMLTableRowElement, isExpanded: boolean) => {
    row.toggleAttribute('data-ax-expanded', isExpanded);
    const toggle = row.querySelector<HTMLButtonElement>(':scope > td > [data-expansion-toggle], :scope > td > .ax-table-context-trigger > [data-expansion-toggle]');
    if (toggle) {
      toggle.setAttribute('aria-expanded', String(isExpanded));
      const label = toggle.getAttribute(isExpanded ? 'data-ax-label-collapse' : 'data-ax-label-expand');
      if (label) toggle.setAttribute('aria-label', label);
      const center = toggle.querySelector<HTMLElement>('.ax-table-expand-glyph-center');
      const template = table.template(`[data-ax-expand-icon="${isExpanded}"]`);
      if (center && template) center.replaceChildren(...Array.from(template.content.cloneNode(true).childNodes));
    }
  };

  const toggleRow = (row: HTMLTableRowElement) => {
    const key = row.getAttribute('data-expansion-key') ?? '';
    const isExpanded = !row.hasAttribute('data-ax-expanded');
    const current = new Set(expandedKeys());
    if (isExpanded) current.add(key);
    else current.delete(key);
    if (!table.emit('astryx-expanded-change', {key, isExpanded, expandedKeys: [...current]}, true)) return;
    render(row, isExpanded);
    table.updateVisibility();
  };

  const onClick = (event: MouseEvent) => {
    const target = event.target as Element | null;
    const toggle = target?.closest<HTMLElement>('[data-expansion-toggle]');
    if (toggle && table.owns(toggle)) {
      const row = toggle.closest('tr');
      if (row) toggleRow(row);
      return;
    }
    const row = target?.closest<HTMLTableRowElement>('tr[data-ax-row-click-expansion="expansion"]');
    if (row && table.owns(row) && table.isPlainRowClick(event, row)) toggleRow(row);
  };

  // The row's context-menu Expand / Collapse action (every cell of an expandable row).
  const unregister = table.registerContextAction('row-expansion-toggle', {
    state: (area) => (area.closest('tr')?.hasAttribute('data-ax-expanded') ? 'collapse' : 'expand'),
    select: (area) => {
      const row = area.closest('tr');
      if (row && row.hasAttribute('data-expansion-key')) toggleRow(row);
    },
  });

  table.addEventListener('click', onClick);
  table.api.set('expansion', {
    get: expandedKeys,
    set: (value) => {
      const next = new Set(value as Iterable<string>);
      for (const row of rows()) render(row, next.has(row.getAttribute('data-expansion-key') ?? ''));
      table.updateVisibility();
    },
  });
  return () => {
    table.removeEventListener('click', onClick);
    unregister();
    table.api.delete('expansion');
  };
});
