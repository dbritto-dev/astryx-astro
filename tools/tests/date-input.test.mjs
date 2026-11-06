#!/usr/bin/env node
/**
 * DateInput (<ax-date-input>): combobox markup and theme hooks, typed entry (complete dates
 * report while typing, other text commits on Enter/blur, rejections stay with an error status
 * and an announcement), locale orders (de-DE, ja-JP), Unicode digits (ar-SA), the calendar
 * popover (toggle opens with focus inside, input click / ArrowDown keep focus, Escape and
 * picking close with focus return, outside press start+end, focus leaving), min/max and
 * constraint enforcement, clear, disabled, cancelable astryx-change, form submit/reset,
 * InputGroup member.
 *   node tools/tests/date-input.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup({height: 1000});
await open('date-input');
await page.waitForFunction(() => customElements.get('ax-date-input') && customElements.get('ax-calendar'));
await page.evaluate(() => {
  window.__changes = [];
  document.addEventListener('astryx-change', (e) => {
    const input = e.target.querySelector?.(':scope > input.ax-input-native');
    window.__changes.push({test: input?.dataset.test ?? e.target.tagName, value: e.detail.value, hasValue: 'value' in e.detail});
  });
});

const box = (t) => `ax-date-input:has(> input[data-test="${t}"])`;
const input = (t) => `input[data-test="${t}"]`;
const changes = () => page.evaluate(() => window.__changes.splice(0));
const state = (t) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const inp = el.querySelector(':scope > input.ax-input-native');
  const pop = el.querySelector('ax-picker-popover');
  return {
    value: el.value,
    text: inp.value,
    placeholder: inp.placeholder,
    expanded: inp.getAttribute('aria-expanded'),
    controls: inp.getAttribute('aria-controls'),
    invalid: inp.getAttribute('aria-invalid'),
    describedBy: inp.getAttribute('aria-describedby'),
    status: el.getAttribute('data-status'),
    open: pop.matches(':popover-open'),
    alert: el.querySelector('[data-ax-date-alert]').textContent,
    hidden: el.querySelector('input[data-ax-date-value]')?.value ?? null,
    toggleLabel: el.querySelector('[data-ax-date-toggle]').getAttribute('aria-label'),
    iconState: el.querySelector('.astryx-date-input-toggle-icon').getAttribute('data-state'),
  };
}, box(t));
const typedStatus = (t) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const status = el.parentElement.querySelector(':scope > .astryx-field-status[data-type="error"]');
  return status ? {id: status.id, text: status.textContent.trim()} : null;
}, box(t));
const retype = async (t, text) => {
  await page.click(input(t), {clickCount: 3});
  await page.keyboard.press('Control+a');
  await page.keyboard.type(text);
};
const outside = async () => {
  await page.mouse.move(1080, 980);
  await page.mouse.down();
  await page.mouse.up();
  await sleep(50);
};
const active = () => page.evaluate(() => {
  const a = document.activeElement;
  return a?.dataset.test ?? a?.getAttribute('data-nav') ?? a?.getAttribute('data-ax-date-toggle') ?? a?.tagName;
});

console.log('Markup');
const markup = await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const inp = el.querySelector(':scope > input.ax-input-native');
  return {
    role: inp.getAttribute('role'),
    haspopup: inp.getAttribute('aria-haspopup'),
    autocomplete: inp.getAttribute('aria-autocomplete'),
    size: el.getAttribute('data-size'),
    layer: el.querySelector('ax-picker-popover').getAttribute('popover'),
    surface: el.querySelector('.astryx-popover').getAttribute('role'),
    surfaceLabel: el.querySelector('.astryx-popover').getAttribute('aria-label'),
    labelled: document.querySelector(`label[for="${inp.id}"]`)?.textContent.trim(),
  };
}, box('basic'));
check('text input is a combobox with a dialog popup', markup.role === 'combobox' && markup.haspopup === 'dialog' && markup.autocomplete === 'none', JSON.stringify(markup));
check('theme hooks: data-size, toggle icon data-state', markup.size === 'md' && (await state('basic')).iconState === 'collapsed');
check('calendar layer is a manual popover with a named dialog surface', markup.layer === 'manual' && markup.surface === 'dialog' && markup.surfaceLabel === 'Choose date', JSON.stringify(markup));
check('Field label names the input', markup.labelled?.startsWith('Event date'), markup.labelled);
let s = await state('basic');
check('server text is the committed value in date_long', s.text === 'March 21, 2026' && s.value === '2026-03-21' && s.expanded === 'false', JSON.stringify(s));

console.log('Typing');
await retype('empty', 'April 2, 2026');
await sleep(50);
let c = await changes();
check('a complete date reports while typing', c.length === 1 && c[0].value === '2026-04-02', JSON.stringify(c));
s = await state('empty');
check('typed text stays until blur', s.text === 'April 2, 2026' && s.value === '2026-04-02');
await page.keyboard.press('Tab');
await sleep(50);
s = await state('empty');
check('blur redraws the committed value', s.text === 'April 2, 2026', s.text);
check('no second report on blur', (await changes()).length === 0);
await page.keyboard.press('Escape');

await retype('empty', '4/7/2026');
await page.keyboard.press('Enter');
await sleep(50);
c = await changes();
s = await state('empty');
check('numeric text commits on Enter', c.length === 1 && c[0].value === '2026-04-07' && s.text === 'April 7, 2026', JSON.stringify({c, s}));

await retype('empty', 'not a date');
await sleep(50);
s = await state('empty');
check('unreadable text while typing: dimmed, aria-invalid, announced, no status yet', s.invalid === 'true' && s.alert === 'Invalid date' && s.status === null, JSON.stringify(s));
await page.keyboard.press('Enter');
await sleep(50);
s = await state('empty');
check('Enter drops text that reads as no date at all (Astryx commit)', s.text === 'April 7, 2026' && s.invalid === null && s.alert === '', JSON.stringify(s));
await retype('empty', 'April');
await page.keyboard.press('Enter');
await sleep(80);
s = await state('empty');
let ts = await typedStatus('empty');
check('Enter keeps incomplete text and shows an error status', s.text === 'April' && s.status === 'error' && s.invalid === 'true' && ts?.text === 'Invalid date', JSON.stringify({s, ts}));
check('the status box describes the input; the alert defers to it', s.describedBy?.split(' ').includes(ts?.id) && s.alert === '', JSON.stringify(s));
check('the error status is shown on the field box (on-field icon)', await page.evaluate((sel) => !!document.querySelector(sel).querySelector('.astryx-input-status-icon[data-status="error"]'), box('empty')));
check('value unchanged by rejected text', s.value === '2026-04-07' && (await changes()).length === 0);
await retype('empty', 'February 30, 2026');
await sleep(80);
ts = await typedStatus('empty');
check('a date the calendar does not have: "does not exist"', ts?.text === 'This date does not exist in the Gregorian Calendar', JSON.stringify(ts));
await retype('empty', 'April 9, 2026');
await sleep(50);
s = await state('empty');
check('a readable date clears the typed status', s.status === null && (await typedStatus('empty')) === null && s.value === '2026-04-09', JSON.stringify(s));
await changes();
await page.keyboard.press('Escape');

console.log('Locales and digits');
await retype('de', '5.4.2026');
await page.keyboard.press('Enter');
await sleep(50);
s = await state('de');
check('de-DE reads day.month.year', s.value === '2026-04-05' && s.text === '5. Apr. 2026', JSON.stringify(s));
await retype('ja', '2026/4/5');
await page.keyboard.press('Enter');
await sleep(50);
s = await state('ja');
check('ja-JP reads year/month/day', s.value === '2026-04-05' && s.text === '2026年4月5日', JSON.stringify(s));
const arText = await page.evaluate(() => new Intl.DateTimeFormat('ar-SA', {calendar: 'gregory', day: 'numeric', month: 'numeric', year: 'numeric'}).format(new Date(2026, 3, 5)));
await retype('ar', arText);
await page.keyboard.press('Enter');
await sleep(50);
s = await state('ar');
check(`ar-SA reads Arabic-Indic digits (${arText})`, s.value === '2026-04-05', JSON.stringify(s));
check('ar-SA writes the committed value in its digits', /[٠-٩]/.test(s.text), s.text);
await page.keyboard.press('Escape');
const buddhist = await state('buddhist');
check('buddhist calendar writes Buddhist years', buddhist.text.includes('2569'), buddhist.text);
await changes();

console.log('Calendar popover');
await page.click(`${box('basic')} [data-ax-date-toggle]`);
await sleep(100);
s = await state('basic');
check('toggle opens the calendar', s.open && s.expanded === 'true' && s.controls != null, JSON.stringify(s));
check('toggle label and icon state follow', s.toggleLabel === 'Close calendar' && s.iconState === 'expanded');
check('focus moves into the calendar (first control)', (await active()) === 'prev');
check('the calendar opens on the value', await page.evaluate((sel) => document.querySelector(sel).querySelector('ax-calendar').focusDate === '2026-03-01', box('basic')));
await page.keyboard.press('Escape');
await sleep(80);
s = await state('basic');
check('Escape closes and returns focus to the opener', !s.open && (await active()) === '' && s.expanded === 'false' && s.controls === null, `${JSON.stringify(s)} active=${await active()}`);

await page.click(input('basic'));
await sleep(80);
s = await state('basic');
check('a click in the input opens with focus kept in the input', s.open && (await active()) === 'basic');
await page.click(`${box('basic')} button[data-date="2026-03-12"]:not([data-ax-outside])`);
await sleep(80);
c = await changes();
s = await state('basic');
check('picking a day commits and closes', !s.open && s.value === '2026-03-12' && s.text === 'March 12, 2026' && c.length === 1 && c[0].value === '2026-03-12', JSON.stringify({s, c}));
check('focus returns to the input', (await active()) === 'basic');
check('the calendar change stays inside (one event, from the field)', c.length === 1 && c[0].test === 'basic');

await page.keyboard.press('ArrowDown');
await sleep(80);
check('ArrowDown opens, focus stays in the input', (await state('basic')).open && (await active()) === 'basic');
await page.keyboard.press('Escape');
await sleep(50);
check('Escape from the input closes', !(await state('basic')).open && (await active()) === 'basic');
await page.keyboard.press('Alt+ArrowDown');
await sleep(50);
check('Alt+ArrowDown opens', (await state('basic')).open);
await page.keyboard.press('Escape');

await retype('basic', 'May 3, 2026');
await sleep(50);
check('a typed date shows its month in the calendar', await page.evaluate((sel) => document.querySelector(sel).querySelector('ax-calendar').focusDate === '2026-05-01', box('basic')));
await changes();

console.log('Dismissal');
await page.click(input('empty'));
await sleep(50);
check('open', (await state('empty')).open);
await page.click(`label[for="${await page.getAttribute(input('empty'), 'id')}"]`);
await sleep(50);
check('a press on the field label stays inside', (await state('empty')).open);
await outside();
check('a press outside (start and end) closes', !(await state('empty')).open);
await page.click(input('empty'));
await sleep(50);
// A press that starts outside and ends inside does not dismiss.
const r = await page.evaluate((sel) => document.querySelector(sel).getBoundingClientRect().toJSON(), input('empty'));
await page.mouse.move(1080, 980);
await page.mouse.down();
await page.mouse.move(r.x + 20, r.y + r.height / 2);
await page.mouse.up();
await sleep(50);
check('a press that ends inside does not dismiss', (await state('empty')).open);
await page.click(input('empty'));
await page.focus(input('clearable'));
await sleep(50);
check('focus leaving the field closes it', !(await state('empty')).open);

console.log('Bounds and constraints');
await retype('bounds', 'April 5, 2026');
await sleep(80);
s = await state('bounds');
ts = await typedStatus('bounds');
check('a complete date outside min/max shows the bounds at once', s.status === 'error' && ts?.text === 'Enter a date from March 1, 2026 to March 31, 2026' && s.value === '2026-03-10', JSON.stringify({s, ts}));
await page.keyboard.press('Tab');
await sleep(50);
s = await state('bounds');
check('blur keeps the rejected text (never adjusted)', s.text === 'April 5, 2026' && s.value === '2026-03-10', JSON.stringify(s));
await page.keyboard.press('Escape');
await page.click(`${box('bounds')} [data-ax-date-toggle]`);
await sleep(80);
const disabledDays = await page.evaluate((sel) => {
  const cal = document.querySelector(sel).querySelector('ax-calendar');
  return {feb: cal.querySelector('.astryx-calendar-nav[data-nav="prev"]').disabled, apr: cal.querySelector('.astryx-calendar-nav[data-nav="next"]').disabled};
}, box('bounds'));
check('the calendar cannot leave min/max', disabledDays.feb && disabledDays.apr, JSON.stringify(disabledDays));
await page.keyboard.press('Escape');
await retype('weekdays', 'March 14, 2026');
await sleep(80);
ts = await typedStatus('weekdays');
check('a date a constraint rejects: "not available"', ts?.text === 'This date is not available', JSON.stringify(ts));
const weekendDisabled = await page.evaluate((sel) => document.querySelector(sel).querySelector('button[data-date="2026-03-14"]').getAttribute('aria-disabled'), box('weekdays'));
check('the calendar disables constrained days (server mask)', weekendDisabled === 'true');
await page.keyboard.press('Escape');
await changes();

console.log('Tooltip status variant');
const tipBefore = await state('tooltip-status');
await retype('tooltip-status', 'April');
await page.keyboard.press('Enter');
await sleep(80);
const tip = await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const inp = el.querySelector(':scope > input.ax-input-native');
  const button = [...el.querySelectorAll('.ax-input-status-button')].find((b) => !b.closest('[hidden]'));
  const layer = button ? document.getElementById(button.getAttribute('aria-describedby')) : null;
  const announcer = el.parentElement.querySelector(':scope > [data-ax-field-status][hidden]');
  return {
    describedBy: inp.getAttribute('aria-describedby') ?? '',
    tooltipId: layer?.id,
    tooltip: layer?.textContent.trim(),
    callerHidden: el.querySelector(':scope > [data-ax-status-slot]').hidden,
    announcer: announcer?.textContent,
  };
}, box('tooltip-status'));
check('tooltip variant: the typed error replaces the caller icon, its tooltip holds the message', tip.callerHidden && tip.tooltip === 'Invalid date' && tip.describedBy.split(' ').includes(tip.tooltipId), JSON.stringify(tip));
check('tooltip variant: the message is spoken through the hidden field-status node', tip.announcer === 'Invalid date', JSON.stringify(tip));
await page.keyboard.press('Escape');
await retype('tooltip-status', 'March 22, 2026');
await sleep(50);
const tipAfter = await state('tooltip-status');
check('a valid date restores the caller status and description', tipAfter.status === 'error' && tipAfter.describedBy === tipBefore.describedBy && !(await page.evaluate((sel) => document.querySelector(sel).querySelector(':scope > [data-ax-status-slot]').hidden, box('tooltip-status'))), JSON.stringify(tipAfter));
await page.keyboard.press('Escape');
await changes();

console.log('Clear, disabled, cancel');
await page.hover(input('clearable'));
await page.click(`${box('clearable')} [data-ax-input-clear]`);
await sleep(80);
c = await changes();
s = await state('clearable');
check('clear empties the field with value undefined', s.value === undefined && s.text === '' && c.length === 1 && c[0].hasValue && c[0].value === undefined, JSON.stringify({s, c}));
check('clear button hides, focus in the input', await page.evaluate((sel) => document.querySelector(sel).querySelector('[data-ax-input-clear]').hidden, box('clearable')) && (await active()) === 'clearable');

await page.click(`${box('disabled')} [data-ax-date-toggle]`, {force: true});
await page.click(input('disabled'), {force: true});
await page.keyboard.type('x');
await sleep(80);
s = await state('disabled');
check('disabled: no popover, no typing, still focusable', !s.open && s.text === 'March 21, 2026' && (await active()) === 'disabled' && s.hidden === null, JSON.stringify(s));
await page.click(input('loading'), {force: true});
await page.keyboard.press('ArrowDown');
await sleep(50);
check('loading blocks opening (aria-busy)', !(await state('loading')).open && (await page.getAttribute(input('loading'), 'aria-busy')) === 'true');

await page.evaluate(() => document.addEventListener('astryx-change', (e) => e.preventDefault(), {once: true}));
await retype('clearable', 'June 1, 2026');
await sleep(50);
s = await state('clearable');
check('a cancelled change keeps the old value', s.value === undefined && s.hidden === null, JSON.stringify(s));
await page.keyboard.press('Escape');
await changes();

console.log('Form');
const checkinSel = 'ax-date-input:has(input[name="checkin"]) > input.ax-input-native';
await page.click(checkinSel, {clickCount: 3});
await page.keyboard.press('Control+a');
await page.keyboard.type('3/25/2026');
await page.keyboard.press('Enter');
await sleep(50);
await page.click('[data-test="form"] button[type="submit"]');
await sleep(50);
let data = JSON.parse(await page.textContent('[data-test="form-output"]'));
check('form submits ISO values (hidden input)', data.checkin === '2026-03-25' && data.checkout === '' && data.due === '2026-04-01', JSON.stringify(data));
check('the visible text is not submitted', !Object.values(data).some((v) => /March/.test(v)));
await page.click('[data-test="form"] button[type="reset"]');
await sleep(80);
s = await page.evaluate(() => {
  const el = document.querySelector('input[name="checkin"]').closest('ax-date-input');
  return {value: el.value, text: el.querySelector(':scope > input.ax-input-native').value, hidden: el.querySelector('input[name="checkin"]').value};
});
check('reset restores the server value', s.value === '2026-03-21' && s.text === 'March 21, 2026' && s.hidden === '2026-03-21', JSON.stringify(s));
const disabledSubmitted = await page.evaluate(() => document.querySelector('input[name="disabled-date"]') !== null);
check('a disabled field submits nothing', !disabledSubmitted);

console.log('InputGroup member');
const group = await page.evaluate(() => {
  const inp = document.querySelector('input[name="due"]').closest('ax-date-input');
  return {item: inp.hasAttribute('data-astryx-input-group-item'), field: !!inp.closest('.astryx-field')};
});
check('in an InputGroup the box is a group member without its own Field', group.item, JSON.stringify(group));
const dueSel = 'ax-date-input:has(input[name="due"]) > input.ax-input-native';
await page.click(dueSel, {clickCount: 3});
await page.keyboard.press('Control+a');
await page.keyboard.type('April');
await page.keyboard.press('Enter');
await sleep(80);
const dueAlert = await page.evaluate(() => {
  const el = document.querySelector('input[name="due"]').closest('ax-date-input');
  return {alert: el.querySelector('[data-ax-date-alert]').textContent, status: el.getAttribute('data-status')};
});
check('in a group the rejection is announced by the alert region', dueAlert.alert === 'Invalid date' && dueAlert.status === 'error', JSON.stringify(dueAlert));

await done();
