#!/usr/bin/env node
/**
 * MultiSelector: aria (multiselectable listbox, aria-selected, activedescendant), toggling
 * keeps the list open (click, Enter, Space), astryx-change {values}, hidden inputs per value,
 * trigger summary (count / labels / badges), select-all tri-state + partial name, clear and
 * Delete, form reset, selected-first ordering at open, type-to-select opens, search + create,
 * grouped / disabled options, disabled and read-only triggers, announcements.
 *   node tools/tests/multi-selector.test.mjs
 */
import {setup, isOpen, activeId, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('multi-selector');

const layerOf = (id) => page.evaluate((i) => '#' + document.getElementById(i).closest('ax-multi-selector').getAttribute('data-ax-layer'), id);
const attr = (sel, name) => page.getAttribute(sel, name);
const text = (sel) => page.evaluate((s) => document.querySelector(s)?.textContent?.trim(), sel);
const activeDesc = (id) => page.evaluate((i) => {
  const d = document.getElementById(i).getAttribute('aria-activedescendant');
  return d ? document.getElementById(d)?.getAttribute('data-value') : null;
}, id);
const names = (name) => page.evaluate((n) => [...document.querySelectorAll(`input[name="${n}"]`)].map((i) => i.value).join(','), name);
const order = (layer) => page.evaluate((l) => [...document.querySelectorAll(`${l} [role="option"]:not([data-ax-fixed])`)].map((o) => o.dataset.value).join(','), layer);
const live = () => page.evaluate(() => [...document.querySelectorAll('[data-astryx-live-region]')].map((r) => r.textContent).join('|'));
await page.evaluate(() => {
  window.__changes = [];
  document.addEventListener('astryx-change', (e) => { if (e.target.matches('ax-multi-selector')) window.__changes.push(e.detail); });
});
const lastChange = () => page.evaluate(() => window.__changes.at(-1));

const T = '#ms-form-columns';
const L = await layerOf('ms-form-columns');

console.log('Server markup');
check('trigger is button role=combobox, aria-haspopup=listbox', (await attr(T, 'role')) === 'combobox' && (await attr(T, 'aria-haspopup')) === 'listbox');
check('listbox is aria-multiselectable, labelled by the trigger', (await attr(`${L} [role="listbox"]`, 'aria-multiselectable')) === 'true' && (await attr(`${L} [role="listbox"]`, 'aria-labelledby')) === 'ms-form-columns');
check('hidden input per value', (await names('columns')) === 'Name,Email');
check('count summary', (await text(`${T} .ax-multi-selector-text`)) === '2 selected');
check('select-all starts indeterminate with a partial name', (await attr(`${L} [data-ax-select-all-row]`, 'aria-label')) === 'Select all, partially selected' && (await attr(`${L} [data-ax-select-all-row]`, 'aria-selected')) === 'false');
// Astryx's row checkbox: an inert wrapper holding a CheckboxInput (theme targets apply).
const box = (sel) => page.evaluate((s) => {
  const row = document.querySelector(s);
  const root = row?.querySelector('[data-ax-mark-slot] .astryx-checkbox-input');
  const input = root?.querySelector('input[type="checkbox"]');
  return root && {inert: root.parentElement.inert, size: root.getAttribute('data-size'), label: !!root.querySelector('.astryx-checkbox-label'), checked: input.checked, indeterminate: input.indeterminate, id: input.id};
}, sel);
const nameBox = await box(`${L} [data-value="Name"]`);
const roleBox = await box(`${L} [data-value="Role"]`);
const allBox = await box(`${L} [data-ax-select-all-row]`);
check('rows render an inert CheckboxInput (md for a md MultiSelector, label hidden)', nameBox?.inert && nameBox.size === 'md' && nameBox.label, JSON.stringify(nameBox));
check('server state: selected rows checked, select-all indeterminate', nameBox?.checked && roleBox && !roleBox.checked && allBox?.indeterminate, JSON.stringify({nameBox, roleBox, allBox}));
const ids = await page.evaluate(() => [...document.querySelectorAll('.astryx-multi-selector-option input[type="checkbox"]')].map((i) => i.id));
check('row checkbox ids are unique', ids.length > 0 && new Set(ids).size === ids.length);

console.log('Open, ordering, toggling');
await page.click(T);
await sleep(80);
check('click opens', await isOpen(page, L));
check('aria-expanded true', (await attr(T, 'aria-expanded')) === 'true');
check('opens on the first row (select all)', (await activeDesc('ms-form-columns')) === '__xds_select_all__');
check('selected options move first on open', (await order(L)).startsWith('Name,Email,'));
await page.click(`${L} [data-value="Role"]`);
await sleep(40);
check('click toggles and keeps the list open', await isOpen(page, L));
check('astryx-change {values}', JSON.stringify(await lastChange()) === JSON.stringify({values: ['Name', 'Email', 'Role']}));
check('aria-selected on the toggled option', (await attr(`${L} [data-value="Role"]`, 'aria-selected')) === 'true');
check("the toggled row's CheckboxInput is checked", (await box(`${L} [data-value="Role"]`))?.checked === true);
check('hidden inputs follow', (await names('columns')) === 'Name,Email,Role');
check('order frozen while open', (await order(L)).startsWith('Name,Email,Role'));
await sleep(80);
check('selection change is announced', (await live()).includes('3 of 6 selected'));
await page.keyboard.press('Home');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
check('ArrowDown moves', (await activeDesc('ms-form-columns')) === 'Email');
await page.keyboard.press('Enter');
await sleep(40);
check('Enter toggles off and stays open', (await isOpen(page, L)) && (await names('columns')) === 'Name,Role');
await page.keyboard.press(' ');
await sleep(40);
check('Space toggles back on', (await names('columns')) === 'Name,Role,Email');
await page.keyboard.press('Home');
check('Home → select all', (await activeDesc('ms-form-columns')) === '__xds_select_all__');
await page.keyboard.press('Enter');
await sleep(40);
check('select all selects every enabled option', (await names('columns')).split(',').length === 6);
check('select all row is checked (no partial name)', (await attr(`${L} [data-ax-select-all-row]`, 'aria-selected')) === 'true' && (await attr(`${L} [data-ax-select-all-row]`, 'aria-label')) == null);
check("select-all's CheckboxInput is checked, no longer indeterminate", await box(`${L} [data-ax-select-all-row]`).then((b) => b?.checked === true && !b.indeterminate));
await sleep(80);
check('"All selected" announced', (await live()).includes('All selected'));
await page.keyboard.press('Enter');
await sleep(40);
check('select all again clears', (await names('columns')) === '');
await page.keyboard.press('Escape');
await sleep(60);
check('Escape closes', !(await isOpen(page, L)));
check('focus on the trigger', (await activeId(page)) === 'ms-form-columns');
check('original order restored after close', (await order(L)) === 'Name,Email,Role,Team,Location,Status');
check('placeholder when empty', (await text(`${T} .ax-multi-selector-text`)) === 'Select…');

console.log('Type-to-select, clear, reset');
await page.keyboard.press('t');
await sleep(40);
check('a letter opens the list on the match', (await isOpen(page, L)) && (await activeDesc('ms-form-columns')) === 'Team');
await page.keyboard.press(' ');
await sleep(30);
check('Space after a match toggles it', (await names('columns')) === 'Team');
await page.keyboard.press('Tab');
await sleep(60);
check('Tab closes', !(await isOpen(page, L)));
await page.focus(T);
await page.keyboard.press('Delete');
await sleep(30);
check('Delete clears a closed clearable selector', (await names('columns')) === '' && JSON.stringify((await lastChange()).values) === '[]');
await page.click('#ms-form button[type="reset"]');
await sleep(60);
check('form reset restores the server values', (await names('columns')) === 'Name,Email' && (await text(`${T} .ax-multi-selector-text`)) === '2 selected');
const clearBtn = await page.evaluate(() => '#' + document.getElementById('ms-form-columns').closest('ax-multi-selector').id + ' [data-ax-input-clear]');
await page.click(clearBtn);
await sleep(40);
check('clear button empties', (await names('columns')) === '' && !(await isOpen(page, L)));

console.log('Trigger summaries');
const BL = await layerOf('ms-badges');
check('badges: maxBadges then +N', (await page.evaluate(() => [...document.querySelectorAll('#ms-badges .astryx-badge')].length)) === 2 && (await text('#ms-badges .ax-multi-selector-overflow')) === '+2');
await page.click('#ms-badges');
await sleep(60);
await page.click(`${BL} [data-value="Location"]`);
await sleep(40);
check('badges re-render on change', (await text('#ms-badges .ax-multi-selector-overflow')) === '+3');
await page.keyboard.press('Escape');
const LBL = await layerOf('ms-labels');
await page.click('#ms-labels');
await sleep(60);
await page.click(`${LBL} [data-value="Team"]`);
await sleep(40);
check('labels summary', (await text('#ms-labels .ax-multi-selector-text')) === 'Name, Role, Status');
await page.keyboard.press('Escape');

console.log('Search + create');
const TG = '#ms-tags';
const TL = await layerOf('ms-tags');
await page.click(TG);
await sleep(120);
const input = `${TL} [data-ax-panel-search] input`;
check('search input focused and is the combobox', await page.evaluate((s) => document.activeElement === document.querySelector(s), input) && (await attr(input, 'role')) === 'combobox');
await page.keyboard.type('se');
await sleep(40);
const vis = await page.evaluate((l) => [...document.querySelectorAll(`${l} [role="option"]:not([data-ax-fixed])`)].filter((o) => !o.hidden).map((o) => o.dataset.value).join(','), TL);
check('search filters', vis === 'Security,Research', vis);
await page.keyboard.type('curity');
await sleep(40);
check('create row hidden while an option has that exact label', await page.evaluate((l) => document.querySelector(`${l} [data-ax-create-row]`).hidden, TL));
for (let i = 0; i < 6; i++) await page.keyboard.press('Backspace');
await page.keyboard.type('o');
await sleep(80);
check('create row offered for an unmatched query', await page.evaluate((l) => !document.querySelector(`${l} [data-ax-create-row]`).hidden, TL) && (await text(`${TL} [data-ax-create-row]`)) === 'Create "seo"');
check('empty state stays out while the create row shows', await page.evaluate((l) => document.querySelector(`${l} [data-ax-empty="search"]`).hidden, TL));
check('create row announced', (await live()).includes('Create "seo"'));
await page.keyboard.press('Enter');
await sleep(60);
const created = await lastChange();
check('Enter with nothing highlighted creates', JSON.stringify(created) === JSON.stringify({values: ['seo'], change: {type: 'create', query: 'seo'}}), JSON.stringify(created));
check('the new option exists and is selected', (await attr(`${TL} [data-value="seo"]`, 'aria-selected')) === 'true');
check('search cleared after create', (await page.inputValue(input)) === '');
check('hidden input for the created value', (await names('tags')) === 'seo');
await page.keyboard.type('zzz');
await page.keyboard.press('Backspace');
await page.keyboard.press('Backspace');
await page.keyboard.press('Backspace');
await page.keyboard.press('Escape');
await sleep(60);
check('Escape closes the searchable list, focus to trigger', !(await isOpen(page, TL)) && (await activeId(page)) === 'ms-tags');

console.log('Grouped / disabled / read-only');
const GL = await layerOf('ms-grouped');
check('groups are role=group with names', (await page.evaluate((l) => [...document.querySelectorAll(`${l} [role="group"]`)].map((g) => g.getAttribute('aria-label')).join(','), GL)) === 'Engineering,Design');
check('disabled option aria-disabled', (await attr(`${GL} [data-value="infra"]`, 'aria-disabled')) === 'true');
await page.focus('#ms-grouped');
await page.keyboard.press('ArrowDown');
await sleep(40);
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
check('arrows skip the disabled option', (await activeDesc('ms-grouped')) === 'web');
await page.keyboard.press('ArrowUp');
await page.keyboard.press('ArrowUp');
await page.keyboard.press('Enter');
await sleep(30);
check('select-all keeps the selected disabled option', JSON.stringify((await lastChange()).values.sort()) === JSON.stringify(['brand', 'infra', 'mobile', 'other', 'product', 'web']));
await page.keyboard.press('Escape');
check('disabled trigger focusable + aria-disabled, nothing submitted', (await attr('#ms-disabled', 'aria-disabled')) === 'true' && (await page.$('input[name="disabled"]')) === null);
check('read-only: aria-readonly, no popup, values submitted', (await attr('#ms-readonly', 'aria-readonly')) === 'true' && (await attr('#ms-readonly', 'aria-haspopup')) == null && (await names('readonly')) === 'Name,Email');

await done();
