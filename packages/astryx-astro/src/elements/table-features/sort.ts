/**
 * Table sorting behaviour — the interaction half of @astryxdesign/core
 * useTableSortable.tsx (SortHeaderButton handleClick) and useTableSortableState.tsx (local
 * re-sort), on the rendered DOM.
 *
 * A click (or Enter/Space, Shift for multi-sort) on a Sort control steps that column:
 * ascending → descending → unsorted (or back to ascending without `allowUnsortedState`).
 * `astryx-sort-change` {sort} fires first (cancelable); then `aria-sort`, the indicator
 * (swapped from the server-rendered templates), the priority numbers and — for in-page data
 * (`useTableSortableState`) — the row order follow. Rows compare by the ranks the server
 * wrote (`data-ax-sort-rank`), ties by their original position.
 * API: `table.sort` (get/set; setting applies without an event).
 */
import {registerTableBehavior, type AxTable} from '../table';

type Direction = 'ascending' | 'descending';
interface Entry {
  sortKey: string;
  direction: Direction;
}
interface Config {
  allowUnsortedState?: boolean;
  isMultiSortEnabled?: boolean;
  isLocal?: boolean;
  keys?: string[];
  priority?: Record<string, string>;
}

function parse<T>(raw: string | null, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function nextDirection(current: Direction | null, allowUnsorted: boolean): Direction | null {
  if (current == null) return 'ascending';
  if (current === 'ascending') return 'descending';
  return allowUnsorted ? null : 'ascending';
}

/** The sort state after a click on `sortKey` (Astryx handleClick). */
export function nextSortState(sort: Entry[], sortKey: string, isShift: boolean, allowUnsorted: boolean): Entry[] {
  if (isShift) {
    const idx = sort.findIndex((s) => s.sortKey === sortKey);
    if (idx < 0) return [...sort, {sortKey, direction: 'ascending'}];
    const dir = nextDirection(sort[idx].direction, allowUnsorted);
    const next = [...sort];
    if (dir == null) next.splice(idx, 1);
    else next[idx] = {...next[idx], direction: dir};
    return next;
  }
  const dir = nextDirection(sort.find((s) => s.sortKey === sortKey)?.direction ?? null, allowUnsorted);
  return dir == null ? [] : [{sortKey, direction: dir}];
}

function ranksOf(row: HTMLTableRowElement): number[] | null {
  const raw = row.getAttribute('data-ax-sort-rank');
  return raw ? raw.split(' ').map(Number) : null;
}

registerTableBehavior('sort', (table: AxTable) => {
  const config = parse<Config>(table.getAttribute('data-ax-sort-config'), {});
  let sort = parse<Entry[]>(table.getAttribute('data-ax-sort'), []);
  const keys = config.keys ?? [];

  const buttons = () =>
    Array.from(table.querySelectorAll<HTMLButtonElement>('thead [data-ax-sort-key]')).filter((b) => table.owns(b));

  const renderHeaders = () => {
    const isMulti = config.isMultiSortEnabled === true && sort.length > 1;
    for (const button of buttons()) {
      const key = button.dataset.axSortKey ?? '';
      const index = sort.findIndex((e) => e.sortKey === key);
      const direction = index >= 0 ? sort[index].direction : null;
      const th = button.closest('th');
      if (direction) th?.setAttribute('aria-sort', direction);
      else th?.removeAttribute('aria-sort');

      const icon = button.querySelector<HTMLElement>(':scope > .ax-table-sort-icon');
      const state = direction ?? 'none';
      if (icon && icon.dataset.direction !== state) {
        icon.dataset.direction = state;
        const template = table.template(`[data-ax-sort-icon="${state}"]`);
        icon.replaceChildren(...(template ? Array.from(template.content.cloneNode(true).childNodes) : []));
      }

      // Multi-sort priority: a visible number plus a hidden "Priority n of m" description.
      const rank = isMulti && index >= 0 ? index + 1 : null;
      const priorityId = button.dataset.axPriorityId ?? '';
      let rankEl = button.querySelector<HTMLElement>(':scope > .ax-table-sort-rank');
      let priorityEl = priorityId ? (button.parentElement?.querySelector<HTMLElement>(`:scope > [id="${CSS.escape(priorityId)}"]`) ?? null) : null;
      if (rank == null) {
        rankEl?.remove();
        priorityEl?.remove();
        button.removeAttribute('aria-describedby');
        continue;
      }
      if (!rankEl) {
        rankEl = document.createElement('span');
        rankEl.className = 'ax-table-sort-rank';
        rankEl.setAttribute('aria-hidden', 'true');
        button.append(rankEl);
      }
      rankEl.textContent = String(rank);
      if (!priorityEl && priorityId) {
        priorityEl = document.createElement('span');
        priorityEl.id = priorityId;
        priorityEl.hidden = true;
        button.after(priorityEl);
      }
      if (priorityEl) {
        priorityEl.textContent = config.priority?.[`${rank}/${sort.length}`] ?? '';
        button.setAttribute('aria-describedby', priorityId);
      }
    }
  };

  const compare = (a: HTMLTableRowElement, b: HTMLTableRowElement) => {
    const ra = ranksOf(a);
    const rb = ranksOf(b);
    if (!ra || !rb) return 0;
    for (const entry of sort) {
      const i = keys.indexOf(entry.sortKey);
      if (i < 0) continue;
      const d = ra[i] - rb[i];
      if (d !== 0) return entry.direction === 'ascending' ? d : -d;
    }
    return ra[ra.length - 1] - rb[rb.length - 1];
  };

  const apply = (next: Entry[]) => {
    sort = next;
    table.setAttribute('data-ax-sort', JSON.stringify(sort));
    renderHeaders();
    if (config.isLocal) {
      table.reorderBody(compare);
      // A client pager shows the first rows of the new order (re-derives `hidden`, renumbers).
      table.updateVisibility();
      table.renumber();
    }
  };

  const request = (next: Entry[]) => {
    if (!table.emit('astryx-sort-change', {sort: next}, true)) return;
    apply(next);
  };

  const onClick = (event: MouseEvent) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-ax-sort-key]');
    if (!button || !table.owns(button) || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
    request(nextSortState(sort, button.dataset.axSortKey ?? '', event.shiftKey && config.isMultiSortEnabled === true, config.allowUnsortedState ?? true));
  };

  // Header context menu (Astryx getSortActions): the look follows the current sort; choosing
  // replaces the sort with this column alone, or removes the column from it.
  const keyOf = (area: HTMLElement) => area.querySelector<HTMLElement>('[data-ax-sort-key]')?.dataset.axSortKey ?? null;
  const dirOf = (area: HTMLElement) => {
    const key = keyOf(area);
    return key == null ? null : (sort.find((e) => e.sortKey === key)?.direction ?? null);
  };
  const unregister = [
    table.registerContextAction('sort-asc', {
      state: (area) => (dirOf(area) === 'ascending' ? 'checked' : 'unchecked'),
      select: (area) => { const key = keyOf(area); if (key != null) request([{sortKey: key, direction: 'ascending'}]); },
    }),
    table.registerContextAction('sort-desc', {
      state: (area) => (dirOf(area) === 'descending' ? 'checked' : 'unchecked'),
      select: (area) => { const key = keyOf(area); if (key != null) request([{sortKey: key, direction: 'descending'}]); },
    }),
    table.registerContextAction('sort-clear', {
      state: (area) => (dirOf(area) != null ? 'shown' : null),
      select: (area) => { const key = keyOf(area); if (key != null) request(sort.filter((e) => e.sortKey !== key)); },
    }),
  ];

  table.addEventListener('click', onClick);
  table.api.set('sort', {get: () => sort.map((e) => ({...e})), set: (value) => apply(Array.isArray(value) ? (value as Entry[]) : [])});
  return () => {
    table.removeEventListener('click', onClick);
    for (const off of unregister) off();
    table.api.delete('sort');
  };
});
