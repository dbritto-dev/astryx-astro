#!/usr/bin/env node
/**
 * Typeahead: combobox semantics (role, aria-autocomplete, aria-expanded, aria-controls,
 * aria-activedescendant, aria-selected), static filtering (label + keywords, groups,
 * maxMenuItems, minQueryLength, hasEntriesOnFocus), keyboard (wrap, Home/End, Enter, Escape,
 * Tab), selection → astryx-change + token + hidden input + form reset, edit mode, clear,
 * empty state + announcements, outside press (start AND end outside), focus stays in the
 * input, async source via astryx-query (loading spinner + aria-busy, stale answers dropped,
 * partial lists), IME guard, disabled, match highlight, the bare BaseTypeahead.
 *   node tools/tests/typeahead.test.mjs
 */
import {setup, isOpen, activeId, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('typeahead');

const layerOf = (id) => page.evaluate((i) => '#' + document.getElementById(i).closest('ax-typeahead').getAttribute('data-ax-layer'), id);
const attr = (sel, name) => page.getAttribute(sel, name);
const visible = (layer) => page.evaluate((l) => [...document.querySelectorAll(`${l} [role="option"]:not([data-ax-empty])`)].filter((o) => !o.hidden && !o.closest('[hidden]')).map((o) => o.dataset.id).join(','), layer);
const activeDesc = (id) => page.evaluate((i) => {
  const d = document.getElementById(i).getAttribute('aria-activedescendant');
  return d ? document.getElementById(d)?.dataset.id : null;
}, id);
const live = () => page.evaluate(() => [...document.querySelectorAll('[data-astryx-live-region]')].map((r) => r.textContent).join('|'));
await page.evaluate(() => {
  window.__changes = [];
  document.addEventListener('astryx-change', (e) => { if (e.target.matches('ax-typeahead')) window.__changes.push({id: e.target.id, value: e.detail.value}); });
});
const lastChange = () => page.evaluate(() => window.__changes.at(-1));
const boxOf = (id) => page.evaluate((i) => '#' + document.getElementById(i).closest('ax-typeahead').id, id);

const F = '#ta-fruit';
const FL = await layerOf('ta-fruit');
console.log('Server markup');
check('input role=combobox aria-autocomplete=list', (await attr(F, 'role')) === 'combobox' && (await attr(F, 'aria-autocomplete')) === 'list');
check('aria-controls → role=listbox', await page.evaluate((s) => document.getElementById(document.querySelector(s).getAttribute('aria-controls'))?.getAttribute('role') === 'listbox', F));
check('aria-expanded=false', (await attr(F, 'aria-expanded')) === 'false');
check('popup is a manual popover layer root', (await attr(FL, 'popover')) === 'manual' && (await attr(FL, 'data-astryx-layer-root')) != null);
check('static items are server-rendered (hidden)', (await page.evaluate((l) => document.querySelectorAll(`${l} [data-ax-static]`).length, FL)) === 27);

console.log('Static filtering + keyboard');
await page.click(F);
check('focus without hasEntriesOnFocus opens nothing', !(await isOpen(page, FL)));
await page.keyboard.type('ap');
await sleep(60);
check('typing opens the list', await isOpen(page, FL));
check('substring filter', (await visible(FL)) === 'apple,apricot,grape,papaya,pineapple', await visible(FL));
check('aria-expanded=true', (await attr(F, 'aria-expanded')) === 'true');
check('first result highlighted (activedescendant)', (await activeDesc('ta-fruit')) === 'apple');
check('focus stays in the input', (await activeId(page)) === 'ta-fruit');
await sleep(80);
check('result count announced', (await live()).includes('5 results'));
check('match highlight registered', await page.evaluate(() => CSS.highlights?.has('astryx-typeahead-match') ?? true));
await page.keyboard.press('ArrowUp');
check('ArrowUp wraps to the last', (await activeDesc('ta-fruit')) === 'pineapple');
await page.keyboard.press('ArrowDown');
check('ArrowDown wraps to the first', (await activeDesc('ta-fruit')) === 'apple');
await page.keyboard.press('End');
check('End → last', (await activeDesc('ta-fruit')) === 'pineapple');
await page.keyboard.press('Home');
await page.keyboard.press('ArrowDown');
check('Home then ArrowDown', (await activeDesc('ta-fruit')) === 'apricot');
await page.keyboard.press('Enter');
await sleep(80);
check('Enter selects and closes', !(await isOpen(page, FL)));
check('astryx-change {value: item}', JSON.stringify((await lastChange()).value) === JSON.stringify({id: 'apricot', label: 'Apricot'}));
check('token shows the value', await page.evaluate(() => {
  const token = document.getElementById('ta-fruit').closest('ax-typeahead').querySelector('[data-ax-typeahead-token]');
  return !token.hidden && token.textContent.trim() === 'Apricot';
}));
check('input cleared and hidden behind the token', (await page.inputValue(F)) === '' && (await attr(F, 'data-ax-input-hidden')) != null && (await attr(F, 'tabindex')) === '-1');
check('focus moves to the token button', await page.evaluate(() => document.activeElement?.closest('[data-ax-typeahead-token]') != null));
check('selected option aria-selected', (await attr(`${FL} [data-id="apricot"]`, 'aria-selected')) === 'true');

console.log('Edit mode, Escape, clear');
await page.keyboard.press('Enter');
await sleep(80);
check('pressing the token enters edit mode (label in the input)', (await page.inputValue(F)) === 'Apricot' && (await activeId(page)) === 'ta-fruit');
check('edit mode searches the label', await isOpen(page, FL));
await page.keyboard.press('Escape');
await sleep(40);
check('Escape closes the list first', !(await isOpen(page, FL)));
await page.keyboard.press('Escape');
await sleep(80);
check('second Escape restores the token', await page.evaluate(() => !document.getElementById('ta-fruit').closest('ax-typeahead').querySelector('[data-ax-typeahead-token]').hidden));
const clear = `${await boxOf('ta-fruit')} [data-ax-end-lane] [data-ax-input-clear]`;
await page.click(clear);
await sleep(60);
check('clear empties the value', (await lastChange()).value === null && (await activeId(page)) === 'ta-fruit');
check('token gone, input visible', await page.evaluate(() => document.getElementById('ta-fruit').closest('ax-typeahead').querySelector('[data-ax-typeahead-token]').hidden) && (await attr(F, 'data-ax-input-hidden')) == null);

console.log('Empty state');
await page.keyboard.type('zzz');
await sleep(80);
check('empty row shown for a settled query', await page.evaluate((l) => !document.querySelector(`${l} [data-ax-empty]`).hidden, FL));
check('empty row is an aria-disabled option', (await attr(`${FL} [data-ax-empty]`, 'role')) === 'option' && (await attr(`${FL} [data-ax-empty]`, 'aria-disabled')) === 'true');
check('no activedescendant on an empty list', (await attr(F, 'aria-activedescendant')) == null);
await sleep(80);
check('empty message announced', (await live()).includes('No results found'));
await page.keyboard.press('Enter');
check('Enter on an empty list picks nothing', JSON.stringify((await lastChange()).value) === 'null');

console.log('Outside press + Tab');
await page.fill(F, '');
await page.keyboard.type('pe');
await sleep(60);
check('reopened', await isOpen(page, FL));
const lr = await page.locator(`${FL} [role="listbox"]`).boundingBox();
await page.mouse.move(lr.x + 10, lr.y + 10);
await page.mouse.down();
await page.mouse.move(1000, 880);
await page.mouse.up();
await sleep(60);
check('press starting inside, ending outside keeps it open', await isOpen(page, FL));
check('a press in the list keeps focus in the input', (await activeId(page)) === 'ta-fruit');
await page.mouse.click(1050, 890);
await sleep(60);
check('press starting and ending outside closes', !(await isOpen(page, FL)));
await page.click(F);
await page.keyboard.press('ArrowDown');
await sleep(40);
check('ArrowDown reopens current results', await isOpen(page, FL));
await page.keyboard.press('Tab');
await sleep(60);
check('Tab closes', !(await isOpen(page, FL)));

console.log('IME guard');
await page.focus(F);
await page.fill(F, '');
await page.keyboard.type('ki');
await sleep(60);
await page.evaluate((s) => document.querySelector(s).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', isComposing: true, bubbles: true, cancelable: true})), F);
await sleep(30);
check('a composing Enter does not select', (await isOpen(page, FL)) && (await page.inputValue(F)) === 'ki');
await page.evaluate((s) => document.querySelector(s).dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', keyCode: 229, bubbles: true, cancelable: true})), F);
await sleep(30);
check('a composing Escape does not close', await isOpen(page, FL));
await page.keyboard.press('Enter');
await sleep(60);
check('a real Enter selects', (await lastChange()).value?.id === 'kiwi');

console.log('Keywords, groups, renderItem');
const P = '#ta-people';
const PL = await layerOf('ta-people');
await page.click(await boxOf('ta-people'));
await sleep(60);
check('clicking the box with a value enters edit mode', (await page.inputValue(P)) === 'Grace Hopper');
await page.fill(P, 'admiral');
await sleep(60);
check('keywords match', (await visible(PL)) === 'grace');
await page.fill(P, 'a');
await sleep(60);
const groups = await page.evaluate((l) => [...document.querySelectorAll(`${l} [role="group"]`)].filter((g) => !g.hidden).map((g) => g.getAttribute('aria-label')).join(','), PL);
check('results grouped (role=group, named)', groups === 'Engineering,Design,Research', groups);
check('renderItem content (description)', await page.evaluate((l) => document.querySelector(`${l} [data-id="ada"] .ax-typeahead-item-description`)?.textContent === 'Engineering', PL));
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');

console.log('minQueryLength + hasEntriesOnFocus');
const M = '#ta-min';
const ML = await layerOf('ta-min');
await page.click(M);
await page.keyboard.type('ap');
await sleep(60);
check('below minQueryLength nothing opens', !(await isOpen(page, ML)));
await page.keyboard.type('p');
await sleep(60);
check('at minQueryLength the search runs', (await isOpen(page, ML)) && (await visible(ML)) === 'apple,pineapple');
await page.keyboard.press('Escape');
const R = '#ta-focus';
const RL = await layerOf('ta-focus');
await page.click(R);
await sleep(80);
check('hasEntriesOnFocus opens the bootstrap list on focus', await isOpen(page, RL));
check('maxMenuItems caps the list', (await visible(RL)).split(',').length === 5);
await page.keyboard.press('Escape');

console.log('Async source (astryx-query)');
const A = '#ta-async';
const AL = await layerOf('ta-async');
await page.evaluate(() => {
  window.__queries = [];
  document.addEventListener('astryx-query', (e) => window.__queries.push(e.detail.query));
});
await page.click(A);
await page.keyboard.type('p');
await sleep(250);
check('spinner + aria-busy while the request runs', (await attr(A, 'aria-busy')) === 'true'
  && await page.evaluate(() => !document.getElementById('ta-async').closest('ax-typeahead').querySelector('[data-ax-typeahead-spinner]').hidden));
await sleep(150);
check('busy start announced', (await live()).includes('Loading'));
await page.keyboard.type('or');
await sleep(800);
check('debounced: one query per pause', JSON.stringify(await page.evaluate(() => window.__queries)) === JSON.stringify(['p', 'por']));
check('final answer shown (stale dropped)', (await visible(AL)) === 'portugal');
check('busy cleared', (await attr(A, 'aria-busy')) == null);
await page.keyboard.press('Enter');
await sleep(60);
check('async result selectable', (await lastChange()).value?.label === 'Portugal');
const C = '#ta-async-partial';
const CL = await layerOf('ta-async-partial');
await page.click(C);
await page.keyboard.type('a');
await sleep(250);
check('partial list shown first', (await visible(CL)) === 'lima,arequipa,cali', await visible(CL));
await page.keyboard.press('ArrowDown');
const kept = await activeDesc('ta-async-partial');
await sleep(400);
check('later list appends after the shown rows', (await visible(CL)) === 'lima,arequipa,cali,cartagena,santiago,madrid', await visible(CL));
check('the highlighted item keeps its highlight', (await activeDesc('ta-async-partial')) === kept);
await page.keyboard.press('Escape');
const E = '#ta-async-empty';
const EL = await layerOf('ta-async-empty');
await page.click(E);
await page.keyboard.type('x');
await sleep(300);
check('custom empty text for an async empty answer', (await page.evaluate((l) => document.querySelector(`${l} [data-ax-empty]`).textContent.trim(), EL)) === 'No records for that query');
await page.keyboard.press('Escape');

console.log('Form + disabled');
check('hidden input with the selected id', (await page.inputValue('input[name="fruit"]')) === 'apple');
await page.click(await boxOf('ta-form-fruit'));
await page.fill('#ta-form-fruit', 'mang');
await sleep(60);
await page.keyboard.press('Enter');
await sleep(60);
check('selection updates the hidden input', (await page.inputValue('input[name="fruit"]')) === 'mango');
await page.click('#ta-form button[type="reset"]');
await sleep(60);
check('form reset restores the value', (await page.inputValue('input[name="fruit"]')) === 'apple' && await page.evaluate(() => document.getElementById('ta-form-fruit').closest('ax-typeahead').querySelector('[data-ax-typeahead-token]').textContent.trim() === 'Apple'));
const D = '#ta-disabled';
check('disabled: aria-disabled + readonly, focusable', (await attr(D, 'aria-disabled')) === 'true' && (await attr(D, 'readonly')) != null && (await attr(D, 'disabled')) == null);
check('disabled submits nothing', (await page.$('input[name="disabled"]')) === null);
await page.click(await boxOf('ta-disabled'), {force: true});
await sleep(40);
check('disabled token never enters edit mode', (await page.inputValue(D)) === '');

console.log('BaseTypeahead');
const B = '#ta-base';
const BL = await layerOf('ta-base');
await page.click(B);
await page.keyboard.type('cher');
await sleep(60);
check('bare engine filters', (await visible(BL)) === 'cherry');
await page.keyboard.press('Enter');
await sleep(60);
check('bare engine clears the input after a pick', (await page.inputValue(B)) === '' && (await lastChange()).value?.id === 'cherry');
await page.keyboard.type('ch');
await sleep(60);
check('the pick is marked in the list', (await attr(`${BL} [data-id="cherry"]`, 'aria-selected')) === 'true');
await page.keyboard.press('Escape');

await done();
