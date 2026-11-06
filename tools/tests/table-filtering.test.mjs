#!/usr/bin/env node
/**
 * Table column filtering (useTableFiltering / useTableFilterState, hasClientFiltering) in a real
 * browser (run `cd apps/docs && npx astro build` first): the popover variant (funnel state and
 * name, the draft edited in the popover, Apply / Reset, cancelable `astryx-filter-change` with
 * Astryx's {columnKey, value} plus the state), the inline variant (live text, MultiSelector,
 * NumberInput, Tokenizer with free tokens, clear buttons), client row filtering and the filtered
 * empty state, the controls' own events staying inside, inline-compact placeholders, and the
 * `filters` / `clearFilters()` API.
 *   node tools/tests/table-filtering.test.mjs
 */
import {setup, sleep, isOpen} from './_harness.mjs';

const {page, check, open, done} = await setup({width: 1300});
await open('table');

await page.evaluate(() => {
  window.__events = [];
  for (const type of ['astryx-filter-change', 'astryx-change']) {
    document.addEventListener(type, (e) => window.__events.push({type, tag: e.target.tagName, id: e.target.querySelector?.('table')?.id ?? null, detail: JSON.parse(JSON.stringify(e.detail ?? null, (k, v) => (k === 'event' ? undefined : v)))}));
  }
});
const events = () => page.evaluate(() => window.__events.splice(0));
const visibleNames = (sel) => page.evaluate((s) => [...document.querySelector(s).tBodies[0].rows].filter((r) => !r.hidden && !r.hasAttribute('data-ax-empty-row')).map((r) => r.cells[0].textContent.trim()), sel);
const emptyShown = (sel) => page.evaluate((s) => { const r = document.querySelector(s).tBodies[0].querySelector('[data-ax-empty-row]'); return r ? !r.hidden && r.getClientRects().length > 0 : null; }, sel);
const funnel = (col, sel = '#table-filter') => `${sel} thead th[data-column-key="${col}"] .ax-table-filter-trigger`;
const popoverOf = (col, sel = '#table-filter') => `${sel} thead th[data-column-key="${col}"] ax-popover`;
const people = await page.evaluate(() => [...document.querySelector('#table-filter').tBodies[0].rows].filter((r) => r.dataset.axFilterValues).map((r) => ({name: r.cells[0].textContent.trim(), ...JSON.parse(r.dataset.axFilterValues)})));

// ── server render (popover variant, initial filter team = Platform) ──
const platform = people.filter((p) => p.team === 'Platform').map((p) => p.name);
check('server render hides rows the initial filter rejects', JSON.stringify(await visibleNames('#table-filter')) === JSON.stringify(platform), JSON.stringify(await visibleNames('#table-filter')));
const triggers = await page.evaluate((sel) => [...document.querySelectorAll(`${sel} thead .ax-table-filter-trigger`)].map((b) => ({
  col: b.closest('th').dataset.columnKey, label: b.getAttribute('aria-label'), popup: b.getAttribute('aria-haspopup'), expanded: b.getAttribute('aria-expanded'),
  active: b.hasAttribute('data-active'), color: b.querySelector('.astryx-icon')?.dataset.color, opacity: getComputedStyle(b).opacity, inAfter: !!b.closest('.ax-table-header-label-row'),
})), '#table-filter');
check('a funnel per filtered column, after the label', triggers.length === 6 && triggers.every((t) => t.inAfter), JSON.stringify(triggers.map((t) => t.col)));
const team = triggers.find((t) => t.col === 'team');
const name = triggers.find((t) => t.col === 'name');
check('funnel named "Filter <header>", aria-haspopup=dialog', name.label === 'Filter Name' && name.popup === 'dialog' && name.expanded === 'false', JSON.stringify(name));
check('active funnel: accent, opaque', team.active && team.color === 'accent' && team.opacity === '1', JSON.stringify(team));
check('inactive funnel: secondary, faded to 0.35', !name.active && name.color === 'secondary' && name.opacity === '0.35', JSON.stringify(name));
await page.hover('#table-filter thead th[data-column-key="name"]');
check('header hover shows the faded funnel', (await page.evaluate((s) => getComputedStyle(document.querySelector(s)).opacity, funnel('name'))) === '1');
check('the table has no empty state while rows match', (await emptyShown('#table-filter')) === false);

