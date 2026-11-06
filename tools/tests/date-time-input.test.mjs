#!/usr/bin/env node
/**
 * DateTimeInput (<ax-date-time-input>): two segments under one label; a typed or picked date
 * keeps the time (or takes now, clamped on a boundary day); a time needs a date; the calendar
 * popover (popover="auto", toggle, ArrowDown, light dismiss); the preset-time combobox
 * (open by click / Alt+ArrowDown, aria-activedescendant, ArrowUp/Down/Home/End, Enter commits
 * typed text first, Escape, pointer pick, min/max windows); arrow stepping (announced);
 * typed date rejections as the detached field status; locale formats; clear; disabled;
 * form submit/reset.
 *   node tools/tests/date-time-input.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup({height: 1000});
await open('date-time-input');
await page.waitForFunction(() => customElements.get('ax-date-time-input') && customElements.get('ax-calendar'));
await page.evaluate(() => {
  window.__changes = [];
  document.addEventListener('astryx-change', (e) => {
    const input = e.target.querySelector?.('input[data-ax-date-input]');
    window.__changes.push({test: input?.dataset.test ?? e.target.tagName, value: e.detail.value});
  });
});

const root = (t) => `ax-date-time-input:has(input[data-test="${t}"])`;
const dateInput = (t) => `input[data-test="${t}"]`;
const timeInput = (t) => `${root(t)} input[data-ax-time-input]`;
const changes = () => page.evaluate(() => window.__changes.splice(0));
const state = (t) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const d = el.querySelector('input[data-ax-date-input]');
  const ti = el.querySelector('input[data-ax-time-input]');
  const config = JSON.parse(el.getAttribute('data-ax-config'));
  const pop = document.getElementById(config.popover);
  const list = config.listPopover ? document.getElementById(config.listPopover) : null;
  const active = ti.getAttribute('aria-activedescendant');
  return {
    value: el.value,
    date: d.value,
    time: ti.value,
    calendarOpen: pop.matches(':popover-open'),
    listOpen: list ? list.matches(':popover-open') : null,
    timeExpanded: ti.getAttribute('aria-expanded'),
    activeOption: active ? document.getElementById(active)?.textContent : null,
    selected: list ? [...list.querySelectorAll('[aria-selected="true"]')].map((o) => o.textContent) : [],
    firstOption: list ? [...list.querySelectorAll('[role="option"]')].find((o) => !o.hidden)?.textContent : null,
    lastOption: list ? [...list.querySelectorAll('[role="option"]')].filter((o) => !o.hidden).at(-1)?.textContent : null,
    status: el.getAttribute('data-status'),
    dateStatus: el.querySelector('[data-ax-date-segment]').getAttribute('data-status'),
    timeDescribedBy: ti.getAttribute('aria-describedby'),
    dateDescribedBy: d.getAttribute('aria-describedby'),
    popId: pop.id,
  };
}, root(t));
const retype = async (sel, text) => {
  await page.click(sel, {clickCount: 3});
  await page.keyboard.press('Control+a');
  await page.keyboard.type(text);
};
const live = () => page.evaluate(() => [...document.querySelectorAll('[data-astryx-live-region]')].map((r) => r.textContent).join(' | '));

console.log('Markup');
let s = await state('basic');
check('two segments: date "March 21, 2026", time "2:30 PM"', s.date === 'March 21, 2026' && s.time === '2:30 PM' && s.value === '2026-03-21T14:30', JSON.stringify(s));
const markup = await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const ti = el.querySelector('input[data-ax-time-input]');
  return {
    row: el.classList.contains('astryx-date-time-input'),
    dateSeg: el.querySelector('.astryx-date-time-input-date-segment')?.getAttribute('data-size'),
    timeSeg: el.querySelector('.astryx-date-time-input-time-segment')?.getAttribute('data-size'),
    timeName: ti.getAttribute('aria-label'),
    timeRole: ti.getAttribute('role'),
    clock: !!el.querySelector('.astryx-date-time-input-clock-icon'),
  };
}, root('basic'));
check('theme hooks on the row and both segments', markup.row && markup.dateSeg === 'md' && markup.timeSeg === 'md' && markup.clock, JSON.stringify(markup));
check('the time input is named "<label> time", no combobox without options', markup.timeName === 'Meeting time time' && markup.timeRole === null, JSON.stringify(markup));
const optionsMarkup = await page.evaluate((sel) => {
  const ti = document.querySelector(sel);
  return {role: ti.getAttribute('role'), autocomplete: ti.getAttribute('aria-autocomplete'), expanded: ti.getAttribute('aria-expanded')};
}, timeInput('options'));
check('timeOptionInterval makes the time a list combobox', optionsMarkup.role === 'combobox' && optionsMarkup.autocomplete === 'list' && optionsMarkup.expanded === 'false', JSON.stringify(optionsMarkup));

console.log('Date keeps the time');
await retype(dateInput('basic'), 'April 2, 2026');
await sleep(50);
let c = await changes();
check('a typed date keeps the time', c.at(-1)?.value === '2026-04-02T14:30', JSON.stringify(c));
await page.keyboard.press('Escape');
await page.click(`${root('basic')} [data-ax-date-toggle]`);
await sleep(100);
s = await state('basic');
check('the toggle opens the calendar on the date', s.calendarOpen && await page.evaluate((id) => document.getElementById(id).querySelector('ax-calendar').focusDate === '2026-04-01', s.popId));
await page.click(`#${s.popId} button[data-date="2026-04-09"]:not([data-ax-outside])`);
await sleep(80);
c = await changes();
s = await state('basic');
check('a picked day keeps the time and closes', !s.calendarOpen && s.value === '2026-04-09T14:30' && c.length === 1, JSON.stringify({s, c}));
check('the calendar change stays inside', c.every((x) => x.test === 'basic'));

console.log('A time needs a date');
await retype(timeInput('empty'), '10:00 AM');
await sleep(30);
check('typing a time with no date reports nothing', (await changes()).length === 0);
await page.keyboard.press('Escape');
await page.focus(dateInput('basic'));
await sleep(30);
check('…and reverts on blur', (await state('empty')).time === '');
await retype(dateInput('empty'), 'May 1, 2026');
await sleep(50);
c = await changes();
check('a date with no time takes the current time', /^2026-05-01T\d\d:\d\d$/.test(c.at(-1)?.value ?? ''), JSON.stringify(c));
await page.keyboard.press('Escape');
await page.keyboard.press('Tab');

console.log('Time typing and arrows');
await retype(timeInput('basic'), '4:05 PM');
await page.keyboard.press('Tab');
await sleep(50);
s = await state('basic');
check('a typed time combines with the date', s.value === '2026-04-09T16:05' && s.time === '4:05 PM', JSON.stringify(s));
await page.focus(timeInput('basic'));
await page.keyboard.press('ArrowUp');
await sleep(80);
check('ArrowUp steps the time by timeIncrement (1)', (await state('basic')).value === '2026-04-09T16:06');
check('the step is announced', (await live()).includes('4:06 PM'), await live());
await page.focus(timeInput('options'));
await page.keyboard.press('ArrowUp');
await sleep(30);
check('timeIncrement={15} steps by 15 with the list closed', (await state('options')).value === '2026-03-21T09:15');
await changes();

console.log('Time list');
await page.click(timeInput('options'));
await sleep(80);
s = await state('options');
check('a click opens the list', s.listOpen && s.timeExpanded === 'true', JSON.stringify(s));
check('the active option is the selected time', s.activeOption === '9:15 AM' && JSON.stringify(s.selected) === '["9:15 AM"]', JSON.stringify(s));
check('focus stays in the time input', await page.evaluate((sel) => document.activeElement === document.querySelector(sel), timeInput('options')));
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
await sleep(30);
check('ArrowDown moves the active option', (await state('options')).activeOption === '9:45 AM', (await state('options')).activeOption);
await page.keyboard.press('Home');
await sleep(30);
check('Home → first option', (await state('options')).activeOption === '12:00 AM');
await page.keyboard.press('End');
await sleep(30);
check('End → last option', (await state('options')).activeOption === '11:45 PM');
await page.keyboard.press('ArrowUp');
await page.keyboard.press('Enter');
await sleep(50);
s = await state('options');
c = await changes();
check('Enter commits the active option and closes', !s.listOpen && s.value === '2026-03-21T23:30' && s.timeExpanded === 'false' && c.length === 1, JSON.stringify({s, c}));
await page.keyboard.press('Alt+ArrowDown');
await sleep(50);
check('Alt+ArrowDown opens', (await state('options')).listOpen);
await page.keyboard.press('Escape');
await sleep(50);
check('Escape closes', !(await state('options')).listOpen);
await page.click(timeInput('options'));
await sleep(50);
await page.keyboard.press('Control+a');
await page.keyboard.type('1:07 PM');
await sleep(50);
check('typing moves the highlight to the option at or before it', (await state('options')).activeOption === '1:00 PM', (await state('options')).activeOption);
await page.keyboard.press('Enter');
await sleep(50);
s = await state('options');
check('Enter commits the typed time, not the option', s.value === '2026-03-21T13:07' && !s.listOpen, JSON.stringify(s));
await changes();
await page.click(timeInput('options'));
await sleep(50);
const listId = await page.evaluate((sel) => JSON.parse(document.querySelector(sel).getAttribute('data-ax-config')).listPopover, root('options'));
await page.click(`#${listId} [role="option"]:text-is("6:30 PM")`);
await sleep(50);
s = await state('options');
check('a pointer pick commits and closes, focus in the input', s.value === '2026-03-21T18:30' && !s.listOpen && await page.evaluate((sel) => document.activeElement === document.querySelector(sel), timeInput('options')), JSON.stringify(s));
await page.click(timeInput('options'));
await sleep(50);
await page.mouse.click(1080, 990);
await sleep(50);
check('a press outside closes the list', !(await state('options')).listOpen);
await changes();

console.log('Bounds');
await page.click(timeInput('bounds'));
await sleep(50);
s = await state('bounds');
check('on the min day the list starts at the min time', s.firstOption === '9:00 AM' && s.lastOption === '11:00 PM', JSON.stringify(s));
await page.keyboard.press('Escape');
await page.keyboard.press('ArrowDown');
await sleep(30);
check('a step below the min time is refused', (await state('bounds')).value === '2026-03-10T09:00');
await retype(dateInput('bounds'), 'March 20, 2026');
await sleep(50);
c = await changes();
check('a new date keeps an in-window time', c.at(-1)?.value === '2026-03-20T09:00', JSON.stringify(c));
await page.keyboard.press('Escape');
await page.evaluate((sel) => { document.querySelector(sel).value = '2026-03-12T19:00'; }, root('bounds'));
await retype(dateInput('bounds'), 'March 20, 2026');
await sleep(50);
c = await changes();
check('a time past the max day\'s time is clamped to it', c.at(-1)?.value === '2026-03-20T17:30', JSON.stringify(c));
await page.keyboard.press('Escape');
await retype(dateInput('bounds'), 'March 25, 2026');
await sleep(80);
s = await state('bounds');
const statusText = await page.evaluate((sel) => document.querySelector(sel).parentElement.querySelector(':scope > .astryx-field-status')?.textContent.trim(), root('bounds'));
check('a date past max: error on the row and the date segment, detached message', s.status === 'error' && s.dateStatus === 'error' && statusText === 'Enter a date from March 10, 2026 to March 20, 2026', JSON.stringify({s, statusText}));
check('both inputs are described by the message', s.dateDescribedBy === s.timeDescribedBy && s.dateDescribedBy?.length > 0);
await retype(dateInput('bounds'), 'March 15, 2026');
await sleep(50);
s = await state('bounds');
check('a valid date clears it', s.status === null && s.dateStatus === null, JSON.stringify(s));
await page.keyboard.press('Escape');
await changes();

console.log('Locales');
const de = await state('de');
check('de-DE: "21. März 2026" and "14:30"', de.date === '21. März 2026' && de.time === '14:30', JSON.stringify(de));
await page.click(timeInput('de'));
await sleep(50);
check('de-DE options are 24-hour', (await state('de')).activeOption === '14:30');
await page.keyboard.press('Escape');
const ja = await state('ja');
check('ja-JP date', ja.date === '2026年3月21日', ja.date);
const ar = await state('ar');
check('ar-SA digits in both segments', /[٠-٩]/.test(ar.date) && /[٠-٩]/.test(ar.time), JSON.stringify(ar));

console.log('Clear, disabled, form');
await page.click(`${root('options')} [data-ax-input-clear]`);
await sleep(50);
c = await changes();
s = await state('options');
check('clear empties both segments (undefined)', s.value === undefined && s.date === '' && s.time === '' && c.length === 1 && c[0].value === undefined, JSON.stringify({s, c}));
await page.click(dateInput('disabled'), {force: true});
await page.keyboard.press('ArrowDown');
await sleep(50);
check('disabled: no calendar', !(await state('disabled')).calendarOpen);
const startsDate = 'ax-date-time-input:has(input[name="starts"]) input[data-ax-date-input]';
await retype(startsDate, 'March 22, 2026');
await page.keyboard.press('Escape');
await page.click('[data-test="form"] button[type="submit"]');
await sleep(50);
const data = JSON.parse(await page.textContent('[data-test="form-output"]'));
check('form submits the ISO datetime', data.starts === '2026-03-22T09:00' && data.ends === '', JSON.stringify(data));
check('a disabled field submits nothing', !(await page.evaluate(() => !!document.querySelector('input[name="disabled-dt"]'))));
await page.click('[data-test="form"] button[type="reset"]');
await sleep(80);
const reset = await page.evaluate(() => document.querySelector('input[name="starts"]').closest('ax-date-time-input').value);
check('reset restores the server value', reset === '2026-03-21T09:00', reset);

await done();
