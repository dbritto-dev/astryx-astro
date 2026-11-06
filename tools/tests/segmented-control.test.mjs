#!/usr/bin/env node
/**
 * SegmentedControl: SSR state, roving (arrows / Home / End / RTL / disabled skipped),
 * selection-follows-focus, aria-checked + tab stop, astryx-change (and its veto), disabled
 * group with a reason, keyboard hint, and the sliding lens (motion on; none under reduce).
 *   node tools/tests/segmented-control.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup({reducedMotion: 'no-preference'});
await open('segmented-control');

const state = (id) => page.evaluate((id) => {
  const el = document.getElementById(id);
  const segs = [...el.querySelectorAll('[role="radio"]')];
  return {
    checked: segs.filter((s) => s.getAttribute('aria-checked') === 'true').map((s) => s.dataset.value).join(','),
    stops: segs.filter((s) => s.getAttribute('tabindex') === '0').map((s) => s.dataset.value).join(','),
    selectedAttr: segs.filter((s) => s.dataset.selected === 'selected').map((s) => s.dataset.value).join(','),
    focused: document.activeElement?.closest?.('[role="radio"]')?.dataset.value ?? null,
    value: el.value,
  };
}, id);
await page.evaluate(() => {
  window.__changes = [];
  document.addEventListener('astryx-change', (e) => window.__changes.push(`${e.target.id}:${e.detail.value}`));
});
const changes = () => page.evaluate(() => window.__changes.splice(0));

console.log('SSR state');
let s = await state('sc-md');
check('value="week" is checked, selected and the only tab stop', s.checked === 'week' && s.selectedAttr === 'week' && s.stops === 'week', JSON.stringify(s));
check('root is a named radiogroup with size hook', await page.evaluate(() => {
  const el = document.getElementById('sc-md');
  return el.getAttribute('role') === 'radiogroup' && el.getAttribute('aria-label') === 'View (md)' && el.dataset.size === 'md' && el.classList.contains('astryx-segmented-control');
}));
check('items carry size/disabled hooks', await page.evaluate(() =>
  document.querySelector('#sc-sm [role="radio"]').dataset.size === 'sm' &&
  document.querySelector('#sc-icons [data-value="calendar"]').dataset.disabled === 'disabled'));

console.log('Keyboard (selection follows focus)');
await page.emulateMedia({reducedMotion: 'reduce'});
await page.focus('#sc-md [data-value="week"]');
await page.keyboard.press('ArrowRight');
s = await state('sc-md');
check('ArrowRight → month focused and checked', s.focused === 'month' && s.checked === 'month' && s.stops === 'month', JSON.stringify(s));
check('astryx-change {value} fired', (await changes()).join() === 'sc-md:month');
await page.keyboard.press('Home');
s = await state('sc-md');
check('Home → day', s.checked === 'day' && s.focused === 'day');
await page.keyboard.press('End');
s = await state('sc-md');
check('End → year', s.checked === 'year' && s.focused === 'year');
await page.keyboard.press('ArrowRight');
s = await state('sc-md');
check('ArrowRight wraps to day', s.checked === 'day');
await page.keyboard.press('ArrowLeft');
check('ArrowLeft wraps to year', (await state('sc-md')).checked === 'year');
await changes();
await page.keyboard.press('Tab');
await page.keyboard.press('Shift+Tab');
s = await state('sc-md');
check('Tab back in lands on the selected segment, selecting nothing', s.focused === 'year' && (await changes()).length === 0, JSON.stringify(s));

console.log('Disabled segment is skipped');
await page.focus('#sc-icons [data-value="grid"]');
await page.keyboard.press('ArrowRight');
s = await state('sc-icons');
check('ArrowRight skips the disabled calendar and wraps to list', s.checked === 'list' && s.focused === 'list', JSON.stringify(s));
await page.click('#sc-icons [data-value="calendar"]', {force: true});
check('clicking a disabled segment selects nothing', (await state('sc-icons')).checked === 'list');

console.log('RTL');
await page.focus('#sc-rtl [data-value="a"]');
await page.keyboard.press('ArrowLeft');
check('ArrowLeft moves forward in RTL', (await state('sc-rtl')).checked === 'b');
await page.keyboard.press('ArrowRight');
check('ArrowRight moves back in RTL', (await state('sc-rtl')).checked === 'a');

console.log('Click + event + veto');
await changes();
await page.click('#sc-fill [data-value="yearly"]');
check('click selects', (await state('sc-fill')).checked === 'yearly');
check('event log updated by the demo listener', (await page.textContent('#sc-log')) === 'value: yearly');
await page.evaluate(() => document.getElementById('sc-lg').addEventListener('astryx-change', (e) => e.preventDefault(), {once: true}));
await page.click('#sc-lg [data-value="day"]');
check('preventDefault() keeps the current value', (await state('sc-lg')).checked === 'week');
await page.evaluate(() => { document.getElementById('sc-lg').value = 'month'; });
check('el.value = … selects without an event', (await state('sc-lg')).checked === 'month' && !(await changes()).includes('sc-lg:month'));

console.log('Disabled group with a reason');
await page.click('#sc-disabled [data-value="public"]', {force: true});
s = await state('sc-disabled');
check('nothing selectable; the selected segment keeps the tab stop', s.checked === 'team' && s.stops === 'team', JSON.stringify(s));
const reason = await page.evaluate(() => {
  const el = document.getElementById('sc-disabled');
  const id = el.dataset.axTooltip;
  const tip = document.getElementById(id);
  const items = [...el.querySelectorAll('[role="radio"]')];
  return {
    group: el.getAttribute('aria-describedby') === id,
    items: items.every((i) => (i.getAttribute('aria-describedby') ?? '').split(' ').includes(id) && i.getAttribute('aria-disabled') === 'true'),
    text: tip?.textContent?.trim(),
  };
});
check('reason tooltip describes the group and every segment', reason.group && reason.items && reason.text === 'Only owners can change visibility', JSON.stringify(reason));
await page.mouse.move(2, 400);
await sleep(200);
await page.hover('#sc-disabled [data-value="private"]');
await sleep(450);
check('the reason shows on hover', await page.evaluate(() => document.getElementById(document.getElementById('sc-disabled').dataset.axTooltip).matches(':popover-open')));
await page.keyboard.press('ArrowRight');
check('arrows do nothing in a disabled group', (await state('sc-disabled')).checked === 'team');

console.log('Keyboard hint');
// The docs toolbar's last control is right before the first demo control in tab order.
await page.focus('#docs-mode');
await page.keyboard.press('Tab');
check('Tab reaches the first control on its selected segment', (await state('sc-sm')).focused === 'week');
const hintOpen = () => page.evaluate(() => document.querySelector('#sc-sm [data-ax-keyboard-hint]').matches(':popover-open'));
check('keyboard focus entering shows the hint', await hintOpen());
check('hint text from the catalog', (await page.textContent('#sc-sm [data-ax-keyboard-hint]')).includes('to navigate'));
await page.keyboard.press('ArrowRight');
check('an arrow dismisses it', !(await hintOpen()));
await page.keyboard.press('Shift+Tab');
await page.keyboard.press('Tab');
check('it does not come back for this control', !(await hintOpen()));

console.log('Sliding indicator (motion on)');
await page.emulateMedia({reducedMotion: 'no-preference'});
await page.mouse.click(5, 5);
const lens = () => page.evaluate(() => {
  const el = document.getElementById('sc-md');
  const cs = getComputedStyle(el, '::before');
  const box = (v) => {
    const s = el.querySelector(`[data-value="${v}"]`);
    const r = s.getBoundingClientRect(), t = el.getBoundingClientRect();
    return {x: r.left - t.left - el.clientLeft, w: r.width};
  };
  return {
    attr: el.getAttribute('data-ax-lens'), visibility: cs.visibility, left: parseFloat(cs.left), width: parseFloat(cs.width),
    bg: cs.backgroundColor, day: box('day'), year: box('year'),
    yearBg: getComputedStyle(el.querySelector('[data-value="year"]')).backgroundColor,
    dayBg: getComputedStyle(el.querySelector('[data-value="day"]')).backgroundColor,
    surface: (() => { const p = document.createElement('span'); p.style.color = 'var(--color-background-surface)'; el.append(p); const c = getComputedStyle(p).color; p.remove(); return c; })(),
  };
});
// sc-md currently has "year" selected; click "day" and watch the lens travel.
await page.click('#sc-md [data-value="day"]');
await sleep(40);
let l = await lens();
check('a change slides the lens (data-ax-lens="slide", visible)', l.attr === 'slide' && l.visibility === 'visible', JSON.stringify(l));
check('mid-slide the lens is between the old and new segment', l.left < l.year.x - 1 && l.left > l.day.x + 1, `left ${l.left} day ${l.day.x} year ${l.year.x}`);
check('the lens carries the selected surface', l.bg === l.surface, `${l.bg} vs ${l.surface}`);
check('the destination hides its own surface while the lens travels', l.dayBg === 'rgba(0, 0, 0, 0)', l.dayBg);
await sleep(450);
l = await lens();
check('at rest: lens hidden on the new segment', l.attr === null && l.visibility === 'hidden' && Math.abs(l.left - l.day.x) < 1 && Math.abs(l.width - l.day.w) < 1, JSON.stringify(l));
check('at rest: the new segment paints the surface, the old one none', l.dayBg === l.surface && l.yearBg === 'rgba(0, 0, 0, 0)', `${l.dayBg} / ${l.yearBg}`);

console.log('Reduced motion: no travel');
await page.emulateMedia({reducedMotion: 'reduce'});
await page.click('#sc-md [data-value="month"]');
await sleep(20);
l = await lens();
check('no lens slide under reduced motion', l.attr === null && l.visibility === 'hidden', JSON.stringify({attr: l.attr, v: l.visibility}));

await done();
