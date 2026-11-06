/**
 * Table column settings — the client half of @astryxdesign/core
 * Table/plugins/columnSettings/useTableColumnSettings.tsx (transformColumns: show the active
 * columns in `activeColumnKeys` order) on the rendered table: the server rendered every
 * settings column (inactive ones hidden, after the active ones), so a new key list moves the
 * header and body cells of the settings columns into the new order (the slots plugin columns
 * occupy stay put), hides the inactive ones and re-resolves the column widths over the visible
 * columns (columnUtils `resolveColumnWidths`, the width specs the server wrote per header; the
 * table's min-width becomes the new column floor).
 *
 * `request(keys)` (TableColumnSettings, Astryx `onChangeActiveColumnKeys`) dispatches
 * `astryx-columns-change` (cancelable) `{activeColumnKeys}` first. Every applied change also
 * dispatches the internal, non-bubbling `ax-columns-sync` {activeColumnKeys}.
 * API: `table.activeColumnKeys` (get/set; setting dispatches no astryx event).
 */
import {registerTableBehavior, type AxTable} from '../table';
import {resolveColumnWidths} from '../../components/Table/columnUtils';
import type {ColumnWidth} from '../../components/Table/types';

interface SettingsConfig {
  activeColumnKeys?: string[];
  universe?: string[];
  alwaysVisible?: string[];
}

function parse<T>(raw: string | null, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

registerTableBehavior('column-settings', (table: AxTable) => {
  const config = parse<SettingsConfig>(table.getAttribute('data-ax-column-settings'), {});
  const universe = config.universe ?? [];
  let active = [...(config.activeColumnKeys ?? [])];

  const keyOf = (cell: Element) => cell.getAttribute('data-column-key');
  const headerRow = () => table.table?.tHead?.rows[0] ?? null;
  const managedKeys = () => {
    const keys = new Set<string>();
    for (const th of table.headerCells()) {
      const key = keyOf(th);
      if (key != null && (universe.includes(key) || active.includes(key))) keys.add(key);
    }
    return keys;
  };

  const apply = (keys: readonly string[]) => {
    const managed = managedKeys();
    const nextActive = keys.filter((k, i) => managed.has(k) && keys.indexOf(k) === i);
    const activeSet = new Set(nextActive);
    // Active keys in order, then the hidden universe columns (as the server renders them).
    const order = [...nextActive, ...universe.filter((k) => managed.has(k) && !activeSet.has(k))];
    const rank = new Map(order.map((k, i) => [k, i]));
    const rows = [headerRow(), ...table.bodyRows()].filter((r): r is HTMLTableRowElement => r != null);
    const focused = document.activeElement instanceof HTMLElement && table.contains(document.activeElement) ? document.activeElement : null;
    for (const row of rows) {
      const cells = Array.from(row.cells);
      const slots: number[] = [];
      const managedCells: HTMLTableCellElement[] = [];
      cells.forEach((cell, i) => {
        const key = keyOf(cell);
        if (key != null && rank.has(key)) {
          slots.push(i);
          managedCells.push(cell);
        }
      });
      if (managedCells.length === 0) continue;
      managedCells.sort((a, b) => (rank.get(keyOf(a)!) ?? 0) - (rank.get(keyOf(b)!) ?? 0));
      const next = [...cells];
      slots.forEach((slot, i) => (next[slot] = managedCells[i]));
      if (next.some((cell, i) => cell !== cells[i])) row.append(...next);
      for (const cell of managedCells) cell.hidden = !activeSet.has(keyOf(cell)!);
    }
    if (focused && !focused.isConnected) focused.focus({preventScroll: true});
    else if (focused && document.activeElement !== focused) focused.focus({preventScroll: true});
    // Widths over the visible columns.
    const headers = table.headerCells().filter((th) => !th.hidden);
    const columns = headers.map((th) => {
      const spec = parse<ColumnWidth | null>(th.getAttribute('data-ax-column-width'), null);
      return {key: keyOf(th) ?? '', width: spec ?? undefined};
    });
    if (headers.every((th) => th.hasAttribute('data-ax-column-width'))) {
      const resolved = resolveColumnWidths(columns);
      headers.forEach((th, i) => {
        const style = resolved.columns.get(columns[i].key)?.style ?? {};
        th.style.width = style.width ?? '';
        th.style.minWidth = style.minWidth ?? '';
      });
      for (const th of table.headerCells()) if (th.hidden) {
        th.style.width = '';
        th.style.minWidth = '';
      }
      const tableEl = table.table;
      if (tableEl) tableEl.style.minWidth = resolved.tableMinWidth > 0 ? `${resolved.tableMinWidth}px` : '';
    }
    active = nextActive;
    table.setAttribute('data-ax-active-columns', JSON.stringify(active));
    table.dispatchEvent(new CustomEvent('ax-columns-sync', {detail: {activeColumnKeys: [...active]}}));
  };

  table.api.set('column-settings', {
    get: () => [...active],
    set: (value) => apply(Array.isArray(value) ? (value as unknown[]).map(String) : []),
    request: (value: readonly string[]) => {
      const keys = [...value];
      if (!table.emit('astryx-columns-change', {activeColumnKeys: keys}, true)) return false;
      apply(keys);
      return true;
    },
    alwaysVisible: () => [...(config.alwaysVisible ?? [])],
  } as {get(): unknown; set(value: unknown): void; request(keys: readonly string[]): boolean; alwaysVisible(): string[]});
  return () => {
    table.api.delete('column-settings');
  };
});
