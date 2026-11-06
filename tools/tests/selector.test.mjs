#!/usr/bin/env node
/**
 * Selector: open/close (click, keys, Escape, Tab, outside press), aria-expanded /
 * aria-controls / aria-activedescendant / aria-selected, keyboard map (arrows clamp and skip
 * disabled, Home/End, Enter/Space pick), keyboard-only highlight ring, type-to-select (closed
 * commit + open highlight), selection → astryx-change + hidden input + trigger text, clear
 * (button + Delete), form reset, search filtering + empty state, grouped options, disabled /
 * read-only triggers, the selected-item overlay.
 *   node tools/tests/selector.test.mjs
 */
import {setup, isOpen, activeId, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('selector');

const layerOf = (id) => page.evaluate((i) => document.getElementById(i).closest('ax-selector').getAttribute('data-ax-layer'), id);
const attr = (sel, name) => page.getAttribute(sel, name);
const text = (sel) => page.evaluate((s) => document.querySelector(s)?.textContent?.trim(), sel);
const activeDesc = (id) => page.evaluate((i) => {
  const t = document.getElementById(i);
  const d = t.getAttribute('aria-activedescendant');
  return d ? document.getElementById(d)?.getAttribute('data-value') : null;
}, id);
const events = async () => page.evaluate(() => window.__changes ?? []);
await page.evaluate(() => {
  window.__changes = [];
  document.addEventListener('astryx-change', (e) => {
    if (e.target.matches('ax-selector')) window.__changes.push({id: e.target.querySelector('.ax-selector-trigger').id, value: e.detail.value});
  });
});

const T = '#sel-form';
const L = `#${await layerOf('sel-form')}`;

console.log('Server markup (zero JS wiring)');
check('trigger is a button role=combobox', (await page.evaluate((s) => document.querySelector(s).tagName, T)) === 'BUTTON' && (await attr(T, 'role')) === 'combobox');
check('aria-haspopup=listbox + aria-controls → listbox', (await attr(T, 'aria-haspopup')) === 'listbox'
  && (await page.evaluate((s) => document.getElementById(document.querySelector(s).getAttribute('aria-controls'))?.getAttribute('role'), T)) === 'listbox');
check('aria-expanded false while closed', (await attr(T, 'aria-expanded')) === 'false');
check('layer is popover=auto, a layer root', (await attr(L, 'popover')) === 'auto' && (await attr(L, 'data-astryx-layer-root')) != null);
check('selected option has aria-selected=true', (await page.evaluate((l) => document.querySelector(`${l} [aria-selected="true"]`)?.getAttribute('data-value'), L)) === 'Cherry');
check('hidden input carries the value', (await page.inputValue('input[name="fruit"]')) === 'Cherry');
check('aria-required on the trigger', (await attr(T, 'aria-required')) === 'true');

console.log('Click open / close');
await page.click(T);
await sleep(80);
check('click opens', await isOpen(page, L));
check('aria-expanded true', (await attr(T, 'aria-expanded')) === 'true');
check('activedescendant on the selected option', (await activeDesc('sel-form')) === 'Cherry');
check('pointer open draws no keyboard ring', (await page.evaluate((l) => document.querySelector(`${l} [data-ax-highlighted]`)?.hasAttribute('data-ax-keyboard'), L)) === false);
check('focus stays on the trigger', (await activeId(page)) === 'sel-form');
check('chevron state expanded', (await page.evaluate((s) => document.querySelector(s).closest('ax-selector').querySelector('.astryx-selector-indicator-icon').getAttribute('data-state'), T)) === 'expanded');
await page.click(T);
await sleep(80);
check('second click closes', !(await isOpen(page, L)));
check('aria-expanded false again', (await attr(T, 'aria-expanded')) === 'false');
check('no activedescendant while closed', (await attr(T, 'aria-activedescendant')) == null);

console.log('Keyboard: open keys, movement, pick');
await page.focus(T);
await page.keyboard.press('ArrowDown');
await sleep(60);
check('ArrowDown opens', await isOpen(page, L));
check('ArrowDown opens on the first option', (await activeDesc('sel-form')) === 'Apple');
check('keyboard highlight draws the ring', (await page.evaluate((l) => document.querySelector(`${l} [data-ax-highlighted]`)?.hasAttribute('data-ax-keyboard'), L)) === true);
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
check('ArrowDown moves', (await activeDesc('sel-form')) === 'Cherry');
await page.keyboard.press('End');
check('End → last', (await activeDesc('sel-form')) === 'Grape');
await page.keyboard.press('ArrowDown');
check('ArrowDown clamps at the end', (await activeDesc('sel-form')) === 'Grape');
await page.keyboard.press('Home');
check('Home → first', (await activeDesc('sel-form')) === 'Apple');
await page.keyboard.press('ArrowUp');
check('ArrowUp clamps at the start', (await activeDesc('sel-form')) === 'Apple');
await page.keyboard.press('PageDown');
check('PageDown → last', (await activeDesc('sel-form')) === 'Grape');
await page.keyboard.press('ArrowUp');
await page.keyboard.press('Enter');
await sleep(60);
check('Enter picks and closes', !(await isOpen(page, L)));
check('trigger shows the pick', (await text(`${T} .ax-selector-label`)) === 'Fig');
check('hidden input updated', (await page.inputValue('input[name="fruit"]')) === 'Fig');
check('aria-selected moved', (await page.evaluate((l) => document.querySelector(`${l} [aria-selected="true"]`)?.getAttribute('data-value'), L)) === 'Fig');
check('astryx-change {value}', JSON.stringify((await events()).at(-1)) === JSON.stringify({id: 'sel-form', value: 'Fig'}));
check('focus remains on the trigger', (await activeId(page)) === 'sel-form');
await page.keyboard.press('ArrowUp');
await sleep(40);
check('ArrowUp opens on the last option', (await activeDesc('sel-form')) === 'Grape');
await page.keyboard.press('Escape');
await sleep(60);
check('Escape closes', !(await isOpen(page, L)));
check('Escape keeps focus on the trigger', (await activeId(page)) === 'sel-form');
await page.keyboard.press('Enter');
await sleep(40);
check('Enter opens on the selection', (await activeDesc('sel-form')) === 'Fig');
await page.keyboard.press('ArrowUp');
await page.keyboard.press(' ');
await sleep(40);
check('Space picks', (await text(`${T} .ax-selector-label`)) === 'Elderberry' && !(await isOpen(page, L)));
await page.keyboard.press(' ');
await sleep(40);
check('Space opens', await isOpen(page, L));
await page.keyboard.press('Tab');
await sleep(60);
check('Tab closes', !(await isOpen(page, L)));

console.log('Type-to-select');
await page.focus(T);
await page.keyboard.press('b');
await sleep(30);
check('closed: a letter commits the match', (await text(`${T} .ax-selector-label`)) === 'Banana' && !(await isOpen(page, L)));
check('closed match fires astryx-change', (await events()).at(-1)?.value === 'Banana');
await page.waitForTimeout(800);
await page.keyboard.press('ArrowDown');
await sleep(40);
await page.keyboard.press('g');
check('open: a letter moves the highlight', (await activeDesc('sel-form')) === 'Grape' && (await text(`${T} .ax-selector-label`)) === 'Banana');
await page.keyboard.press('Escape');
await sleep(40);

console.log('Clear (button, Delete) + form reset');
const clearSel = `#${await page.evaluate(() => document.getElementById('sel-form').closest('ax-selector').id)} [data-ax-input-clear]`;
check('clear button visible with a value', !(await page.evaluate((s) => document.querySelector(s).hidden, clearSel)));
await page.click(clearSel);
await sleep(40);
check('clear empties the value', (await page.inputValue('input[name="fruit"]')) === '' && (await events()).at(-1)?.value === null);
check('placeholder shown', (await text(`${T} .ax-selector-label`)) === 'Select…');
check('clear button hidden without a value', await page.evaluate((s) => document.querySelector(s).hidden, clearSel));
check('clear did not open the list', !(await isOpen(page, L)));
await page.focus(T);
await page.keyboard.press('a');
await sleep(30);
await page.keyboard.press('Delete');
await sleep(30);
check('Delete clears a closed clearable selector', (await page.inputValue('input[name="fruit"]')) === '');
await page.keyboard.press('c');
await page.click('#selector-form button[type="reset"]');
await sleep(60);
check('form reset restores the server value', (await page.inputValue('input[name="fruit"]')) === 'Cherry' && (await text(`${T} .ax-selector-label`)) === 'Cherry');

console.log('Outside press');
await page.click(T);
await sleep(60);
await page.mouse.click(1050, 860);
await sleep(80);
check('press outside closes', !(await isOpen(page, L)));

console.log('Search');
const S = '#sel-search';
const SL = `#${await layerOf('sel-search')}`;
check('trigger has no combobox role with a search row', (await attr(S, 'role')) == null);
await page.focus(S);
await page.keyboard.press('p');
await sleep(120);
check('typing on the trigger opens and seeds the query', (await isOpen(page, SL)) && (await page.inputValue(`${SL} [data-ax-panel-search] input`)) === 'p');
check('focus moves into the search input', await page.evaluate((l) => document.activeElement === document.querySelector(`${l} [data-ax-panel-search] input`), SL));
await page.keyboard.type('er');
await sleep(40);
const visible = await page.evaluate((l) => [...document.querySelectorAll(`${l} [role="option"]`)].filter((o) => !o.hidden).map((o) => o.dataset.value), SL);
check('search filters (substring, case-insensitive)', JSON.stringify(visible) === JSON.stringify(['Peru']), visible.join(','));
const searchInput = `${SL} [data-ax-panel-search] input`;
check('search input is the combobox', (await attr(searchInput, 'role')) === 'combobox' && (await attr(searchInput, 'aria-expanded')) === 'true');
await page.keyboard.press('ArrowDown');
check('ArrowDown in the search highlights (activedescendant on the input)', (await page.evaluate((s) => document.getElementById(document.querySelector(s).getAttribute('aria-activedescendant'))?.dataset.value, searchInput)) === 'Peru');
await page.keyboard.type('zz');
await sleep(40);
check('no match shows the search empty state', await page.evaluate((l) => !document.querySelector(`${l} [data-ax-empty="search"]`).hidden, SL));
check('a filtered-out highlight is dropped', (await attr(searchInput, 'aria-activedescendant')) == null);
await page.keyboard.press('Escape');
await sleep(80);
check('Escape closes the search panel', !(await isOpen(page, SL)));
check('focus returns to the trigger', (await activeId(page)) === 'sel-search');
check('closing resets the query', (await page.inputValue(searchInput)) === '' && (await page.evaluate((l) => [...document.querySelectorAll(`${l} [role="option"]`)].every((o) => !o.hidden), SL)));
await page.click(S);
await sleep(120);
await page.keyboard.type('chi');
await sleep(40);
await page.click(`${SL} [data-value="Chile"]`);
await sleep(80);
check('a pointer pick from the search panel selects and closes', !(await isOpen(page, SL)) && (await page.inputValue('input[name="country"]')) === 'Chile');
check('focus returns to the trigger after the pick', (await activeId(page)) === 'sel-search');

console.log('Grouped + disabled options');
const G = '#sel-grouped';
const GL = `#${await layerOf('sel-grouped')}`;
check('sections are role=group with a label', (await page.evaluate((l) => [...document.querySelectorAll(`${l} [role="group"]`)].map((g) => g.getAttribute('aria-label')).join(','), GL)) === 'Citrus,Berries');
check('section heading is aria-hidden', (await page.evaluate((l) => document.querySelector(`${l} .astryx-selector-section-heading`).getAttribute('aria-hidden'), GL)) === 'true');
await page.focus(G);
await page.keyboard.press('Enter');
await sleep(40);
check('opens on the selection inside a group', (await activeDesc('sel-grouped')) === 'lime');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
check('arrows skip a disabled option', (await activeDesc('sel-grouped')) === 'strawberry');
await page.keyboard.press('Escape');
const P = '#sel-disabled-options';
const PL = `#${await layerOf('sel-disabled-options')}`;
await page.click(P);
await sleep(60);
await page.click(`${PL} [data-value="pro"]`, {force: true});
await sleep(40);
check('a click on a disabled option does nothing', (await isOpen(page, PL)) && (await text(`${P} .ax-selector-label`)) === 'Free');
check('disabled option exposes aria-disabled', (await attr(`${PL} [data-value="pro"]`, 'aria-disabled')) === 'true');
await page.click(`${PL} [data-value="team"]`);
await sleep(60);
check('a click picks and closes', (await text(`${P} .ax-selector-label`)) === 'Team' && !(await isOpen(page, PL)));
check('pointer pick suppresses the returned ring', await page.evaluate((s) => document.querySelector(s).closest('ax-selector').hasAttribute('data-ax-focus-restored'), P));

console.log('Disabled / read-only');
const D = '#sel-disabled';
check('disabled trigger stays focusable (aria-disabled)', (await attr(D, 'aria-disabled')) === 'true' && (await attr(D, 'disabled')) == null);
check('disabled selector submits nothing', (await page.$('input[name="disabled"]')) === null);
await page.click(D, {force: true});
await page.focus(D);
await page.keyboard.press('ArrowDown');
await sleep(40);
check('disabled never opens', await page.evaluate(() => document.querySelectorAll('ax-combobox-layer:popover-open').length === 0));
const R = '#sel-readonly';
check('read-only keeps role=combobox + aria-readonly, no popup', (await attr(R, 'role')) === 'combobox' && (await attr(R, 'aria-readonly')) === 'true' && (await attr(R, 'aria-haspopup')) == null && (await attr(R, 'aria-expanded')) === 'false');
check('read-only value is submitted', (await page.inputValue('input[name="readonly"]')) === 'Banana');
const describedDisabled = await page.evaluate(() => document.getElementById('sel-disabled-message').getAttribute('aria-describedby'));
check('disabledMessage describes the trigger', !!describedDisabled && await page.evaluate((ids) => ids.split(' ').some((i) => document.getElementById(i)?.textContent.includes('Editor role')), describedDisabled));

console.log('Selected-item overlay');
const LG = '#sel-long';
const LGL = `#${await layerOf('sel-long')}`;
await page.evaluate((s) => document.querySelector(s).scrollIntoView({block: 'center'}), LG);
await page.click(LG);
await sleep(120);
const geo = await page.evaluate(([t, l]) => {
  const box = document.querySelector(t).closest('ax-selector').getBoundingClientRect();
  const opt = document.querySelector(`${l} [aria-selected="true"]`).getBoundingClientRect();
  return {box: box.top + box.height / 2, opt: opt.top + opt.height / 2};
}, [LG, LGL]);
check('the selected option sits over the trigger', Math.abs(geo.box - geo.opt) <= 3, JSON.stringify(geo));
await page.keyboard.press('Escape');
await sleep(60);
await page.evaluate((s) => {
  const box = document.querySelector(s).closest('ax-selector');
  window.scrollBy(0, box.getBoundingClientRect().bottom - window.innerHeight + 8);
}, LG);
await page.click(LG);
await sleep(120);
const fit = await page.evaluate((l) => {
  const r = document.querySelector(`${l} [role="listbox"]`).getBoundingClientRect();
  return {top: r.top, bottom: r.bottom, vh: window.innerHeight};
}, LGL);
check('near the bottom edge the list is clamped into the viewport', fit.top >= 0 && fit.bottom <= fit.vh, JSON.stringify(fit));
await page.keyboard.press('Escape');

await done();
