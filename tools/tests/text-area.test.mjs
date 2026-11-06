#!/usr/bin/env node
/**
 * TextArea in a real browser (run `cd apps/docs && npx astro build` first): label wiring,
 * grapheme-aware counter (emoji/flags count as one), over-limit aria-invalid + error counter,
 * zone announcements (near: polite "N characters remaining", over: assertive), counter in
 * aria-describedby, container click, no auto-grow (rows), native form submit and reset.
 *   node tools/tests/text-area.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('text-area');

const counterOf = (t) => page.evaluate((t) => {
  const el = document.querySelector(`textarea[data-test="${t}"]`);
  const counter = el.parentElement.querySelector('.astryx-text-area-counter');
  return {
    text: counter.textContent.trim(), over: counter.hasAttribute('data-ax-over'), invalid: el.getAttribute('aria-invalid'),
    described: el.getAttribute('aria-describedby').split(' ').includes(counter.id),
  };
}, t);

const initial = await counterOf('counter');
check('counter counts graphemes (👋🏽 and 🇨🇴 are one each): 23/40', initial.text === '23/40' && !initial.over && initial.described, JSON.stringify(initial));
await page.click('label:has-text("Bio")');
check('label click focuses the textarea', await page.evaluate(() => document.activeElement?.getAttribute('data-test') === 'counter'));
await page.keyboard.press('End');
await page.keyboard.press('Control+End');
await page.evaluate(() => { window.__changes = []; document.addEventListener('astryx-change', (e) => window.__changes.push(e.detail.value)); });
await page.keyboard.type(' 👨‍👩‍👧');
check('typing a family emoji adds 2 (space + one grapheme): 25/40, astryx-change', (await counterOf('counter')).text === '25/40' && await page.evaluate(() => window.__changes.length > 0));
await page.keyboard.type('1234567');
await sleep(60);
const polite = await page.evaluate(() => [...document.querySelectorAll('[data-astryx-live-region="polite"]')].map((r) => r.textContent).join(' | '));
check('crossing 80% announces "N characters remaining" politely', /8 characters remaining/.test(polite), polite);
await page.keyboard.type('123456789');
await sleep(60);
const over = await counterOf('counter');
const assertive = await page.evaluate(() => [...document.querySelectorAll('[data-astryx-live-region="assertive"]')].map((r) => r.textContent).join(' | '));
check('over the limit: error counter + aria-invalid', over.over && over.invalid === 'true' && over.text === '41/40', JSON.stringify(over));
check('crossing the limit announces "1 character over the limit" assertively', /1 character over the limit/.test(assertive), assertive);
check('the limit is not enforced natively', await page.evaluate(() => document.querySelector('textarea[data-test="counter"]').maxLength === -1));

const overInitial = await counterOf('over');
check('server-rendered over-limit state', overInitial.over && overInitial.invalid === 'true' && overInitial.text === '23/10', JSON.stringify(overInitial));

const layout = await page.evaluate(() => {
  const ta = [...document.querySelectorAll('textarea')].find((t) => t.closest('.astryx-field').querySelector('label')?.textContent === 'Long form');
  const before = ta.getBoundingClientRect().height;
  ta.value += '\nmore\nmore\nmore\nmore\nmore\nmore\nmore';
  ta.dispatchEvent(new Event('input', {bubbles: true}));
  return {rows: ta.rows, same: ta.getBoundingClientRect().height === before, resize: getComputedStyle(ta).resize};
});
check('rows drive the height (no auto-grow, as Astryx); resizable vertically', layout.rows === 6 && layout.same && layout.resize === 'vertical', JSON.stringify(layout));

await page.click('.astryx-text-area:has(textarea[data-test="counter"]) .astryx-text-area-counter', {force: true});
check('click on the box (counter area) focuses the textarea', await page.evaluate(() => document.activeElement?.getAttribute('data-test') === 'counter'));

// disabled
check('disabled: aria-disabled + readonly, no name', await page.evaluate(() => {
  const ta = [...document.querySelectorAll('textarea')].find((t) => t.closest('.astryx-field').querySelector('label')?.textContent === 'Disabled');
  return ta.getAttribute('aria-disabled') === 'true' && ta.readOnly && !ta.name && ta.closest('.astryx-text-area').dataset.disabled === 'disabled';
}));

// form
const form = 'form[data-test="form"]';
check('FormLayout default required → aria-required on the unmarked textarea only', await page.evaluate((f) => {
  const s = document.querySelector(`${f} textarea[name="summary"]`);
  const c = document.querySelector(`${f} textarea[name="comments"]`);
  return s.getAttribute('aria-required') === 'true' && c.getAttribute('aria-required') === null;
}, form));
await page.fill(`${form} textarea[name="summary"]`, 'Changed');
await page.click(`${form} button[type="submit"]`);
const submitted = await page.evaluate((f) => JSON.parse(document.querySelector(`${f} [data-test="form-output"]`).textContent), form);
check('form submit carries the textarea values', submitted.summary === 'Changed' && submitted.comments === '', JSON.stringify(submitted));
await page.click(`${form} button[type="reset"]`);
await sleep(30);
const reset = await page.evaluate((f) => {
  const ta = document.querySelector(`${f} textarea[name="summary"]`);
  return {value: ta.value, counter: ta.parentElement.querySelector('.astryx-text-area-counter').textContent.trim()};
}, form);
check('form reset restores the value and re-syncs the counter', reset.value === 'Initial summary' && reset.counter === '15/60', JSON.stringify(reset));

await done();
