#!/usr/bin/env node
/**
 * Table row selection (useTableSelection / useTableSelectionState) and TableSelectionToolbar in
 * a real browser (run `cd apps/docs && npx astro build` first): the selection column (header
 * select-all with indeterminate, named row checkboxes, disabled and non-selectable rows),
 * aria-selected + the inline wash (and its replay on pinned cells), row toggles by click and
 * Space, select-all / deselect-all keeping frozen keys, cancelable events, the
 * `astryx-selection-change` payload, the toolbar (visibility, count, custom count, Clear), the
 * `selectedKeys` API, hasRowHighlight: false. (Astryx has no Shift-range selection.)
 *   node tools/tests/table-selection.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup({width: 1300});
await open('table');

const T = '#table-selection';
await page.evaluate(() => {
  window.__events = [];
  for (const type of ['astryx-select-item', 'astryx-select-all', 'astryx-selection-change', 'astryx-change']) {
    document.addEventListener(type, (e) => window.__events.push({type, tag: e.target.tagName, detail: JSON.parse(JSON.stringify(e.detail, (k, v) => (k === 'event' ? undefined : v)))}));
  }
});
const events = () => page.evaluate(() => window.__events.splice(0));
const state = (tableSel = T) => page.evaluate((sel) => {
  const table = document.querySelector(sel);
  const header = table.querySelector('thead input[data-ax-table-select="all"]');
  const rows = [...table.tBodies[0].rows].map((row) => {
    const input = row.querySelector('input[data-ax-table-select="row"]');
    return {
      key: row.dataset.axSelectionKey, selected: row.getAttribute('aria-selected'), bg: row.style.backgroundColor, overlay: row.style.getPropertyValue('--table-row-overlay'),
      checked: input?.checked ?? null, disabled: input?.getAttribute('aria-disabled') ?? null, indicator: input ? input.parentElement.querySelector('[data-ax-indicator-slot] > *')?.getAttribute('data-checked') ?? null : null,
    };
  });
  const indicator = header?.parentElement.querySelector('[data-ax-indicator-slot] > *')?.getAttribute('data-checked') ?? null;
  return {header: header ? {checked: header.checked, indeterminate: header.indeterminate, indicator} : null, rows, keys: table.closest('ax-table').selectedKeys};
}, tableSel);
const toolbar = (sel = '[data-test="selection-toolbar"]') => page.evaluate((s) => {
  // `data-test` (like every Toolbar attribute) lands on the role="toolbar" row.
  const bar = document.querySelector(s);
  const host = bar.closest('ax-table-selection-toolbar');
  return {hidden: host.hidden, visible: host.getClientRects().length > 0 || !!bar?.getClientRects().length, label: bar?.getAttribute('aria-label'), size: bar?.dataset.size, count: host.querySelector('[data-ax-selection-label]')?.textContent?.trim(), clear: host.querySelector('[data-ax-selection-clear]')?.textContent?.trim()};
}, sel);
const selectedKeys = (s) => s.rows.filter((r) => r.selected === 'true').map((r) => r.key).join(',');

// ── server render ──
let s = await state();
const wiring = await page.evaluate((sel) => {
  const table = document.querySelector(sel);
  const header = table.querySelector('thead input[data-ax-table-select="all"]');
  const firstTh = table.querySelector('thead th');
  const rowInput = table.querySelector('tbody input[data-ax-table-select="row"]');
  const col = firstTh.getBoundingClientRect();
  const box = rowInput.closest('.ax-checkbox-box').getBoundingClientRect();
  const cell = rowInput.closest('td').getBoundingClientRect();
  return {
    headerName: header.labels?.[0]?.textContent?.trim(), rowName: rowInput.labels?.[0]?.textContent?.trim(), colKey: firstTh.dataset.columnKey, width: Math.round(col.width),
    size: rowInput.closest('ax-checkbox-input').dataset.size, centered: Math.abs(box.left + box.width / 2 - (cell.left + cell.width / 2)) <= 1.5,
    features: table.closest('ax-table').dataset.axFeatures,
  };
}, T);
check('selection column: __xds_selection, 36px, small checkboxes centered', wiring.colKey === '__xds_selection' && wiring.width === 36 && wiring.size === 'sm' && wiring.centered && /selection/.test(wiring.features), JSON.stringify(wiring));
check('header named "Select all rows"; rows "Select <getRowLabel>"', wiring.headerName === 'Select all rows' && wiring.rowName === 'Select Alice Chen', JSON.stringify(wiring));
check('server state: header indeterminate (1 of 7 enabled), selected rows aria-selected (incl. a disabled one)', s.header.indeterminate && s.header.indicator === 'indeterminate' && selectedKeys(s) === 'p02,p05', JSON.stringify(s.header));
const bob = s.rows.find((r) => r.key === 'p02');
const elena = s.rows.find((r) => r.key === 'p05');
check('selected rows carry the inline accent wash, republished as --table-row-overlay', bob.bg !== '' && bob.overlay.includes('--color-accent-muted') && bob.checked && bob.indicator === 'checked', JSON.stringify(bob));
check('a disabled row: aria-disabled checkbox, still selected', elena.disabled === 'true' && elena.checked && elena.selected === 'true', JSON.stringify(elena));
check('the complete selection includes keys outside the rows', JSON.stringify(s.keys) === '["p02","p05","p99"]', JSON.stringify(s.keys));
let tb = await toolbar();
check('toolbar: visible with a selection, role=toolbar "Bulk actions" size sm, "3 selected", "Unselect All"', !tb.hidden && tb.label === 'Bulk actions' && tb.size === 'sm' && tb.count === '3 selected' && tb.clear === 'Unselect All', JSON.stringify(tb));
const pinned = await page.evaluate((sel) => {
  const row = document.querySelector(`${sel} tbody tr[data-ax-selection-key="p02"]`);
  const cell = row.querySelector('td');
  return {pinned: cell.classList.contains('ax-table-pinned'), replay: getComputedStyle(cell, '::before').backgroundColor, row: getComputedStyle(row).backgroundColor};
}, T);
check('pinned selection cell replays the wash (--table-row-overlay)', pinned.pinned && pinned.replay === pinned.row && pinned.row !== 'rgba(0, 0, 0, 0)', JSON.stringify(pinned));

// ── row toggles ──
await page.click(`${T} tr[data-ax-selection-key="p01"] input`);
s = await state();
let ev = await events();
check('row click: astryx-select-item {key, isSelected}, then astryx-selection-change {selectedKeys, selectedCount, hasSelection}',
  ev.length === 2 && ev[0].type === 'astryx-select-item' && ev[0].tag === 'AX-TABLE' && ev[0].detail.key === 'p01' && ev[0].detail.isSelected === true
  && ev[1].type === 'astryx-selection-change' && JSON.stringify(ev[1].detail) === JSON.stringify({selectedKeys: ['p02', 'p05', 'p99', 'p01'], selectedCount: 4, hasSelection: true}), JSON.stringify(ev));
check('the row is selected (aria-selected + wash); header stays indeterminate', s.rows[0].selected === 'true' && s.rows[0].bg !== '' && s.header.indeterminate, JSON.stringify(s.rows[0]));
check('the checkboxes\' own astryx-change stays inside the table', ev.every((e) => e.type !== 'astryx-change'), JSON.stringify(ev));
tb = await toolbar();
check('toolbar count follows: "4 selected"', tb.count === '4 selected', JSON.stringify(tb));

await page.focus(`${T} tr[data-ax-selection-key="p03"] input`);
await page.keyboard.press('Space');
s = await state();
ev = await events();
check('keyboard: Space on a focused row checkbox selects the row', s.rows[2].selected === 'true' && ev[0]?.detail.key === 'p03', JSON.stringify(ev));
await page.keyboard.press('Space');
s = await state();
ev = await events();
check('Space again deselects it (aria-selected and wash removed)', s.rows[2].selected === null && s.rows[2].bg === '' && s.rows[2].overlay === '' && ev[0]?.detail.isSelected === false, JSON.stringify(s.rows[2]));

// Cancelable: preventDefault keeps the state.
await page.evaluate((sel) => document.querySelector(sel).closest('ax-table').addEventListener('astryx-select-item', (e) => e.preventDefault(), {once: true}), T);
await page.click(`${T} tr[data-ax-selection-key="p04"] input`);
s = await state();
ev = await events();
check('preventDefault on astryx-select-item keeps the row (and its checkbox) unselected', s.rows[3].selected === null && s.rows[3].checked === false && s.rows[3].indicator === null && ev.length === 1, JSON.stringify({row: s.rows[3], ev}));

// ── select all / deselect all ──
await page.click(`${T} thead input[data-ax-table-select="all"]`);
s = await state();
ev = await events();
check('header (indeterminate) → astryx-select-all {isAllSelected: true}', ev[0]?.type === 'astryx-select-all' && ev[0].detail.isAllSelected === true, JSON.stringify(ev));
check('select-all selects every enabled row; frozen keys stay; header checked', s.rows.every((r) => r.selected === 'true' && r.checked) && s.header.checked && !s.header.indeterminate && s.header.indicator === 'checked'
  && ev[1]?.detail.selectedCount === 9 && ev[1].detail.selectedKeys.includes('p99'), JSON.stringify({header: s.header, ev}));
tb = await toolbar();
check('toolbar: "9 selected"', tb.count === '9 selected', JSON.stringify(tb));
await page.click(`${T} thead input[data-ax-table-select="all"]`);
s = await state();
ev = await events();
check('header (checked) → deselect all: the disabled row and the outside key stay', ev[0]?.detail.isAllSelected === false && selectedKeys(s) === 'p05' && JSON.stringify(s.keys) === '["p05","p99"]' && s.header.checked === false && !s.header.indeterminate, JSON.stringify({keys: s.keys, header: s.header}));
await page.evaluate((sel) => document.querySelector(sel).closest('ax-table').addEventListener('astryx-select-all', (e) => e.preventDefault(), {once: true}), T);
await page.click(`${T} thead input[data-ax-table-select="all"]`);
s = await state();
ev = await events();
check('preventDefault on astryx-select-all restores the header', ev.length === 1 && !s.header.checked && !s.header.indeterminate && selectedKeys(s) === 'p05', JSON.stringify({ev, header: s.header}));

// ── toolbar Clear + API ──
tb = await toolbar();
check('toolbar: "2 selected"', tb.count === '2 selected', JSON.stringify(tb));
await page.click('[data-test="selection-toolbar"] [data-ax-selection-clear]');
s = await state();
ev = await events();
tb = await toolbar();
check('Unselect All clears the complete selection: astryx-selection-change {selectedKeys: []}', ev.length === 1 && ev[0].type === 'astryx-selection-change' && ev[0].detail.selectedCount === 0 && ev[0].detail.hasSelection === false && s.rows.every((r) => r.selected === null && !r.checked) && JSON.stringify(s.keys) === '[]', JSON.stringify({ev, keys: s.keys}));
check('the toolbar hides without a selection', tb.hidden && !tb.visible, JSON.stringify(tb));
await page.evaluate((sel) => { document.querySelector(sel).closest('ax-table').selectedKeys = ['p04', 'p06']; }, T);
s = await state();
ev = await events();
tb = await toolbar();
check('table.selectedKeys = […] selects rows without an astryx event; the toolbar follows', selectedKeys(s) === 'p04,p06' && s.header.indeterminate && ev.length === 0 && !tb.hidden && tb.count === '2 selected', JSON.stringify({ev, tb}));

// ── hasRowHighlight: false, non-selectable rows, custom count ──
const P = '#table-selection-plain';
s = await state(P);
let tbPlain = await toolbar('[data-test="selection-toolbar-plain"]');
check('non-selectable rows render no checkbox; toolbar hidden with nothing selected', s.rows[1].checked === null && s.rows.filter((r) => r.checked !== null).length === 4 && tbPlain.hidden, JSON.stringify({rows: s.rows, tbPlain}));
await page.click(`${P} tr[data-ax-selection-key="p01"] input`);
s = await state(P);
tbPlain = await toolbar('[data-test="selection-toolbar-plain"]');
const custom = await page.evaluate(() => document.querySelector('[data-test="selection-toolbar-plain"] [data-selected-count]')?.textContent);
check('hasRowHighlight: false — aria-selected set, no wash', s.rows[0].selected === 'true' && s.rows[0].bg === '' && s.rows[0].overlay === '', JSON.stringify(s.rows[0]));
check('custom selectionLabel: [data-selected-count] kept current; label, clearLabel and size md', !tbPlain.hidden && custom === '1' && tbPlain.count === '1 chosen' && tbPlain.label === 'Team actions' && tbPlain.clear === 'Clear' && tbPlain.size === 'md', JSON.stringify({tbPlain, custom}));
await page.click(`${P} thead input[data-ax-table-select="all"]`);
s = await state(P);
check('select-all skips non-selectable rows', s.rows.filter((r) => r.selected === 'true').map((r) => r.key).join(',') === 'p01,p03,p04,p05' && s.header.checked, JSON.stringify(s.rows));
const count = await page.evaluate(() => document.querySelector('[data-test="selection-toolbar-plain"] [data-selected-count]')?.textContent);
check('custom count follows select-all', count === '4', String(count));
await events();

// ── keyboard order: header first, then the rows ──
await page.focus(`${T} thead input[data-ax-table-select="all"]`);
await page.keyboard.press('Tab');
const next = await page.evaluate(() => document.activeElement?.closest('tr')?.dataset.axSelectionKey);
check('Tab moves from the header checkbox to the first row checkbox', next === 'p01', String(next));
await sleep(10);

await done();
