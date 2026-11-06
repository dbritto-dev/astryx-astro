#!/usr/bin/env node
/**
 * Outline (behaviors/outline.ts) against the built docs.
 * Covers: aria-current="location" follows scroll in a scroll container with an offset (the
 * activation line = root top + offset + scroll-margin-top), first item at the top, last at the
 * bottom, the indicator tracks the active link, click navigation (hash, focus moved to the
 * heading, navigate-start/end once each, active lands on arrival), Space activation,
 * modified clicks left to the browser, controlled outlines, Markdown-built items.
 */
import {setup} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('outline');
await page.evaluate(() => {
  window.__events = [];
  for (const type of ['astryx-active-id-change', 'astryx-navigate-start', 'astryx-navigate-end']) {
    document.addEventListener(type, (e) => window.__events.push({type, id: e.detail.id, nav: e.target.getAttribute('data-test')}));
  }
});
const events = () => page.evaluate(() => window.__events.splice(0));
const SPY = '[data-test="spy"]';
const current = (nav = SPY) => page.$$eval(`${nav} a[aria-current="location"]`, (as) => as.map((a) => a.getAttribute('data-ax-outline-id')));
const settle = () => page.waitForTimeout(120);
const scrollTo = async (top) => { await page.$eval('[data-test="scroller"]', (el, t) => { el.scrollTop = t; }, top); await settle(); };
/** scrollTop that puts a heading's top exactly on its activation line (offset 40 + margin 8). */
const lineFor = (id) => page.$eval('[data-test="scroller"]', (el, hid) => {
  const h = document.getElementById(hid);
  return el.scrollTop + h.getBoundingClientRect().top - el.getBoundingClientRect().top - 40 - 8;
}, id);

check('initially the first item is current', JSON.stringify(await current()) === '["ol-intro"]');
check('active link: data-active + exactly one aria-current', await page.$$eval(`${SPY} .astryx-outline-item[data-active]`, (as) => as.length === 1));

const usageLine = await lineFor('ol-usage');
await scrollTo(usageLine - 6);
check('just before its activation line, the previous heading stays current', JSON.stringify(await current()) === '["ol-env"]', JSON.stringify(await current()));
await scrollTo(usageLine + 1);
check('once its top passes the line, the heading becomes current', JSON.stringify(await current()) === '["ol-usage"]', JSON.stringify(await current()));
let e = await events();
check('astryx-active-id-change dispatched for scroll changes', e.some((x) => x.type === 'astryx-active-id-change' && x.id === 'ol-usage'), JSON.stringify(e));
const aligned = await page.$eval(SPY, (nav) => {
  const a = nav.querySelector('a[data-active]').getBoundingClientRect();
  const i = nav.querySelector('.astryx-outline-indicator').getBoundingClientRect();
  return Math.abs(a.top - i.top) < 1.5 && Math.abs(a.height - i.height) < 1.5;
});
check('indicator slides to the active link', aligned);
await scrollTo(100000);
check('at the bottom the last item is current', JSON.stringify(await current()) === '["ol-faq"]');
await scrollTo(0);
check('back at the top the first item is current', JSON.stringify(await current()) === '["ol-intro"]');
await events();

// Click navigation.
await page.click(`${SPY} a[data-ax-outline-id="ol-theming"]`);
await page.waitForTimeout(1400);
e = await events();
check('navigate-start then navigate-end, once each', e.filter((x) => x.type === 'astryx-navigate-start').length === 1 && e.filter((x) => x.type === 'astryx-navigate-end').length === 1, JSON.stringify(e));
check('the clicked item lands as current', JSON.stringify(await current()) === '["ol-theming"]', JSON.stringify(await current()));
check('hash pushed', await page.evaluate(() => location.hash) === '#ol-theming');
check('focus moved to the heading (tabindex -1)', await page.evaluate(() => document.activeElement?.id === 'ol-theming' && document.activeElement.getAttribute('tabindex') === '-1'));
const rest = {line: await lineFor('ol-theming'), top: await page.$eval('[data-test="scroller"]', (el) => el.scrollTop)};
check('the heading rests on its activation line (offset + scroll-margin-top)', Math.abs(rest.line - rest.top) < 3, JSON.stringify(rest));

// Space activates a focused link.
await page.focus(`${SPY} a[data-ax-outline-id="ol-install"]`);
await page.keyboard.press(' ');
await page.waitForTimeout(1400);
check('Space activates the link', JSON.stringify(await current()) === '["ol-install"]' && await page.evaluate(() => location.hash) === '#ol-install');
await events();

// Modified click: left to the browser (no navigate events, default not prevented).
const prevented = await page.$eval(`${SPY} a[data-ax-outline-id="ol-faq"]`, (a) => {
  const ev = new MouseEvent('click', {bubbles: true, cancelable: true, metaKey: true});
  a.addEventListener('click', (x) => x.preventDefault(), {once: true});
  return a.dispatchEvent(ev);
});
e = await events();
check('modified click: no navigation handled by the outline', e.length === 0 && prevented === false);

// Controlled outline.
const C = '[data-test="controlled"]';
check('controlled: activeId renders current', JSON.stringify(await current(C)) === '["ol-config"]');
await page.click(`${C} a[data-ax-outline-id="ol-usage"]`);
await page.waitForTimeout(1400);
e = await events();
check('controlled click: astryx-active-id-change only, current unchanged', e.some((x) => x.type === 'astryx-active-id-change' && x.id === 'ol-usage' && x.nav === 'controlled') && JSON.stringify(await current(C)) === '["ol-config"]', JSON.stringify(e));
await page.$eval(C, (nav) => { nav.activeId = 'ol-usage'; });
check('controlled: nav.activeId moves it', JSON.stringify(await current(C)) === '["ol-usage"]');

check('nav landmark with a translated default name', await page.$eval(SPY, (nav) => nav.tagName === 'NAV' && nav.getAttribute('aria-label') === 'Table of contents'));
check('Markdown items with levels', await page.$$eval('nav[aria-label="Guide contents"] a', (as) => as.map((a) => `${a.textContent}:${a.dataset.level}`).join('|') === 'Guide:1|Getting started:2|Requirements:3|Deploying:2|Static hosts:3|Servers:3'));

await done();
