/**
 * Table context menus — the client half of @astryxdesign/core Table/tableContextMenu.tsx
 * (wrapInTableContextMenu, LazyTableContextMenu, toContextMenuOptions) on the runtime's
 * `<ax-menu data-ax-menu-kind="context">` (ContextMenu: right-click at the pointer, Shift+F10 /
 * the Menu key from a focused control in the cell at its bottom-start, a 500ms touch hold;
 * focus on the first row; Escape, Tab, a press outside or a row closes it).
 *
 * Every cell with actions owns a trigger (`[data-ax-context-actions]`, the whole cell for body
 * cells) and an `<ax-menu>` whose menu starts empty. As a menu opens (`beforetoggle`), its rows
 * are cloned from the table's row templates in first-seen group order with a divider between
 * groups — resolved then, as Astryx resolves an action getter on open: a feature module that
 * claimed an action id (`table.registerContextAction`) picks its look from the current state
 * (the sort direction's check mark, Expand / Collapse row) or leaves it out (Clear sort).
 *
 * Choosing a row dispatches `astryx-context-action` (cancelable) `{id, columnKey, rowKey, kind}`
 * on the `<ax-table>` — Astryx `action.onSelect()`; unless prevented, a first-party action then
 * acts (`sort-asc` / `sort-desc` / `sort-clear` → the sort change with its `astryx-sort-change`,
 * `row-expansion-toggle` → the row toggle with its `astryx-expanded-change`). The menu rows'
 * own `astryx-select` stays inside the table.
 */
import {registerTableBehavior, type AxTable} from '../table';
import '../runtime/menu';

interface Entry {
  id: string;
  group?: string;
  t: Record<string, string>;
  s: string | null;
}

function parse(raw: string | null | undefined): Entry[] {
  try {
    const value = JSON.parse(raw ?? '[]');
    return Array.isArray(value) ? (value as Entry[]) : [];
  } catch {
    return [];
  }
}

const isContextMenu = (el: EventTarget | null): el is HTMLElement =>
  el instanceof HTMLElement && el.tagName === 'AX-MENU' && el.getAttribute('data-ax-menu-kind') === 'context';

registerTableBehavior('context-menu', (table: AxTable) => {
  const areaOf = (menu: Element): HTMLElement | null => {
    const id = menu.getAttribute('data-ax-context-target');
    const area = id ? menu.ownerDocument.getElementById(id) : null;
    return area && area.hasAttribute('data-ax-context-actions') && table.owns(area) ? area : null;
  };

  const rowsFor = (area: HTMLElement): Node[] => {
    const shown: {entry: Entry; key: string}[] = [];
    for (const entry of parse(area.getAttribute('data-ax-context-actions'))) {
      const impl = table.contextAction(entry.id);
      const state = impl?.state ? impl.state(area) : entry.s;
      if (state == null) continue;
      const key = entry.t[state];
      if (key) shown.push({entry, key});
    }
    // toContextMenuOptions: groups in first-seen order, a divider between them.
    const order: string[] = [];
    const buckets = new Map<string, string[]>();
    for (const {entry, key} of shown) {
      const group = entry.group ?? '__ungrouped__';
      let bucket = buckets.get(group);
      if (!bucket) {
        buckets.set(group, (bucket = []));
        order.push(group);
      }
      bucket.push(key);
    }
    const nodes: Node[] = [];
    const clone = (selector: string) => {
      const template = table.template(selector);
      if (template) nodes.push(...Array.from(template.content.cloneNode(true).childNodes));
    };
    order.forEach((group, index) => {
      if (index > 0) clone('[data-ax-context-divider]');
      for (const key of buckets.get(group) ?? []) clone(`[data-ax-context-template="${CSS.escape(key)}"]`);
    });
    return nodes;
  };

  const fill = (menuEl: HTMLElement) => {
    const area = areaOf(menuEl);
    if (!area) return;
    const template = menuEl.querySelector<HTMLTemplateElement>(':scope > template[data-ax-menu-content]');
    const list = template
      ? template.content.querySelector<HTMLElement>('[role="menu"]')
      : (menuEl as HTMLElement & {menu?: HTMLElement | null}).menu ?? null;
    list?.replaceChildren(...rowsFor(area));
  };

  // Capture: runs before the menu's own beforetoggle (which mounts and focuses the rows).
  const onBeforeToggle = (event: Event) => {
    if (!isContextMenu(event.target) || (event as ToggleEvent).newState !== 'open') return;
    if (event.target.closest('ax-table') !== table) return;
    fill(event.target);
  };

  const onSelect = (event: Event) => {
    const row = event.target instanceof Element ? event.target : null;
    const menu = row?.closest('ax-menu');
    if (!row || !menu || !isContextMenu(menu)) return;
    const area = areaOf(menu);
    if (!area) return;
    event.stopPropagation();
    const id = row.getAttribute('data-id') ?? '';
    const detail = {
      id,
      columnKey: area.getAttribute('data-ax-context-column') ?? undefined,
      rowKey: area.getAttribute('data-ax-context-row') ?? undefined,
      kind: area.getAttribute('data-ax-context-kind') === 'header' ? 'header' : 'body',
    };
    if (!table.emit('astryx-context-action', detail, true)) return;
    table.contextAction(id)?.select?.(area);
  };

  table.addEventListener('beforetoggle', onBeforeToggle, {capture: true});
  table.addEventListener('astryx-select', onSelect);
  return () => {
    table.removeEventListener('beforetoggle', onBeforeToggle, {capture: true});
    table.removeEventListener('astryx-select', onSelect);
  };
});
