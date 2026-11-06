#!/usr/bin/env node
/**
 * CommandPalette: modal dialog (showModal, aria-label, autofocus input), hotkey open, bootstrap +
 * filter + groups, combobox semantics (aria-controls / aria-expanded / aria-activedescendant only
 * while results exist), keyboard (↓/↑ clamped, PageUp/PageDown, Enter runs, Tab drops the
 * highlight, Escape through the layer stack), focus return, pointer hover/click, empty states +
 * announcements, async source (busy spinner, Loading announcement, optimistic narrowing), picker
 * value, inline preview, standalone items.
 *   node tools/tests/command-palette.test.mjs
 */
import {setup, activeId, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('command-palette');

const MAIN = '#cp-main';
const host = (dialog) => `ax-command-palette:has(> ax-dialog > ${dialog})`;
const inputOf = (dialog) => `${dialog} input[data-ax-command-palette-input]`;
const listOf = (dialog) => page.evaluate((d) => '#' + document.querySelector(d).closest('ax-command-palette').getAttribute('data-ax-list'), dialog);
const isModal = (dialog) => page.evaluate((d) => document.querySelector(d).matches(':modal'), dialog);
const rows = (list) => page.evaluate((l) => [...document.querySelectorAll(`${l} [role="option"]`)].filter((o) => !o.hidden && !o.closest('[hidden]')).map((o) => o.dataset.value).join(','), list);
const groupsShown = (list) => page.evaluate((l) => [...document.querySelectorAll(`${l} [role="group"]`)].filter((g) => !g.hidden).map((g) => g.getAttribute('aria-label')).join(','), list);
const active = (dialog) => page.evaluate((d) => {
  const input = document.querySelector(d).querySelector('input[data-ax-command-palette-input]');
  const id = input.getAttribute('aria-activedescendant');
  const el = id ? document.getElementById(id) : null;
  return el ? {value: el.dataset.value, highlighted: el.getAttribute('data-highlighted')} : null;
}, dialog);
const live = () => page.evaluate(() => [...document.querySelectorAll('[data-astryx-live-region], [data-astryx-modal-live-region]')].map((r) => r.textContent).join('|'));
await page.evaluate(() => {
  window.__selects = [];
  window.__opens = [];
  document.addEventListener('astryx-select', (e) => window.__selects.push({target: e.target.tagName.toLowerCase(), ...e.detail}));
  document.addEventListener('astryx-open-change', (e) => { if (e.target.matches('ax-dialog, ax-command-palette')) window.__opens.push(e.detail); });
});
const lastSelect = () => page.evaluate(() => window.__selects.at(-1));

console.log('Server markup');
const ML = await listOf(MAIN);
check('dialog closed, named by label', !(await page.evaluate((d) => document.querySelector(d).open, MAIN)) && (await page.getAttribute(MAIN, 'aria-label')) === 'Command palette');
check('input is the palette combobox', await page.evaluate((d) => {
  const i = document.querySelector(d).querySelector('input[data-ax-command-palette-input]');
  return i.getAttribute('role') === 'combobox' && i.getAttribute('aria-autocomplete') === 'list' && i.getAttribute('aria-label') === 'Search commands' && i.hasAttribute('data-autofocus');
}, MAIN));
check('static commands server-rendered in groups (ungrouped last)', (await groupsShown(ML)) === 'Actions,Navigation,Preferences'
  && await page.evaluate((l) => document.querySelector(l).lastElementChild.previousElementSibling.previousElementSibling.previousElementSibling.dataset.value === 'help', ML));
check('footer hints with Kbd', await page.evaluate((d) => document.querySelectorAll(`${d} .astryx-command-palette-footer .astryx-kbd`).length >= 4, MAIN));

console.log('Open, bootstrap, filter');
await page.click('#cp-open');
await sleep(120);
check('button opens the modal dialog', await isModal(MAIN));
check('the input takes focus', await page.evaluate((s) => document.activeElement === document.querySelector(s), inputOf(MAIN)));
check('bootstrap lists every command', (await rows(ML)) === 'new-file,search,copy-link,home,calendar,settings,theme,help', await rows(ML));
check('aria-expanded=true, aria-controls → listbox', await page.evaluate((s) => {
  const i = document.querySelector(s);
  return i.getAttribute('aria-expanded') === 'true' && document.getElementById(i.getAttribute('aria-controls'))?.getAttribute('role') === 'listbox';
}, inputOf(MAIN)));
check('nothing highlighted until a key moves', (await active(MAIN)) === null);
await page.keyboard.type('o');
await sleep(80);
check('typing filters (substring)', (await rows(ML)) === 'copy-link,home,calendar,theme', await rows(ML));
check('groups follow the results', (await groupsShown(ML)) === 'Actions,Navigation,Preferences');
check('result count announced inside the dialog', (await live()).includes('4 results'));
await page.keyboard.press('ArrowUp');
check('ArrowUp from none highlights the first (clamped)', (await active(MAIN))?.value === 'copy-link');
check('the highlighted row carries data-highlighted', (await active(MAIN))?.highlighted === 'highlighted');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
check('ArrowDown moves', (await active(MAIN))?.value === 'calendar');
await page.keyboard.press('PageDown');
check('PageDown → last', (await active(MAIN))?.value === 'theme');
await page.keyboard.press('ArrowDown');
check('ArrowDown clamps at the end', (await active(MAIN))?.value === 'theme');
await page.keyboard.press('PageUp');
check('PageUp → first', (await active(MAIN))?.value === 'copy-link');
await page.keyboard.press('Home');
check('Home stays with the caret', (await active(MAIN))?.value === 'copy-link' && await page.evaluate((s) => document.querySelector(s).selectionStart === 0, inputOf(MAIN)));
await page.keyboard.press('End');
await page.keyboard.type('pen');
await sleep(60);
check('a new query clears the highlight', (await active(MAIN)) === null && (await rows(ML)) === 'calendar');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await sleep(150);
const s1 = await lastSelect();
check('Enter runs the highlighted command: astryx-select {value, item}', s1?.value === 'calendar' && s1.item.label === 'Open calendar' && s1.target === 'ax-command-palette');
check('the palette closes', !(await isModal(MAIN)));
check('focus returns to the opener', (await activeId(page)) === 'cp-open');
check('output updated by the demo listener', (await page.textContent('#cp-main-output')) === 'Ran: Open calendar (calendar)');

console.log('Hotkey, empty state, Escape');
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press('Control+k');
await sleep(150);
check('mod+K (Ctrl on Linux) opens the palette', await isModal(MAIN));
check('reopened with an empty query and every command', (await page.inputValue(inputOf(MAIN))) === '' && (await rows(ML)).split(',').length === 8);
await page.keyboard.type('zzz');
await sleep(100);
check('no match: the search-empty text shows', await page.evaluate((l) => {
  const e = document.querySelector(`${l} [data-ax-empty="search"]`);
  return !e.hidden && e.textContent.trim() === 'No commands match';
}, ML));
check('no listbox while empty (role, aria-controls, aria-expanded=false)', await page.evaluate(([l, s]) => {
  const list = document.querySelector(l);
  const i = document.querySelector(s);
  return !list.hasAttribute('role') && !list.hasAttribute('aria-label') && !i.hasAttribute('aria-controls') && i.getAttribute('aria-expanded') === 'false';
}, [ML, inputOf(MAIN)]));
await sleep(80);
check('the empty message is announced as rendered', (await live()).includes('No commands match'));
check('the empty state wraps anywhere', await page.evaluate((l) => {
  const cs = getComputedStyle(document.querySelector(`${l} [data-ax-empty="search"]`));
  return cs.overflowWrap === 'anywhere' && cs.getPropertyValue('--_astryx-text-overflow-wrap').trim() === 'anywhere';
}, ML));
await page.keyboard.press('Escape');
await sleep(150);
check('Escape closes through the layer stack', !(await isModal(MAIN)));
check('astryx-open-change {isOpen: false, reason: escape}', await page.evaluate(() => {
  const last = window.__opens.at(-1);
  return last && last.isOpen === false && last.reason === 'escape';
}));
check('the hotkey is ignored while typing in a field', await (async () => {
  await page.focus('#cp-standalone-input');
  await page.keyboard.press('Control+k');
  await sleep(100);
  return !(await isModal(MAIN));
})());

console.log('Pointer');
await page.click('#cp-open');
await sleep(150);
const scrollBefore = await page.evaluate((l) => document.querySelector(l).scrollTop, ML);
await page.hover(`${ML} [data-value="settings"]`);
await sleep(50);
check('hover highlights (activedescendant follows)', (await active(MAIN))?.value === 'settings');
check('hover never scrolls the list', (await page.evaluate((l) => document.querySelector(l).scrollTop, ML)) === scrollBefore);
await page.keyboard.press('Tab');
check('Tab drops the highlight', (await active(MAIN)) === null);
check('focus stays inside the modal (Tab wraps)', await page.evaluate((d) => document.querySelector(d).contains(document.activeElement), MAIN));
await page.click(`${ML} [data-value="settings"]`);
await sleep(150);
check('a click runs the command and closes', (await lastSelect())?.value === 'settings' && !(await isModal(MAIN)));
await page.click('#cp-open');
await sleep(150);
await page.mouse.click(10, 10);
await sleep(150);
check('a backdrop press closes (purpose info)', !(await isModal(MAIN)));

console.log('Async source');
const AS = '#cp-async';
const AL = await listOf(AS);
await page.click('#cp-async-open');
await sleep(150);
check('async bootstrap empty → the bootstrap text', await page.evaluate((l) => {
  const e = document.querySelector(`${l} [data-ax-empty="bootstrap"]`);
  return !e.hidden && e.textContent.trim() === 'Start typing a name';
}, AL));
check('custom input slot is the palette combobox', await page.evaluate((s) => {
  const i = document.querySelector(s);
  return i.getAttribute('role') === 'combobox' && i.getAttribute('aria-label') === 'Search people' && i.placeholder === 'Search people…';
}, inputOf(AS)));
await page.keyboard.type('a');
await sleep(250);
check('pending first query: an empty line, no message, no listbox', await page.evaluate((l) => {
  const list = document.querySelector(l);
  return !list.querySelector('[data-ax-empty="pending"]').hidden && list.querySelector('[data-ax-empty="search"]').hidden
    && list.querySelector('[data-ax-empty="bootstrap"]').hidden && !list.hasAttribute('role');
}, AL));
check('busy: spinner shown after its delay, aria-busy', await page.evaluate((d) => {
  const sp = document.querySelector(d).querySelector('[data-ax-busy]');
  return !sp.hidden && getComputedStyle(sp).opacity === '1' && document.querySelector(d).querySelector('input').getAttribute('aria-busy') != null;
}, AS));
check('the busy start is announced', (await live()).includes('Loading'));
await sleep(350);
check('async results grouped', (await rows(AL)).split(',').length === 8 && (await groupsShown(AL)) === 'A–G,H–Z', `${await rows(AL)} / ${await groupsShown(AL)}`);
check('busy cleared', await page.evaluate((d) => document.querySelector(d).querySelector('[data-ax-busy]').hidden, AS));
await page.keyboard.type('r');
await sleep(30);
check('optimistic narrowing while the next answer is pending', (await rows(AL)) === 'barbara-liskov,margaret-hamilton,susan-kare', await rows(AL));
await sleep(500);
check('the answer replaces the narrowed list', (await rows(AL)) === 'barbara-liskov,margaret-hamilton,susan-kare' && await page.evaluate((d) => document.querySelector(d).querySelector('[data-ax-busy]').hidden, AS));
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await sleep(150);
check('async command runs', (await lastSelect())?.value === 'barbara-liskov' && (await page.textContent('#cp-async-output')).includes('Barbara Liskov'));

console.log('Picker mode');
const PK = '#cp-picker';
const PKL = await listOf(PK);
await page.click('#cp-picker-open');
await sleep(150);
check('the value is selected and highlighted on open', await page.evaluate((l) => {
  const row = document.querySelector(`${l} [data-value="matcha"]`);
  return row.getAttribute('aria-selected') === 'true' && row.getAttribute('data-selected') === 'selected';
}, PKL) && (await active(PK))?.value === 'matcha');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await sleep(150);
check('picking reports the new value', (await lastSelect())?.value === 'stone');
await page.click('#cp-picker-open');
await sleep(150);
check('the new value persists', await page.evaluate((l) => document.querySelector(`${l} [data-value="stone"]`).getAttribute('aria-selected') === 'true', PKL));
await page.keyboard.press('Escape');
await sleep(150);

console.log('Inline preview + standalone');
check('inline preview renders in flow, not modal, no autofocus', await page.evaluate(() => {
  const root = document.querySelector('ax-command-palette > [data-ax-inline]');
  const input = root.querySelector('input');
  return root && !root.closest('dialog') && !input.hasAttribute('data-autofocus') && document.activeElement !== input;
}));
await page.focus('ax-command-palette > [data-ax-inline] input');
await page.keyboard.type('link');
await sleep(60);
check('inline filtering works', await page.evaluate(() => [...document.querySelectorAll('ax-command-palette > [data-ax-inline] [role="option"]')].filter((o) => !o.hidden && !o.closest('[hidden]')).map((o) => o.dataset.value).join(',')) === 'copy-link');
await page.keyboard.press('Escape');
await sleep(60);
check('Escape closes an inline preview locally', await page.evaluate(() => document.querySelector('ax-command-palette > [data-ax-inline]').hidden));
await page.click('#cp-standalone-list [data-value="open"]');
await sleep(40);
check('a standalone item click dispatches astryx-select {value}', (await lastSelect())?.value === 'open' && (await lastSelect())?.target === 'div');
check('standalone list is always a listbox, input a searchbox', await page.evaluate(() =>
  document.getElementById('cp-standalone-list').getAttribute('role') === 'listbox' && document.getElementById('cp-standalone-input').getAttribute('role') === 'searchbox'));
check('standalone item states', await page.evaluate(() => {
  const list = document.getElementById('cp-standalone-list');
  return list.querySelector('[data-value="open"]').getAttribute('data-highlighted') === 'highlighted'
    && list.querySelector('[data-value="share"]').getAttribute('aria-selected') === 'true'
    && list.querySelector('[data-value="archive"]').getAttribute('aria-disabled') === 'true';
}));

await done();
