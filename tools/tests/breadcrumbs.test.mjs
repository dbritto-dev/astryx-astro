#!/usr/bin/env node
/**
 * Breadcrumbs: <nav aria-label> > <ol>, aria-current="page" (auto on the last item's content
 * element, explicit isCurrent, opt-out with isCurrent={false}), decorative separators (hidden on
 * the first item, the slash mirrored in RTL), and the overflow menu (APG menu button: Enter /
 * Space / ArrowDown open on the first row, arrows, Escape refocuses the trigger, a row closes it,
 * aria-expanded sync; a current crumb's menu keeps aria-current).
 *   node tools/tests/breadcrumbs.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('breadcrumbs');

console.log('Structure');
check('nav landmark labelled "Breadcrumb" around an ordered list', await page.evaluate(() => {
  const n = document.getElementById('crumbs-auto');
  return n.tagName === 'NAV' && n.getAttribute('aria-label') === 'Breadcrumb' && n.firstElementChild.tagName === 'OL' && n.getAttribute('data-variant') === 'default';
}));
check('custom label', (await page.getAttribute('#crumbs-menu', 'aria-label')) === 'Project trail');
check('auto current: the last item\'s link carries aria-current="page"', await page.evaluate(() => {
  const marked = [...document.querySelectorAll('#crumbs-auto [aria-current]')];
  return marked.length === 1 && marked[0].tagName === 'A' && marked[0].textContent.trim() === 'Apollo' && marked[0].getAttribute('aria-current') === 'page';
}));
check('explicit isCurrent: a span, the only current item', await page.evaluate(() => {
  const marked = [...document.querySelectorAll('#crumbs-menu [aria-current="page"]')];
  return marked.length === 1 && marked[0].tagName === 'SPAN' && marked[0].textContent.trim() === 'Settings';
}));
check('isCurrent={false} on the last item: nothing is current', await page.evaluate(() => document.querySelectorAll('#crumbs-angle [aria-current]').length === 0));
check('separators are aria-hidden; hidden before the first item', await page.evaluate(() => {
  const seps = [...document.querySelectorAll('#crumbs-auto .ax-breadcrumb-separator')];
  return seps.every((s) => s.getAttribute('aria-hidden') === 'true') && getComputedStyle(seps[0]).display === 'none' && getComputedStyle(seps[1]).display !== 'none';
}));
check('a custom text separator', await page.evaluate(() => document.querySelectorAll('#crumbs-angle .ax-breadcrumb-separator')[1].textContent.trim() === '›'));
check('RTL: the default slash is mirrored', await page.evaluate(() => getComputedStyle(document.querySelectorAll('#crumbs-rtl .ax-breadcrumb-slash')[1]).transform.startsWith('matrix(-1')));
check('RTL: the trail runs right to left', await page.evaluate(() => {
  const items = [...document.querySelectorAll('#crumbs-rtl li')].map((li) => li.getBoundingClientRect().left);
  return items[0] > items[1] && items[1] > items[2];
}));
check('a button crumb is a <button> styled as a link', await page.evaluate(() => document.querySelector('#crumbs-button > button')?.getAttribute('type') === 'button'));
check('supporting variant on nav and items', await page.evaluate(() => document.getElementById('crumbs-supporting').getAttribute('data-variant') === 'supporting' && [...document.querySelectorAll('#crumbs-supporting li')].every((li) => li.getAttribute('data-variant') === 'supporting')));

console.log('Overflow menu');
const trigger = '#crumbs-menu-item > button';
const state = () => page.evaluate((sel) => {
  const t = document.querySelector(sel);
  const m = document.getElementById(t.getAttribute('aria-controls'));
  const layer = m.closest('ax-menu');
  return {open: layer.matches(':popover-open'), expanded: t.getAttribute('aria-expanded'), active: document.activeElement?.textContent?.trim() ?? '', isTrigger: document.activeElement === t, role: m.getAttribute('role'), labelledBy: m.getAttribute('aria-labelledby') === t.id, theme: m.classList.contains('astryx-breadcrumb-menu')};
}, trigger);
let s = await state();
check('trigger: aria-haspopup="menu", theme hook, chevron', await page.evaluate((sel) => {
  const t = document.querySelector(sel);
  return t.getAttribute('aria-haspopup') === 'menu' && t.classList.contains('astryx-breadcrumb-item-menu-trigger') && t.getAttribute('data-variant') === 'default' && t.querySelector('.ax-breadcrumb-chevron') != null;
}, trigger));
check('menu: role=menu labelled by the trigger, theme hook', s.role === 'menu' && s.labelledBy && s.theme);
await page.focus(trigger);
await page.keyboard.press('Enter');
await sleep(80);
s = await state();
check('Enter opens it on the first row', s.open && s.expanded === 'true' && s.active === 'Apollo', JSON.stringify(s));
await page.keyboard.press('ArrowDown');
check('ArrowDown moves to the next row', (await state()).active === 'Gemini');
await page.keyboard.press('Escape');
await sleep(80);
s = await state();
check('Escape closes it and refocuses the trigger', !s.open && s.isTrigger && s.expanded === 'false');
await page.keyboard.press('ArrowDown');
await sleep(80);
check('ArrowDown opens it too', (await state()).active === 'Apollo');
await page.keyboard.press('Escape');
await sleep(80);
await page.keyboard.press(' ');
await sleep(80);
check('Space opens it', (await state()).open);
await page.keyboard.press('Tab');
await sleep(80);
check('Tab closes it', !(await state()).open);
await page.click(trigger);
await sleep(80);
check('a click opens it', (await state()).open);
await page.click('#crumbs-menu-item ax-menu [role="menuitem"] >> nth=1');
await sleep(80);
check('choosing a row closes it', !(await state()).open);
check('a current crumb with a menu keeps aria-current="page" and aria-haspopup', await page.evaluate(() => {
  const b = document.querySelector('#crumbs-current-menu > button');
  return b.getAttribute('aria-current') === 'page' && b.getAttribute('aria-haspopup') === 'menu';
}));
check('the supporting variant menu rows are sm', await page.evaluate(() => [...document.querySelectorAll('#crumbs-current-menu [role="menuitem"]')].every((r) => r.getAttribute('data-size') === 'sm')));

await done();
