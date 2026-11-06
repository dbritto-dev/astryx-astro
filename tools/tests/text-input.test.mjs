#!/usr/bin/env node
/**
 * TextInput + Field wiring in a real browser (run `cd apps/docs && npx astro build` first):
 * label click focuses, ids/aria (for, describedby, invalid, required incl. FormLayout
 * stamping), status announced/described (attached + tooltip placement), clear button
 * (tooltip "Clear", contextual name, keeps focus, astryx-change), Enter / IME guard,
 * disabled + disabledMessage, container click, description click, FR10 routing, native
 * form submit and reset.   node tools/tests/text-input.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('text-input');

const input = (testId) => `input[data-test="${testId}"]`;

// ── label / ids / description ──
const wiring = await page.evaluate(() => {
  const el = document.querySelector('input[data-test="described"]');
  const label = document.querySelector(`label[for="${el.id}"]`);
  const desc = document.getElementById(el.getAttribute('aria-describedby'));
  return {label: label?.textContent, desc: desc?.textContent, type: el.type, value: el.value};
});
check('label[for] points at the input', wiring.label === 'Display name', JSON.stringify(wiring));
check('aria-describedby → description', wiring.desc === 'Shown on your public profile', JSON.stringify(wiring));

await page.click('label:has-text("Display name")');
check('label click focuses the input', await page.evaluate(() => document.activeElement?.getAttribute('data-test') === 'described'));
await page.click('text=Shown on your public profile');
check('description click focuses the input', await page.evaluate(() => document.activeElement?.getAttribute('data-test') === 'described'));

check('isRequired → aria-required, not native required', await page.evaluate(() => {
  const el = document.querySelector('input[data-test="required"]');
  return el.getAttribute('aria-required') === 'true' && !el.required;
}));
check('hidden label is sr-only and still names the input', await page.evaluate(() => {
  const el = document.querySelector('input[data-test="hidden-label"]');
  const label = document.querySelector(`label[for="${el.id}"]`);
  return label.classList.contains('ax-field-sr-only') && label.getBoundingClientRect().width <= 1;
}));

// ── status ──
const status = await page.evaluate(() => {
  const el = [...document.querySelectorAll('.astryx-field-label')].find((l) => l.textContent === 'error md');
  const inputEl = document.getElementById(el.getAttribute('for'));
  const ids = (inputEl.getAttribute('aria-describedby') ?? '').split(' ');
  const box = ids.map((id) => document.getElementById(id)).find((n) => n?.classList.contains('astryx-field-status'));
  const control = inputEl.closest('.astryx-text-input');
  return {
    invalid: inputEl.getAttribute('aria-invalid'), box: box?.textContent, variant: box?.dataset.variant,
    controlStatus: control.dataset.status, icon: !!control.querySelector('.astryx-input-status-icon[data-status="error"][data-size="md"]'),
  };
});
check('error status: aria-invalid + described by the attached message box', status.invalid === 'true' && status.box === 'Enter a valid email address' && status.variant === 'attached', JSON.stringify(status));
check('status reflected on the control box + on-field icon', status.controlStatus === 'error' && status.icon, JSON.stringify(status));
const announced = await page.evaluate(() => [...document.querySelectorAll('[data-astryx-live-region="assertive"]')].map((r) => r.textContent).join(' | '));
check('error message announced assertively (persistent live region)', announced.includes('Enter a valid email address'), announced.slice(0, 120));

const tooltipStatus = await page.evaluate(() => {
  const el = document.querySelector('input[data-test="status-tooltip"]');
  const button = el.closest('.astryx-text-input').querySelector('.ax-input-status-button');
  const tipId = button.getAttribute('aria-describedby');
  const field = el.closest('.astryx-field');
  return {
    name: button.getAttribute('aria-label'), tip: document.getElementById(tipId)?.textContent,
    inputDescribed: (el.getAttribute('aria-describedby') ?? '').split(' ').includes(tipId),
    noBox: !field.querySelector('.astryx-field-status'), announcer: field.querySelector('[data-ax-field-status][hidden]')?.textContent,
  };
});
check('tooltip status: focusable "Warning details" button described by the message', tooltipStatus.name === 'Warning details' && tooltipStatus.tip === 'This address is already invited', JSON.stringify(tooltipStatus));
check('tooltip status: input described by the tooltip; no box; still announced', tooltipStatus.inputDescribed && tooltipStatus.noBox && tooltipStatus.announcer === 'This address is already invited', JSON.stringify(tooltipStatus));
await page.focus(input('status-tooltip'));
await page.keyboard.press('Tab');
await sleep(80);
check('Tab reaches the status button and its tooltip opens', await page.evaluate(() => {
  const b = document.activeElement;
  return b?.classList.contains('ax-input-status-button') && document.getElementById(b.getAttribute('aria-describedby'))?.matches(':popover-open');
}));

// ── clear button ──
const clearSel = `.astryx-text-input:has(${input('clear-empty')}) [data-ax-input-clear]`;
check('clear button hidden while empty', await page.evaluate((s) => document.querySelector(s).hidden, clearSel));
await page.click(input('clear-empty'));
await page.keyboard.type('abc');
check('clear button appears with a value', await page.evaluate((s) => !document.querySelector(s).hidden, clearSel));
const clearMeta = await page.evaluate((s) => {
  const b = document.querySelector(s);
  return {name: b.getAttribute('aria-label'), tip: document.getElementById(b.getAttribute('data-ax-tooltip'))?.textContent};
}, clearSel);
check('clear: contextual name, generic "Clear" tooltip (contract #10)', clearMeta.name === 'Clear Filter' && clearMeta.tip === 'Clear', JSON.stringify(clearMeta));
await page.evaluate(() => {
  window.__changes = [];
  document.addEventListener('astryx-change', (e) => window.__changes.push(e.detail.value));
});
await page.click(clearSel);
const afterClear = await page.evaluate(() => ({value: document.querySelector('input[data-test="clear-empty"]').value, focused: document.activeElement?.getAttribute('data-test'), changes: window.__changes}));
check('clear empties the input, keeps focus, emits astryx-change ""', afterClear.value === '' && afterClear.focused === 'clear-empty' && afterClear.changes.at(-1) === '', JSON.stringify(afterClear));
check('clear button hides again', await page.evaluate((s) => document.querySelector(s).hidden, clearSel));
await page.keyboard.type('x');
check('typing emits astryx-change with the value', await page.evaluate(() => window.__changes.at(-1) === 'x'));

// ── Enter / IME ──
await page.evaluate(() => {
  window.__enters = 0;
  document.addEventListener('astryx-enter', () => window.__enters++);
});
await page.keyboard.press('Enter');
await page.evaluate(() => {
  document.querySelector('input[data-test="clear-empty"]').dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', isComposing: true, bubbles: true}));
});
check('Enter → astryx-enter; IME-composing Enter ignored', await page.evaluate(() => window.__enters) === 1);

// ── search traits ──
check('search input: enterkeyhint=search, autocorrect=off', await page.evaluate(() => {
  const el = document.querySelector('input[data-test="search"]');
  return el.getAttribute('enterkeyhint') === 'search' && el.getAttribute('autocorrect') === 'off' && el.type === 'search';
}));
await page.click(`.astryx-text-input:has(${input('search')}) .astryx-icon`);
check('click on the box chrome (start icon) focuses the input', await page.evaluate(() => document.activeElement?.getAttribute('data-test') === 'search'));

// ── disabled ──
const disabled = await page.evaluate(() => {
  const el = document.querySelector('input[data-test="disabled"]');
  return {aria: el.getAttribute('aria-disabled'), readOnly: el.readOnly, name: el.getAttribute('name'), tab: el.tabIndex, box: el.closest('.astryx-text-input').dataset.disabled};
});
check('disabled: aria-disabled + readonly, no name, still tabbable', disabled.aria === 'true' && disabled.readOnly && disabled.name === null && disabled.tab === 0 && disabled.box === 'disabled', JSON.stringify(disabled));
await page.focus(input('disabled'));
await page.keyboard.type('zzz');
check('disabled input does not change', await page.evaluate(() => document.querySelector('input[data-test="disabled"]').value === 'Locked value'));
await page.focus(input('disabled'));
await page.keyboard.press('Tab'); // keyboard focus onto the next (disabled-with-reason) input
await sleep(80);
const dm = await page.evaluate(() => {
  const el = document.querySelector('input[data-test="disabled-message"]');
  const tip = [...(el.getAttribute('aria-describedby') ?? '').split(' ')].map((id) => document.getElementById(id)).find((n) => n?.getAttribute('role') === 'tooltip');
  return {text: tip?.textContent, open: tip?.matches(':popover-open')};
});
check('disabledMessage: describes the input; keyboard focus opens the tooltip', dm.text === 'You need the Editor role to change this' && dm.open, JSON.stringify(dm));

// ── loading ──
check('loading: aria-busy + decorative spinner before the clear button', await page.evaluate(() => {
  const el = document.querySelector('input[data-test="loading"]');
  const box = el.closest('.astryx-text-input');
  const spinner = box.querySelector('.astryx-spinner');
  const clear = box.querySelector('.ax-input-clear-slot');
  return el.getAttribute('aria-busy') === 'true' && spinner?.getAttribute('aria-hidden') === 'true' &&
    !!(spinner.compareDocumentPosition(clear) & Node.DOCUMENT_POSITION_FOLLOWING);
}));

// ── FormLayout stamping ──
const form = await page.evaluate(() => {
  const f = document.querySelector('form[data-test="form"]');
  const get = (n) => f.querySelector(`input[name="${n}"]`);
  const field = get('first').closest('.astryx-field');
  return {
    first: get('first').getAttribute('aria-required'), middle: get('middle').getAttribute('aria-required'),
    direction: field.dataset.formDirection, nativeRequired: get('first').required,
    middleIndicator: !!get('middle').closest('.astryx-field').querySelector('[data-ax-indicator="optional"]'),
    lastHasNoIndicator: getComputedStyle(get('first').closest('.astryx-field')).display,
  };
});
check('FormLayout default required → aria-required stamped (not native required); isOptional opts out', form.first === 'true' && form.middle === null && !form.nativeRequired, JSON.stringify(form));
check('FormLayout stamps data-form-direction; horizontal-labels dissolves the field box', form.direction === 'horizontal-labels' && form.lastHasNoIndicator === 'contents', JSON.stringify(form));
const geometry = await page.evaluate(() => {
  const f = document.querySelector('form[data-test="form"]');
  const field = f.querySelector('input[name="last"]').closest('.astryx-field');
  const label = field.querySelector('label').getBoundingClientRect();
  const desc = field.querySelector('.ax-field-description').getBoundingClientRect();
  const box = field.querySelector('.astryx-text-input').getBoundingClientRect();
  return {labelLeftOfBox: label.right <= box.left, descAboveBox: desc.bottom <= box.top + 1 && desc.left >= box.left - 1};
});
check('horizontal-labels: label beside, description above the control', geometry.labelLeftOfBox && geometry.descAboveBox, JSON.stringify(geometry));

// ── FR10 routing ──
check('containerClass → Field box, controlClass → control box, data-* → input', await page.evaluate(() => {
  const field = document.querySelector('.astryx-field.demo-container');
  return !!field && !!field.querySelector('.astryx-text-input.demo-control') && !!document.querySelector('input[data-test="described"].ax-input-native');
}));

// ── native form ──
await page.click('form[data-test="form"] button[type="submit"]');
const submitted = await page.evaluate(() => JSON.parse(document.querySelector('[data-test="form-output"]').textContent));
check('form submit carries the values by htmlName', submitted.first === 'Ada' && submitted.last === 'Lovelace' && submitted.email === 'ada@' && submitted.middle === '', JSON.stringify(submitted));
await page.fill('form[data-test="form"] input[name="first"]', 'Grace');
await page.click('form[data-test="form"] button[type="reset"]');
await sleep(30);
check('form reset restores the server value', await page.evaluate(() => document.querySelector('form[data-test="form"] input[name="first"]').value === 'Ada'));

await done();
