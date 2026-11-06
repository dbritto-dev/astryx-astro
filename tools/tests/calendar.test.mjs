#!/usr/bin/env node
/**
 * Calendar (<ax-calendar>): APG grid markup, roving tab stop, the full keyboard map (arrows,
 * Home/End, Ctrl+Home/End, PageUp/PageDown, Shift+PageUp/PageDown, crossing months at the
 * edges, RTL arrows), single selection (click, Enter) with astryx-change, range selection
 * (start, hover preview, completion, reverse pick across grids, Escape cancel that stops
 * propagation), min/max and constraint masks, range spans, month navigation buttons with
 * edge state and announcements, week numbers and empty outside cells, today marker.
 *   node tools/tests/calendar.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup({height: 1000});
await open('calendar');
await page.waitForFunction(() => customElements.get('ax-calendar'));
await page.evaluate(() => {
  window.__changes = [];
  window.__docEscapes = 0;
  document.addEventListener('astryx-change', (e) => window.__changes.push({id: e.target.id, value: e.detail.value, hasDate: e.detail.valueAsDate instanceof Date}));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.__docEscapes++; });
});

const day = (cal, iso) => `#${cal} button[data-date="${iso}"]:not([data-ax-outside])`;
const focused = () => page.evaluate(() => document.activeElement?.getAttribute('data-date') ?? document.activeElement?.tagName);
const label = (cal) => page.textContent(`#${cal} .ax-calendar-month-label`);
const attr = (sel, name) => page.getAttribute(sel, name);
const changes = () => page.evaluate(() => window.__changes.splice(0));
const live = () => page.evaluate(() => [...document.querySelectorAll('[data-astryx-live-region]')].map((r) => r.textContent).join(' | '));
const press = async (key, times = 1) => { for (let i = 0; i < times; i++) await page.keyboard.press(key); };

console.log('Markup');
const markup = await page.evaluate(() => {
  const cal = document.getElementById('cal-single');
  const grid = cal.querySelector('[role="grid"]');
  return {
    gridLabel: grid.getAttribute('aria-label'),
    headers: grid.querySelectorAll('[role="columnheader"]').length,
    cells: grid.querySelectorAll('[role="gridcell"]').length,
    rows: grid.querySelectorAll('[role="row"]').length,
    stops: [...grid.querySelectorAll('button[tabindex="0"]')].map((b) => b.dataset.date),
    selectedCell: cal.querySelector('button[data-date="2026-03-10"]').closest('[role="gridcell"]').getAttribute('aria-selected'),
    selectedName: cal.querySelector('button[data-date="2026-03-10"]').getAttribute('aria-label'),
    outside: cal.querySelector('button[data-ax-outside]').getAttribute('aria-disabled'),
    navTargets: [...cal.querySelectorAll('.astryx-calendar-nav')].map((b) => `${b.dataset.nav}:${b.getAttribute('aria-label')}`),
  };
});
check('grid named by its month', markup.gridLabel === 'March 2026', markup.gridLabel);
check('7 columnheaders, 42 gridcells, 7 rows', markup.headers === 7 && markup.cells === 42 && markup.rows === 7, JSON.stringify(markup));
check('one tab stop, on the selected day', JSON.stringify(markup.stops) === '["2026-03-10"]', JSON.stringify(markup.stops));
check('selected cell aria-selected and "…, selected" name', markup.selectedCell === 'true' && markup.selectedName === 'Tuesday, March 10, 2026, selected', markup.selectedName);
check('adjacent-month days are aria-disabled', markup.outside === 'true');
check('nav buttons named Previous/Next month', markup.navTargets.join() === 'prev:Previous month,next:Next month');

const identical = await page.evaluate(() => ['cal-single', 'cal-range', 'cal-weeks', 'cal-buddhist', 'cal-es', 'cal-rtl', 'cal-bounds'].filter((id) => {
  const el = document.getElementById(id);
  const before = el.querySelector('.ax-calendar-months').innerHTML;
  el.value = el.value; // re-render in the browser with the shared render function
  return el.querySelector('.ax-calendar-months').innerHTML !== before;
}));
check('browser re-render reproduces the server markup exactly', identical.length === 0, identical.join());

console.log('Keyboard map (single)');
await page.focus(day('cal-single', '2026-03-10'));
await press('ArrowRight');
check('ArrowRight → next day', (await focused()) === '2026-03-11');
await press('ArrowLeft');
check('ArrowLeft → previous day', (await focused()) === '2026-03-10');
await press('ArrowDown');
check('ArrowDown → next week', (await focused()) === '2026-03-17');
await press('ArrowUp');
check('ArrowUp → previous week', (await focused()) === '2026-03-10');
await press('Home');
check('Home → first day of the row', (await focused()) === '2026-03-08');
await press('End');
check('End → last day of the row', (await focused()) === '2026-03-14');
await page.keyboard.press('Control+Home');
check('Ctrl+Home → first day of the month (outside days skipped)', (await focused()) === '2026-03-01');
await page.keyboard.press('Control+End');
check('Ctrl+End → last day of the month', (await focused()) === '2026-03-31');
check('tab stop follows focus', (await attr(day('cal-single', '2026-03-31'), 'tabindex')) === '0' && (await attr(day('cal-single', '2026-03-10'), 'tabindex')) === '-1');
await press('ArrowRight');
await sleep(50);
check('ArrowRight at the month end crosses into April', (await label('cal-single')) === 'April 2026' && (await focused()) === '2026-04-01', `${await label('cal-single')} ${await focused()}`);
check('month change is announced', (await live()).includes('April 2026'), await live());
await press('ArrowUp');
check('ArrowUp from Apr 1 → Mar 25 (previous month)', (await focused()) === '2026-03-25' && (await label('cal-single')) === 'March 2026');
await press('PageDown');
check('PageDown → same day next month', (await focused()) === '2026-04-25' && (await label('cal-single')) === 'April 2026');
await press('PageUp');
check('PageUp → same day previous month', (await focused()) === '2026-03-25');
await page.keyboard.press('Shift+PageDown');
check('Shift+PageDown → next year', (await focused()) === '2027-03-25' && (await label('cal-single')) === 'March 2027');
await page.keyboard.press('Shift+PageUp');
check('Shift+PageUp → previous year', (await focused()) === '2026-03-25' && (await label('cal-single')) === 'March 2026');
const stops = await page.$$eval('#cal-single [role="grid"] button[tabindex="0"]', (els) => els.map((e) => e.dataset.date));
check('still exactly one tab stop after navigation', stops.length === 1 && stops[0] === '2026-03-25', JSON.stringify(stops));

console.log('Single selection');
await changes();
await press('Enter');
let ch = await changes();
check('Enter selects the focused day → astryx-change {value, valueAsDate}', ch.length === 1 && ch[0].value === '2026-03-25' && ch[0].hasDate, JSON.stringify(ch));
check('selection reflected (data-selected, name)', (await attr(day('cal-single', '2026-03-25'), 'data-selected')) === 'selected' && (await attr(day('cal-single', '2026-03-10'), 'data-selected')) === null && (await attr(day('cal-single', '2026-03-25'), 'aria-label')).endsWith(', selected'));
check('focus kept on the day after re-render', (await focused()) === '2026-03-25');
await page.click(day('cal-single', '2026-03-03'));
ch = await changes();
check('click selects', ch.length === 1 && ch[0].value === '2026-03-03' && (await page.textContent('[data-output-for="cal-single"]')) === '"2026-03-03"');
check('element value + data-ax-value', (await page.$eval('#cal-single', (el) => el.value)) === '2026-03-03' && (await attr('#cal-single', 'data-ax-value')) === '2026-03-03');
await page.click(`#cal-single button[data-date="2026-04-01"][data-ax-outside]`, {force: true});
check('clicking an adjacent-month day does nothing', (await changes()).length === 0);
// Cancelable change: a controlled owner keeps the value.
await page.evaluate(() => document.getElementById('cal-single').addEventListener('astryx-change', (e) => e.preventDefault(), {once: true}));
await page.click(day('cal-single', '2026-03-04'));
check('preventDefault() on astryx-change keeps the old value', (await page.$eval('#cal-single', (el) => el.value)) === '2026-03-03' && (await attr(day('cal-single', '2026-03-04'), 'data-selected')) === null);
await changes();

console.log('Month buttons');
await page.click('#cal-single .astryx-calendar-nav[data-nav="next"]');
check('Next month button', (await label('cal-single')) === 'April 2026');
await page.click('#cal-single .astryx-calendar-nav[data-nav="prev"]');
await page.click('#cal-single .astryx-calendar-nav[data-nav="prev"]');
check('Previous month button', (await label('cal-single')) === 'February 2026');
const fdc = await page.evaluate(() => document.getElementById('cal-single').focusDate);
check('focusDate API follows', fdc === '2026-02-01', fdc);
await page.evaluate(() => document.getElementById('cal-single').navigateTo('2026-03-15'));
check('navigateTo(iso)', (await label('cal-single')) === 'March 2026');

console.log('RTL');
await page.focus(day('cal-rtl', '2026-10-14'));
await press('ArrowLeft');
check('RTL: ArrowLeft → next day', (await focused()) === '2026-10-15');
await press('ArrowRight');
await press('ArrowRight');
check('RTL: ArrowRight → previous day', (await focused()) === '2026-10-13');
const rtlGeom = await page.evaluate(() => {
  const r = (iso) => document.querySelector(`#cal-rtl button[data-date="${iso}"]`).getBoundingClientRect().left;
  return r('2026-10-13') > r('2026-10-14');
});
check('RTL: earlier days sit to the right', rtlGeom);

console.log('Range selection');
await page.click(day('cal-range', '2026-04-20'));
await sleep(30);
check('first pick: rangeSelectionStart, "range start" name, no change event', (await page.$eval('#cal-range', (el) => el.rangeSelectionStart)) === '2026-04-20' && (await attr(day('cal-range', '2026-04-20'), 'aria-label')).endsWith(', range start') && (await changes()).length === 0);
check('range start announced', (await live()).includes('Start date Monday, April 20, 2026. Select an end date.'), await live());
check('the previous range is replaced by the in-progress start', (await attr(day('cal-range', '2026-04-10'), 'data-in-range')) === null);
await page.hover(day('cal-range', '2026-04-23'));
await sleep(30);
const preview = await page.$$eval('#cal-range .ax-calendar-preview-bg', (els) => els.map((e) => e.parentElement.querySelector('button').dataset.date));
check('hover previews the range', JSON.stringify(preview) === '["2026-04-20","2026-04-21","2026-04-22","2026-04-23"]', JSON.stringify(preview));
await page.click(day('cal-range', '2026-04-23'));
ch = await changes();
check('second pick completes → astryx-change {value: {start, end}}', ch.length === 1 && ch[0].value.start === '2026-04-20' && ch[0].value.end === '2026-04-23', JSON.stringify(ch));
const inRange = await page.$$eval('#cal-range [data-in-range]', (els) => els.map((e) => e.dataset.date));
check('days in range marked, cells aria-selected', JSON.stringify(inRange) === '["2026-04-20","2026-04-21","2026-04-22","2026-04-23"]' && (await page.$eval(day('cal-range', '2026-04-21'), (b) => b.closest('[role=gridcell]').getAttribute('aria-selected'))) === 'true');
check('endpoints named range start / end', (await attr(day('cal-range', '2026-04-20'), 'aria-label')).endsWith('range start') && (await attr(day('cal-range', '2026-04-23'), 'aria-label')).endsWith('range end') && (await attr(day('cal-range', '2026-04-22'), 'aria-label')).endsWith('in range'));
check('completion announced', (await live()).includes('Selected range: Monday, April 20, 2026 to Thursday, April 23, 2026.'), await live());
check('grid is aria-multiselectable', (await page.getAttribute('#cal-range [role="grid"]', 'aria-multiselectable')) === 'true');
await page.click(day('cal-range', '2026-05-05'));
await page.click(day('cal-range', '2026-04-28'));
ch = await changes();
check('reverse pick across the two grids swaps start/end', ch.length === 1 && ch[0].value.start === '2026-04-28' && ch[0].value.end === '2026-05-05', JSON.stringify(ch));
await page.click(day('cal-range', '2026-04-02'));
await page.evaluate(() => { window.__docEscapes = 0; });
await press('Escape');
check('Escape cancels the in-progress range and stops there', (await page.$eval('#cal-range', (el) => el.rangeSelectionStart)) === null && (await page.evaluate(() => window.__docEscapes)) === 0);
check('value kept after cancel', JSON.stringify(await page.$eval('#cal-range', (el) => el.value)) === '{"start":"2026-04-28","end":"2026-05-05"}');
await press('Escape');
check('Escape with no range in progress passes through', (await page.evaluate(() => window.__docEscapes)) === 1);
await page.focus(day('cal-range', '2026-04-30'));
await press('ArrowRight');
check('two months: ArrowRight crosses into the second grid without moving the view', (await focused()) === '2026-05-01' && (await label('cal-range')) === 'April 2026 – May 2026');
await press('ArrowDown', 5);
check('two months: leaving the last grid shifts the view by one month', (await focused()) === '2026-06-05' && (await label('cal-range')) === 'May 2026 – June 2026', `${await focused()} ${await label('cal-range')}`);
const rangeStops = await page.$$eval('#cal-range [role="grid"]', (gs) => gs.map((g) => g.querySelectorAll('button[tabindex="0"]').length));
check('one tab stop per grid', JSON.stringify(rangeStops) === '[1,1]', JSON.stringify(rangeStops));

console.log('Range spans');
await page.click(day('cal-span', '2026-07-10'));
const span = await page.evaluate(() => Object.fromEntries(['2026-07-03', '2026-07-04', '2026-07-16', '2026-07-17'].map((d) => [d, document.querySelector(`#cal-span button[data-date="${d}"]`).getAttribute('aria-disabled')])));
check('maxRangeSpan 7: days 7+ away disabled, 6 away enabled', span['2026-07-03'] === 'true' && span['2026-07-04'] === null && span['2026-07-16'] === null && span['2026-07-17'] === 'true', JSON.stringify(span));
await page.click(day('cal-span', '2026-07-10'));
await sleep(30);
check('minRangeSpan 2: picking the start again clears it (and is announced)', (await page.$eval('#cal-span', (el) => el.rangeSelectionStart)) === null && (await attr(day('cal-span', '2026-07-17'), 'aria-disabled')) === null && (await live()).includes('Cleared start date'));
check('…without a change event', (await changes()).length === 0);

console.log('min / max / constraints');
const bounds = await page.evaluate(() => {
  const a = (d) => document.querySelector(`#cal-bounds button[data-date="${d}"]:not([data-ax-outside])`).getAttribute('aria-disabled');
  const prev = document.querySelector('#cal-bounds .astryx-calendar-nav[data-nav="prev"]');
  return {before: a('2026-05-04'), first: a('2026-05-05'), weekend: a('2026-05-09'), weekday: a('2026-05-11'), prevDisabled: prev.disabled, prevAttr: prev.getAttribute('data-disabled')};
});
check('before min disabled, min enabled', bounds.before === 'true' && bounds.first === null, JSON.stringify(bounds));
check('dateConstraints (server mask) disables weekends', bounds.weekend === 'true' && bounds.weekday === null);
check('Previous disabled at min (disabled + data-disabled)', bounds.prevDisabled && bounds.prevAttr === 'disabled');
await page.focus(day('cal-bounds', '2026-05-05'));
await press('ArrowLeft');
check('ArrowLeft past min does nothing', (await focused()) === '2026-05-05');
await press('ArrowRight', 4);
check('arrows skip disabled weekends', (await focused()) === '2026-05-11', await focused());
await press('ArrowUp');
check('ArrowUp to a date before min stays', (await focused()) === '2026-05-11');
await press('PageDown');
check('PageDown → June', (await focused()) === '2026-06-11' && (await label('cal-bounds')) === 'June 2026');
check('Next disabled at max', await page.$eval('#cal-bounds .astryx-calendar-nav[data-nav="next"]', (b) => b.disabled && b.dataset.disabled === 'disabled'));
check('after max disabled', (await attr(day('cal-bounds', '2026-06-22'), 'aria-disabled')) === 'true' && (await attr(day('cal-bounds', '2026-06-19'), 'aria-disabled')) === null);
await press('PageDown');
check('PageDown past max does nothing', (await focused()) === '2026-06-11' && (await label('cal-bounds')) === 'June 2026');
await page.evaluate(() => { document.getElementById('cal-bounds').dateConstraints = [(d) => d.getDate() !== 12]; });
check('client dateConstraints property applies', (await attr(day('cal-bounds', '2026-06-12'), 'aria-disabled')) === 'true');

console.log('Week numbers / no outside days');
const weeks = await page.evaluate(() => {
  const g = document.querySelector('#cal-weeks [role="grid"]');
  return {
    rowheaders: [...g.querySelectorAll('[role="rowheader"]')].map((r) => r.textContent),
    corner: g.querySelector('[role="columnheader"] .ax-visually-hidden')?.textContent,
    firstHeader: g.querySelectorAll('[role="columnheader"]')[1].textContent,
    emptyCells: [...g.querySelectorAll('[role="gridcell"]')].filter((c) => !c.querySelector('button')).length,
    rows: g.querySelectorAll('[role="row"]').length,
  };
});
check('ISO week numbers as rowheaders', JSON.stringify(weeks.rowheaders) === '["5","6","7","8","9"]', JSON.stringify(weeks.rowheaders));
check('week column header named by the locale (visually hidden)', weeks.corner === 'week', weeks.corner);
check('Monday first', weeks.firstHeader === 'Mon');
check('variable rows (5 weeks + header) with empty outside cells', weeks.rows === 6 && weeks.emptyCells === 7, JSON.stringify(weeks));
await page.focus(day('cal-weeks', '2026-02-02'));
await press('ArrowLeft');
check('ArrowLeft across empty cells reaches Feb 1', (await focused()) === '2026-02-01');
await press('ArrowLeft');
check('…and then crosses into January', (await focused()) === '2026-01-31' && (await label('cal-weeks')) === 'January 2026');

console.log('Today / locales');
const today = await page.evaluate(() => {
  const b = document.querySelector('#cal-today button[aria-current="date"]');
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return {date: b?.dataset.date, iso, marker: b?.dataset.marker, today: b?.dataset.today, stop: b?.getAttribute('tabindex')};
});
check('today: aria-current=date, data-today, today-only marker, tab stop', today.date === today.iso && today.marker === 'today-only' && today.today === 'today' && today.stop === '0', JSON.stringify(today));
check('buddhist calendar label', (await label('cal-buddhist')).includes('2569'), await label('cal-buddhist'));
check('es-ES: standalone capitalised month and Spanish name', (await label('cal-es')).startsWith('Septiembre') && (await attr(day('cal-es', '2026-09-21'), 'aria-label')).includes('lunes'), await label('cal-es'));

await done();