// ── popover: draft, Apply ──
await page.click(funnel('name'));
await sleep(150);
check('funnel opens its popover', await isOpen(page, popoverOf('name')));
const pop = await page.evaluate((s) => {
  const p = document.querySelector(s);
  const surface = p.querySelector('.astryx-popover');
  return {label: surface?.getAttribute('aria-label'), width: Math.round(p.querySelector('.ax-table-filter-popover-content').getBoundingClientRect().width),
    focus: document.activeElement?.closest('ax-text-input') != null, buttons: [...p.querySelectorAll('[data-ax-filter-action]')].map((b) => `${b.dataset.axFilterAction}:${b.textContent.trim()}:${b.closest('.astryx-button')?.dataset.variant ?? b.dataset.variant}`),
    expanded: document.querySelector(s.replace(' ax-popover', ' .ax-table-filter-trigger')).getAttribute('aria-expanded')};
}, popoverOf('name'));
check('popover: named after the column, 240px content, md TextInput focused', pop.label === 'Filter Name' && pop.width === 240 && pop.focus, JSON.stringify(pop));
check('popover: Reset (ghost) and Apply (primary)', pop.buttons.join() === 'reset:Reset:ghost,apply:Apply:primary', pop.buttons.join());
check('funnel aria-expanded follows', pop.expanded === 'true');
await page.keyboard.type('al');
await sleep(50);
let ev = await events();
check('typing in the popover edits a draft: no filter event, no inner astryx-change escapes', ev.length === 0, JSON.stringify(ev));
check('rows do not change before Apply', JSON.stringify(await visibleNames('#table-filter')) === JSON.stringify(platform));
await page.click(`${popoverOf('name')} [data-ax-filter-action="apply"]`);
await sleep(100);
ev = await events();
check('Apply: astryx-filter-change {columnKey, value, filters}', ev.length === 1 && ev[0].type === 'astryx-filter-change' && ev[0].tag === 'AX-TABLE' && ev[0].detail.columnKey === 'name' && ev[0].detail.value === 'al' && ev[0].detail.filters.team === 'Platform' && ev[0].detail.filters.name === 'al', JSON.stringify(ev));
check('Apply closes the popover', !(await isOpen(page, popoverOf('name'))));
const alPlatform = people.filter((p) => p.team === 'Platform' && p.name.toLowerCase().includes('al')).map((p) => p.name);
check('rows filtered by both columns (contains, case-insensitive)', JSON.stringify(await visibleNames('#table-filter')) === JSON.stringify(alPlatform) && alPlatform.length === 2, JSON.stringify(await visibleNames('#table-filter')));
check('the Name funnel turns active', await page.evaluate((s) => document.querySelector(s).hasAttribute('data-active') && document.querySelector(s).querySelector('.astryx-icon').dataset.color === 'accent', funnel('name')));

// Reopen: the draft is seeded from the committed value.
await page.click(funnel('name'));
await sleep(150);
check('reopened popover shows the committed value', (await page.evaluate((s) => document.querySelector(s).querySelector('input').value, popoverOf('name'))) === 'al');
await page.keyboard.press('Escape');
await sleep(100);

