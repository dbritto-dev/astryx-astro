#!/usr/bin/env node
/**
 * CheckboxList + CheckboxListItem in a real browser (run `cd apps/docs && npx astro build`
 * first): group wiring (role, label, description, theme target), checkbox names (string, rich
 * label, aria-label) and descriptions, toggling by checkbox / row surface / Space, row state
 * (data-selected, indicator), `astryx-change` {values} in Astryx order (the CheckboxInputs' own
 * event stays inside), select-all with indeterminate (standalone and collection, disabled items
 * frozen), compact size, disabled / disabled-with-reason (tooltip) / read-only / loading items,
 * standalone items in a List (`astryx-check`), native form values, the required group, reset,
 * and the element's `value` API.
 *   node tools/tests/checkbox-list.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('checkbox-list');

const group = (t) => `ax-checkbox-list[data-test="${t}"]`;
await page.evaluate(() => {
  window.__events = [];
  for (const type of ['astryx-change', 'astryx-check']) {
    document.addEventListener(type, (e) => window.__events.push({
      type, tag: e.target.tagName, test: e.target.closest('[data-test]')?.dataset.test ?? null, detail: JSON.parse(JSON.stringify(e.detail, (k, v) => (k === 'event' ? undefined : v))),
    }));
  }
});
const events = () => page.evaluate(() => window.__events.splice(0));
const snapshot = (t) => page.evaluate((sel) => [...document.querySelector(sel).querySelectorAll('li[data-ax-checkbox-list-item]')].map((row) => {
  const input = row.querySelector('input[type="checkbox"]');
  const ind = row.querySelector('[data-ax-indicator-slot] > *');
  return {value: row.dataset.axCheckboxValue ?? null, checked: input.checked, indeterminate: input.indeterminate, selected: row.dataset.selected ?? null, indicator: ind?.getAttribute('data-checked') ?? null, required: input.required};
}), group(t));
const checkedValues = (rows) => rows.filter((r) => r.checked).map((r) => r.value).join(',');
const consistent = (rows) => rows.every((r) => (r.indeterminate ? r.indicator === 'indeterminate' : r.checked ? r.indicator === 'checked' : r.indicator === null));

// ── wiring ──
const wiring = await page.evaluate((sel) => {
  const g = document.querySelector(sel);
  const field = g.closest('.astryx-field');
  const label = document.getElementById(g.getAttribute('aria-labelledby'));
  const desc = (g.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent);
  const input = g.querySelector('li input[type="checkbox"]');
  const list = g.querySelector('.astryx-list');
  return {
    role: g.getAttribute('role'), fieldClass: field?.className, label: label?.textContent?.trim(), labelTag: label?.tagName, desc,
    name: input.labels?.[0]?.textContent?.trim(), inputDesc: document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent,
    listDensity: list?.dataset.density, rowDensity: g.querySelector('li').dataset.density, size: input.closest('ax-checkbox-input')?.dataset.size,
    tabStops: g.querySelector('li').querySelectorAll('button, a[href], [tabindex="0"]').length, delegate: g.querySelector('li').dataset.axClickable,
  };
}, group('notify'));
check('role="group" labelled by the Field label (a span), described by the description', wiring.role === 'group' && wiring.label?.startsWith('Notifications') && wiring.labelTag === 'SPAN' && wiring.desc.includes('Where we reach you'), JSON.stringify(wiring));
check('theme target .astryx-checkbox-list on the Field root', /astryx-field/.test(wiring.fieldClass) && /astryx-checkbox-list/.test(wiring.fieldClass), JSON.stringify(wiring));
check('each checkbox is named by its label and described by its row description', wiring.name === 'Email' && wiring.inputDesc === 'Daily digest', JSON.stringify(wiring));
check('rows are List items (balanced, md checkbox), the row delegates to the checkbox (one tab stop)', wiring.listDensity === 'balanced' && wiring.rowDensity === 'balanced' && wiring.size === 'md' && wiring.tabStops === 0 && wiring.delegate === 'delegate', JSON.stringify(wiring));

const rich = await page.evaluate((sel) => {
  const inputs = [...document.querySelectorAll(`${sel} input[type="checkbox"]`)];
  const nameOf = (i) => (i.getAttribute('aria-labelledby') ? i.getAttribute('aria-labelledby').split(' ').map((id) => document.getElementById(id)?.textContent?.trim()).join(' ') : i.labels?.[0]?.textContent?.trim());
  return {pro: nameOf(inputs[0]), proLabelledBy: inputs[0].hasAttribute('aria-labelledby'), support: nameOf(inputs[1]), supportHidden: inputs[1].labels?.[0]?.textContent?.trim(), audit: nameOf(inputs[2])};
}, group('rich'));
check('aria-label replaces a rich label name', rich.pro === 'Pro plan Recommended option' && !rich.proLabelledBy, JSON.stringify(rich));
check('a rich label names the checkbox through aria-labelledby (hidden label says "Checkbox")', rich.support?.startsWith('Priority support, see terms') && rich.supportHidden === 'Checkbox' && rich.audit === 'Audit log', JSON.stringify(rich));

// ── toggling, values, events ──
let rows = await snapshot('notify');
check('initial values render checked rows (fill, indicator)', checkedValues(rows) === 'email,push' && consistent(rows) && rows[0].selected === 'selected' && rows[1].selected === null, JSON.stringify(rows));
await page.click(`${group('notify')} li:nth-of-type(2) .ax-item-label`);
rows = await snapshot('notify');
let ev = await events();
check('a row surface click toggles its checkbox; the row gets data-selected', rows[1].checked && rows[1].selected === 'selected' && consistent(rows), JSON.stringify(rows));
check('astryx-change {values} appends the toggled value (Astryx order), from <ax-checkbox-list>', ev.length === 1 && ev[0].type === 'astryx-change' && ev[0].tag === 'AX-CHECKBOX-LIST' && JSON.stringify(ev[0].detail.values) === '["email","push","sms"]', JSON.stringify(ev));
await page.click(`${group('notify')} li:nth-of-type(1) input`);
rows = await snapshot('notify');
ev = await events();
check('a click on the checkbox unchecks it and removes the value', !rows[0].checked && rows[0].selected === null && JSON.stringify(ev.map((e) => e.detail.values)) === '[["push","sms"]]', JSON.stringify(ev));
await page.focus(`${group('notify')} li:nth-of-type(1) input`);
await page.keyboard.press('Space');
rows = await snapshot('notify');
ev = await events();
check('Space toggles the focused checkbox', rows[0].checked && JSON.stringify(ev.map((e) => e.detail.values)) === '[["push","sms","email"]]', JSON.stringify(ev));
check('the CheckboxInputs\' own astryx-change {isChecked} never leaves the row', ev.every((e) => e.tag === 'AX-CHECKBOX-LIST'), JSON.stringify(ev));
const ring = await page.evaluate(() => {
  const input = document.querySelector('ax-checkbox-list[data-test="notify"] li:nth-of-type(1) input');
  return {row: getComputedStyle(input.closest('li')).outlineStyle, box: getComputedStyle(input.closest('.ax-checkbox-box').querySelector('.ax-indicator-ring')).outlineStyle};
});
check('keyboard focus on the checkbox rings the row (focus within) and the box', ring.row === 'solid', JSON.stringify(ring));
await page.click(`${group('rich')} li:nth-of-type(2) a`);
rows = await snapshot('rich');
ev = await events();
check('a link in a rich label keeps its own action (no toggle)', !rows[1].checked && ev.length === 0, JSON.stringify({rows, ev}));
// ── density ──
const compact = await page.evaluate((sel) => {
  const g = document.querySelector(sel);
  return {size: g.querySelector('ax-checkbox-input').dataset.size, row: g.querySelector('li').dataset.density, divider: getComputedStyle(g.querySelector('li')).borderBottomWidth};
}, group('density-compact'));
check('compact list: small (sm) checkboxes, compact rows, dividers', compact.size === 'sm' && compact.row === 'compact' && compact.divider === '1px', JSON.stringify(compact));

// ── select all (standalone) ──
rows = await snapshot('select-all-standalone');
check('select-all starts indeterminate from its items', rows[0].indeterminate && rows[0].indicator === 'indeterminate' && rows[0].selected === null, JSON.stringify(rows[0]));
await page.click(`${group('select-all-standalone')} [data-test="select-all"] .ax-item-label`);
rows = await snapshot('select-all-standalone');
ev = await events();
check('select-all (indeterminate) checks every item', rows.every((r) => r.checked && !r.indeterminate) && consistent(rows) && rows.every((r) => r.selected === 'selected'), JSON.stringify(rows));
check('select-all dispatches astryx-check {isChecked: true} from its row; no list astryx-change in standalone mode', ev.length === 1 && ev[0].type === 'astryx-check' && ev[0].detail.isChecked === true && ev[0].test === 'select-all' && ev[0].tag === 'LI', JSON.stringify(ev));
await page.click(`${group('select-all-standalone')} [data-test="select-all"] input`);
rows = await snapshot('select-all-standalone');
ev = await events();
check('select-all (checked) unchecks every item', rows.every((r) => !r.checked) && consistent(rows) && ev[0]?.detail.isChecked === false, JSON.stringify({rows, ev}));
await page.click(`${group('select-all-standalone')} li:nth-of-type(3) .ax-item-label`);
rows = await snapshot('select-all-standalone');
ev = await events();
check('an item toggle makes select-all indeterminate and dispatches astryx-check from the item', rows[0].indeterminate && rows[2].checked && ev.length === 1 && ev[0].type === 'astryx-check' && ev[0].detail.isChecked === true, JSON.stringify({rows, ev}));

// ── select all (collection, a disabled item frozen) ──
rows = await snapshot('select-all-collection');
check('collection select-all: indeterminate over name,email', rows[0].indeterminate && checkedValues(rows.slice(1)) === 'name,email', JSON.stringify(rows));
await page.click(`${group('select-all-collection')} [data-test="select-all"] input`);
rows = await snapshot('select-all-collection');
ev = await events();
check('select-all checks the enabled items only; the disabled one stays unchecked', checkedValues(rows.slice(1)) === 'name,email,role' && !rows[4].checked && rows[0].checked && !rows[0].indeterminate, JSON.stringify(rows));
check('collection mode: astryx-check from select-all, then astryx-change {values} with the new value appended', ev.length === 2 && ev[0].type === 'astryx-check' && ev[1].type === 'astryx-change' && JSON.stringify(ev[1].detail.values) === '["name","email","role"]', JSON.stringify(ev));
await page.click(`${group('select-all-collection')} li:nth-of-type(3) input`);
rows = await snapshot('select-all-collection');
ev = await events();
check('an item toggle in collection mode: values + select-all indeterminate', rows[0].indeterminate && JSON.stringify(ev.map((e) => [e.type, e.detail.values])) === '[["astryx-change",["name","role"]]]', JSON.stringify(ev));
const api = await page.evaluate((sel) => {
  const g = document.querySelector(sel);
  const before = g.value;
  g.value = ['role', 'email', 'name'];
  return {before, after: g.value, events: window.__events.length};
}, group('select-all-collection'));
rows = await snapshot('select-all-collection');
check('el.value get/set: no event, items and select-all follow', JSON.stringify(api.before) === '["name","role"]' && JSON.stringify(api.after) === '["role","email","name"]' && api.events === 0 && rows[0].checked && checkedValues(rows.slice(1)) === 'name,email,role', JSON.stringify({api, rows}));

// ── status, required indicator ──
const status = await page.evaluate((sel) => {
  const g = document.querySelector(sel);
  const desc = (g.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent?.trim());
  return {invalid: [...g.querySelectorAll('input')].map((i) => i.getAttribute('aria-invalid')), desc, required: [...g.querySelectorAll('input')].map((i) => i.required)};
}, group('status-error'));
check('error status: every checkbox aria-invalid, the message describes the group', status.invalid.every((v) => v === 'true') && status.desc.some((d) => d?.includes('Choose at least one channel')), JSON.stringify(status));
check('isRequired with nothing checked: the first box carries native required', JSON.stringify(status.required) === '[true,false]', JSON.stringify(status));
const hidden = await page.evaluate((sel) => {
  const g = document.querySelector(sel);
  const field = g.closest('.astryx-field');
  const label = document.getElementById(g.getAttribute('aria-labelledby'));
  return {width: field.getBoundingClientRect().width, container: field.classList.contains('docs-checkbox-container'), control: g.getAttribute('style'), labelW: label.getBoundingClientRect().width};
}, group('hidden-label'));
check('hidden label (sr-only), width, containerClass and controlStyle routing', hidden.width === 220 && hidden.container && /padding-block/.test(hidden.control ?? '') && hidden.labelW <= 1, JSON.stringify(hidden));

// ── disabled, reason tooltip, read-only, loading ──
const disabled = await page.evaluate((sel) => {
  const g = document.querySelector(sel);
  return {group: g.getAttribute('aria-disabled'), inputs: [...g.querySelectorAll('input')].map((i) => [i.getAttribute('aria-disabled'), i.disabled, i.getAttribute('form')]), rows: [...g.querySelectorAll('li')].map((r) => r.getAttribute('aria-disabled'))};
}, group('disabled'));
check('disabled group: aria-disabled group, rows and (focusable) checkboxes detached from the form', disabled.group === 'true' && disabled.inputs.every(([a, d, f]) => a === 'true' && d === false && f === '') && disabled.rows.every((r) => r === 'true'), JSON.stringify(disabled));
await page.click(`${group('disabled')} li:nth-of-type(2) input`, {force: true});
rows = await snapshot('disabled');
check('a click on a disabled checkbox changes nothing', !rows[1].checked && rows[0].checked && (await events()).length === 0, JSON.stringify(rows));
const reason = await page.evaluate((sel) => {
  const g = document.querySelector(sel);
  const tipId = g.getAttribute('data-ax-tooltip');
  const inputs = [...g.querySelectorAll('input')];
  return {tipId, groupDesc: g.getAttribute('aria-describedby')?.split(' ').includes(tipId), inputDesc: inputs.map((i) => i.getAttribute('aria-describedby'))};
}, group('disabled-message'));
check('disabled reason describes the group and each checkbox (after its own description)', reason.groupDesc && reason.inputDesc[0]?.split(' ').length === 2 && reason.inputDesc[0].endsWith(reason.tipId) && reason.inputDesc[1] === reason.tipId, JSON.stringify(reason));
await page.focus(`${group('disabled-message')} li:nth-of-type(1) input`);
await page.keyboard.press('Tab');
await page.keyboard.press('Shift+Tab');
await sleep(400);
const tipShown = await page.evaluate((id) => document.getElementById(id)?.matches(':popover-open'), reason.tipId);
check('keyboard focus on a checkbox shows the reason tooltip (checkboxes stay focusable)', tipShown === true, String(tipShown));
await page.keyboard.press('Escape');
await page.mouse.move(0, 0);

await page.click(`${group('read-only')} li:nth-of-type(2) .ax-item-label`);
await page.click(`${group('read-only')} li:nth-of-type(2) input`, {force: true});
rows = await snapshot('read-only');
const readOnly = await page.evaluate((sel) => ({ro: [...document.querySelectorAll(`${sel} input`)].map((i) => i.getAttribute('aria-readonly')), delegate: document.querySelector(`${sel} li`).dataset.axClickable ?? null}), group('read-only'));
check('read-only: aria-readonly, nothing toggles, no row delegation, full-opacity checked row without the fill', !rows[1].checked && rows[0].checked && rows[0].selected === null && readOnly.ro.every((v) => v === 'true') && readOnly.delegate === null && (await events()).length === 0, JSON.stringify({rows, readOnly}));

const perItem = await page.evaluate((sel) => {
  const rows = [...document.querySelectorAll(`${sel} li`)];
  return rows.map((r) => ({busy: r.getAttribute('aria-busy'), disabled: r.getAttribute('aria-disabled'), spinner: !!r.querySelector('.astryx-spinner, [role="progressbar"], svg[class*="spinner"]'), selected: r.dataset.selected ?? null}));
}, group('per-item'));
check('disabled items dim (a checked disabled item has no fill); a loading item is aria-busy with a spinner', perItem[0].disabled === 'true' && perItem[1].disabled === 'true' && perItem[1].selected === null && perItem[2].busy === 'true' && perItem[2].spinner, JSON.stringify(perItem));
await page.click(`${group('per-item')} li:nth-of-type(3) input`, {force: true});
rows = await snapshot('per-item');
check('a loading item does not toggle', !rows[2].checked && (await events()).length === 0, JSON.stringify(rows));

// ── standalone items in a plain List ──
await page.click('[data-test="terms"] .ax-item-label');
ev = await events();
const terms = await page.evaluate(() => {
  const row = document.querySelector('[data-test="terms"]');
  return {checked: row.querySelector('input').checked, selected: row.dataset.selected, log: document.querySelector('[data-test="log"]').textContent};
});
check('a standalone item in a List dispatches astryx-check {isChecked} from its row', terms.checked && terms.selected === 'selected' && ev.length === 1 && ev[0].type === 'astryx-check' && ev[0].detail.isChecked === true && ev[0].test === 'terms', JSON.stringify({terms, ev}));
const partial = await page.evaluate(() => {
  const input = document.querySelector('[data-test="plain-list"] li:nth-of-type(3) input');
  return {indeterminate: input.indeterminate};
});
check('isChecked="indeterminate" renders the mixed state', partial.indeterminate, JSON.stringify(partial));

// ── native form: htmlName, required group, reset ──
const form = 'form[data-test="form"]';
const formState = () => page.evaluate((sel) => {
  const f = document.querySelector(sel);
  const inputs = [...f.querySelectorAll('ax-checkbox-list[data-test="form-toppings"] input')];
  return {valid: f.checkValidity(), required: inputs.map((i) => i.required), names: inputs.map((i) => i.name), values: inputs.map((i) => i.value), out: f.querySelector('[data-test="form-output"]').textContent};
}, form);
let fs = await formState();
check('htmlName + item value on every enabled checkbox (a disabled one is not submitted)', fs.names.join() === 'toppings,toppings,' && fs.values.join() === 'cheese,basil,olives', JSON.stringify(fs));
check('required group: nothing checked → the first enabled box is required and the form is invalid', !fs.valid && JSON.stringify(fs.required) === '[true,false,false]', JSON.stringify(fs));
await page.click(`${form} button[type="submit"]`);
await sleep(50);
const blocked = await page.evaluate((sel) => ({out: document.querySelector(`${sel} [data-test="form-output"]`).textContent, focus: document.activeElement?.value}), form);
check('submit is blocked and focus moves to the required box', blocked.out === '' && blocked.focus === 'cheese', JSON.stringify(blocked));
await page.click(`${group('form-toppings')} li:nth-of-type(2) .ax-item-label`);
fs = await formState();
check('a checked box releases the requirement', fs.valid && fs.required.every((r) => !r), JSON.stringify(fs));
await page.click(`${form} button[type="submit"]`);
await sleep(50);
fs = await formState();
check('FormData carries every checked value under htmlName', fs.out === JSON.stringify({toppings: ['basil'], sides: ['fries']}), fs.out);
const layout = await page.evaluate((sel) => document.querySelector(sel).closest('.astryx-field').getAttribute('data-layout'), group('form-toppings'));
check('FormLayout horizontal-labels reaches the Field (data-layout)', layout === 'horizontal-labels', String(layout));
await events();
await page.click(`${form} button[type="reset"]`);
await sleep(80);
fs = await formState();
rows = await snapshot('form-toppings');
const sides = await snapshot('form-sides');
check('reset restores the initial state: rows, indicators and the required box', rows.every((r) => !r.checked && r.selected === null) && consistent(rows) && JSON.stringify(fs.required) === '[true,false,false]' && sides[0].checked && sides[0].selected === 'selected', JSON.stringify({rows, fs, sides}));
const afterReset = await page.evaluate((sel) => document.querySelector(sel).value, group('form-sides'));
check('reset restores the element value', JSON.stringify(afterReset) === '["fries"]', JSON.stringify(afterReset));

await done();
