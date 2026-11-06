#!/usr/bin/env node
/**
 * Pagination: generatePageRange (ellipsis math, Astryx's own cases), SSR semantics, buttons mode
 * (page / prev / next / first / last clicks, astryx-change {page} + veto, keyed re-render keeping
 * focus, prev/next enablement + tooltips, polite announcement), page-size Selector
 * (astryx-page-size-change then page 1), count / compact text, dots radio group (roving,
 * selection follows focus, click), input variant (clamp, commit, first/last), step labels and
 * stride, disabled, links mode (hrefs, aria-current, input navigation), inner events stopped,
 * translated strings (es-ES).
 *   node tools/tests/pagination.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {generatePageRange} = await import('../../packages/astryx-astro/src/components/Pagination/pageRange.ts');
const {page, check, open, done, port} = await setup();

console.log('generatePageRange');
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
check('(5, 10, 1) → [1, …, 4, 5, 6, …, 10]', eq(generatePageRange(5, 10, 1), [1, '...', 4, 5, 6, '...', 10]));
check('(1, 10, 1) → [1 … 5, …, 10] (near the start)', eq(generatePageRange(1, 10, 1), [1, 2, 3, 4, 5, '...', 10]));
check('(10, 10, 1) → [1, …, 6 … 10] (near the end)', eq(generatePageRange(10, 10, 1), [1, '...', 6, 7, 8, 9, 10]));
check('(1, 5, 1) → all pages', eq(generatePageRange(1, 5, 1), [1, 2, 3, 4, 5]));
check('(4, 7, 1) → 7 fits the 7 slots', eq(generatePageRange(4, 7, 1), [1, 2, 3, 4, 5, 6, 7]));
check('(10, 20, 2) → siblings 2', eq(generatePageRange(10, 20, 2), [1, '...', 8, 9, 10, 11, 12, '...', 20]));
check('(4, 20, 1) → [1, …, 3, 4, 5, …, 20] (Astryx: an ellipsis may stand for one page)', eq(generatePageRange(4, 20, 1), [1, '...', 3, 4, 5, '...', 20]));
check('(3, 20, 1) → near the start', eq(generatePageRange(3, 20, 1), [1, 2, 3, 4, 5, '...', 20]));

await open('pagination');
await page.evaluate(() => {
  window.__events = [];
  for (const type of ['astryx-change', 'astryx-page-size-change']) {
    document.addEventListener(type, (e) => window.__events.push(`${type === 'astryx-change' ? 'change' : 'size'}:${e.target.id || e.target.tagName.toLowerCase()}:${e.detail.page ?? e.detail.pageSize ?? e.detail.value}`));
  }
});
const events = () => page.evaluate(() => window.__events.splice(0));
const pages = (id) => page.evaluate((id) => [...document.querySelectorAll(`#${id} .ax-pagination-controls > [data-ax-pagination-item]`)]
  .map((el) => (el.hasAttribute('data-page') ? (el.getAttribute('aria-current') === 'page' ? `[${el.textContent.trim()}]` : el.textContent.trim()) : '…')).join(' '), id);
const nav = (id, kind) => `#${id} [data-ax-nav="${kind}"]`;
const navState = (id) => page.evaluate((id) => Object.fromEntries([...document.querySelectorAll(`#${id} [data-ax-nav]`)].map((b) => {
  const tip = document.getElementById(b.dataset.axNavTip ?? b.dataset.axTooltip ?? '');
  return [b.dataset.axNav, `${b.disabled ? 'off' : 'on'}${b.hidden ? '/hidden' : ''}${tip ? (tip.getAttribute('data-ax-enabled') === 'false' ? '/tip-off' : '/tip-on') : ''}`];
})), id);
const polite = () => page.evaluate(() => document.querySelector('[data-astryx-live-region="polite"]')?.textContent ?? '');

console.log('SSR');
check('root: named navigation landmark with variant/size hooks', await page.evaluate(() => {
  const el = document.getElementById('pg-pages');
  return el.getAttribute('role') === 'navigation' && el.getAttribute('aria-label') === 'Pagination' && el.classList.contains('astryx-pagination') && el.dataset.variant === 'pages' && el.dataset.size === 'md';
}));
check('page 5 of 20: 1 … 4 [5] 6 … 20', (await pages('pg-pages')) === '1 … 4 [5] 6 … 20', await pages('pg-pages'));
check('page buttons are named "Go to page N", ellipses aria-hidden', await page.evaluate(() => {
  const items = [...document.querySelectorAll('#pg-pages [data-ax-pagination-item]')];
  return items.filter((i) => i.dataset.page).every((b) => b.getAttribute('aria-label') === `Go to page ${b.dataset.page}`) && items.filter((i) => !i.dataset.page).every((e) => e.getAttribute('aria-hidden') === 'true');
}));
check('prev / next: ghost icon-only, labelled, enabled with tooltips', await page.evaluate(() => {
  const p = document.querySelector('#pg-pages [data-ax-nav="previous"]');
  const n = document.querySelector('#pg-pages [data-ax-nav="next"]');
  return p.getAttribute('aria-label') === 'Go to previous page' && n.getAttribute('aria-label') === 'Go to next page' && p.dataset.variant === 'ghost' && p.hasAttribute('data-ax-icon-only') &&
    p.dataset.axTooltip && document.getElementById(p.dataset.axTooltip)?.textContent.trim() === 'Go to previous page';
}));
const startNav = await navState('pg-start');
check('page 1: previous natively disabled, no tooltip; next enabled', startNav.previous === 'off/tip-off' && startNav.next === 'on/tip-on', JSON.stringify(startNav));

console.log('Buttons mode: clicks');
await page.click('#pg-pages [data-page="6"]');
const kept = await page.evaluate(() => document.activeElement?.dataset?.page);
check('click page 6 → astryx-change {page: 6}', (await events()).join() === 'change:pg-pages:6');
check('re-rendered: 1 … 5 [6] 7 … 20; the pressed button kept focus', (await pages('pg-pages')) === '1 … 5 [6] 7 … 20' && kept === '6', `${await pages('pg-pages')} focus=${kept}`);
check('active page: aria-current="page" + neutral fill', await page.evaluate(() => {
  const b = document.querySelector('#pg-pages [data-page="6"]');
  return b.getAttribute('aria-current') === 'page' && b.hasAttribute('data-ax-active-page') && getComputedStyle(b).backgroundColor !== 'rgba(0, 0, 0, 0)';
}));
await sleep(50);
check('announced politely: "Page 6 of 20"', (await polite()).includes('Page 6 of 20'), await polite());
check('demo log', (await page.textContent('#pg-log')) === 'page: 6');
await page.click(nav('pg-pages', 'next'));
check('next → 7', (await events()).join() === 'change:pg-pages:7' && (await pages('pg-pages')) === '1 … 6 [7] 8 … 20');
await page.click(nav('pg-pages', 'previous'));
await page.click(nav('pg-pages', 'previous'));
check('previous twice → 5', (await events()).join() === 'change:pg-pages:6,change:pg-pages:5');
await page.click('#pg-pages [data-page="1"]');
check('page 1 → [1] 2 3 4 5 … 20 and previous disabled', (await pages('pg-pages')) === '[1] 2 3 4 5 … 20' && (await navState('pg-pages')).previous === 'off/tip-off');
await page.click('#pg-pages [data-page="20"]');
check('page 20 → 1 … 16 17 18 19 [20], next disabled, previous back on', (await pages('pg-pages')) === '1 … 16 17 18 19 [20]' && (await navState('pg-pages')).next === 'off/tip-off' && (await navState('pg-pages')).previous === 'on/tip-on');
await events();
await page.evaluate(() => document.getElementById('pg-pages').addEventListener('astryx-change', (e) => e.preventDefault(), {once: true}));
await page.click('#pg-pages [data-page="17"]');
check('preventDefault() keeps the page', (await pages('pg-pages')) === '1 … 16 17 18 19 [20]');
await events();
await page.click(nav('pg-start', 'next'));
check('pg-start: next → 2 and previous becomes enabled with its tooltip', (await navState('pg-start')).previous === 'on/tip-on' && (await events()).join() === 'change:pg-start:2');
check('API: el.page = 9 re-renders silently', await page.evaluate(() => { const el = document.getElementById('pg-start'); el.page = 9; return el.page; }) === 9 && (await pages('pg-start')) === '1 … 6 7 8 [9] 10' && (await events()).length === 0);
check('a moved element keeps its page', await page.evaluate(() => { const el = document.getElementById('pg-start'); el.parentElement.append(el); return el.page; }) === 9);
await page.click(nav('pg-start', 'next'));
check('…and keeps working', (await events()).join() === 'change:pg-start:10' && (await navState('pg-start')).next.startsWith('off'));

console.log('Page size + count');
check('count: "1–25 of 137"', (await page.textContent('#pg-count .ax-pagination-info')).trim() === '1–25 of 137');
await page.click('#pg-count ax-selector [role="combobox"]');
await sleep(120);
await page.click('#pg-count ax-combobox-layer [role="option"][data-value="50"]');
await sleep(80);
check('picking 50: astryx-page-size-change {pageSize: 50}, then astryx-change {page: 1}', (await events()).join() === 'size:pg-count:50,change:pg-count:1');
check('count re-renders "1–50 of 137"', (await page.textContent('#pg-count .ax-pagination-info')).trim() === '1–50 of 137');
await page.click(nav('pg-count', 'next'));
check('next → "51–100 of 137"', (await page.textContent('#pg-count .ax-pagination-info')).trim() === '51–100 of 137');
await page.click(nav('pg-count', 'next'));
check('last page "101–137 of 137", next disabled', (await page.textContent('#pg-count .ax-pagination-info')).trim() === '101–137 of 137' && (await navState('pg-count')).next.startsWith('off'));
await events();
await page.evaluate(() => document.getElementById('pg-count').addEventListener('astryx-page-size-change', (e) => e.preventDefault(), {once: true}));
await page.click('#pg-count ax-selector [role="combobox"]');
await sleep(120);
await page.click('#pg-count ax-combobox-layer [role="option"][data-value="10"]');
await sleep(80);
check('vetoed page size: the Selector snaps back, the page stays', (await page.evaluate(() => document.querySelector('#pg-count ax-selector').value)) === '50' && (await events()).join() === 'size:pg-count:10' && (await page.textContent('#pg-count .ax-pagination-info')).trim() === '101–137 of 137');

console.log('Compact, none, cursor');
check('compact "Page 3 of 12"; first/last only with hasFirstLast', (await page.textContent('#pg-compact .ax-pagination-info')).trim() === 'Page 3 of 12' && !(await page.$('#pg-compact [data-ax-nav="first"]')) && !!(await page.$('#pg-compact-fl [data-ax-nav="first"]')));
await page.click(nav('pg-compact-fl', 'last'));
check('compact last → "Page 12 of 12", next/last off, first on', (await page.textContent('#pg-compact-fl .ax-pagination-info')).trim() === 'Page 12 of 12' && (await navState('pg-compact-fl')).last.startsWith('off') && (await navState('pg-compact-fl')).first.startsWith('on'));
await page.click(nav('pg-compact-fl', 'first'));
check('compact first → "Page 1 of 12"', (await page.textContent('#pg-compact-fl .ax-pagination-info')).trim() === 'Page 1 of 12');
await events();
await page.click(nav('pg-cursor', 'next'));
await sleep(50);
check('cursor paging (hasMore): next → page 2, announced "Page 2"', (await events()).join() === 'change:pg-cursor:2' && (await polite()).includes('Page 2'), await polite());
await page.evaluate(() => { document.getElementById('pg-cursor').hasMore = false; });
check('el.hasMore = false disables next', (await navState('pg-cursor')).next.startsWith('off'));

console.log('Dots (radio group)');
const dots = (id) => page.evaluate((id) => {
  const g = document.querySelector(`#${id} [role="radiogroup"]`);
  const all = [...g.querySelectorAll('[role="radio"]')];
  return {
    checked: all.filter((d) => d.getAttribute('aria-checked') === 'true').map((d) => d.dataset.page).join(),
    active: all.filter((d) => d.dataset.active === 'active').map((d) => d.dataset.page).join(),
    stops: all.filter((d) => d.getAttribute('tabindex') === '0').map((d) => d.dataset.page).join(),
    focused: document.activeElement?.dataset?.page,
    label: g.getAttribute('aria-label'),
    names: all.map((d) => d.getAttribute('aria-label')).join('|'),
  };
}, id);
let d = await dots('pg-dots');
check('radiogroup "Page indicators" of radios "Page N"; page 2 checked, the only stop', d.label === 'Page indicators' && d.names.startsWith('Page 1|Page 2') && d.checked === '2' && d.active === '2' && d.stops === '2', JSON.stringify(d));
await page.focus('#pg-dots [data-page="2"]');
check('focusing the current dot changes nothing', (await events()).length === 0);
await page.keyboard.press('ArrowRight');
d = await dots('pg-dots');
check('ArrowRight → page 3 (selection follows focus)', d.checked === '3' && d.focused === '3' && d.stops === '3' && (await events()).join() === 'change:pg-dots:3', JSON.stringify(d));
await page.keyboard.press('End');
check('End → 6', (await dots('pg-dots')).checked === '6');
await page.keyboard.press('ArrowRight');
check('ArrowRight wraps → 1', (await dots('pg-dots')).checked === '1');
await page.keyboard.press('Home');
await page.keyboard.press('ArrowLeft');
check('ArrowLeft wraps → 6', (await dots('pg-dots')).checked === '6');
await events();
await page.click('#pg-dots [data-page="4"]');
d = await dots('pg-dots');
check('click → 4 (and focuses it)', d.checked === '4' && d.focused === '4' && (await events()).join() === 'change:pg-dots:4', JSON.stringify(d));
await page.click(nav('pg-dots', 'next'));
check('next → 5 moves the checked dot', (await dots('pg-dots')).checked === '5');
check('sm dots are smaller', await page.evaluate(() => document.querySelector('#pg-dots-sm .astryx-pagination-dot').getBoundingClientRect().width < document.querySelector('#pg-dots .astryx-pagination-dot').getBoundingClientRect().width));
await events();

console.log('Input variant');
const input = '#pg-input input[role="spinbutton"]';
check('"Page [4] / 20" with first/last; the box is named "Go to page"', await page.evaluate(() => {
  const el = document.getElementById('pg-input');
  const i = el.querySelector('input[role="spinbutton"]');
  const label = document.getElementById(i.getAttribute('aria-labelledby')?.split(' ')[0] ?? '') ?? el.querySelector(`label[for="${i.id}"]`);
  return el.querySelector('.astryx-pagination-input-label').textContent === 'Page' && el.querySelector('.astryx-pagination-input-label').getAttribute('aria-hidden') === 'true' &&
    el.querySelector('.astryx-pagination-input-total').textContent === '/ 20' && i.value === '4' && label?.textContent.includes('Go to page') &&
    !!el.querySelector('[data-ax-nav="first"]') && !!el.querySelector('[data-ax-nav="last"]');
}));
await page.fill(input, '99');
await page.keyboard.press('Enter');
await sleep(50);
check('typing 99 + Enter clamps to 20 → astryx-change {page: 20} (the NumberInput\'s own event stops at the root)', (await events()).join() === 'change:pg-input:20' && (await page.inputValue(input)) === '20');
check('next and last disabled at 20', (await navState('pg-input')).next.startsWith('off') && (await navState('pg-input')).last.startsWith('off'));
await page.click(nav('pg-input', 'first'));
check('first → 1; the box shows 1', (await page.inputValue(input)) === '1' && (await events()).join() === 'change:pg-input:1');
await page.fill(input, '1');
await page.keyboard.press('Enter');
check('committing the current page fires nothing', (await events()).length === 0);
check('step=5: "Go forward 5 pages" / "Go back 5 pages"', await page.evaluate(() =>
  document.querySelector('#pg-input-sm [data-ax-nav="next"]').getAttribute('aria-label') === 'Go forward 5 pages' &&
  document.querySelector('#pg-input-sm [data-ax-nav="previous"]').getAttribute('aria-label') === 'Go back 5 pages' &&
  document.querySelector('#pg-input-sm .astryx-pagination-input-label').textContent === 'Row'));
await page.click(nav('pg-input-sm', 'next'));
check('step 5: 7 → 12', (await events()).join() === 'change:pg-input-sm:12' && (await page.inputValue('#pg-input-sm input[role="spinbutton"]')) === '12');
check('cursor input: the box is disabled, first/last absent', await page.evaluate(() => {
  const el = document.getElementById('pg-input-cursor');
  return el.querySelector('input[role="spinbutton"]').getAttribute('aria-disabled') === 'true' && el.querySelector('[data-ax-nav="first"]').hidden && !el.querySelector('.astryx-pagination-input-total:not([hidden])');
}));

console.log('Disabled');
check('every control disabled; dots aria-disabled', await page.evaluate(() =>
  [...document.querySelectorAll('#pg-disabled button')].every((b) => b.disabled) &&
  [...document.querySelectorAll('#pg-dots-disabled [role="radio"]')].every((r) => r.getAttribute('aria-disabled') === 'true')));
await page.click('#pg-dots-disabled [data-page="5"]', {force: true});
await page.keyboard.press('ArrowRight');
check('disabled dots: no change', (await events()).length === 0 && (await dots('pg-dots-disabled')).checked === '3');

console.log('i18n');
check('es-ES: "21–40 de 1234", landmark "Paginación"', await page.evaluate(() => {
  const el = document.getElementById('pg-es');
  return el.querySelector('.ax-pagination-info').textContent.trim() === '21–40 de 1234' && el.getAttribute('aria-label') !== 'Pagination';
}), await page.evaluate(() => `${document.querySelector('#pg-es .ax-pagination-info').textContent.trim()} / ${document.getElementById('pg-es').getAttribute('aria-label')}`));
check('RTL: chevrons mirror', await page.evaluate(() => getComputedStyle(document.querySelector('#pg-rtl [data-ax-nav="previous"] .ax-mirror-rtl')).transform !== 'none'));

console.log('Links mode');
check('page numbers, prev/next are links; current is aria-current="page"', await page.evaluate(() => {
  const el = document.getElementById('pg-links');
  const items = [...el.querySelectorAll('[data-ax-pagination-item][data-page]')];
  return items.every((a) => a.tagName === 'A' && a.getAttribute('href') === `?page=${a.dataset.page}#pg-links`) &&
    items.find((a) => a.dataset.page === '4').getAttribute('aria-current') === 'page' &&
    el.querySelector('[data-ax-nav="previous"]').getAttribute('href') === '?page=3#pg-links' &&
    el.querySelector('[data-ax-nav="next"]').getAttribute('href') === '?page=5#pg-links' && !el.querySelector('template');
}));
check('links dots: a group of links, the current one aria-current="page"', await page.evaluate(() => {
  const g = document.querySelector('#pg-links-dots .ax-pagination-dots');
  const links = [...g.querySelectorAll('a')];
  return g.getAttribute('role') === 'group' && links.length === 5 && links[1].getAttribute('aria-current') === 'page' && links[0].getAttribute('href') === '?page=1#pg-links-dots';
}));
await Promise.all([page.waitForURL(/page=5/, {timeout: 3000}).catch(() => {}), page.click('#pg-links [data-page="5"]')]);
check('clicking a page link navigates', page.url().includes('?page=5'), page.url());
await open('pagination');
await page.fill('#pg-links-input input[role="spinbutton"]', '17');
await Promise.all([page.waitForURL(/page=17/, {timeout: 3000}).catch(() => {}), page.keyboard.press('Enter')]);
check('links input: commit navigates to the same URL scheme', page.url() === `http://localhost:${port}/components/pagination/?page=17#pg-links-input`, page.url());

await done();