// Reset on Team: value null.
await page.click(funnel('team'));
await sleep(150);
check('enum filter: a Selector showing the value', (await page.evaluate((s) => document.querySelector(s).querySelector('ax-selector')?.value, popoverOf('team'))) === 'Platform');
await page.click(`${popoverOf('team')} [data-ax-filter-action="reset"]`);
await sleep(100);
ev = await events();
check('Reset: astryx-filter-change {columnKey, value: null} without the column', ev.length === 1 && ev[0].detail.columnKey === 'team' && ev[0].detail.value === null && !('team' in ev[0].detail.filters), JSON.stringify(ev));
const al = people.filter((p) => p.name.toLowerCase().includes('al')).map((p) => p.name);
check('rows re-filtered without the Team filter', JSON.stringify(await visibleNames('#table-filter')) === JSON.stringify(al), JSON.stringify(await visibleNames('#table-filter')));
check('the Team funnel turns inactive', await page.evaluate((s) => !document.querySelector(s).hasAttribute('data-active'), funnel('team')));

// Cancelable: prevented Apply keeps the state.
await page.evaluate(() => document.addEventListener('astryx-filter-change', (e) => e.preventDefault(), {once: true}));
await page.click(funnel('salary'));
await sleep(150);
await page.keyboard.type('200000');
await page.click(`${popoverOf('salary')} [data-ax-filter-action="apply"]`);
await sleep(100);
ev = await events();
check('prevented astryx-filter-change keeps the rows and the funnel', ev.length === 1 && JSON.stringify(await visibleNames('#table-filter')) === JSON.stringify(al) && !(await page.evaluate((s) => document.querySelector(s).hasAttribute('data-active'), funnel('salary'))), JSON.stringify(ev));
check('…and the popover still closes (Astryx handleApply)', !(await isOpen(page, popoverOf('salary'))));

// Number filter (popover): live draft, Apply.
await page.click(funnel('salary'));
await sleep(150);
const numberSeed = await page.evaluate((s) => document.querySelector(s).querySelector('input').value, popoverOf('salary'));
check('number popover reseeded empty after the prevented change', numberSeed === '', numberSeed);
await page.keyboard.type('200000');
await page.click(`${popoverOf('salary')} [data-ax-filter-action="apply"]`);
await sleep(100);
ev = await events();
check('number filter commits a number', ev.length === 1 && ev[0].detail.columnKey === 'salary' && ev[0].detail.value === 200000, JSON.stringify(ev));
const rich = people.filter((p) => p.name.toLowerCase().includes('al') && p.salary >= 200000).map((p) => p.name);
check('rows: salary ≥ 200000 and name contains al', JSON.stringify(await visibleNames('#table-filter')) === JSON.stringify(rich), JSON.stringify(await visibleNames('#table-filter')));

// API: filters getter, silent setter, clearFilters.
const api = await page.evaluate(() => document.querySelector('#table-filter').closest('ax-table').filters);
check('table.filters', JSON.stringify(api) === JSON.stringify({name: 'al', salary: 200000}), JSON.stringify(api));
await page.evaluate(() => { document.querySelector('#table-filter').closest('ax-table').filters = {team: 'Design'}; });
ev = await events();
const design = people.filter((p) => p.team === 'Design').map((p) => p.name);
check('setting table.filters applies silently', ev.length === 0 && JSON.stringify(await visibleNames('#table-filter')) === JSON.stringify(design), JSON.stringify(ev));
check('…and the funnels follow', await page.evaluate(() => [...document.querySelectorAll('#table-filter thead .ax-table-filter-trigger[data-active]')].map((b) => b.closest('th').dataset.columnKey).join()) === 'team');
await page.evaluate(() => document.querySelector('#table-filter').closest('ax-table').clearFilters());
check('clearFilters() shows every row, no event', (await visibleNames('#table-filter')).length === people.length && (await events()).length === 0);

