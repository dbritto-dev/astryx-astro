#!/usr/bin/env node
/**
 * Table behaviour (components/Table + elements/table.ts + elements/table-features/*) against
 * the built docs (apps/docs/dist).
 *   node tools/tests/table.test.mjs
 * Covers: the scroll region (name, tab stop while overflowing), sorting by click and keyboard
 * (aria-sort, row order, indicator, multi-sort priority, the event and cancelling it), column
 * resize by pointer and keyboard (separator ARIA, widths, event), sticky columns on
 * horizontal scroll (+ shadows), row expansion (chevron, row click, panel, event), grouped
 * rows, tree rows, and the truncation tooltip.
 */
import {setup, isOpen, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup({width: 1200, height: 900});
await open('table');
const eq = (name, actual, expected) => check(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

// Collect astryx-* events per table id.
await page.evaluate(() => {
  window.__events = [];
  for (const type of ['astryx-sort-change', 'astryx-column-resize', 'astryx-expanded-change', 'astryx-toggle-group', 'astryx-expanded-ids-change']) {
    document.addEventListener(type, (e) => window.__events.push({type, table: e.target.querySelector('table')?.id, detail: e.detail}));
  }
});
const lastEvent = (type) => page.evaluate((t) => window.__events.filter((e) => e.type === t).at(-1) ?? null, type);
const firstColumn = (id, col = 0) =>
  page.evaluate(([tid, c]) => Array.from(document.getElementById(tid).tBodies[0].rows).filter((r) => !r.hidden).map((r) => r.cells[c]?.textContent.trim()), [id, col]);
const ariaSort = (id) => page.evaluate((tid) => Array.from(document.getElementById(tid).tHead.rows[0].cells).map((th) => th.getAttribute('aria-sort')), id);

// ── Scroll region ────────────────────────────────────────────────────────
const region = (id) =>
  page.evaluate((tid) => {
    const w = document.getElementById(tid).closest('ax-table');
    return {role: w.getAttribute('role'), label: w.getAttribute('aria-label'), labelledby: w.getAttribute('aria-labelledby'), tabindex: w.getAttribute('tabindex'), ox: getComputedStyle(w).overflowX};
  }, id);
const wide = await region('table-wide');
check('overflowing table: region is a named, focusable group that scrolls', wide.role === 'group' && wide.label === 'All employees' && wide.tabindex === '0' && wide.ox === 'auto', JSON.stringify(wide));
const basic = await region('table-basic');
check('fitting table: no tab stop, named by its caption', basic.tabindex === null && basic.labelledby?.endsWith('-caption') && basic.label === null && basic.ox === 'clip', JSON.stringify(basic));

// ── Sorting ──────────────────────────────────────────────────────────────
const sortBtn = (label) => `#table-sort thead th:has(button[data-ax-sort-key="${label}"]) button`;
eq('initial sort: Name ascending', (await ariaSort('table-sort'))[0], 'ascending');
const namesAsc = await firstColumn('table-sort');
check('rows start sorted by name', namesAsc.join('|') === [...namesAsc].sort((a, b) => a.localeCompare(b)).join('|'));
await page.click(sortBtn('name'));
eq('click: Name descending', (await ariaSort('table-sort'))[0], 'descending');
eq('rows reversed', await firstColumn('table-sort'), [...namesAsc].reverse());
eq('astryx-sort-change detail', (await lastEvent('astryx-sort-change'))?.detail, {sort: [{sortKey: 'name', direction: 'descending'}]});
const icon = await page.$eval(`${sortBtn('name')} .ax-table-sort-icon`, (el) => ({dir: el.dataset.direction, svg: !!el.querySelector('svg, .astryx-icon')}));
check('indicator swapped to descending', icon.dir === 'descending' && icon.svg, JSON.stringify(icon));
await page.click(sortBtn('name'));
eq('third click: unsorted (aria-sort removed)', (await ariaSort('table-sort'))[0], null);
eq('unsorted: original data order', (await firstColumn('table-sort')).slice(0, 3), ['Alice Chen', 'Bob Smith', 'Carol Wu']);
await page.click(sortBtn('salary'));
const salaries = (await firstColumn('table-sort', 5)).map((s) => Number(s.replace(/[$,]/g, '')));
check('numeric column sorts numerically', salaries.every((v, i) => i === 0 || salaries[i - 1] <= v), salaries.join(','));
// Keyboard: Enter and Space on a focused Sort control.
await page.focus(sortBtn('team'));
await page.keyboard.press('Enter');
eq('Enter sorts Team ascending', (await ariaSort('table-sort'))[1], 'ascending');
const teams = await firstColumn('table-sort', 1);
check('rows ordered by team', teams.every((v, i) => i === 0 || teams[i - 1].localeCompare(v) <= 0), teams.join(','));
await page.keyboard.press('Space');
eq('Space steps Team to descending', (await ariaSort('table-sort'))[1], 'descending');
// Multi-sort: Shift+click adds a secondary key with a priority description.
await page.click(sortBtn('location'), {modifiers: ['Shift']});
const multi = await page.evaluate(() => {
  const b = document.querySelector('#table-sort button[data-ax-sort-key="location"]');
  const id = b.getAttribute('aria-describedby');
  return {rank: b.querySelector('.ax-table-sort-rank')?.textContent, desc: id ? document.getElementById(id)?.textContent : null};
});
eq('Shift+click adds a secondary key with its priority', multi, {rank: '2', desc: 'Priority 2 of 2'});
const tl = await page.evaluate(() => Array.from(document.getElementById('table-sort').tBodies[0].rows).map((r) => [r.cells[1].textContent, r.cells[2].textContent]));
check('ties broken by the secondary key', tl.every((v, i) => i === 0 || tl[i - 1][0] > v[0] || (tl[i - 1][0] === v[0] && tl[i - 1][1].localeCompare(v[1]) <= 0)), JSON.stringify(tl.slice(0, 6)));
// Cancelling the event keeps the state.
await page.evaluate(() => document.getElementById('table-sort').closest('ax-table').addEventListener('astryx-sort-change', (e) => e.preventDefault(), {once: true}));
const before = await ariaSort('table-sort');
await page.click(sortBtn('rating'));
eq('preventDefault keeps the sort', await ariaSort('table-sort'), before);

// ── Column resize ────────────────────────────────────────────────────────
const handle = '#table-resize th[data-column-key="name"] [data-resize-handle]';
const sep = await page.$eval(handle, (el) => ({
  role: el.getAttribute('role'), o: el.getAttribute('aria-orientation'), now: el.getAttribute('aria-valuenow'),
  min: el.getAttribute('aria-valuemin'), max: el.getAttribute('aria-valuemax'), label: el.getAttribute('aria-label'), tab: el.getAttribute('tabindex'),
}));
eq('handle is a focusable vertical separator with values', sep, {role: 'separator', o: 'vertical', now: '80', min: '80', max: '420', label: 'Resize column Name', tab: '0'});
const thWidth = (key) => page.$eval(`#table-resize th[data-column-key="${key}"]`, (th) => Math.round(th.getBoundingClientRect().width));
const w0 = await thWidth('name');
await page.locator('#table-resize').scrollIntoViewIfNeeded();
const hb = await page.locator(handle).boundingBox();
await page.mouse.move(hb.x + hb.width / 2, hb.y + 5);
await page.mouse.down();
await page.mouse.move(hb.x + hb.width / 2 + 30, hb.y + 5, {steps: 4});
await page.mouse.move(hb.x + hb.width / 2 + 60, hb.y + 5, {steps: 4});
check('dragging marks the handle', (await page.$eval(handle, (el) => el.getAttribute('data-resizing'))) === 'true');
await page.mouse.up();
const w1 = await thWidth('name');
check('pointer drag widens the column by the delta', Math.abs(w1 - (w0 + 60)) <= 1, `${w0} → ${w1}`);
const ev = await lastEvent('astryx-column-resize');
check('astryx-column-resize {updates} with every column but the last', ev && Math.abs(ev.detail.updates.name - (w0 + 60)) <= 1 && 'email' in ev.detail.updates && !('location' in ev.detail.updates), JSON.stringify(ev?.detail));
check('aria-valuenow follows the committed width', Math.abs(Number(await page.$eval(handle, (el) => el.getAttribute('aria-valuenow'))) - w1) <= 1);
check('the drag no longer marks the handle', (await page.$eval(handle, (el) => el.getAttribute('data-resizing'))) === null);
await page.focus(handle);
await page.keyboard.press('ArrowRight');
check('ArrowRight +10px', Math.abs((await thWidth('name')) - (w1 + 10)) <= 1);
await page.keyboard.press('Shift+ArrowLeft');
check('Shift+ArrowLeft −50px', Math.abs((await thWidth('name')) - (w1 - 40)) <= 1);
await page.keyboard.press('Home');
eq('Home → minimum', await thWidth('name'), 80);
eq('aria-valuenow at the minimum', await page.$eval(handle, (el) => el.getAttribute('aria-valuenow')), '80');
await page.keyboard.press('End');
eq('End → maximum', await thWidth('name'), 420);
await sleep(150);
const reaches = await page.evaluate(() => {
  const t = document.getElementById('table-resize');
  const h = t.querySelector('[data-resize-handle]').getBoundingClientRect();
  const r = t.getBoundingClientRect();
  return h.bottom > r.bottom - 4 && h.bottom <= r.bottom + 1;
});
check('the handle reaches the last row', reaches);

// ── Sticky columns ───────────────────────────────────────────────────────
await page.locator('#table-wide').scrollIntoViewIfNeeded();
const pinned = () =>
  page.evaluate(() => {
    const t = document.getElementById('table-wide');
    const w = t.closest('ax-table').getBoundingClientRect();
    const row = t.tBodies[0].rows[0];
    const name = row.querySelector('[data-astryx-table-pinned]').getBoundingClientRect();
    const status = row.cells[row.cells.length - 1].getBoundingClientRect();
    const email = row.cells[1].getBoundingClientRect();
    const head = t.tHead.rows[0].cells[0].getBoundingClientRect();
    const shadow = (el) => getComputedStyle(el, '::after').opacity;
    return {wl: w.left, wr: w.right, name: name.left, status: status.right, email: email.left, head: head.left, start: shadow(row.cells[0]), end: shadow(row.cells[row.cells.length - 1])};
  });
const p0 = await pinned();
check('at rest: start column at the start edge, end column at the end edge', Math.abs(p0.name - p0.wl) <= 1 && Math.abs(p0.status - p0.wr) <= 16, JSON.stringify(p0));
check('at rest: only the end shadow shows', p0.start === '0' && p0.end === '1', JSON.stringify(p0));
await page.evaluate(() => { document.getElementById('table-wide').closest('ax-table').scrollLeft = 400; });
await sleep(250);
const p1 = await pinned();
check('scrolled: pinned start cells stay put (body and header)', Math.abs(p1.name - p0.name) <= 1 && Math.abs(p1.head - p0.head) <= 1, JSON.stringify(p1));
check('scrolled: pinned end cells stay put', Math.abs(p1.status - p0.status) <= 1, JSON.stringify(p1));
check('scrolled: other columns move', p1.email < p0.email - 300, JSON.stringify(p1));
check('scrolled: both shadows show', p1.start === '1' && p1.end === '1', JSON.stringify(p1));
await page.evaluate(() => { const w = document.getElementById('table-wide').closest('ax-table'); w.scrollLeft = w.scrollWidth; });
await sleep(250);
const p2 = await pinned();
check('at the end: the end shadow hides', p2.start === '1' && p2.end === '0', JSON.stringify(p2));

// ── Row expansion ────────────────────────────────────────────────────────
const exp = (key) =>
  page.evaluate((k) => {
    const row = document.querySelector(`#table-expand tr[data-expansion-key="${k}"]`);
    const toggle = row.querySelector('[data-expansion-toggle]');
    const panel = row.nextElementSibling;
    return {expanded: toggle?.getAttribute('aria-expanded'), label: toggle?.getAttribute('aria-label'), panelHidden: panel?.hasAttribute('data-expansion-panel') ? panel.hidden : null};
  }, key);
eq('initially expanded row', await exp('p02'), {expanded: 'true', label: 'Collapse Bob Smith', panelHidden: false});
eq('collapsed row', await exp('p01'), {expanded: 'false', label: 'Expand Alice Chen', panelHidden: true});
check('a non-expandable row has no toggle', await page.evaluate(() => !document.querySelector('#table-expand tbody tr:nth-child(7) [data-expansion-toggle]') && !document.querySelector('#table-expand tr[data-expansion-key="p04"]')));
await page.click('#table-expand tr[data-expansion-key="p01"] [data-expansion-toggle]');
eq('click expands', await exp('p01'), {expanded: 'true', label: 'Collapse Alice Chen', panelHidden: false});
const xd = (await lastEvent('astryx-expanded-change'))?.detail;
eq('astryx-expanded-change detail', xd && {...xd, expandedKeys: [...xd.expandedKeys].sort()}, {key: 'p01', isExpanded: true, expandedKeys: ['p01', 'p02']});
check('panel shows the slot content', (await page.$eval('#table-expand tr[data-expansion-key="p01"] + tr', (r) => r.textContent)).includes('alice.chen@example.com'));
await sleep(400);
const rot = await page.$eval('#table-expand tr[data-expansion-key="p01"] .ax-table-expand-glyph', (el) => getComputedStyle(el).transform);
check('glyph turns a quarter while expanded', rot.startsWith('matrix(0') || rot.includes('6.12'), rot);
await page.focus('#table-expand tr[data-expansion-key="p01"] [data-expansion-toggle]');
await page.keyboard.press('Enter');
eq('Enter collapses', await exp('p01'), {expanded: 'false', label: 'Expand Alice Chen', panelHidden: true});
// Row click (hasRowClickExpansion): a plain click on the row toggles.
await page.click('#table-expand-rowclick tbody tr:first-child td:nth-child(3)');
const rc = await page.$eval('#table-expand-rowclick tbody tr:first-child', (r) => ({exp: r.hasAttribute('data-ax-expanded'), panel: !r.nextElementSibling.hidden}));
eq('row click expands', rc, {exp: true, panel: true});
const stripes = await page.$$eval('#table-expand-rowclick tbody tr:not([data-expansion-panel])', (rows) => rows.map((r) => getComputedStyle(r).backgroundColor));
check('an open panel does not shift the zebra', stripes[0] === stripes[2] && stripes[1] === stripes[3] && stripes[0] !== stripes[1], stripes.join(' | '));

// ── Grouped rows ─────────────────────────────────────────────────────────
const design = () => page.evaluate(() => {
  const header = document.querySelector('#table-grouped tr[data-ax-group-key="Design"]');
  const rows = [];
  for (let r = header.nextElementSibling; r && !r.hasAttribute('data-ax-group-key'); r = r.nextElementSibling) rows.push(r.hidden);
  return {expanded: header.querySelector('[data-ax-group-toggle]').getAttribute('aria-expanded'), rowsHidden: rows};
});
eq('collapsed group hides its rows', await design(), {expanded: 'false', rowsHidden: [true, true]});
await page.click('#table-grouped tr[data-ax-group-key="Design"] td');
eq('clicking the header row expands the group', await design(), {expanded: 'true', rowsHidden: [false, false]});
eq('astryx-toggle-group detail', (await lastEvent('astryx-toggle-group'))?.detail, {groupKey: 'Design', isCollapsed: false, collapsedGroups: []});

// ── Tree rows ────────────────────────────────────────────────────────────
const visibleNames = () => firstColumn('table-tree');
eq('tree starts with src expanded', await visibleNames(), ['src', 'components', 'lib', 'index.ts', 'docs', 'README.md']);
await page.click('#table-tree tr[data-ax-tree-id="components"] [data-ax-tree-toggle]');
eq('expanding a folder shows its children', await visibleNames(), ['src', 'components', 'Table.astro', 'Button.astro', 'lib', 'index.ts', 'docs', 'README.md']);
eq('aria-level / aria-expanded on rows', await page.$eval('#table-tree tr[data-ax-tree-id="components"]', (r) => [r.getAttribute('aria-level'), r.getAttribute('aria-expanded')]), ['2', 'true']);
await page.click('#table-tree [data-ax-tree-expand-all]');
eq('expand all', (await visibleNames()).length, 10);
eq('expand-all toggle now collapses', await page.$eval('#table-tree [data-ax-tree-expand-all]', (b) => [b.getAttribute('aria-expanded'), b.getAttribute('aria-label')]), ['true', 'Collapse all rows']);
await page.click('#table-tree [data-ax-tree-expand-all]');
eq('collapse all', await visibleNames(), ['src', 'docs', 'README.md']);
eq('astryx-expanded-ids-change detail', (await lastEvent('astryx-expanded-ids-change'))?.detail, {ids: [], id: null, isExpanded: false});

// ── Sticky header recipe (custom plugin: region scrolls both ways) ───────
await page.locator('#table-sticky-header').scrollIntoViewIfNeeded();
const sh = await page.evaluate(async () => {
  const t = document.getElementById('table-sticky-header');
  const w = t.closest('ax-table');
  w.scrollTop = 150;
  await new Promise((r) => setTimeout(r, 100));
  return {oy: getComputedStyle(w).overflowY, tab: w.getAttribute('tabindex'), headTop: Math.round(t.tHead.rows[0].cells[0].getBoundingClientRect().top), wrapTop: Math.round(w.getBoundingClientRect().top), scrolled: w.scrollTop};
});
check('sticky header: the region scrolls vertically and the header stays at its top', sh.oy === 'auto' && sh.tab === '0' && sh.scrolled > 100 && Math.abs(sh.headTop - sh.wrapTop) <= 1, JSON.stringify(sh));

// ── Row filter hook (for the deferred filtering plugin) ──────────────────
const filtered = await page.evaluate(() => {
  const w = document.getElementById('table-basic').closest('ax-table');
  const remove = w.addRowFilter((row) => row.cells[2]?.textContent === 'Platform');
  const shown = Array.from(w.body.rows).filter((r) => !r.hidden).map((r) => r.cells[0].textContent);
  remove();
  return {shown, after: Array.from(w.body.rows).filter((r) => !r.hidden).length};
});
eq('addRowFilter hides rejected rows and restores them', filtered, {shown: ['Alice Chen', 'Daniel Okafor'], after: 5});

// ── Truncation tooltip ───────────────────────────────────────────────────
await page.locator('#table-truncate').scrollIntoViewIfNeeded();
const cell = '#table-truncate tbody tr:first-child td:nth-child(2) [data-truncate]';
const tipId = await page.$eval(cell, (el) => el.getAttribute('data-ax-tooltip'));
check('a truncated default cell gets a tooltip', !!tipId);
const cb = await page.locator(cell).boundingBox();
await page.mouse.move(cb.x + 10, cb.y + cb.height / 2, {steps: 2});
await sleep(350);
check('hover shows the full text', (await isOpen(page, `#${tipId}`)) && (await page.$eval(`#${tipId}`, (t) => t.textContent.trim())) === 'alice.chen@example.com');
const fits = await page.$eval('#table-truncate tbody tr:first-child td:first-child [data-truncate]', (el) => el.getAttribute('data-ax-tooltip'));
check('a fitting cell gets none', fits === null);

// ── RTL: pinned start column on the right; arrow keys follow the reading direction ──
await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
await sleep(200);
const rtl = await page.evaluate(() => {
  const t = document.getElementById('table-wide');
  const w = t.closest('ax-table').getBoundingClientRect();
  const name = t.tBodies[0].rows[0].cells[0].getBoundingClientRect();
  return {w: Math.round(w.right), name: Math.round(name.right)};
});
check('RTL: the start-pinned column sits at the right edge', Math.abs(rtl.w - rtl.name) <= 1, JSON.stringify(rtl));
const wr0 = await thWidth('email');
await page.focus('#table-resize th[data-column-key="email"] [data-resize-handle]');
await page.keyboard.press('ArrowLeft');
check('RTL: ArrowLeft widens the column', Math.abs((await thWidth('email')) - (wr0 + 10)) <= 1, `${wr0} → ${await thWidth('email')}`);
await page.evaluate(() => document.documentElement.removeAttribute('dir'));

await done();
