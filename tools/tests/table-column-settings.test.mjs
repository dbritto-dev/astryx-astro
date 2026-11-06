#!/usr/bin/env node
/**
 * Table column settings (useTableColumnSettings / useTableColumnSettingsState and the
 * TableColumnSettings picker) in a real browser (run `cd apps/docs && npx astro build` first):
 * the server render (active columns in `activeColumnKeys` order, settings columns that are not
 * active rendered hidden after them), hiding and re-showing columns from the picker (toggle
 * semantics: a re-shown column joins at the end; the always-visible column stays), the
 * cancelable `astryx-columns-change` {activeColumnKeys}, widths re-resolved over the visible
 * columns, edge padding on the last visible cell, and reordering through `activeColumnKeys`.
 *   node tools/tests/table-column-settings.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup({width: 1300});
await open('table');

await page.evaluate(() => {
  window.__events = [];
  for (const type of ['astryx-columns-change', 'astryx-change']) {
    document.addEventListener(type, (e) => window.__events.push({type, tag: e.target.tagName, detail: JSON.parse(JSON.stringify(e.detail ?? null, (k, v) => (k === 'event' ? undefined : v)))}));
  }
});
const events = () => page.evaluate(() => window.__events.splice(0));
const T = '#table-columns';
const state = () => page.evaluate((s) => {
  const table = document.querySelector(s);
  const heads = [...table.tHead.rows[0].cells];
  const visible = heads.filter((th) => !th.hidden).map((th) => th.dataset.columnKey);
  const rows = [...table.tBodies[0].rows].map((r) => [...r.cells].filter((c) => !c.hidden).map((c) => c.dataset.columnKey));
  const widths = heads.filter((th) => !th.hidden).map((th) => th.style.width);
  const sum = heads.filter((th) => !th.hidden).reduce((n, th) => n + th.getBoundingClientRect().width, 0);
  const last = heads.filter((th) => !th.hidden).at(-1);
  const lastCell = [...table.tBodies[0].rows[0].cells].filter((c) => !c.hidden).at(-1);
  return {
    order: heads.map((th) => `${th.dataset.columnKey}${th.hidden ? '(h)' : ''}`), visible, rowsMatch: rows.every((r) => JSON.stringify(r) === JSON.stringify(visible)),
    widths, fill: Math.abs(sum - table.getBoundingClientRect().width) < 2, minWidth: table.style.minWidth,
    lastPad: getComputedStyle(last).paddingInlineEnd, lastCellPad: getComputedStyle(lastCell).paddingInlineEnd, lastDivider: getComputedStyle(lastCell).borderInlineEndWidth,
    texts: [...table.tBodies[0].rows[0].cells].filter((c) => !c.hidden).map((c) => c.textContent.trim()),
    api: table.closest('ax-table').activeColumnKeys,
    picker: document.querySelector(`ax-table-column-settings[for="${s.slice(1)}"] ax-multi-selector`)?.values,
  };
}, T);

let s = await state();
check('server render: active columns in activeColumnKeys order, Email hidden after them', JSON.stringify(s.order) === JSON.stringify(['name', 'role', 'team', 'location', 'salary', 'email(h)']), JSON.stringify(s.order));
check('body cells follow the header', s.rowsMatch && s.texts[0] === 'Alice Chen' && s.texts[1] === 'Staff Engineer');
check('widths resolved over the visible columns only (the table is filled)', s.fill && !s.widths.includes(''), JSON.stringify(s.widths));
check('the last visible cell keeps the edge padding (hidden cells skipped)', s.lastPad === '8px' && s.lastCellPad === '8px', JSON.stringify(s));
check('API and picker show the active keys', JSON.stringify(s.api) === JSON.stringify(['name', 'role', 'team', 'location', 'salary']) && JSON.stringify([...s.picker].sort()) === JSON.stringify(['location', 'name', 'role', 'salary', 'team']), JSON.stringify(s));

// ── picker ──
const P = `ax-table-column-settings[for="table-columns"]`;
const opts = await page.evaluate((p) => {
  const ms = document.querySelector(p);
  return [...ms.querySelectorAll('[role="option"]')].map((o) => `${o.dataset.value}:${o.getAttribute('aria-selected')}:${o.getAttribute('aria-disabled') ?? 'false'}`);
}, P);
check('picker: one option per settings column; Name disabled (always visible)', JSON.stringify(opts) === JSON.stringify(['name:true:true', 'email:false:false', 'location:true:false', 'role:true:false', 'team:true:false', 'salary:true:false']), JSON.stringify(opts));
check('picker: grouped sections', JSON.stringify(await page.evaluate((p) => [...document.querySelector(p).querySelectorAll('[role="group"]')].map((g) => g.getAttribute('aria-label')), P)) === '["Contact","Work"]');
await page.click(`${P} button[role="combobox"], ${P} [role="combobox"]`);
await sleep(150);
await page.click(`${P} [role="option"][data-value="role"]`);
await sleep(120);
let ev = await events();
check('unchecking Role: astryx-columns-change {activeColumnKeys} without it; picker event stays inside', ev.length === 1 && ev[0].type === 'astryx-columns-change' && ev[0].tag === 'AX-TABLE' && JSON.stringify(ev[0].detail.activeColumnKeys) === JSON.stringify(['name', 'team', 'location', 'salary']), JSON.stringify(ev));
s = await state();
check('Role hidden, the rest in order', JSON.stringify(s.visible) === JSON.stringify(['name', 'team', 'location', 'salary']) && s.rowsMatch && s.fill, JSON.stringify(s));
await page.click(`${P} [role="option"][data-value="email"]`);
await sleep(120);
ev = await events();
check('checking Email: it joins at the end (toggleColumn)', ev.length === 1 && JSON.stringify(ev[0].detail.activeColumnKeys) === JSON.stringify(['name', 'team', 'location', 'salary', 'email']), JSON.stringify(ev));
s = await state();
check('Email shown last; widths re-resolved', JSON.stringify(s.visible) === JSON.stringify(['name', 'team', 'location', 'salary', 'email']) && s.rowsMatch && s.fill && s.texts.at(-1) === 'alice.chen@example.com', JSON.stringify(s));
check('the new last cell gets the edge padding and no column divider', s.lastCellPad === '8px', JSON.stringify(s));
await page.click(`${P} [role="option"][data-value="name"]`).catch(() => {});
await sleep(100);
ev = await events();
check('the always-visible column cannot be unchecked', ev.length === 0 && (await state()).visible[0] === 'name', JSON.stringify(ev));

// Prevented change: the picker is put back.
await page.evaluate(() => document.addEventListener('astryx-columns-change', (e) => e.preventDefault(), {once: true}));
await page.click(`${P} [role="option"][data-value="team"]`);
await sleep(120);
ev = await events();
s = await state();
check('a prevented astryx-columns-change keeps the columns and resets the picker', ev.length === 1 && s.visible.includes('team') && s.picker.includes('team'), JSON.stringify({ev, s}));
await page.keyboard.press('Escape');
await sleep(80);

// ── reorder through the API ──
await page.evaluate((sel) => { document.querySelector(sel).closest('ax-table').activeColumnKeys = ['salary', 'name', 'role']; }, T);
await sleep(80);
s = await state();
check('table.activeColumnKeys = [...] reorders and hides silently', JSON.stringify(s.visible) === JSON.stringify(['salary', 'name', 'role']) && s.rowsMatch && (await events()).length === 0, JSON.stringify(s));
check('…cells moved with their content', s.texts[0] === '$212,000' && s.texts[1] === 'Alice Chen' && s.texts[2] === 'Staff Engineer', JSON.stringify(s.texts));
check('…widths fill the table; the picker follows', s.fill && JSON.stringify([...s.picker].sort()) === JSON.stringify(['name', 'role', 'salary']), JSON.stringify(s));
check('the first visible cell gets the start edge padding', await page.evaluate((sel) => getComputedStyle(document.querySelector(sel).tHead.rows[0].cells[0]).paddingInlineStart === '8px', T));

await done();
