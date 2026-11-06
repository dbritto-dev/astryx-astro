#!/usr/bin/env node
/**
 * Table pagination (useTablePagination, hasClientPaging, paginateData-style links) in a real
 * browser (run `cd apps/docs && npx astro build` first): Pagination rendered above and below
 * with distinct landmark names and alignment, the initial page's rows, page changes and the page
 * size (the Pagination's own cancelable `astryx-change` {page} / `astryx-page-size-change`
 * {pageSize}), the second Pagination following, a prevented change, the `paging` API, paging
 * after client filtering (totals, back to page 1), and links mode.
 *   node tools/tests/table-pagination.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup({width: 1300});
await open('table');

await page.evaluate(() => {
  window.__events = [];
  for (const type of ['astryx-change', 'astryx-page-size-change', 'astryx-filter-change']) {
    document.addEventListener(type, (e) => window.__events.push({type, tag: e.target.tagName, detail: JSON.parse(JSON.stringify(e.detail ?? null, (k, v) => (k === 'event' ? undefined : v)))}));
  }
});
const events = () => page.evaluate(() => window.__events.splice(0));
const T = '#table-paging';
const visible = (sel = T) => page.evaluate((s) => [...document.querySelector(s).tBodies[0].rows].filter((r) => !r.hidden && !r.hasAttribute('data-ax-empty-row')).map((r) => r.cells[0].textContent.trim()), sel);
const all = await page.evaluate((s) => [...document.querySelector(s).tBodies[0].rows].map((r) => r.cells[0].textContent.trim()), T);
const navs = (sel = T) => page.evaluate((s) => {
  const section = document.querySelector(s).closest('section');
  const table = document.querySelector(s).closest('ax-table');
  return [...section.querySelectorAll('.ax-table-pagination')].map((w) => {
    const p = w.querySelector('ax-pagination');
    const r = w.getBoundingClientRect();
    const pr = p.getBoundingClientRect();
    const tr = table.getBoundingClientRect();
    return {side: w.dataset.side, label: p.getAttribute('aria-label'), role: p.getAttribute('role'), page: p.page, pageSize: p.pageSize, total: p.totalItems, hidden: w.hidden,
      gap: Math.round(w.dataset.side === 'below' ? r.top - tr.bottom : tr.top - r.bottom), centered: Math.abs((pr.left + pr.right) / 2 - (r.left + r.right) / 2) < 2,
      current: p.querySelector('[aria-current="page"]')?.textContent.trim() ?? null};
  });
}, sel);

// ── server render ──
let n = await navs();
check('position both: Pagination above and below the table', n.length === 2 && n[0].side === 'above' && n[1].side === 'below', JSON.stringify(n));
check('distinct landmark names "(top)" / "(bottom)"', n[0].label === 'Table pagination (top)' && n[1].label === 'Table pagination (bottom)' && n.every((x) => x.role === 'navigation'), JSON.stringify(n.map((x) => x.label)));
check('wrappers: spacing-2 toward the table, centered', n.every((x) => x.gap === 8 && x.centered), JSON.stringify(n.map((x) => [x.gap, x.centered])));
check('initial page 2 of 5-row pages', n.every((x) => x.page === 2 && x.pageSize === 5 && x.current === '2'), JSON.stringify(n));
check('server render shows only page 2 (rows 6–10)', JSON.stringify(await visible()) === JSON.stringify(all.slice(5, 10)), JSON.stringify(await visible()));
check('page-size Selector rendered (pageSizeOptions)', await page.evaluate((s) => document.querySelector(s).closest('section').querySelectorAll('.ax-table-pagination ax-selector').length === 2, T));

// ── page change on the bottom Pagination ──
await page.click(`${T} >> xpath=ancestor::section//div[@data-side="below"]//button[normalize-space()="3"]`);
await sleep(100);
let ev = await events();
check('astryx-change {page: 3} from the <ax-pagination>', ev.length === 1 && ev[0].type === 'astryx-change' && ev[0].tag === 'AX-PAGINATION' && ev[0].detail.page === 3, JSON.stringify(ev));
check('rows 11–15 shown', JSON.stringify(await visible()) === JSON.stringify(all.slice(10, 15)), JSON.stringify(await visible()));
n = await navs();
check('the top Pagination follows', n[0].page === 3 && n[0].current === '3', JSON.stringify(n[0]));
check('table.paging', JSON.stringify(await page.evaluate((s) => document.querySelector(s).closest('ax-table').paging, T)) === '{"page":3,"pageSize":5}');

// ── prevented change ──
await page.evaluate(() => document.addEventListener('astryx-change', (e) => e.preventDefault(), {once: true}));
await page.click(`${T} >> xpath=ancestor::section//div[@data-side="above"]//button[normalize-space()="4"]`);
await sleep(100);
ev = await events();
check('a prevented page change keeps the rows and both Paginations', ev.length === 1 && JSON.stringify(await visible()) === JSON.stringify(all.slice(10, 15)) && (await navs()).every((x) => x.page === 3), JSON.stringify(ev));

// ── next button (keyboard) ──
await page.focus(`${T} >> xpath=ancestor::section//div[@data-side="above"]//button[@aria-label="Go to next page"]`).catch(() => {});
const focusedNext = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
if (focusedNext === 'Go to next page') {
  await page.keyboard.press('Enter');
  await sleep(100);
  ev = await events();
  check('Next (Enter) → page 4', ev.some((e) => e.type === 'astryx-change' && e.detail.page === 4) && JSON.stringify(await visible()) === JSON.stringify(all.slice(15, 20)), JSON.stringify(ev));
} else {
  check('Next page button found', false, String(focusedNext));
}

// ── page size ──
await page.click(`${T} >> xpath=ancestor::section//div[@data-side="below"]//ax-selector//button`);
await sleep(150);
await page.click(`${T} >> xpath=ancestor::section//div[@data-side="below"]//*[@role="option" and normalize-space()="10"]`);
await sleep(150);
ev = await events();
check('astryx-page-size-change {pageSize: 10} then astryx-change {page: 1}', ev.map((e) => `${e.type}:${JSON.stringify(e.detail)}`).join(' ') === 'astryx-page-size-change:{"pageSize":10} astryx-change:{"page":1}', JSON.stringify(ev));
check('rows 1–10 shown', JSON.stringify(await visible()) === JSON.stringify(all.slice(0, 10)), JSON.stringify(await visible()));
n = await navs();
check('both Paginations at page 1, size 10', n.every((x) => x.page === 1 && x.pageSize === 10), JSON.stringify(n));

// ── API set (silent) ──
await page.evaluate((s) => { document.querySelector(s).closest('ax-table').paging = {page: 2, pageSize: 10}; }, T);
await sleep(50);
check('table.paging = {page: 2} shows rows 11–20 without events', JSON.stringify(await visible()) === JSON.stringify(all.slice(10, 20)) && (await events()).length === 0 && (await navs()).every((x) => x.page === 2));

// ── client filtering + paging ──
const I = '#table-filter-inline';
const statusOk = await page.evaluate((s) => [...document.querySelector(s).tBodies[0].rows].filter((r) => r.dataset.axFilterValues && JSON.parse(r.dataset.axFilterValues).status !== 'Offline').map((r) => ({name: r.cells[0].textContent.trim(), team: JSON.parse(r.dataset.axFilterValues).team})), I);
let fn = await navs(I);
check('filtered paging: total = matching rows, count variant, end-aligned', fn.length === 1 && fn[0].total === statusOk.length && (await page.evaluate((s) => document.querySelector(s).closest('section').querySelector('.ax-table-pagination').dataset.align, I)) === 'end', JSON.stringify(fn));
await page.click(`${I} >> xpath=ancestor::section//div[@data-side="below"]//button[@aria-label="Go to next page"]`);
await sleep(100);
await events();
check('page 2 of the matching rows', JSON.stringify(await visible(I)) === JSON.stringify(statusOk.slice(5, 10).map((p) => p.name)), JSON.stringify(await visible(I)));
// Change a filter: back to page 1, totals follow.
await page.click(`${I} thead th[data-column-key="team"] ax-selector button`);
await sleep(150);
await page.click(`${I} thead th[data-column-key="team"] [role="option"][data-value="Growth"]`);
await sleep(150);
ev = await events();
check('team filter change fires astryx-filter-change', ev.some((e) => e.type === 'astryx-filter-change' && e.detail.columnKey === 'team' && e.detail.value === 'Growth'), JSON.stringify(ev));
const growth = statusOk.filter((p) => p.team === 'Growth').map((p) => p.name);
fn = await navs(I);
check('a filter change returns to page 1 and the total follows', fn[0].page === 1 && fn[0].total === growth.length && JSON.stringify(await visible(I)) === JSON.stringify(growth.slice(0, 5)), JSON.stringify({fn, v: await visible(I), growth}));
check('one page left → the Pagination hides (Astryx renders none)', growth.length <= 5 ? fn[0].hidden === true : fn[0].hidden === false, JSON.stringify(fn));

// ── links mode ──
const links = await page.evaluate(() => {
  const section = document.querySelector('#table-paging-links').closest('section');
  const w = section.querySelector('.ax-table-pagination');
  return {align: w.dataset.align, size: w.querySelector('ax-pagination').dataset.size, hrefs: [...w.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')), rows: document.querySelector('#table-paging-links').tBodies[0].rows.length};
});
check('links mode: page links, sm, start-aligned', links.align === 'start' && links.size === 'sm' && links.hrefs.includes('?people-page=2') && links.hrefs.includes('?people-page=5'), JSON.stringify(links));
check('server-driven paging renders the page it was given', links.rows === 4);

await done();
