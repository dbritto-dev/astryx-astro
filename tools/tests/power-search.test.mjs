#!/usr/bin/env node
/**
 * PowerSearch: field typeahead (browse, groups, aliases, content search, "field operator value"
 * suggestions), adding through the editor popover (enum saves on pick, text + Enter, number +
 * Enter, async string suggestions), `empty` operators adding at once, editing a token (dialog
 * named by the token, aria-expanded, operator switch, Delete), Escape cancel + focus return,
 * Backspace / ✕ / Clear all with read-only filters locked, astryx-change {filters, changeType,
 * index}, result count announcement, read-only / disabled fields, the standalone editor.
 *   node tools/tests/power-search.test.mjs
 */
import {setup, isOpen, activeId, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup({height: 1000});
await open('power-search');

const ROOT = '#ps-main';
const input = 'input[data-testid="ps-main-input"]';
const listOf = () => page.evaluate((r) => '#' + document.querySelector(r).querySelector('ax-tokenizer').getAttribute('data-ax-layer'), ROOT);
const layerOf = (root) => page.evaluate((r) => '#' + document.querySelector(r).getAttribute('data-ax-layer'), root);
const rows = (l) => page.evaluate((s) => [...document.querySelectorAll(`${s} [role="option"]:not([data-ax-empty])`)].filter((o) => !o.hidden && !o.closest('[hidden]')).map((o) => o.dataset.id), l);
const tokens = (root = ROOT) => page.evaluate((r) => [...document.querySelector(r).querySelectorAll('[data-ax-token-item]')].map((t) => {
  const label = t.querySelector('.ax-token-label')?.textContent ?? '';
  const value = t.querySelector('.ax-power-search-token-value')?.textContent;
  return value ? `${label} ${value}` : label;
}), root);
const live = () => page.evaluate(() => [...document.querySelectorAll('[data-astryx-live-region]')].map((r) => r.textContent).join('|'));
await page.evaluate(() => {
  window.__changes = [];
  document.addEventListener('astryx-change', (e) => { if (e.target.matches('ax-power-search')) window.__changes.push({id: e.target.id, ...e.detail}); });
});
const lastChange = () => page.evaluate(() => window.__changes.at(-1));
const changeCount = () => page.evaluate(() => window.__changes.length);
const LIST = await listOf();
const EDITOR = await layerOf(ROOT);

console.log('Server markup');
check('root theme hook and tokenizer field', await page.evaluate((r) => {
  const el = document.querySelector(r);
  return el.classList.contains('astryx-power-search') && el.querySelector('.astryx-tokenizer input[role="combobox"]') != null;
}, ROOT));
check('filter tokens: label + bold value', JSON.stringify(await tokens()) === JSON.stringify(['Status: is Open', 'Labels: is any of Bug, UI', 'Team: is Core']), JSON.stringify(await tokens()));
check('value is bold', await page.evaluate((r) => getComputedStyle(document.querySelector(`${r} .ax-power-search-token-value`)).fontWeight >= 600, ROOT));
check('editable token: dialog trigger named by its text, remove named by its text', await page.evaluate((r) => {
  const tok = document.querySelector(`${r} [data-ax-token-item^="filter-0-"]`);
  const action = tok.querySelector('.ax-token-action');
  const name = document.getElementById(action.getAttribute('aria-labelledby'))?.textContent;
  return name === 'Status: is Open' && action.getAttribute('aria-haspopup') === 'dialog' && action.getAttribute('aria-expanded') === 'false'
    && tok.querySelector('[data-ax-token-remove]').getAttribute('aria-label') === 'Remove Status: is Open';
}, ROOT));
check('read-only filter: no action, no remove', await page.evaluate((r) => {
  const tok = document.querySelector(`${r} [data-ax-token-item^="filter-2-"]`);
  return !tok.querySelector('.ax-token-action') && !tok.querySelector('[data-ax-token-remove]');
}, ROOT));
check('result count in the end lane', await page.evaluate((r) => document.querySelector(`${r} [data-ax-result-count-text]`).textContent === '3 results', ROOT));

console.log('Field typeahead');
await page.click(input);
await sleep(80);
check('focus browses every field (entries on focus)', (await rows(LIST)).length === 15, (await rows(LIST)).join(','));
check('ungrouped first, then groups', await page.evaluate((l) => [...document.querySelectorAll(`${l} [role="group"]`)].map((g) => g.getAttribute('aria-label')).join(','), LIST) === 'Dates,Flags,Numbers');
check('rows carry the field icon and description', await page.evaluate((l) => {
  const row = document.querySelector(`${l} [role="option"][data-id="status"]`);
  return row.querySelector('.astryx-icon') != null && row.textContent.includes('Where the issue is in its workflow');
}, LIST));
await page.keyboard.type('state');
await sleep(60);
check('aliases match (state → Status)', (await rows(LIST))[1] === 'status', (await rows(LIST)).join(','));
check('content search row first', (await rows(LIST))[0] === '__content_search__:state');
await page.fill(input, '');
await page.keyboard.type('title contains foo');
await sleep(60);
check('"field operator value" suggestion', (await rows(LIST)).includes('title:contains:value:foo'), (await rows(LIST)).join(','));
await page.fill(input, '');
await page.keyboard.type('focus');
await sleep(60);
await page.keyboard.press('Enter');
await sleep(150);
const c1 = await lastChange();
check('content search adds Title contains "focus" at once', c1?.changeType === 'add' && c1.index === 3 && JSON.stringify(c1.filters[3]) === JSON.stringify({field: 'title', operator: 'contains', value: {type: 'string', value: 'focus'}}));
check('the new token renders', (await tokens()).at(-1) === 'Title: contains focus');
check('the editor did not open', !(await isOpen(page, EDITOR)));
await sleep(150);
check('result count updated by the page and announced', await page.evaluate((r) => document.querySelector(`${r} [data-ax-result-count-text]`).textContent === '1 result', ROOT) && (await live()).includes('1 result'));

console.log('Add through the editor: enum saves on pick');
await page.keyboard.press('Escape');
await page.fill(input, '');
await page.keyboard.type('Status');
await sleep(60);
await page.keyboard.press('Enter');
await sleep(250);
check('picking a field opens the editor popover', await isOpen(page, EDITOR));
check('adding: no dialog role on the surface', await page.evaluate((l) => !document.querySelector(`${l} [data-ax-surface]`).hasAttribute('role'), EDITOR));
check('field + default operator preselected', await page.evaluate((l) => {
  const sels = [...document.querySelectorAll(`${l} ax-selector`)];
  return sels[0]?.value === 'status' && sels[1]?.value === 'is';
}, EDITOR));
check('the value control takes focus', await page.evaluate((l) => document.querySelector(`${l} [data-ax-value-cell]`).contains(document.activeElement), EDITOR));
check('Apply disabled until a value', await page.evaluate((l) => document.querySelector(`${l} [data-ax-apply]`).disabled, EDITOR));
const before = await changeCount();
await page.keyboard.press('Enter');
await sleep(120);
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await sleep(200);
const c2 = await lastChange();
check('picking an enum value saves the filter', (await changeCount()) === before + 1 && c2.changeType === 'add' && JSON.stringify(c2.filters.at(-1)) === JSON.stringify({field: 'status', operator: 'is', value: {type: 'enum', value: 'closed'}}), JSON.stringify(c2?.filters.at(-1)));
check('the editor closes and focus returns to the input', !(await isOpen(page, EDITOR)) && await page.evaluate((s) => document.activeElement === document.querySelector(s), input));

console.log('empty operator, Escape cancel');
await page.keyboard.press('Escape');
await page.keyboard.type('Archived');
await sleep(60);
await page.keyboard.press('Enter');
await sleep(200);
check('an empty operator adds at once', (await lastChange()).filters.at(-1).operator === 'is_true' && !(await isOpen(page, EDITOR)));
await page.keyboard.press('Escape');
await page.keyboard.type('Estimate');
await sleep(60);
await page.keyboard.press('Enter');
await sleep(250);
check('number editor opens', await isOpen(page, EDITOR) && await page.evaluate((l) => document.querySelector(`${l} ax-number-input`) != null, EDITOR));
const n = await changeCount();
await page.keyboard.press('Escape');
await sleep(150);
check('Escape cancels: closed, nothing added', !(await isOpen(page, EDITOR)) && (await changeCount()) === n);
check('focus back on the input', await page.evaluate((s) => document.activeElement === document.querySelector(s), input));
await page.keyboard.press('Escape');
await page.keyboard.type('Estimate');
await sleep(60);
await page.keyboard.press('Enter');
await sleep(250);
await page.keyboard.type('4.5');
await page.keyboard.press('Enter');
await sleep(200);
check('number + Enter saves', JSON.stringify((await lastChange()).filters.at(-1)) === JSON.stringify({field: 'estimate', operator: 'equals', value: {type: 'float', value: 4.5}}), JSON.stringify((await lastChange()).filters.at(-1)));

console.log('Edit a token');
await page.keyboard.press('Escape');
await page.click(`${ROOT} [data-ax-token-item^="filter-3-"] .ax-token-action`);
await sleep(250);
check('pressing a token opens its editor as a dialog named by the token', await isOpen(page, EDITOR) && await page.evaluate((l) => {
  const s = document.querySelector(`${l} [data-ax-surface]`);
  return s.getAttribute('role') === 'dialog' && s.getAttribute('aria-label') === 'Title: contains focus';
}, EDITOR));
check('the token is aria-expanded', (await page.getAttribute(`${ROOT} [data-ax-token-item^="filter-3-"] .ax-token-action`, 'aria-expanded')) === 'true');
check('the value is loaded into the editor', await page.evaluate((l) => document.querySelector(`${l} ax-text-input input`)?.value === 'focus', EDITOR));
check('edit mode shows Delete', await page.evaluate((l) => !document.querySelector(`${l} [data-ax-delete-slot]`).hidden, EDITOR));
await page.fill(`${EDITOR} ax-text-input input`, 'focus ring');
await page.keyboard.press('Enter');
await sleep(200);
const c3 = await lastChange();
check('Enter in the text value saves an edit', c3.changeType === 'edit' && c3.index === 3 && c3.filters[3].value.value === 'focus ring');
check('the edited token re-renders', (await tokens())[3] === 'Title: contains focus ring', (await tokens())[3]);
await page.click(`${ROOT} [data-ax-token-item^="filter-3-"] .ax-token-action`);
await sleep(250);
await page.click(`${EDITOR} [data-ax-operator-cell] ax-selector button[role="combobox"]`);
await sleep(100);
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await sleep(100);
check('an operator switch of the same type keeps the value', await page.evaluate((l) => {
  const sels = [...document.querySelectorAll(`${l} ax-selector`)];
  return sels[1].value === 'not_contains' && document.querySelector(`${l} ax-text-input input`).value === 'focus ring';
}, EDITOR));
await page.click(`${EDITOR} [data-ax-delete]`);
await sleep(200);
check('Delete removes the filter', (await lastChange()).changeType === 'remove' && (await lastChange()).index === 3 && !(await tokens()).some((t) => t.startsWith('Title')));

console.log('Async value suggestions');
await page.keyboard.press('Escape');
await page.keyboard.type('Component');
await sleep(60);
await page.keyboard.press('Enter');
await sleep(250);
await page.keyboard.type('dia');
await sleep(500);
const valueList = await page.evaluate((l) => '#' + document.querySelector(`${l} ax-typeahead`).getAttribute('data-ax-layer'), EDITOR);
check('the value typeahead shows the page\'s answer', (await rows(valueList)).join(',') === 'Dialog', (await rows(valueList)).join(','));
await page.keyboard.press('Enter');
await sleep(200);
check('picking a suggestion saves', JSON.stringify((await lastChange()).filters.at(-1)) === JSON.stringify({field: 'component', operator: 'is', value: {type: 'string', value: 'Dialog'}}));

console.log('Removing: Backspace, ✕, Clear all');
await page.keyboard.press('Escape');
await page.focus(input);
const count0 = (await tokens()).length;
await page.keyboard.press('Backspace');
await sleep(100);
check('Backspace removes the last filter', (await tokens()).length === count0 - 1 && (await lastChange()).changeType === 'remove');
await page.click(`${ROOT} [data-ax-token-item^="filter-1-"] [data-ax-token-remove]`);
await sleep(120);
check('✕ removes that filter (index reported)', (await lastChange()).changeType === 'remove' && (await lastChange()).index === 1 && !(await tokens()).some((t) => t.startsWith('Labels')));
await page.click(`${ROOT} [data-ax-input-clear]`);
await sleep(120);
check('Clear all keeps the read-only filter', JSON.stringify(await tokens()) === JSON.stringify(['Team: is Core']), JSON.stringify(await tokens()));
check('Clear all announced in PowerSearch\'s words', (await live()).includes('Editable filters removed'));
await page.focus(input);
await page.keyboard.press('Backspace');
await sleep(100);
check('Backspace never removes a read-only filter', JSON.stringify(await tokens()) === JSON.stringify(['Team: is Core']));
await page.click(`${ROOT} [data-ax-token-item^="filter-0-"]`);
await sleep(200);
check('a read-only token does not open the editor', !(await isOpen(page, EDITOR)));

console.log('Read-only, disabled, sizes');
check('read-only field: tokens static, no clear', await page.evaluate(() => {
  const el = document.getElementById('ps-readonly');
  return !el.querySelector('.ax-token-action') && !el.querySelector('[data-ax-token-remove]') && !el.querySelector('[data-ax-input-clear]');
}));
check('disabled: aria-disabled input, reason described', await page.evaluate(() => {
  const i = document.getElementById('ps-disabled').querySelector('input[role="combobox"]');
  const ids = (i.getAttribute('aria-describedby') ?? '').split(' ');
  return i.getAttribute('aria-disabled') === 'true' && ids.some((id) => document.getElementById(id)?.textContent.includes('Sign in to filter'));
}));
check('size reaches the field and tokens', await page.evaluate(() => {
  const el = document.getElementById('ps-sm');
  return el.querySelector('.astryx-tokenizer').dataset.size === 'sm' && el.querySelector('.astryx-token').dataset.size === 'sm';
}));
check('folded overflow forwarded', await page.evaluate(() => document.getElementById('ps-overflow').querySelector('.astryx-tokenizer').hasAttribute('data-ax-truncated')));

console.log('Standalone editor');
check('loads its filter without stealing focus', await page.evaluate(() => {
  const ed = document.getElementById('ps-editor');
  return ed.querySelector('ax-number-input').value === 2 && !ed.contains(document.activeElement);
}));
await page.click('#ps-editor [data-ax-apply]');
await sleep(80);
check('Apply → astryx-save {filter}', (await page.textContent('#ps-editor-output')).includes('"value":{"type":"integer","value":2}'));
await page.click('#ps-editor [data-ax-cancel]');
await sleep(80);
check('Cancel → astryx-cancel', (await page.textContent('#ps-editor-output')) === 'astryx-cancel');
await page.click('#ps-editor [data-ax-delete]');
await sleep(80);
check('Delete → astryx-save {filter: null}', (await page.textContent('#ps-editor-output')) === 'astryx-save null');

await done();
