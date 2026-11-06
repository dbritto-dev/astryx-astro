#!/usr/bin/env node
/**
 * TimeInput (<ax-time-input>): typed entry (valid text reports at once, blur reverts invalid
 * text, an emptied field clears), arrow stepping (increment, wrap at midnight, refused outside
 * min/max, announced, IME-safe), hour cycles (en-US 12h, en-GB 24h, -u-hc-h23, ja-JP 12h
 * override), locale digits (ar-SA), the focus hint, the clock-icon click, clear, disabled,
 * form submit/reset.
 *   node tools/tests/time-input.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup({height: 1000});
await open('time-input');
await page.waitForFunction(() => customElements.get('ax-time-input'));
await page.evaluate(() => {
  window.__changes = [];
  document.addEventListener('astryx-change', (e) => {
    const input = e.target.querySelector?.(':scope > input.ax-input-native');
    window.__changes.push({test: input?.dataset.test, value: e.detail.value, hasValue: 'value' in e.detail});
  });
});

const box = (t) => `ax-time-input:has(> input[data-test="${t}"])`;
const input = (t) => `input[data-test="${t}"]`;
const changes = () => page.evaluate(() => window.__changes.splice(0));
const state = (t) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const inp = el.querySelector(':scope > input.ax-input-native');
  return {
    value: el.value,
    text: inp.value,
    placeholder: inp.placeholder,
    invalid: inp.getAttribute('aria-invalid'),
    dimmed: inp.hasAttribute('data-ax-invalid'),
    alert: el.querySelector('[data-ax-time-alert]').textContent,
  };
}, box(t));
const retype = async (t, text) => {
  await page.click(input(t), {clickCount: 3});
  await page.keyboard.press('Control+a');
  await page.keyboard.type(text);
};
const live = () => page.evaluate(() => [...document.querySelectorAll('[data-astryx-live-region]')].map((r) => r.textContent).join(' | '));

console.log('Markup and hour cycles');
const texts = await page.evaluate(() => Object.fromEntries(['basic', 'en-us', 'en-gb', 'h23', 'de', 'ja', 'ar', 'seconds'].map((t) => [t, document.querySelector(`input[data-test="${t}"]`).value])));
check('en-US is 12-hour', texts['en-us'] === '2:30 PM', texts['en-us']);
check('en-GB is 24-hour', texts['en-gb'] === '14:30', texts['en-gb']);
check('a -u-hc-h23 tag overrides the locale (h23)', texts.h23 === '14:30', texts.h23);
check('de-DE is 24-hour', texts.de === '14:30', texts.de);
check('hourFormat="12h" uses the locale day period (ja-JP)', texts.ja === '午後2:30', texts.ja);
check('ar-SA writes Arabic-Indic digits', /[٠-٩]/.test(texts.ar), texts.ar);
check('seconds shown with hasSeconds', texts.seconds === '2:30:15 PM', texts.seconds);
const themeAttrs = await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  return {cls: el.classList.contains('astryx-time-input'), size: el.getAttribute('data-size')};
}, box('basic'));
check('theme hooks', themeAttrs.cls && themeAttrs.size === 'md');

console.log('Typing');
await retype('empty', '3:45 PM');
await sleep(50);
let c = await changes();
check('text reports as soon as it reads as a time (Astryx: each readable prefix)', c.at(-1)?.value === '15:45' && c.every((x) => x.test === 'empty'), JSON.stringify(c));
await page.keyboard.press('Tab');
await sleep(50);
let s = await state('empty');
check('blur redraws in the locale format', s.text === '3:45 PM' && s.value === '15:45', JSON.stringify(s));
await retype('empty', '1430');
await page.keyboard.press('Tab');
await sleep(50);
s = await state('empty');
check('compact "1430" reads as 2:30 PM', s.value === '14:30' && s.text === '2:30 PM', JSON.stringify(s));
await changes();
await retype('empty', 'xyz');
await sleep(50);
s = await state('empty');
check('invalid text: aria-invalid, dimmed, announced', s.invalid === 'true' && s.dimmed && s.alert === 'Invalid time', JSON.stringify(s));
await page.keyboard.press('Tab');
await sleep(50);
s = await state('empty');
check('blur reverts invalid text to the value', s.text === '2:30 PM' && s.invalid === null && s.alert === '' && (await changes()).length === 0, JSON.stringify(s));
await retype('empty', '');
await page.keyboard.press('Backspace');
await page.keyboard.press('Tab');
await sleep(50);
c = await changes();
s = await state('empty');
check('an emptied field clears on blur (value undefined)', s.value === undefined && c.length === 1 && c[0].hasValue && c[0].value === undefined, JSON.stringify({s, c}));

console.log('Hint');
await page.focus(input('empty'));
await sleep(30);
check('focused and empty shows the format hint', (await state('empty')).placeholder === 'e.g., 2:30 PM');
await page.focus(input('en-gb'));
await page.evaluate((sel) => { const i = document.querySelector(sel); i.value = ''; i.dispatchEvent(new Event('input', {bubbles: true})); }, input('en-gb'));
await sleep(30);
check('24-hour hint', (await state('en-gb')).placeholder.includes('14:30'), (await state('en-gb')).placeholder);
await page.keyboard.press('Tab');
await sleep(30);
check('the hint goes on blur', (await state('empty')).placeholder === 'Select a time');
await changes();

console.log('Arrow keys');
await page.evaluate((sel) => { document.querySelector(sel).value = '23:59'; }, box('basic'));
await page.focus(input('basic'));
await page.keyboard.press('ArrowUp');
await sleep(50);
s = await state('basic');
check('ArrowUp wraps 23:59 → 00:00', s.value === '00:00' && s.text === '12:00 AM', JSON.stringify(s));
await page.keyboard.press('ArrowDown');
await sleep(50);
check('ArrowDown wraps back to 23:59', (await state('basic')).value === '23:59');
await sleep(80);
check('the stepped time is announced', (await live()).includes('11:59 PM'), await live());
await changes();
await page.focus(input('increment'));
await page.keyboard.press('ArrowUp');
await sleep(30);
check('increment={15}: 9:00 → 9:15', (await state('increment')).value === '09:15');
await page.focus(input('bounds'));
await page.keyboard.press('ArrowDown');
await sleep(30);
check('a step below min is refused', (await state('bounds')).value === '09:00');
await page.keyboard.press('ArrowUp');
await sleep(30);
check('a step inside the range applies (+30)', (await state('bounds')).value === '09:30');
await retype('bounds', '6:00 PM');
await sleep(30);
s = await state('bounds');
check('typed time after max is invalid and not reported', s.invalid === 'true' && s.value === '09:30', JSON.stringify(s));
await page.keyboard.press('Tab');
await sleep(30);
check('blur reverts it', (await state('bounds')).text === '9:30 AM');
await changes();
await page.focus(input('empty'));
await page.keyboard.press('ArrowUp');
await sleep(30);
const now = await page.evaluate(() => { const d = new Date(); d.setMinutes(d.getMinutes() + 1); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; });
check('an empty field steps from now', (await state('empty')).value === now, `${(await state('empty')).value} vs ${now}`);
await page.focus(input('basic'));
await page.evaluate((sel) => {
  const i = document.querySelector(sel);
  i.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowUp', isComposing: true, bubbles: true, cancelable: true}));
}, input('basic'));
await sleep(30);
check('arrows during IME composition are left alone', (await state('basic')).value === '23:59');
await changes();

console.log('Locales');
await retype('de', '9:05');
await page.keyboard.press('Tab');
await sleep(30);
s = await state('de');
check('de-DE reads "9:05"', s.value === '09:05' && s.text === '09:05', JSON.stringify(s));
const arText = await page.evaluate(() => new Intl.DateTimeFormat('ar-SA', {hour: 'numeric', minute: '2-digit', hourCycle: 'h12', timeZone: 'UTC'}).format(new Date(Date.UTC(2000, 0, 1, 15, 15))).replace(/[  ]/g, ' '));
await retype('ar', arText);
await page.keyboard.press('Tab');
await sleep(30);
s = await state('ar');
check(`ar-SA reads its digits and day period (${arText})`, s.value === '15:15', JSON.stringify(s));
await retype('ja', '午前9:15');
await page.keyboard.press('Tab');
await sleep(30);
check('ja-JP reads its day period', (await state('ja')).value === '09:15', JSON.stringify(await state('ja')));
await changes();

console.log('Chrome, clear, disabled');
await page.focus(input('increment'));
await page.evaluate(() => document.activeElement.blur());
await page.click(`${box('increment')} .ax-time-input-icon`);
check('a click on the clock icon focuses the input', await page.evaluate((sel) => document.activeElement === document.querySelector(sel), input('increment')));
await page.click(`${box('increment')} [data-ax-input-clear]`);
await sleep(50);
c = await changes();
check('clear: value undefined, focus kept', (await state('increment')).value === undefined && c[0]?.value === undefined && c[0]?.hasValue && await page.evaluate((sel) => document.activeElement === document.querySelector(sel), input('increment')), JSON.stringify(c));
await page.click(input('disabled'), {force: true});
await page.keyboard.press('ArrowUp');
await page.keyboard.type('1');
await sleep(30);
s = await state('disabled');
check('disabled: focusable, no stepping or typing', s.value === '08:15' && s.text === '8:15 AM' && (await changes()).length === 0, JSON.stringify(s));

console.log('Form');
const opensSel = 'ax-time-input:has(input[name="opens"]) > input.ax-input-native';
await page.click(opensSel, {clickCount: 3});
await page.keyboard.press('Control+a');
await page.keyboard.type('10:30 AM');
await page.keyboard.press('Tab');
await page.click('[data-test="form"] button[type="submit"]');
await sleep(50);
const data = JSON.parse(await page.textContent('[data-test="form-output"]'));
check('form submits ISO times', data.opens === '10:30' && data.closes === '' && data.from === '10:00', JSON.stringify(data));
check('a disabled field submits nothing', !(await page.evaluate(() => !!document.querySelector('input[name="disabled-time"]'))));
await page.click('[data-test="form"] button[type="reset"]');
await sleep(80);
const reset = await page.evaluate(() => {
  const el = document.querySelector('input[name="opens"]').closest('ax-time-input');
  return {value: el.value, text: el.querySelector(':scope > input.ax-input-native').value, hidden: el.querySelector('input[name="opens"]').value};
});
check('reset restores the server value', reset.value === '09:00' && reset.text === '9:00 AM' && reset.hidden === '09:00', JSON.stringify(reset));

await done();
