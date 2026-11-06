#!/usr/bin/env node
/**
 * RadioList + RadioListItem in a real browser (run `cd apps/docs && npx astro build` first):
 * radiogroup wiring (labelledby, describedby, required incl. FormLayout), shared name, row
 * surface click and label click selecting, arrows (incl. RTL), Tab entry with no selection,
 * indicator + data-selected sync (built-in and a theme replacement), astryx-change {value},
 * focus ring on the circle only on keyboard focus, disabled group / item / disabledMessage
 * (focusable, selection blocked, reason tooltip), native form submit / reset.
 *   node tools/tests/radio-list.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('radio-list');

const group = (t) => `ax-radio-list[data-test="${t}"]`;
const snapshot = (t) => page.evaluate((sel) => {
  const g = document.querySelector(sel);
  return [...g.querySelectorAll('[data-ax-radio-item]')].map((row) => {
    const radio = row.querySelector('input[type="radio"]');
    const ind = row.querySelector('[data-ax-indicator-slot] > *');
    return {
      value: radio.value, checked: radio.checked, selected: row.getAttribute('data-selected'),
      indicator: ind?.getAttribute('data-checked') ?? null, dot: !!ind?.querySelector('.astryx-radio-indicator-dot'), cls: ind?.className,
    };
  });
}, group(t));
const chosen = (rows) => rows.filter((r) => r.checked).map((r) => r.value).join(',');
const consistent = (rows) => rows.every((r) => (r.checked ? r.selected === 'selected' && r.indicator === 'checked' : r.selected === null && r.indicator === null));

await page.evaluate(() => {
  window.__changes = [];
  document.addEventListener('astryx-change', (e) => window.__changes.push({tag: e.target.tagName, test: e.target.dataset.test, value: e.detail.value}));
});
const changes = () => page.evaluate(() => window.__changes.splice(0));

// ── wiring ──
const wiring = await page.evaluate((sel) => {
  const g = document.querySelector(sel);
  const label = document.getElementById(g.getAttribute('aria-labelledby'));
  const radios = [...g.querySelectorAll('input[type="radio"]')];
  const names = new Set(radios.map((r) => r.name));
  const desc = (g.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent);
  const r0 = radios[0];
  return {
    role: g.getAttribute('role'), label: label?.textContent?.trim(), labelTag: label?.tagName, names: [...names], desc,
    radioName: document.getElementById(r0.getAttribute('aria-labelledby'))?.textContent, radioDesc: document.getElementById(r0.getAttribute('aria-describedby'))?.textContent,
    orientation: g.dataset.orientation, size: g.dataset.size,
  };
}, group('plan'));
check('role="radiogroup" named by the field label (a span)', wiring.role === 'radiogroup' && wiring.label?.startsWith('Plan') && wiring.labelTag === 'SPAN', JSON.stringify(wiring));
check('group described by its description', wiring.desc.includes('You can change plans at any time'), JSON.stringify(wiring));
check('radios share the htmlName', wiring.names.length === 1 && wiring.names[0] === 'plan', JSON.stringify(wiring));
check('radio named by its label span and described by its description', wiring.radioName === 'Free' && wiring.radioDesc === 'Up to 3 projects', JSON.stringify(wiring));
check('theme hooks: [data-orientation][data-size] on the group', wiring.orientation === 'vertical' && wiring.size === 'md', JSON.stringify(wiring));
check('aria-label replaces the rich label name', await page.evaluate((sel) => {
  const r = document.querySelector(`${sel} input[value="pro"]`);
  return r.getAttribute('aria-label') === 'Pro, recommended' && !r.hasAttribute('aria-labelledby');
}, group('plan')));
check('a generated name groups radios without htmlName', await page.evaluate((sel) => {
  const names = [...document.querySelectorAll(`${sel} input[type="radio"]`)].map((r) => r.name);
  return names[0] !== '' && names.every((n) => n === names[0]);
}, group('vertical-md')));

// ── row click / label click / astryx-change ──
let rows = await snapshot('vertical-md');
check('initial selection rendered (indicator, data-selected)', chosen(rows) === 'email' && consistent(rows), JSON.stringify(rows));
await page.click(`${group('vertical-md')} [data-ax-radio-item]:nth-child(2) .ax-item-label`);
rows = await snapshot('vertical-md');
check('clicking a row label selects it; the previous circle clears', chosen(rows) === 'sms' && consistent(rows), JSON.stringify(rows));
let c = await changes();
check('astryx-change {value: "sms"} from <ax-radio-list>', c.length === 1 && c[0].value === 'sms' && c[0].tag === 'AX-RADIO-LIST', JSON.stringify(c));
const rowBox = await page.evaluate((sel) => {
  const r = document.querySelector(`${sel} [data-ax-radio-item]:nth-child(3)`).getBoundingClientRect();
  return {x: r.right - 4, y: r.top + r.height / 2};
}, group('vertical-md'));
await page.mouse.click(rowBox.x, rowBox.y);
rows = await snapshot('vertical-md');
check('clicking the row surface (empty area) selects it', chosen(rows) === 'push' && consistent(rows), JSON.stringify(rows));
await page.click(`${group('plan')} [data-ax-radio-item]:nth-child(1) .ax-item-description`);
rows = await snapshot('plan');
check('clicking a description selects the option', chosen(rows) === 'free' && consistent(rows), JSON.stringify(rows));
await changes();

// ── keyboard ──
await page.focus(`${group('vertical-md')} input[value="push"]`);
await page.keyboard.press('ArrowUp');
rows = await snapshot('vertical-md');
check('ArrowUp selects the previous radio (native roving)', chosen(rows) === 'sms' && consistent(rows), JSON.stringify(rows));
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
rows = await snapshot('vertical-md');
check('ArrowDown wraps to the first radio', chosen(rows) === 'email' && consistent(rows), JSON.stringify(rows));
c = await changes();
check('arrows dispatch astryx-change per selection', c.map((x) => x.value).join() === 'sms,push,email', JSON.stringify(c));

const ring = (sel) => page.evaluate((s) => {
  const ind = document.querySelector(s).closest('.ax-radio-box').querySelector('[data-ax-indicator-slot] > *');
  const cs = getComputedStyle(ind);
  return cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px';
}, sel);
check('keyboard focus: ring on the circle', await ring(`${group('vertical-md')} input[value="email"]`));
await page.click(`${group('vertical-sm')} [data-ax-radio-item]:nth-child(2) .ax-item-label`);
check('mouse focus: no ring on the circle', !(await ring(`${group('vertical-sm')} input[value="sms"]`)));
await changes();

// RTL: horizontal radios follow the reading direction natively.
await page.focus(`${group('rtl')} input[value="one"]`);
await page.keyboard.press('ArrowLeft');
rows = await snapshot('rtl');
check('RTL: ArrowLeft moves to the next radio in reading order', chosen(rows) === 'two' && consistent(rows), JSON.stringify(rows));
await changes();

// ── Tab entry with no selection ──
await page.focus(`${group('plan')} input[value="enterprise"]`);
await page.keyboard.press('Tab');
check('Tab from the previous group enters an unselected group on its first radio', await page.evaluate(() => document.activeElement?.value === 'standard'));
await page.keyboard.press('Tab');
await page.keyboard.press('Shift+Tab');
check('Shift+Tab enters it on an end radio (the browser\'s backward entry is kept)', await page.evaluate(() => ['standard', 'pickup'].includes(document.activeElement?.value)));
await page.focus(`${group('plan')} input[value="enterprise"]`);
await page.evaluate(() => document.querySelector('ax-radio-list[data-test="no-selection"] input[value="express"]').focus());
check('an entry from outside that lands mid-group is normalized to the first enabled radio', await page.evaluate(() => document.activeElement?.value === 'standard'));
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowUp');
check('moves inside the group are never redirected', await page.evaluate(() => document.activeElement?.value === 'standard'));
await page.evaluate(() => {
  const g = document.querySelector('ax-radio-list[data-test="no-selection"]');
  g.value = '';
});
await changes();
const unselected = await snapshot('no-selection');
check('the disabled item is skipped and nothing got selected by focus', chosen(unselected) === '' && consistent(unselected), JSON.stringify(unselected));

// ── disabled ──
const dis = await page.evaluate(() => {
  const g = document.querySelector('ax-radio-list[data-test="disabled"]');
  const radios = [...g.querySelectorAll('input')];
  return {aria: g.getAttribute('aria-disabled'), native: radios.every((r) => r.disabled), rowAria: g.querySelector('[data-ax-radio-item]').getAttribute('aria-disabled'), ind: !!g.querySelector('.astryx-radio-indicator[data-disabled]')};
});
check('disabled group: aria-disabled group, natively disabled radios, dimmed rows', dis.aria === 'true' && dis.native && dis.rowAria === 'true' && dis.ind, JSON.stringify(dis));
const msg = await page.evaluate(() => {
  const g = document.querySelector('ax-radio-list[data-test="disabled-message"]');
  const radios = [...g.querySelectorAll('input')];
  const tip = g.getAttribute('data-ax-tooltip');
  return {
    focusable: radios.every((r) => !r.disabled && r.getAttribute('aria-disabled') === 'true' && r.getAttribute('form') === ''),
    groupDescribed: (g.getAttribute('aria-describedby') ?? '').split(' ').includes(tip),
    radioDescribed: radios.every((r) => (r.getAttribute('aria-describedby') ?? '').split(' ').includes(tip)),
    text: document.getElementById(tip)?.textContent, tip,
  };
});
check('disabledMessage: radios focusable via aria-disabled and detached from the form', msg.focusable, JSON.stringify(msg));
check('disabledMessage: the reason describes the group and each radio', msg.groupDescribed && msg.radioDescribed && msg.text === 'Locked by your organization', JSON.stringify(msg));
await page.focus('ax-radio-list[data-test="disabled-message"] input[value="a"]');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Space');
rows = await snapshot('disabled-message');
check('disabledMessage: arrows / Space never change the selection', chosen(rows) === 'a' && consistent(rows), JSON.stringify(rows));
await page.click('ax-radio-list[data-test="disabled-message"] input[value="c"]', {force: true});
rows = await snapshot('disabled-message');
check('disabledMessage: a click never changes the selection', chosen(rows) === 'a' && consistent(rows), JSON.stringify(rows));
check('disabled groups dispatch no astryx-change', (await changes()).length === 0);
await page.mouse.move(5, 5);
await page.focus(`${group('plan')} input[value="free"]`);
await page.keyboard.press('Tab');
await page.keyboard.press('Tab');
await page.keyboard.press('Tab');
await page.keyboard.press('Tab');
await page.focus('ax-radio-list[data-test="disabled-message"] input[value="a"]');
await page.keyboard.press('Shift+Tab');
await page.keyboard.press('Tab');
await sleep(150);
check('disabledMessage: keyboard focus shows the reason tooltip', await page.evaluate((id) => document.getElementById(id)?.matches(':popover-open'), msg.tip));

// ── status / required / FormLayout ──
const err = await page.evaluate(() => {
  const g = document.querySelector('ax-radio-list[data-test="status-error-md"]');
  const box = (g.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)).find((n) => n?.classList.contains('astryx-field-status'));
  const r = g.querySelector('input');
  return {invalid: g.getAttribute('aria-invalid'), required: g.getAttribute('aria-required'), text: box?.textContent, variant: box?.dataset.variant, radioRequired: r.required, radioInvalid: r.getAttribute('aria-invalid')};
});
check('error status: group aria-invalid + detached message', err.invalid === 'true' && err.text === 'Choose a delivery speed' && err.variant === 'detached', JSON.stringify(err));
check('isRequired: group aria-required, radios native required, radio aria-invalid follows status', err.required === 'true' && err.radioRequired && err.radioInvalid === 'true', JSON.stringify(err));
const form = await page.evaluate(() => {
  const g = (t) => document.querySelector(`ax-radio-list[data-test="${t}"]`);
  return {
    sizeRequired: g('form-size').getAttribute('aria-required'), wrapRequired: g('form-wrap').getAttribute('aria-required'),
    radioNative: g('form-size').querySelector('input').required,
    layout: g('form-size').closest('.astryx-field')?.getAttribute('data-layout'),
  };
});
check('FormLayout required default: group aria-required, radios not natively required', form.sizeRequired === 'true' && !form.radioNative, JSON.stringify(form));
check('FormLayout: an isOptional group is not required; horizontal-labels field', form.wrapRequired === null && form.layout === 'horizontal-labels', JSON.stringify(form));

// ── form submit / reset ──
await page.click('ax-radio-list[data-test="form-wrap"] [data-ax-radio-item]:nth-child(2) .ax-item-label');
await page.click('ax-radio-list[data-test="form-size"] [data-ax-radio-item]:nth-child(3) .ax-item-label');
await page.click('form[data-test="form"] button[type="submit"]');
const out = JSON.parse(await page.textContent('[data-test="form-output"]'));
check('form submit: the selected values', out.size === 'l' && out.wrap === 'box', JSON.stringify(out));
await page.click('form[data-test="form"] button[type="reset"]');
await sleep(50);
const sizeRows = await snapshot('form-size');
const wrapRows = await snapshot('form-wrap');
check('form reset: initial selection and indicators restored', chosen(sizeRows) === 'm' && consistent(sizeRows) && chosen(wrapRows) === '' && consistent(wrapRows), JSON.stringify({sizeRows, wrapRows}));

// ── theme replacement indicator ──
rows = await snapshot('swap');
check('replacement indicator renders per state', rows.every((r) => /astryx-checkbox-indicator/.test(r.cls)) && consistent(rows), JSON.stringify(rows));
await page.click('ax-radio-list[data-test="swap"] [data-ax-radio-item]:nth-child(3) .ax-item-label');
rows = await snapshot('swap');
check('replacement indicator follows the selection (template morph)', chosen(rows) === 'c' && consistent(rows), JSON.stringify(rows));

await done();
