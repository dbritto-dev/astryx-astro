#!/usr/bin/env node
/**
 * TreeList (<ax-tree-list>) against the built docs.
 * Covers: tree ARIA, one roving Tab stop seeded on the selected row, the full APG keyboard
 * map (↓ ↑ → ← Home End Enter Space *), disabled rows skipped, typeahead on the label,
 * RTL arrow swap, chevron / row-surface toggling and astryx-expanded-change, astryx-select +
 * selectedId, focus moved off a collapsing branch, link rows (surface click, middle click),
 * hidden="until-found" groups.
 */
import {setup} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('tree-list');
await page.waitForFunction(() => customElements.get('ax-tree-list'));
await page.evaluate(() => {
  window.__events = [];
  window.__opened = [];
  window.open = (...args) => { window.__opened.push(args); return null; };
  for (const type of ['astryx-expanded-change', 'astryx-select']) {
    document.addEventListener(type, (e) => window.__events.push({type, tree: e.target.id, id: e.detail.id, isExpanded: e.detail.isExpanded}));
  }
});
const events = () => page.evaluate(() => window.__events.splice(0));
const T = '#tree-files';
const row = (id, tree = T) => `${tree} [data-tree-id="${id}"]`;
const focused = () => page.evaluate(() => document.activeElement?.closest('[role="treeitem"]')?.dataset.treeId ?? document.activeElement?.tagName);
const expanded = (id, tree = T) => page.$eval(row(id, tree), (li) => li.getAttribute('aria-expanded'));
const press = async (key, n = 1) => { for (let i = 0; i < n; i++) await page.keyboard.press(key); };

// ── ARIA at rest ─────────────────────────────────────────────────────────
const aria = await page.$eval(T, (el) => {
  const tree = el.querySelector('[role="tree"]');
  const header = document.getElementById(tree.getAttribute('aria-labelledby'));
  const src = el.querySelector('[data-tree-id="src"]');
  const card = el.querySelector('[data-tree-id="card"]');
  return {
    header: header?.textContent?.trim(),
    srcLevel: src.getAttribute('aria-level'), srcSet: `${src.getAttribute('aria-posinset')}/${src.getAttribute('aria-setsize')}`,
    cardLevel: card.getAttribute('aria-level'), cardSelected: card.getAttribute('aria-selected'),
    cardName: document.getElementById(card.getAttribute('aria-labelledby'))?.textContent,
    stops: [...el.querySelectorAll('[role="treeitem"]')].filter((li) => li.tabIndex === 0).map((li) => li.dataset.treeId),
    groups: [...el.querySelectorAll('[role="group"]')].map((g) => g.getAttribute('hidden')),
  };
});
check('tree named by its header (aria-labelledby)', aria.header === 'Project files');
check('aria-level / posinset / setsize', aria.srcLevel === '1' && aria.srcSet === '1/5' && aria.cardLevel === '3', JSON.stringify(aria));
check('selected row: aria-selected, named by its label only', aria.cardSelected === 'true' && aria.cardName === 'Card.astro');
check('one Tab stop, seeded on the selected row', JSON.stringify(aria.stops) === '["card"]', JSON.stringify(aria.stops));
check('collapsed groups are hidden="until-found"', aria.groups.includes('until-found'));

// ── Keyboard map ─────────────────────────────────────────────────────────
await page.focus(row('card'));
await press('ArrowDown');
check('ArrowDown → next visible row', await focused() === 'tree');
await press('ArrowDown');
check('ArrowDown → lib', await focused() === 'lib');
await press('ArrowRight');
check('ArrowRight on a collapsed parent expands it', await expanded('lib') === 'true' && await focused() === 'lib');
check('expanded group is shown', await page.$eval(`${row('lib')} > [role="group"]`, (g) => !g.hasAttribute('hidden')));
let e = await events();
check('astryx-expanded-change {id: lib, isExpanded: true}', e.length === 1 && e[0].id === 'lib' && e[0].isExpanded === true, JSON.stringify(e));
await press('ArrowRight');
check('ArrowRight on an expanded parent moves to its first child', await focused() === 'cascade');
await press('ArrowRight');
check('ArrowRight on a leaf does nothing', await focused() === 'cascade');
await press('ArrowLeft');
check('ArrowLeft on a child moves to its parent', await focused() === 'lib');
await press('ArrowLeft');
check('ArrowLeft on an expanded parent collapses it', await expanded('lib') === 'false' && await focused() === 'lib');
await press('Home');
check('Home → first row', await focused() === 'src');
await press('End');
check('End → last visible row', await focused() === 'readme');
await press('ArrowDown');
check('ArrowDown at the end stays (no wrap)', await focused() === 'readme');
await press('ArrowUp');
check('ArrowUp → previous row', await focused() === 'pkg');
await press('ArrowUp');
check('ArrowUp skips the disabled row', await focused() === 'docs');
check('roving: only the focused row is tabbable', await page.$$eval(`${T} [role="treeitem"]`, (lis) => lis.filter((li) => li.tabIndex === 0).map((li) => li.dataset.treeId).join() === 'docs'));
await press('Enter');
check('Enter on a parent without an action toggles it', await expanded('docs') === 'true');
await press(' ');
check('Space toggles it back', await expanded('docs') === 'false');
await events();

