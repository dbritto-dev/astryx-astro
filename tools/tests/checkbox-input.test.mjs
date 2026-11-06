#!/usr/bin/env node
/**
 * CheckboxInput in a real browser (run `cd apps/docs && npx astro build` first): label /
 * description / Space toggling with astryx-change {isChecked, event}, the indicator following the
 * input (built-in and a theme replacement), indeterminate, focus ring on the indicator only on
 * keyboard focus, hover tint scope, disabled (aria-disabled, inert, no form value) + disabled
 * message tooltip, read-only and loading blocking, status wiring, required, FormLayout
 * optionality, native form submit / reset.   node tools/tests/checkbox-input.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('checkbox-input');

const input = (t) => `input[data-test="${t}"]`;
const stateOf = (t) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const ind = el.closest('.ax-checkbox-box').querySelector('[data-ax-indicator-slot] > *');
  return {checked: el.checked, indeterminate: el.indeterminate, indicator: ind?.getAttribute('data-checked') ?? null, cls: ind?.className};
}, input(t));

await page.evaluate(() => {
  window.__changes = [];
  document.addEventListener('astryx-change', (e) => window.__changes.push({tag: e.target.tagName, isChecked: e.detail.isChecked, type: e.detail.event?.type}));
});
const changes = () => page.evaluate(() => window.__changes.splice(0));

// ── label click / description click / Space ──
await page.click('label:has-text("Unchecked (md)")');
let s = await stateOf('unchecked-md');
check('label click toggles the checkbox and its indicator', s.checked && s.indicator === 'checked', JSON.stringify(s));
let c = await changes();
check('astryx-change {isChecked: true, event: change} from <ax-checkbox-input>', c.length === 1 && c[0].isChecked === true && c[0].type === 'change' && c[0].tag === 'AX-CHECKBOX-INPUT', JSON.stringify(c));
await page.click('text=Anonymous crash reports and feature usage');
s = await stateOf('described');
check('description click toggles (forwarded to the control)', !s.checked && s.indicator === null, JSON.stringify(s));
await page.focus(input('unchecked-sm'));
await page.keyboard.press('Space');
s = await stateOf('unchecked-sm');
check('Space toggles the focused checkbox', s.checked && s.indicator === 'checked', JSON.stringify(s));
await page.keyboard.press('Space');
s = await stateOf('unchecked-sm');
check('Space again unchecks it', !s.checked && s.indicator === null, JSON.stringify(s));
await changes();

// ── indeterminate ──
s = await stateOf('indeterminate-md');
check('indeterminate: native property set from the server value, indicator dash', s.indeterminate && !s.checked && s.indicator === 'indeterminate', JSON.stringify(s));
check('indeterminate: no aria-checked (native mixed state)', await page.evaluate((sel) => !document.querySelector(sel).hasAttribute('aria-checked'), input('indeterminate-md')));
await page.click(input('indeterminate-md'));
s = await stateOf('indeterminate-md');
check('clicking an indeterminate box checks it', !s.indeterminate && s.checked && s.indicator === 'checked', JSON.stringify(s));
c = await changes();
check('… and reports isChecked: true', c.length === 1 && c[0].isChecked === true, JSON.stringify(c));

// ── focus ring on the indicator, keyboard only ──
const ring = (t) => page.evaluate((sel) => {
  const ind = document.querySelector(sel).closest('.ax-checkbox-box').querySelector('[data-ax-indicator-slot] > *');
  const cs = getComputedStyle(ind);
  return {style: cs.outlineStyle, width: cs.outlineWidth, inputOutline: getComputedStyle(document.querySelector(sel)).opacity};
}, input(t));
await page.click('label:has-text("Checked (sm)")');
let r = await ring('checked-sm');
check('mouse focus draws no ring on the indicator', r.style === 'none' || r.width === '0px', JSON.stringify(r));
await page.focus(input('unchecked-sm'));
await page.keyboard.press('Shift+Tab');
await page.keyboard.press('Tab');
r = await ring('unchecked-sm');
check('keyboard focus draws the ring on the indicator', r.style !== 'none' && r.width !== '0px', JSON.stringify(r));
check('ring on the indicator only (input stays invisible)', r.inputOutline === '0', JSON.stringify(r));
await page.click('label:has-text("Checked (sm)")');
await changes();

// ── hover tint scope ──
check('enabled rows carry the indicator hover scope; disabled rows do not', await page.evaluate(() => {
  const row = (sel) => document.querySelector(sel).closest('.ax-checkbox-row');
  return row('input[data-test="unchecked-md"]').classList.contains('ax-indicator-scope') && !row('input[data-test="disabled"]').classList.contains('ax-indicator-scope');
}));

// ── disabled ──
const disabled = await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  return {aria: el.getAttribute('aria-disabled'), native: el.disabled, form: el.getAttribute('form'), name: el.name, tab: el.tabIndex, ind: el.closest('.ax-checkbox-box').querySelector('.astryx-checkbox-indicator')?.hasAttribute('data-disabled')};
}, input('disabled'));
check('disabled: aria-disabled, focusable, form="" and no name', disabled.aria === 'true' && !disabled.native && disabled.form === '' && disabled.name === '' && disabled.tab === 0 && disabled.ind, JSON.stringify(disabled));
const disabledLabel = await page.evaluate((sel) => `label[for="${document.querySelector(sel).id}"]`, input('disabled'));
await page.click(disabledLabel, {force: true});
await page.click(input('disabled'), {force: true});
await page.focus(input('disabled'));
await page.keyboard.press('Space');
s = await stateOf('disabled');
check('disabled: click, label click and Space do not toggle', !s.checked && s.indicator === null, JSON.stringify(s));
check('disabled: no astryx-change', (await changes()).length === 0);

const tip = await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const row = el.closest('.ax-checkbox-row');
  const id = row.getAttribute('data-ax-tooltip');
  return {id, described: (el.getAttribute('aria-describedby') ?? '').split(' ').includes(id), text: document.getElementById(id)?.textContent};
}, input('disabled-message'));
check('disabledMessage: tooltip on the row describes the input', tip.described && tip.text === 'Managed by your administrator', JSON.stringify(tip));
await page.hover('label:has-text("Disabled with reason")', {force: true});
await sleep(400);
check('disabledMessage: hovering the row shows the reason', await page.evaluate((id) => document.getElementById(id)?.matches(':popover-open'), tip.id));
await page.mouse.move(5, 5);
await sleep(300);

// ── read-only / loading ──
await page.click(input('readonly'), {force: true});
await page.focus(input('readonly'));
await page.keyboard.press('Space');
s = await stateOf('readonly');
check('read-only: stays checked (click and Space)', s.checked && s.indicator === 'checked', JSON.stringify(s));
check('read-only: aria-readonly, full opacity indicator', await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  return el.getAttribute('aria-readonly') === 'true' && getComputedStyle(el.closest('.ax-checkbox-box').querySelector('.astryx-checkbox-indicator')).opacity === '1';
}, input('readonly')));
await page.click(input('loading'), {force: true});
s = await stateOf('loading');
check('loading: aria-busy, spinner in the box, click blocked', !s.checked && await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  return el.getAttribute('aria-busy') === 'true' && !!el.closest('.ax-checkbox-box').querySelector('.astryx-checkbox-indicator .astryx-spinner[aria-hidden="true"]');
}, input('loading')), JSON.stringify(s));
check('read-only / loading: no astryx-change', (await changes()).length === 0);
const polite = await page.evaluate(() => [...document.querySelectorAll('[data-astryx-live-region="polite"]')].map((n) => n.textContent).join('|'));
check('loading: "Loading" announced politely', polite.includes('Loading'), polite);

// ── status / required / labels ──
const status = await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const ids = (el.getAttribute('aria-describedby') ?? '').split(' ');
  const box = ids.map((id) => document.getElementById(id)).find((n) => n?.classList.contains('astryx-field-status'));
  return {invalid: el.getAttribute('aria-invalid'), text: box?.textContent, variant: box?.dataset.variant};
}, input('status-error-md'));
check('error status: aria-invalid + described by the detached message', status.invalid === 'true' && status.text === 'You must accept the terms to continue' && status.variant === 'detached', JSON.stringify(status));
check('warning status: not invalid', await page.evaluate((sel) => !document.querySelector(sel).hasAttribute('aria-invalid'), input('status-warning-sm')));
check('isRequired: native required + aria-required', await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  return el.required && el.getAttribute('aria-required') === 'true';
}, input('required')));
check('hidden label: sr-only label still names the input', await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const label = document.querySelector(`label[for="${el.id}"]`);
  return label?.textContent === 'Select row' && label.classList.contains('ax-field-sr-only') && label.classList.contains('astryx-checkbox-label');
}, input('hidden-label')));
check('theme targets: root [data-size], label .astryx-checkbox-label', await page.evaluate(() => {
  const root = document.querySelector('input[data-test="checked-sm"]').closest('.astryx-checkbox-input');
  return root.dataset.size === 'sm' && !!root.querySelector('.astryx-checkbox-label') && root.tagName === 'AX-CHECKBOX-INPUT';
}));

// ── FormLayout ──
const layout = await page.evaluate(() => {
  const label = (t) => {
    const el = document.querySelector(`input[data-test="${t}"]`);
    const l = document.querySelector(`label[for="${el.id}"]`);
    return {required: el.getAttribute('aria-required'), shown: [...l.querySelectorAll('.ax-field-indicator')].filter((n) => getComputedStyle(n).display !== 'none').map((n) => n.dataset.axIndicator)};
  };
  return {terms: label('form-terms'), news: label('form-news'), regions: label('form-regions')};
});
check('FormLayout required default hides the restated "Required"; "Optional" shows', layout.terms.shown.length === 0 && layout.news.shown.join() === 'optional', JSON.stringify(layout));
check('FormLayout default sets no aria-required on an unmarked checkbox (an unchecked box is an answer)', layout.regions.required === null, JSON.stringify(layout));

// ── form submit / reset ──
await page.click(input('form-terms'));
await page.click(input('form-regions'));
await page.click('form[data-test="form"] button[type="submit"]');
let out = JSON.parse(await page.textContent('[data-test="form-output"]'));
check('form submit: checked boxes submit "on"; unchecked and disabled ones do not', out.terms === 'on' && out.news === 'on' && out.regions === 'on' && !('locked' in out), JSON.stringify(out));
await page.click('form[data-test="form"] button[type="reset"]');
await sleep(50);
const reset = await page.evaluate(() => ({terms: document.querySelector('input[data-test="form-terms"]').checked, regions: document.querySelector('input[data-test="form-regions"]').indeterminate}));
s = await stateOf('form-regions');
check('form reset: restores checked and indeterminate, and the indicators', !reset.terms && reset.regions && s.indicator === 'indeterminate', JSON.stringify({reset, s}));

// ── theme replacement indicator ──
s = await stateOf('swap-unchecked');
check('replacement indicator renders (theme swap)', /astryx-radio-indicator/.test(s.cls) && s.indicator === null, JSON.stringify(s));
await page.click(input('swap-unchecked'));
s = await stateOf('swap-unchecked');
check('replacement indicator follows the input (morphed to the checked template)', /astryx-radio-indicator/.test(s.cls) && s.indicator === 'checked' && await page.evaluate(() => !!document.querySelector('input[data-test="swap-unchecked"]').closest('.ax-checkbox-box').querySelector('[data-ax-indicator-slot] .astryx-radio-indicator-dot')), JSON.stringify(s));
s = await stateOf('swap-indeterminate');
check('replacement indicator: indeterminate state from the server', s.indeterminate && s.indicator === 'checked', JSON.stringify(s));

await done();
