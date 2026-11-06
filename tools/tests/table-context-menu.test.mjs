#!/usr/bin/env node
/**
 * Table context menus (Astryx tableContextMenu: contextMenuActions on header and body cells) in
 * a real browser (run `cd apps/docs && npx astro build` first): the whole body cell is the
 * right-click target (padding moved onto the trigger), rows built when the menu opens (groups
 * with dividers, disabled and destructive actions), `astryx-context-action` {id, columnKey,
 * rowKey, kind} (cancelable) with the menu rows' own `astryx-select` kept inside, the header
 * sort actions (check mark on the active direction, Clear sort only while sorted, the sort
 * change), Shift+F10 from a focused control (menu at the trigger's bottom-start, arrows, Enter,
 * Escape returning focus), the row-expansion Expand / Collapse row action, and children-mode
 * TableCell / TableHeaderCell `contextMenuActions` (a ContextMenu per cell).
 *   node tools/tests/table-context-menu.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup({width: 1300});
await open('table');

await page.evaluate(() => {
  window.__events = [];
  for (const type of ['astryx-context-action', 'astryx-select', 'astryx-sort-change', 'astryx-expanded-change']) {
    document.addEventListener(type, (e) => window.__events.push({type, tag: e.target.tagName, detail: JSON.parse(JSON.stringify(e.detail ?? null, (k, v) => (k === 'event' ? undefined : v)))}));
  }
});
const events = () => page.evaluate(() => window.__events.splice(0));
const T = '#table-context';
const openMenu = () => page.evaluate(() => {
  const menu = [...document.querySelectorAll('ax-menu[data-ax-menu-kind="context"]')].find((m) => m.matches(':popover-open'));
  if (!menu) return null;
  const list = menu.querySelector('[role="menu"]');
  const r = menu.getBoundingClientRect();
  return {
    id: menu.id, label: list?.getAttribute('aria-label'), left: r.left, top: r.top,
    rows: [...list.children].map((c) => (c.getAttribute('role') === 'menuitem'
      ? `${c.textContent.trim()}${c.getAttribute('aria-disabled') === 'true' ? '[disabled]' : ''}${c.dataset.variant === 'destructive' ? '[destructive]' : ''}${/M4\.5 12\.75l6 6 9-13\.5|M20 6 9 17l-5-5/.test(c.querySelector('.astryx-icon')?.innerHTML ?? '') || c.querySelector('[data-icon="check"]') ? '[✓]' : ''}`
      : c.getAttribute('role') === 'separator' || c.classList.contains('astryx-dropdown-menu-divider') ? '—' : c.tagName)),
    focused: document.activeElement?.closest('[role="menuitem"]')?.textContent.trim() ?? null,
  };
});
const rightClick = async (selector, dx = 0.5, dy = 0.5) => {
  const box = await (await page.$(selector)).boundingBox();
  const x = box.x + box.width * dx;
  const y = box.y + box.height * dy;
  await page.mouse.click(x, y, {button: 'right'});
  await sleep(150);
  return {x, y};
};

await (await page.$(T)).scrollIntoViewIfNeeded();

// ── body cells: the trigger fills the cell ──
const geo = await page.evaluate((s) => {
  const td = document.querySelector(s).tBodies[0].rows[1].cells[1];
  const trigger = td.querySelector(':scope > .ax-table-context-trigger');
  const tr = trigger.getBoundingClientRect();
  const cr = td.getBoundingClientRect();
  const first = document.querySelector(s).tBodies[0].rows[1].cells[0];
  const th = document.querySelector(s).tHead.rows[0].cells[0];
  const textLeft = (el) => { const range = document.createRange(); range.selectNodeContents((el.querySelector('.ax-table-context-trigger') ?? el).firstChild); return Math.round(range.getBoundingClientRect().left); };
  return {fills: Math.abs(tr.width - cr.width) < 1 && Math.abs(tr.height - cr.height) < 1.5, tdPadding: getComputedStyle(td).paddingTop + ' ' + getComputedStyle(td).paddingLeft, triggerPadding: getComputedStyle(trigger).paddingLeft,
    alignedWithHeader: Math.abs(textLeft(first) - textLeft(th.querySelector('.ax-table-sort-button') ?? th)) <= 1, menu: td.querySelector(':scope > ax-menu')?.getAttribute('data-ax-menu-kind'), lazy: !!td.querySelector(':scope > ax-menu > template[data-ax-menu-content]')};
}, T);
check('body cell: the trigger fills the cell, padding moved onto it', geo.fills && geo.tdPadding === '0px 0px' && geo.triggerPadding === '8px', JSON.stringify(geo));
check('first column text stays aligned with its header (edge padding on the trigger)', geo.alignedWithHeader, JSON.stringify(geo));
check('each cell owns a context <ax-menu> whose menu waits in a template', geo.menu === 'context' && geo.lazy, JSON.stringify(geo));

// ── right-click a body cell (padding area) ──
const at = await rightClick(`${T} tbody tr:nth-child(2) td:nth-child(3)`, 0.03, 0.15);
let m = await openMenu();
check('right-click anywhere in the cell (its padding too) opens the menu', m != null, JSON.stringify(m));
check('rows: Edit, Duplicate, divider, Delete [destructive]', m && JSON.stringify(m.rows) === JSON.stringify(['Edit', 'Duplicate', '—', 'Delete[destructive]']), JSON.stringify(m?.rows));
check('menu named "Context menu", at the pointer, first row focused', m && m.label === 'Context menu' && Math.abs(m.left - at.x) < 6 && Math.abs(m.top - at.y) < 8 && m.focused === 'Edit', JSON.stringify(m));
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await sleep(100);
let ev = await events();
const rowKey = await page.evaluate((s) => document.querySelector(s).tBodies[0].rows[1].querySelector('[data-ax-context-row]')?.dataset.axContextRow, T);
check('choosing Duplicate: astryx-context-action {id, columnKey, rowKey, kind}', ev.length === 1 && ev[0].type === 'astryx-context-action' && ev[0].tag === 'AX-TABLE' && JSON.stringify(ev[0].detail) === JSON.stringify({id: 'duplicate', columnKey: 'location', rowKey, kind: 'body'}), JSON.stringify(ev));
check('the row’s astryx-select stays inside the table; the menu closes', !ev.some((e) => e.type === 'astryx-select') && (await openMenu()) == null);

// Disabled action on an offline person's row.
const offline = await page.evaluate((s) => [...document.querySelector(s).tBodies[0].rows].findIndex((r) => r.textContent.includes('Offline') || r.cells[0].textContent.includes('Elena')), T);
await rightClick(`${T} tbody tr:nth-child(${offline + 1}) td:nth-child(1)`);
m = await openMenu();
check('a disabled action renders aria-disabled', m && m.rows.includes('Delete[disabled][destructive]'), JSON.stringify(m?.rows));
await page.keyboard.press('Escape');
await sleep(80);

// ── header: sort actions ──
const sortNames = () => page.evaluate((s) => [...document.querySelector(s).tBodies[0].rows].map((r) => r.cells[0].textContent.trim()), T);
const before = await sortNames();
await rightClick(`${T} thead th[data-column-key="name"]`, 0.3, 0.5);
m = await openMenu();
check('header menu (unsorted): Sort ascending, Sort descending — no Clear sort', m && JSON.stringify(m.rows) === JSON.stringify(['Sort ascending', 'Sort descending']), JSON.stringify(m?.rows));
await page.click('ax-menu:popover-open [role="menuitem"]:nth-child(2)');
await sleep(120);
ev = await events();
check('Sort descending: astryx-context-action then astryx-sort-change', ev.map((e) => e.type).join() === 'astryx-context-action,astryx-sort-change' && ev[0].detail.id === 'sort-desc' && ev[0].detail.kind === 'header' && JSON.stringify(ev[1].detail.sort) === '[{"sortKey":"name","direction":"descending"}]', JSON.stringify(ev));
const after = await sortNames();
check('rows re-sorted descending', JSON.stringify(after) === JSON.stringify([...before].sort((a, b) => b.localeCompare(a))) && (await page.evaluate((s) => document.querySelector(s).tHead.rows[0].cells[0].getAttribute('aria-sort'), T)) === 'descending', JSON.stringify(after));
await rightClick(`${T} thead th[data-column-key="name"]`, 0.3, 0.5);
m = await openMenu();
const checkIcon = await page.evaluate(() => {
  const rows = [...document.querySelector('ax-menu:popover-open [role="menu"]').querySelectorAll('[role="menuitem"]')];
  const svg = (r) => r.querySelector('svg')?.outerHTML ?? '';
  return {descHasCheck: svg(rows[1]) !== '' && svg(rows[1]) !== svg(rows[0]), ascIcon: svg(rows[0]).length > 0};
});
check('reopened: rows rebuilt — Clear sort after a divider', m && JSON.stringify(m.rows.map((r) => r.replace('[✓]', ''))) === JSON.stringify(['Sort ascending', 'Sort descending', '—', 'Clear sort']), JSON.stringify(m?.rows));
check('the active direction shows a check mark instead of its icon', checkIcon.descHasCheck && checkIcon.ascIcon, JSON.stringify(checkIcon));
// Prevented context action: no sort change.
await page.evaluate(() => document.addEventListener('astryx-context-action', (e) => e.preventDefault(), {once: true}));
await page.click('ax-menu:popover-open [role="menuitem"]:last-child');
await sleep(100);
ev = await events();
check('a prevented astryx-context-action skips the action', ev.map((e) => e.type).join() === 'astryx-context-action' && (await page.evaluate((s) => document.querySelector(s).tHead.rows[0].cells[0].getAttribute('aria-sort'), T)) === 'descending', JSON.stringify(ev));

// ── keyboard: Shift+F10 on the focused Sort control ──
await page.focus(`${T} thead th[data-column-key="name"] .ax-table-sort-button`);
await page.keyboard.press('Shift+F10');
await sleep(150);
m = await openMenu();
const trig = await page.evaluate((s) => document.querySelector(s).tHead.rows[0].cells[0].querySelector('.ax-table-context-trigger').getBoundingClientRect().toJSON(), T);
// Chrome reports a keyboard contextmenu at the focused control (not 0,0): the menu opens there.
check('Shift+F10 opens the header menu at the focused control, first row focused', m && m.left >= trig.left - 1 && m.left <= trig.right && m.top >= trig.top && m.top <= trig.bottom + 8 && m.focused === 'Sort ascending', JSON.stringify({m, trig}));
check('keyboard open shows the focus ring', await page.evaluate(() => document.activeElement.matches(':focus-visible')));
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
check('arrows move through enabled rows (skipping the divider)', (await openMenu())?.focused === 'Clear sort');
await page.keyboard.press('Enter');
await sleep(120);
ev = await events();
check('Enter on Clear sort: sort [] and aria-sort removed', ev.map((e) => e.type).join() === 'astryx-context-action,astryx-sort-change' && JSON.stringify(ev[1].detail.sort) === '[]' && (await page.evaluate((s) => document.querySelector(s).tHead.rows[0].cells[0].hasAttribute('aria-sort'), T)) === false, JSON.stringify(ev));
check('focus returns to the Sort control', await page.evaluate(() => document.activeElement?.classList.contains('ax-table-sort-button')));
await page.keyboard.press('Shift+F10');
await sleep(120);
await page.keyboard.press('Escape');
await sleep(80);
check('Escape closes the menu and returns focus', (await openMenu()) == null && (await page.evaluate(() => document.activeElement?.classList.contains('ax-table-sort-button'))));

// ── row expansion: Expand / Collapse row on every cell ──
const E = '#table-expand';
await (await page.$(E)).scrollIntoViewIfNeeded();
const rowOf = (key) => `${E} tbody tr[data-expansion-key="${key}"]`;
const ex = await page.evaluate((s) => [...document.querySelector(s).tBodies[0].rows].filter((r) => !r.hasAttribute('data-expansion-panel')).map((r) => ({key: r.dataset.expansionKey ?? null, triggers: r.querySelectorAll(':scope > td > .ax-table-context-trigger').length, cells: r.cells.length})), E);
check('every cell of an expandable row has a menu; a non-expandable row none', ex.every((r) => (r.key ? r.triggers === r.cells : r.triggers === 0)) && ex.some((r) => !r.key), JSON.stringify(ex));
await rightClick(`${rowOf('p01')} td:nth-child(3)`);
m = await openMenu();
check('collapsed row: "Expand row"', m && JSON.stringify(m.rows) === '["Expand row"]', JSON.stringify(m?.rows));
await page.keyboard.press('Enter');
await sleep(120);
ev = await events();
check('Expand row: astryx-context-action then astryx-expanded-change; the panel shows', ev.map((e) => e.type).join() === 'astryx-context-action,astryx-expanded-change' && ev[1].detail.key === 'p01' && ev[1].detail.isExpanded === true && (await page.evaluate((s) => !document.querySelector(s).nextElementSibling.hidden, rowOf('p01'))), JSON.stringify(ev));
await rightClick(`${rowOf('p01')} td:nth-child(2)`);
m = await openMenu();
check('expanded row: "Collapse row"', m && JSON.stringify(m.rows) === '["Collapse row"]', JSON.stringify(m?.rows));
await page.keyboard.press('Escape');
await sleep(80);
// Shift+F10 on the chevron.
await page.focus(`${rowOf('p03')} [data-expansion-toggle]`);
await page.keyboard.press('Shift+F10');
await sleep(120);
m = await openMenu();
check('Shift+F10 on the chevron opens its row menu', m && JSON.stringify(m.rows) === '["Expand row"]', JSON.stringify(m?.rows));
await page.keyboard.press('Escape');
await sleep(80);
const chevron = await page.evaluate((s) => {
  const td = document.querySelector(s).cells[0];
  const b = td.querySelector('[data-expansion-toggle]').getBoundingClientRect();
  const c = td.getBoundingClientRect();
  return Math.abs((b.left + b.right) / 2 - (c.left + c.right) / 2);
}, rowOf('p03'));
check('the chevron stays centred in its 40px column inside the trigger', chevron <= 1, String(chevron));
check('no stray events', (await events()).length === 0);

// ── children mode: TableCell / TableHeaderCell contextMenuActions (a ContextMenu per cell) ──
console.log('Children mode (TableCell / TableHeaderCell contextMenuActions)');
const C = '#table-children-platform';
await (await page.$(C)).scrollIntoViewIfNeeded();
const childGeo = await page.evaluate((s) => {
  const td = document.querySelector(s);
  const trigger = td.querySelector(':scope > .ax-table-context-trigger');
  const tr = trigger.getBoundingClientRect();
  const cr = td.getBoundingClientRect();
  return {fills: Math.abs(tr.width - cr.width) < 1 && Math.abs(tr.height - cr.height) < 1.5, density: trigger.dataset.density, tdPadding: getComputedStyle(td).paddingTop, triggerPadding: getComputedStyle(trigger).paddingTop};
}, C);
check('a body cell with actions: the trigger fills the cell and carries the density padding', childGeo.fills && childGeo.density === 'compact' && childGeo.tdPadding === '0px' && childGeo.triggerPadding === '4px', JSON.stringify(childGeo));
await rightClick(C, 0.95, 0.9);
m = await openMenu();
check('right-click opens its menu: groups with a divider, a check mark for a checked action, destructive kept', m && JSON.stringify(m.rows) === '["Open team","Pinned[✓]","—","Archive team[destructive]"]', JSON.stringify(m?.rows));
await page.click('[role="menuitem"][data-id="open"]');
await sleep(120);
const childEv = await events();
check("choosing a row dispatches the menu row's astryx-select (data-id = the action id), no table action", childEv.some((e) => e.type === 'astryx-select') && !childEv.some((e) => e.type === 'astryx-context-action') && await page.evaluate(() => !document.querySelector('ax-menu[data-ax-menu-kind="context"]:popover-open')), JSON.stringify(childEv));
await rightClick('#table-children-team');
m = await openMenu();
check('a header cell with actions opens its own menu', m && JSON.stringify(m.rows) === '["Hide column"]', JSON.stringify(m?.rows));
await page.keyboard.press('Escape');
await sleep(80);
const plain = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('#table-children td.astryx-table-cell, #table-children th.astryx-table-header-cell')];
  return cells.filter((c) => !['table-children-platform', 'table-children-team'].includes(c.id)).every((c) => !c.querySelector('.ax-context-menu-trigger, ax-menu'));
});
check('cells without actions render no menu (the browser\'s own passes through)', plain);
await events();

await done();