// Typeahead on the label.
await press('Home');
await press('p');
check('typeahead "p" → package.json', await focused() === 'pkg');
await page.waitForTimeout(600);
await press('r');
check('typeahead "r" → README.md', await focused() === 'readme');
await page.waitForTimeout(600);
await press('Home');
await page.keyboard.type('in');
check('typeahead "in" (buffer) → index.ts', await focused() === 'index');
await page.waitForTimeout(600);
await press('Home');
await press('a');
check('typeahead skips the disabled "archive" row', await focused() !== 'archive', await focused());
await page.waitForTimeout(600);

// * expands every sibling.
await press('Home');
await press('*');
check('* expands all expandable siblings (disabled skipped)', await expanded('docs') === 'true' && await expanded('archive') === 'false');
await press('Home');
await press('ArrowLeft');
check('ArrowLeft collapses src', await expanded('src') === 'false');
await press('ArrowRight');
await events();

// Enter on a button row → astryx-select; the demo moves the selection.
await page.focus(row('button'));
await press('Enter');
e = await events();
check('Enter on a button row → astryx-select {id}', e.some((x) => x.type === 'astryx-select' && x.id === 'button'), JSON.stringify(e));
check('selectedId moves aria-selected / data-selected', await page.$eval(T, (el) => el.selectedId === 'button' && el.querySelector('[data-tree-id="card"]').getAttribute('aria-selected') === null && el.querySelector('[data-tree-id="button"] .astryx-tree-list-item').getAttribute('data-selected') === 'selected'));

// Collapsing a branch that holds focus moves focus to its row.
await page.focus(row('button'));
await page.evaluate(() => document.getElementById('tree-files').collapse('components'));
check('focus inside a collapsing branch moves to the branch row', await focused() === 'components');
check('the branch row takes the Tab stop', await page.$eval(row('components'), (li) => li.tabIndex === 0));
await page.evaluate(() => document.getElementById('tree-files').expand('components'));

// Pointer: chevron and row surface toggle a parent; disabled rows do nothing.
await events();
await page.click(`${row('lib')} > .ax-tree-row-wrap [data-tree-toggle]`);
check('chevron click toggles', await expanded('lib') === 'true');
await page.click(`${row('lib')} > .ax-tree-row-wrap .astryx-tree-list-item-label`);
check('row surface click toggles a parent without an action', await expanded('lib') === 'false');
e = await events();
check('one astryx-expanded-change per click', e.length === 2 && e.every((x) => x.id === 'lib'), JSON.stringify(e));
await page.click(`${row('archive')} > .ax-tree-row-wrap .astryx-tree-list-item`, {force: true});
check('disabled parent does not toggle', await expanded('archive') === 'false');
await page.click(`${row('pkg')} > .ax-tree-row-wrap .ax-tree-start`);
e = await events();
check('surface click on a button row → one astryx-select', e.length === 1 && e[0].type === 'astryx-select' && e[0].id === 'pkg', JSON.stringify(e));

// Link rows.
await page.evaluate(() => history.replaceState(null, '', location.pathname));
const L = '#tree-links';
const rowBox = () => page.$eval(`${row('l-overview', L)} .astryx-tree-list-item`, (el) => { el.scrollIntoView({block: 'center'}); const r = el.getBoundingClientRect(); return {x: r.right - 6, y: r.top + r.height / 2}; });
let box = await rowBox();
await page.mouse.click(box.x, box.y);
check('link row: a click in the row padding follows the link', await page.evaluate(() => location.hash) === '#tree-target');
box = await rowBox();
await page.mouse.click(box.x, box.y, {button: 'middle'});
const o = await page.evaluate(() => window.__opened.splice(0));
check('link row: middle click opens a new tab', o.length === 1 && o[0][0].endsWith('#tree-target') && o[0][1] === '_blank', JSON.stringify(o));
check('link row: Enter clicks the link', await (async () => {
  await page.evaluate(() => history.replaceState(null, '', location.pathname));
  await page.focus(row('l-overview', L));
  await press('Enter');
  return (await page.evaluate(() => location.hash)) === '#tree-target';
})());

// RTL: horizontal arrows swap.
const R = '#tree-rtl';
await page.focus(row('n-1', R));
await press('ArrowLeft');
check('RTL: ArrowLeft on an expanded parent moves into it', await focused() === 'n-2');
await press('ArrowRight');
check('RTL: ArrowRight on an expanded parent collapses it', await expanded('n-2', R) === 'false');
await press('ArrowRight');
check('RTL: ArrowRight on a collapsed row moves to its parent', await focused() === 'n-1');
await page.focus(row('n-2', R));
await press('ArrowLeft');
check('RTL: ArrowLeft on a collapsed parent expands it', await expanded('n-2', R) === 'true');
await page.waitForTimeout(300);
check('RTL: expanded chevron is mirrored (scaleX(-1) rotate(90deg))', await page.$eval(`${row('n-2', R)} .ax-tree-chevron`, (el) => getComputedStyle(el).transform === 'matrix(0, 1, 1, 0, 0, 0)'));
check('LTR: expanded chevron rotate(90deg)', await page.$eval(`${row('src')} .ax-tree-chevron`, (el) => getComputedStyle(el).transform === 'matrix(0, 1, -1, 0, 0, 0)'));

// Theme hooks.
check('theme hooks present', await page.$eval(T, (el) =>
  el.matches('.astryx-tree-list[data-density="balanced"][data-variant="lineGuides"]') &&
  !!el.querySelector('.astryx-tree-list-item[data-density]') && !!el.querySelector('.astryx-tree-list-chevron[data-state]') &&
  !!el.querySelector('.astryx-tree-list-guide') && !!el.querySelector('.astryx-tree-list-item-label')));

await done();
