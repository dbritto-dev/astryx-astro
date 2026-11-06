#!/usr/bin/env node
/**
 * NumberInput behaviour in a real browser (run `cd apps/docs && npx astro build` first):
 * spinbutton ARIA, ArrowUp/Down / PageUp/Down / Home/End, clamping on commit, invalid
 * drafts (aria-invalid + alert, revert on blur), locale parsing (de-DE), Intl formatting at
 * rest vs editable text on focus + hidden form value, steppers (click + hold), clear,
 * wheel, IME guard, disabled/read-only, native form submit and reset.
 *   node tools/tests/number-input.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('number-input');

const sel = (t) => `input[data-test="${t}"]`;
const state = (t) => page.evaluate((s) => {
  const el = document.querySelector(s);
  return {text: el.value, now: el.getAttribute('aria-valuenow'), invalid: el.getAttribute('aria-invalid'), text2: el.getAttribute('aria-valuetext')};
}, sel(t));
await page.evaluate(() => {
  window.__changes = [];
  document.addEventListener('astryx-change', (e) => window.__changes.push(e.detail.value));
});
const lastChange = () => page.evaluate(() => window.__changes.at(-1));

const aria = await page.evaluate(() => {
  const el = document.querySelector('input[data-test="clamped"]');
  return {role: el.getAttribute('role'), min: el.getAttribute('aria-valuemin'), max: el.getAttribute('aria-valuemax'), now: el.getAttribute('aria-valuenow'), mode: el.inputMode, type: el.type};
});
check('spinbutton: role, aria-valuemin/max/now, type=text inputmode=decimal', aria.role === 'spinbutton' && aria.min === '0' && aria.max === '10' && aria.now === '10' && aria.mode === 'decimal' && aria.type === 'text', JSON.stringify(aria));

// ── keys ──
await page.click('label:has-text("Clamped 0–10")');
check('label click focuses the spinbutton', await page.evaluate(() => document.activeElement?.getAttribute('data-test') === 'clamped'));
await page.keyboard.press('ArrowUp');
check('ArrowUp at max stays clamped (10)', (await state('clamped')).now === '10');
const inc = '.astryx-number-input:has(input[data-test="clamped"]) [data-ax-step="1"]';
check('increment stepper aria-disabled at max', await page.evaluate((s) => document.querySelector(s).getAttribute('aria-disabled') === 'true', inc));
await page.keyboard.press('ArrowDown');
check('ArrowDown steps down and emits astryx-change', (await state('clamped')).now === '9' && (await lastChange()) === 9);
check('increment stepper re-enabled below max', await page.evaluate((s) => !document.querySelector(s).hasAttribute('aria-disabled'), inc));
await page.keyboard.press('Home');
check('Home → min (port addition)', (await state('clamped')).now === '0');
await page.keyboard.press('End');
check('End → max (port addition)', (await state('clamped')).now === '10');
await page.keyboard.press('Home');
await page.keyboard.press('PageUp');
check('PageUp steps ×10 (clamped)', (await state('clamped')).now === '10');
await page.keyboard.press('PageDown');
check('PageDown steps ×10', (await state('clamped')).now === '0');
await page.evaluate(() => document.querySelector('input[data-test="clamped"]').dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowUp', isComposing: true, bubbles: true, cancelable: true})));
check('IME-composing ArrowUp does not step', (await state('clamped')).now === '0');

// ── typed drafts ──
await page.fill(sel('clamped'), '99');
check('a typed draft does not commit while typing', (await state('clamped')).now === '0');
await page.keyboard.press('Enter');
check('Enter commits an out-of-range draft clamped to max', (await state('clamped')).now === '10' && (await state('clamped')).text === '10');
await page.fill(sel('clamped'), '12abc');
const invalid = await state('clamped');
const alert = await page.evaluate(() => document.querySelector('.astryx-number-input:has(input[data-test="clamped"]) [data-ax-number-alert]').textContent);
check('invalid draft: aria-invalid + "Invalid number" alert', invalid.invalid === 'true' && alert === 'Invalid number', JSON.stringify({invalid, alert}));
await page.keyboard.press('Tab');
const reverted = await state('clamped');
check('blur reverts an invalid draft to the committed value', reverted.text === '10' && reverted.invalid === null, JSON.stringify(reverted));

check('integer-only: inputmode numeric', await page.evaluate(() => document.querySelector('input[data-test="integer"]').inputMode === 'numeric'));
await page.fill(sel('integer'), '2.5');
await page.keyboard.press('Tab');
check('integer-only rejects a fraction (reverts)', (await state('integer')).now === '3');

// ── locale ──
await page.click(sel('locale'));
check('de-DE: focused text uses the locale decimal comma', (await state('locale')).text === '1234,5');
await page.fill(sel('locale'), '1.234.567,25');
await page.keyboard.press('Tab');
check('de-DE: "1.234.567,25" commits 1234567.25', (await state('locale')).now === '1234567.25');
// Click in (the at-rest text swaps to the editable text), select all, type.
await page.click(sel('locale'));
await page.keyboard.press('Control+A');
await page.keyboard.type('2,5');
await page.keyboard.press('Enter');
check('de-DE: "2,5" commits 2.5', (await state('locale')).now === '2.5');

// ── formatting ──
const atRest = await state('currency');
check('formatValue options: currency text at rest + aria-valuetext', atRest.text === '$1,234.50' && atRest.text2 === '$1,234.50', JSON.stringify(atRest));
await page.click(sel('currency'));
check('focused: editable raw number', (await state('currency')).text === '1234.5');
await page.keyboard.press('ArrowUp');
await page.keyboard.press('Tab');
const stepped = await page.evaluate(() => {
  const box = document.querySelector('.astryx-number-input:has(input[data-test="currency"])');
  return {text: box.querySelector('input[role="spinbutton"]').value, hidden: box.querySelector('[data-ax-number-value]').value, name: box.querySelector('input[role="spinbutton"]').name};
});
check('stepping by 0.01 then blur: formatted text, hidden input carries the raw value', stepped.text === '$1,234.51' && stepped.hidden === '1234.51' && stepped.name === '', JSON.stringify(stepped));

await page.focus(sel('locale'));
await page.keyboard.press('Shift+Tab');
const tabbed = await page.evaluate(() => {
  const el = document.activeElement;
  return {test: el.dataset.test, value: el.value, start: el.selectionStart, end: el.selectionEnd};
});
check('Tab-in swaps formatted → editable text and keeps it all selected', tabbed.test === 'currency' && tabbed.value === '1234.51' && tabbed.start === 0 && tabbed.end === tabbed.value.length, JSON.stringify(tabbed));

// ── steppers ──
const storageInc = '.astryx-number-input:has(input[data-test="units"]) [data-ax-step="1"]';
await page.click(storageInc);
check('stepper click steps by `step` (128 → 192) and focuses the input', (await state('units')).now === '192' && await page.evaluate(() => document.activeElement?.getAttribute('data-test') === 'units'));
check('units describe the input', await page.evaluate(() => {
  const el = document.querySelector('input[data-test="units"]');
  return el.getAttribute('aria-describedby').split(' ').some((id) => document.getElementById(id)?.textContent === 'GB');
}));
const box = await page.locator(storageInc).boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await sleep(1100);
const during = await state('units');
await page.mouse.up();
await sleep(50);
const after = await state('units');
check('held stepper repeats into a draft (aria-valuenow unchanged), commits on release', Number(during.text) > 256 && during.now === '192' && Number(after.now) >= Number(during.text) && after.text === after.now, JSON.stringify({during, after}));

// ── clear / wheel ──
const clear = '.astryx-number-input:has(input[data-test="clearable"]) [data-ax-input-clear]';
await page.click(clear);
const cleared = await state('clearable');
check('clear: empty, aria-valuenow removed, astryx-change null, focus kept', cleared.text === '' && cleared.now === null && (await lastChange()) === null && await page.evaluate(() => document.activeElement?.getAttribute('data-test') === 'clearable'), JSON.stringify(cleared));
check('clear button hides when empty', await page.evaluate((s) => document.querySelector(s).hidden, clear));
await page.hover(sel('clearable'));
await page.mouse.wheel(0, -100);
await sleep(50);
check('wheel over the focused field steps up from empty (→ 0)', (await state('clearable')).now === '0');

// ── disabled / read-only ──
await page.focus(sel('disabled'));
await page.keyboard.press('ArrowUp');
const dis = await page.evaluate(() => {
  const el = document.querySelector('input[data-test="disabled"]');
  return {now: el.getAttribute('aria-valuenow'), name: el.getAttribute('name'), aria: el.getAttribute('aria-disabled'), steppers: [...el.parentElement.querySelectorAll('[data-ax-step]')].every((b) => b.getAttribute('aria-disabled') === 'true')};
});
check('disabled: focusable, never steps, no name, steppers aria-disabled', dis.now === '8' && dis.name === null && dis.aria === 'true' && dis.steppers, JSON.stringify(dis));
await page.focus(sel('readonly'));
await page.keyboard.press('ArrowUp');
check('read-only: no stepping', (await state('readonly')).now === '8');

// ── form ──
await page.fill('form[data-test="form"] input[name="seats"]', '7');
await page.keyboard.press('Tab');
await page.click('form[data-test="form"] button[type="submit"]');
const submitted = await page.evaluate(() => JSON.parse(document.querySelector('form[data-test="form"] [data-test="form-output"]').textContent));
check('form submit: visible value by name, formatted field via its hidden input', submitted.seats === '7' && submitted.discount === '0.15', JSON.stringify(submitted));
await page.click('form[data-test="form"] button[type="reset"]');
await sleep(30);
check('form reset restores the server value', await page.evaluate(() => {
  const el = document.querySelector('form[data-test="form"] input[name="seats"]');
  return el.value === '3' && el.getAttribute('aria-valuenow') === '3';
}));

await done();