// Date filter (popover): a typed date, Apply → ISO value; rows started after it.
await page.click(funnel('started'));
await sleep(150);
await page.click(`${popoverOf('started')} ax-date-input input:not([type="hidden"])`);
await page.keyboard.type('1/1/2021');
await page.keyboard.press('Enter');
await sleep(100);
// One Escape closes the date picker only (the topmost layer); the filter popover stays.
if (await page.evaluate((s) => !!document.querySelector(s)?.querySelector(':popover-open'), popoverOf('started'))) await page.keyboard.press('Escape');
await sleep(100);
check('Escape closes the date picker, not the filter popover', await isOpen(page, popoverOf('started')));
await page.click(`${popoverOf('started')} [data-ax-filter-action="apply"]`);
await sleep(100);
ev = await events();
check('date filter commits an ISO date', ev.length === 1 && ev[0].detail.columnKey === 'started' && ev[0].detail.value === '2021-01-01', JSON.stringify(ev));
const after2021 = people.filter((p) => p.started > Date.UTC(2021, 0, 1) / 1000).map((p) => p.name);
check('rows started after it (PowerSearch "after")', JSON.stringify(await visibleNames('#table-filter')) === JSON.stringify(after2021) && after2021.length > 0, JSON.stringify(await visibleNames('#table-filter')));
check('the date popover closed', !(await isOpen(page, popoverOf('started'))));
await page.evaluate(() => document.querySelector('#table-filter').closest('ax-table').clearFilters());
await events();

// ── inline variant ──
const I = '#table-filter-inline';
const inline = await page.evaluate((sel) => [...document.querySelectorAll(`${sel} thead th`)].map((th) => {
  const slot = th.querySelector('.ax-table-filter-inline');
  const ctl = slot?.querySelector('ax-text-input, ax-number-input, ax-selector, ax-multi-selector, ax-date-input, ax-time-input, ax-tokenizer');
  return {col: th.dataset.columnKey, tag: ctl?.tagName.toLowerCase() ?? null, size: ctl?.querySelector('[data-size]')?.dataset.size ?? ctl?.dataset.size ?? null, below: !!slot && !slot.closest('.ax-table-header-label-row'), clear: !!slot?.querySelector('[data-ax-input-clear], [data-ax-clear]') || null};
}), I);
check('inline: one control per filtered column below the label', JSON.stringify(inline.map((i) => `${i.col}:${i.tag}`)) === JSON.stringify(['name:ax-text-input', 'team:ax-selector', 'status:ax-multi-selector', 'salary:ax-number-input', 'started:ax-date-input', 'skills:ax-tokenizer']) && inline.every((i) => i.below), JSON.stringify(inline));
check('inline controls are sm', inline.every((i) => i.size === 'sm'), JSON.stringify(inline.map((i) => i.size)));
const statusInit = people.filter((p) => p.status !== 'Offline');
const inlineVisible = await visibleNames(I);
check('inline initial MultiSelector filter (Active, Away) with client paging: first 5 matches', JSON.stringify(inlineVisible) === JSON.stringify(statusInit.slice(0, 5).map((p) => p.name)), JSON.stringify(inlineVisible));
check('pagination counts the matching rows', (await page.evaluate((s) => document.querySelector(s).closest('section').querySelector('ax-pagination').totalItems, I)) === statusInit.length);

// Live text filter, per keystroke, inner events stay inside.
await page.click(`${I} thead th[data-column-key="name"] input`);
await page.keyboard.type('zz');
await sleep(80);
ev = await events();
check('inline text commits per keystroke', ev.filter((e) => e.type === 'astryx-filter-change').map((e) => e.detail.value).join() === 'z,zz', JSON.stringify(ev));
check('inline controls’ own astryx-change stays inside the table', ev.every((e) => e.type !== 'astryx-change'), JSON.stringify(ev));
check('filtered empty state: "No data" row shows, no data row visible', (await emptyShown(I)) === true && (await visibleNames(I)).length === 0 && (await page.evaluate((s) => document.querySelector(s).tBodies[0].querySelector('[data-ax-empty-row]').textContent.trim(), I)) === 'No data');
check('pagination hides while nothing (one page) is left', await page.evaluate((s) => [...document.querySelectorAll(`[data-ax-pagination-of]`)].filter((w) => w.closest('section') === document.querySelector(s).closest('section')).every((w) => w.hidden), I));
await page.click(`${I} thead th[data-column-key="name"] [data-ax-input-clear]`);
await sleep(80);
ev = await events();
check('clear button clears the filter (value null)', ev.some((e) => e.type === 'astryx-filter-change' && e.detail.columnKey === 'name' && e.detail.value === null), JSON.stringify(ev));
check('rows come back, empty state hidden', (await emptyShown(I)) === false && (await visibleNames(I)).length === 5);

