#!/usr/bin/env node
/**
 * behaviors/scrollKeyboard — keyboard access to regions that scroll (Card with a fixed height,
 * Layout content and panels, scrollable Stack / StackItem). Deviation from Astryx
 * (docs/accessibility.md): while a region overflows and holds nothing focusable it is a Tab
 * stop (Safari does not make scroll containers focusable on its own), with an inset ring; it
 * leaves the Tab order when it fits or gains a focusable element; an explicit tabindex
 * (AppShell's main) is left alone.
 *   node tools/tests/scroll-keyboard.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup({height: 900});

await open('card');
await sleep(150);
const REGION = '.astryx-card[data-ax-scroll-keyboard]';
const state = () => page.$eval(REGION, (el) => ({
  tabindex: el.getAttribute('tabindex'),
  stop: el.hasAttribute('data-ax-scroll-keyboard-stop'),
  overflows: el.scrollHeight > el.clientHeight + 1,
  scrollTop: Math.round(el.scrollTop),
}));

let s = await state();
check('an overflowing fixed-height Card with nothing focusable is a Tab stop', s.overflows && s.tabindex === '0' && s.stop, JSON.stringify(s));

// Reach it with Tab from the element just before it, scroll it with the keyboard.
await page.$eval(REGION, (el) => {
  const before = document.createElement('button');
  before.id = 'before-region';
  before.textContent = 'before';
  el.before(before);
});
await page.focus('#before-region');
await page.keyboard.press('Tab');
check('Tab reaches the region', await page.$eval(REGION, (el) => el === document.activeElement));
const ring = await page.$eval(REGION, (el) => {
  const cs = getComputedStyle(el);
  return {style: cs.outlineStyle, offset: cs.outlineOffset, width: cs.outlineWidth};
});
check('it draws the focus ring, inset', ring.style !== 'none' && ring.offset === `-${ring.width}`, JSON.stringify(ring));
await page.keyboard.press('PageDown');
await sleep(250);
s = await state();
check('PageDown scrolls it', s.scrollTop > 0, JSON.stringify(s));

// While it holds focus, losing the overflow keeps it focusable (-1) until it blurs.
await page.$eval(REGION, (el) => { el.dataset.saved = el.innerHTML; el.innerHTML = '<p>short</p>'; });
await sleep(100);
s = await state();
check('content that fits while focused: tabindex -1, still focused', s.tabindex === '-1' && await page.$eval(REGION, (el) => el === document.activeElement), JSON.stringify(s));
await page.focus('#before-region');
await sleep(50);
s = await state();
check('…and after blur it leaves the Tab order', s.tabindex === null && !s.stop, JSON.stringify(s));

// Overflowing again, then a focusable element inside: focus inside scrolls it, no extra stop.
await page.$eval(REGION, (el) => { el.innerHTML = el.dataset.saved; });
await sleep(100);
check('overflowing again: a Tab stop again', (await state()).tabindex === '0');
await page.$eval(REGION, (el) => {
  const a = document.createElement('a');
  a.href = '#region-link';
  a.id = 'region-link';
  a.textContent = 'A link';
  el.append(a);
});
await sleep(100);
s = await state();
check('a focusable element inside: no stop of its own', s.tabindex === null && !s.stop, JSON.stringify(s));
await page.$eval('#region-link', (a) => a.remove());
await sleep(100);
check('the link removed: a Tab stop again', (await state()).tabindex === '0');

// An inert region is never a stop.
await page.$eval(REGION, (el) => { el.inert = true; });
await sleep(100);
s = await state();
check('an inert region leaves the Tab order', s.tabindex === null && !s.stop, JSON.stringify(s));
await page.$eval(REGION, (el) => { el.inert = false; });

// Regions that fit are not stops.
await open('layout');
await sleep(150);
const fitting = await page.$$eval('[data-ax-scroll-keyboard]', (els) => els
  .filter((el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1)
  .map((el) => el.getAttribute('tabindex')));
check('Layout regions that fit have no tabindex', fitting.length > 0 && fitting.every((t) => t == null), JSON.stringify(fitting));

// AppShell manages its main itself (tabindex -1/0 while it overflows): the behaviour stays out.
await open('app-shell');
await sleep(150);
const main = await page.$eval('#app-shell-demo-main', (el) => ({tabindex: el.getAttribute('tabindex'), stop: el.hasAttribute('data-ax-scroll-keyboard-stop')}));
check("AppShell's main keeps its own tabindex, not the behaviour's", main.stop === false && main.tabindex != null, JSON.stringify(main));

await done();
