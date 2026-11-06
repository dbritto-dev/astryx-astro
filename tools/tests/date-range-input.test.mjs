#!/usr/bin/env node
/**
 * DateRangeInput (<ax-date-range-input>): trigger markup (button, aria-haspopup, name with the
 * range), popover open/close (native invoker, focus into the popover, Escape with focus return,
 * light dismiss), range selection through the calendar (both orders), presets (aria-current,
 * disabled outside span/bounds), span bounds while picking, Escape cancelling a pick first,
 * clear, disabled, locale text, form submit/reset.
 *   node tools/tests/date-range-input.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup({height: 1000});
await open('date-range-input');
await page.waitForFunction(() => customElements.get('ax-date-range-input') && customElements.get('ax-calendar'));
await page.evaluate(() => {
  window.__changes = [];
  document.addEventListener('astryx-change', (e) => {
    const trigger = e.target.querySelector?.(':scope > [data-ax-range-trigger]');
    window.__changes.push({test: trigger?.dataset.test ?? e.target.tagName, value: e.detail.value});
  });
});

const box = (t) => `ax-date-range-input:has(> button[data-test="${t}"])`;
const trigger = (t) => `button[data-test="${t}"]`;
const changes = () => page.evaluate(() => window.__changes.splice(0));
const state = (t) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const tr = el.querySelector(':scope > [data-ax-range-trigger]');
  const pop = document.getElementById(el.getAttribute('data-ax-popover'));
  return {
    value: el.value,
    text: tr.textContent,
    label: tr.getAttribute('aria-label'),
    expanded: tr.getAttribute('aria-expanded'),
    controls: tr.getAttribute('aria-controls'),
    open: pop.matches(':popover-open'),
    popId: pop.id,
    iconState: el.querySelector('.astryx-date-range-input-toggle-icon').getAttribute('data-state'),
    current: [...pop.querySelectorAll('.ax-date-range-input-preset[aria-current="true"]')].map((b) => b.textContent),
    focusInside: pop.contains(document.activeElement),
  };
}, box(t));
const day = (t, iso) => page.evaluate(([sel, d]) => {
  const pop = document.getElementById(document.querySelector(sel).getAttribute('data-ax-popover'));
  return `#${pop.id} button[data-date="${d}"]:not([data-ax-outside])`;
}, [box(t), iso]);
const fmt = (start, end, locale = 'en') => page.evaluate(([s, e, l]) => {
  const year = new Date().getFullYear();
  const sameYear = s.slice(0, 4) === e.slice(0, 4) && Number(s.slice(0, 4)) === year;
  const opts = sameYear ? {month: 'short', day: 'numeric'} : {month: 'short', day: 'numeric', year: 'numeric'};
  const f = (iso) => new Intl.DateTimeFormat(l, {...opts, timeZone: 'UTC'}).format(new Date(`${iso}T00:00:00Z`));
  return `${f(s)} – ${f(e)}`;
}, [start, end, locale]);

console.log('Markup');
let s = await state('presets');
const expected = await fmt('2026-03-09', '2026-03-15');
check('trigger shows the range', s.text === expected, `${s.text} vs ${expected}`);
check('trigger is named "<label>: <range>"', s.label === `Reporting period: ${expected}`, s.label);
check('trigger advertises a dialog, collapsed', (await page.getAttribute(trigger('presets'), 'aria-haspopup')) === 'dialog' && s.expanded === 'false' && s.controls === null);
s = await state('empty');
check('placeholder text and name while empty', s.text === 'Select date range' && s.label === 'Stay: Select date range', JSON.stringify(s));
const described = await page.evaluate(() => {
  const tr = document.querySelector('ax-date-range-input:has(input[name="booking-start"]) > [data-ax-range-trigger]');
  return (tr.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent).join('|');
});
check('a required trigger is described by "Required"', described.includes('Required'), described);

console.log('Open and close');
await page.click(trigger('presets'));
await sleep(120);
s = await state('presets');
check('trigger click opens the popover', s.open && s.expanded === 'true' && s.controls === s.popId && s.iconState === 'expanded', JSON.stringify(s));
check('focus moves into the popover (first preset)', s.focusInside && (await page.evaluate(() => document.activeElement.textContent)) === 'Last 7 days');
check('the applied preset is aria-current', JSON.stringify(s.current) === '["Last 7 days"]', JSON.stringify(s.current));
const presetStates = await page.evaluate((sel) => {
  const pop = document.getElementById(document.querySelector(sel).getAttribute('data-ax-popover'));
  return Object.fromEntries([...pop.querySelectorAll('.ax-date-range-input-preset')].map((b) => [b.textContent, b.getAttribute('aria-disabled') ?? 'enabled']));
}, box('presets'));
check('presets past min/max are aria-disabled; others enabled', presetStates['Last year'] === 'true' && presetStates['Last 30 days'] === 'enabled', JSON.stringify(presetStates));
check('the group is named', await page.evaluate((sel) => {
  const pop = document.getElementById(document.querySelector(sel).getAttribute('data-ax-popover'));
  return pop.querySelector('[role="group"]').getAttribute('aria-label') === 'Preset date ranges';
}, box('presets')));
await page.keyboard.press('Escape');
await sleep(80);
s = await state('presets');
check('Escape closes and focus returns to the trigger', !s.open && s.expanded === 'false' && s.controls === null && (await page.evaluate(() => document.activeElement?.dataset.test)) === 'presets', JSON.stringify(s));

await page.click(trigger('presets'));
await sleep(80);
await page.mouse.click(1080, 990);
await sleep(80);
check('a press outside light-dismisses', !(await state('presets')).open);

console.log('Presets');
await page.click(trigger('presets'));
await sleep(80);
await page.click(`#${(await state('presets')).popId} .ax-date-range-input-preset:text-is("Last 14 days")`);
await sleep(80);
let c = await changes();
s = await state('presets');
check('a preset commits and closes', !s.open && s.value.start === '2026-03-02' && s.value.end === '2026-03-15' && c.length === 1 && c[0].value.start === '2026-03-02', JSON.stringify({s, c}));
check('aria-current moves to it', JSON.stringify(s.current) === '["Last 14 days"]', JSON.stringify(s.current));
await page.click(trigger('presets'));
await sleep(80);
await page.click(`#${(await state('presets')).popId} .ax-date-range-input-preset:text-is("Last year")`, {force: true});
await sleep(50);
check('a disabled preset does nothing', (await changes()).length === 0 && (await state('presets')).open);
await page.keyboard.press('Escape');

console.log('Calendar selection');
await page.click(trigger('empty'));
await sleep(80);
check('an empty field opens on today\'s month, no pick in progress', await page.evaluate((sel) => {
  const pop = document.getElementById(document.querySelector(sel).getAttribute('data-ax-popover'));
  const cal = pop.querySelector('ax-calendar');
  const t = new Date();
  return cal.focusDate === `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-01` && cal.rangeSelectionStart === null;
}, box('empty')));
await page.evaluate((sel) => {
  const pop = document.getElementById(document.querySelector(sel).getAttribute('data-ax-popover'));
  pop.querySelector('ax-calendar').navigateTo('2026-03-01');
}, box('empty'));
await sleep(50);
await page.click(await day('empty', '2026-03-20'));
await sleep(30);
check('first pick keeps the popover open', (await state('empty')).open && (await changes()).length === 0);
await page.click(await day('empty', '2026-03-12'));
await sleep(80);
c = await changes();
s = await state('empty');
check('second pick (earlier) commits {start, end} in order and closes', !s.open && c.length === 1 && c[0].value.start === '2026-03-12' && c[0].value.end === '2026-03-20', JSON.stringify(c));
check('the trigger text follows', s.text === (await fmt('2026-03-12', '2026-03-20')), s.text);
check('the calendar change stays inside', c.every((x) => x.test === 'empty'));

await page.click(trigger('empty'));
await sleep(80);
check('reopens on the value\'s month', await page.evaluate((sel) => document.getElementById(document.querySelector(sel).getAttribute('data-ax-popover')).querySelector('ax-calendar').focusDate === '2026-03-01', box('empty')));
await page.click(await day('empty', '2026-03-03'));
await sleep(30);
await page.keyboard.press('Escape');
await sleep(50);
s = await state('empty');
check('Escape during a pick cancels the pick, popover stays', s.open && (await page.evaluate((sel) => document.getElementById(document.querySelector(sel).getAttribute('data-ax-popover')).querySelector('ax-calendar').rangeSelectionStart, box('empty'))) === null);
await page.keyboard.press('Escape');
await sleep(50);
check('a second Escape closes', !(await state('empty')).open);

console.log('Span bounds');
await page.click(trigger('spans'));
await sleep(80);
await page.evaluate((sel) => document.getElementById(document.querySelector(sel).getAttribute('data-ax-popover')).querySelector('ax-calendar').navigateTo('2026-03-01'), box('spans'));
await sleep(30);
await page.click(await day('spans', '2026-03-10'));
await sleep(50);
const spanStates = await page.evaluate((sel) => {
  const pop = document.getElementById(document.querySelector(sel).getAttribute('data-ax-popover'));
  const dis = (d) => pop.querySelector(`button[data-date="${d}"]:not([data-ax-outside])`).getAttribute('aria-disabled') === 'true';
  return {near: dis('2026-03-12'), min: dis('2026-03-13'), max: dis('2026-03-23'), far: dis('2026-03-24')};
}, box('spans'));
check('minRangeSpan 4 / maxRangeSpan 14 disable days around the start', spanStates.near && !spanStates.min && !spanStates.max && spanStates.far, JSON.stringify(spanStates));
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
await changes();

console.log('Clear, disabled, locale');
await page.click(`${box('presets')} [data-ax-input-clear]`);
await sleep(50);
c = await changes();
s = await state('presets');
check('clear: null value, placeholder text', s.value === null && s.text === 'Select date range' && c.length === 1 && c[0].value === null, JSON.stringify({s, c}));
await page.focus(`${box('one-month')} [data-ax-input-clear]`);
await page.keyboard.press('Enter');
await sleep(50);
check('a keyboard clear hands focus to the trigger', (await page.evaluate(() => document.activeElement?.dataset.test)) === 'one-month');
await changes();
await page.click(trigger('disabled'), {force: true});
await sleep(50);
check('disabled: the trigger opens nothing', !(await state('disabled')).open && (await page.getAttribute(trigger('disabled'), 'aria-disabled')) === 'true');
const de = await state('de');
check('de-DE text with years across a year end', de.text === (await fmt('2025-12-28', '2026-01-03', 'de-DE')), de.text);
const ar = await state('ar');
check('ar-SA text in Arabic-Indic digits', /[٠-٩]/.test(ar.text), ar.text);

console.log('Form');
const bookingTrigger = 'ax-date-range-input:has(input[name="booking-start"]) > [data-ax-range-trigger]';
await page.click(bookingTrigger);
await sleep(80);
const bookingPop = await page.evaluate((sel) => document.querySelector(sel).parentElement.getAttribute('data-ax-popover'), bookingTrigger);
await page.click(`#${bookingPop} button[data-date="2026-03-16"]:not([data-ax-outside])`);
await page.click(`#${bookingPop} button[data-date="2026-03-18"]:not([data-ax-outside])`);
await sleep(50);
await page.click('[data-test="form"] button[type="submit"]');
await sleep(50);
const data = JSON.parse(await page.textContent('[data-test="form-output"]'));
check('form submits <name>-start / <name>-end', data['booking-start'] === '2026-03-16' && data['booking-end'] === '2026-03-18' && data['blackout-start'] === '' && data['blackout-end'] === '', JSON.stringify(data));
await page.click('[data-test="form"] button[type="reset"]');
await sleep(80);
const reset = await page.evaluate(() => {
  const el = document.querySelector('input[name="booking-start"]').closest('ax-date-range-input');
  return {value: el.value, start: el.querySelector('input[name="booking-start"]').value};
});
check('reset restores the server value', reset.value?.start === '2026-03-09' && reset.start === '2026-03-09', JSON.stringify(reset));

await done();