// Number inline: a draft that parses applies live.
await page.click(`${I} thead th[data-column-key="salary"] input`);
await page.keyboard.type('170000');
await sleep(80);
ev = await events();
const live = ev.filter((e) => e.type === 'astryx-filter-change').map((e) => e.detail.value);
check('inline number applies live as it parses', live.at(-1) === 170000 && live.every((v) => typeof v === 'number'), JSON.stringify(live));
const over170 = statusInit.filter((p) => p.salary >= 170000).map((p) => p.name);
check('rows: status filter AND salary ≥ 170000', JSON.stringify(await visibleNames(I)) === JSON.stringify(over170.slice(0, 5)), JSON.stringify(await visibleNames(I)));
await page.keyboard.press('Tab');
await sleep(80);
check('blur commits the same number: no second event', (await events()).filter((e) => e.type === 'astryx-filter-change').length === 0);
await page.click(`${I} thead th[data-column-key="salary"] [data-ax-input-clear]`);
await sleep(80);
await events();

// Tokenizer: free text becomes a token.
await page.click(`${I} thead th[data-column-key="skills"] input`);
await page.keyboard.type('Go');
await sleep(150);
await page.keyboard.press('Enter');
await sleep(150);
ev = await events();
const tok = ev.filter((e) => e.type === 'astryx-filter-change');
check('Tokenizer without a source: typed text becomes a token → string list value', tok.length === 1 && JSON.stringify(tok[0]?.detail.value) === '["Go"]', JSON.stringify(ev));
const goPeople = statusInit.filter((p) => p.skills.includes('Go')).map((p) => p.name);
check('rows with the Go skill (is any of)', JSON.stringify(await visibleNames(I)) === JSON.stringify(goPeople.slice(0, 5)), JSON.stringify(await visibleNames(I)));
await page.keyboard.press('Escape');

// MultiSelector: clear all statuses → every status.
await page.click(`${I} thead th[data-column-key="status"] [data-ax-input-clear]`);
await sleep(80);
ev = await events();
check('MultiSelector clear → value null', ev.some((e) => e.type === 'astryx-filter-change' && e.detail.columnKey === 'status' && e.detail.value === null), JSON.stringify(ev));
const goAll = people.filter((p) => p.skills.includes('Go')).map((p) => p.name);
check('rows: Go skill, any status', JSON.stringify(await visibleNames(I)) === JSON.stringify(goAll.slice(0, 5)), JSON.stringify(await visibleNames(I)));

// inline-compact placeholders.
const compact = await page.evaluate(() => [...document.querySelectorAll('#table-filter-compact thead th')].map((th) => {
  const ph = th.querySelector('.ax-table-filter-placeholder');
  return ph ? {col: th.dataset.columnKey, hidden: ph.getAttribute('aria-hidden'), h: ph.getBoundingClientRect().height} : {col: th.dataset.columnKey, control: !!th.querySelector('.ax-table-filter-inline ax-text-input, .ax-table-filter-inline ax-selector')};
}));
check('inline-compact: aria-hidden 28px placeholder under the unfiltered column', JSON.stringify(compact) === JSON.stringify([{col: 'name', control: true}, {col: 'role', hidden: 'true', h: 28}, {col: 'team', control: true}]), JSON.stringify(compact));

await done();
