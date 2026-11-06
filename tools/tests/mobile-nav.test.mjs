#!/usr/bin/env node
/**
 * MobileNav (standalone) + NavHeadingMenu: the invoker opens the modal drawer (aria-expanded
 * sync, focus on the panel, scroll lock), side auto / start and RTL edges, the 85vw cap, the
 * close button, a press beside the drawer, Escape, navigation (astryx-navigate from rows,
 * breadcrumbs too) closes it; MobileNavToggle renders nothing outside an AppShell. NavHeadingMenu:
 * roving keys, typeahead, Enter on an action row clicks it, disabled rows are skipped.
 *   node tools/tests/mobile-nav.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup({width: 1100, height: 800});
await open('mobile-nav');

const state = (id) => page.evaluate((i) => {
  const d = document.getElementById(i);
  const trigger = document.querySelector(`[aria-controls="${i}"]`);
  const panel = d.querySelector('.ax-mobile-nav-drawer').getBoundingClientRect();
  return {
    open: d.open, modal: d.matches(':modal'), side: d.getAttribute('data-side'), expanded: trigger?.getAttribute('aria-expanded'),
    left: Math.round(panel.left), right: Math.round(panel.right), width: Math.round(panel.width), vw: innerWidth,
    activeIsPanel: document.activeElement === d.querySelector('.ax-mobile-nav-drawer'), activeIsTrigger: document.activeElement === trigger,
    overflow: getComputedStyle(document.documentElement).overflow,
  };
}, id);

console.log('Standalone drawer');
check('MobileNavToggle renders nothing outside an AppShell', await page.evaluate(() => document.querySelector('.ax-mobile-nav-toggle') == null));
check('dialog: theme hook, aria-modal, named by the header', await page.evaluate(() => {
  const d = document.getElementById('mobile-nav-demo');
  return d.classList.contains('astryx-mobile-nav') && d.getAttribute('aria-modal') === 'true' && d.getAttribute('aria-label') === 'Navigation' && d.hasAttribute('data-side');
}));
await page.click('#mobile-nav-demo-trigger');
await sleep(150);
let s = await state('mobile-nav-demo');
check('the invoker opens it as a modal; aria-expanded true; focus on the panel', s.open && s.modal && s.expanded === 'true' && s.activeIsPanel, JSON.stringify(s));
check('side auto: the trigger is in the start half → the start edge', s.side === 'start' && s.left === 0, JSON.stringify(s));
check('320px wide (under the 85vw cap here)', s.width === 320);
check('page scroll locked', s.overflow === 'hidden');
await page.evaluate(() => { window.__nav = []; document.addEventListener('astryx-navigate', (e) => window.__nav.push(e.detail.href)); });
await page.click('#mobile-nav-inbox');
await sleep(400);
s = await state('mobile-nav-demo');
check('a row navigates: astryx-navigate, the drawer closes, focus returns', !s.open && s.expanded === 'false' && s.activeIsTrigger && (await page.evaluate(() => window.__nav)).includes('#inbox'), JSON.stringify(s));
await page.click('#mobile-nav-demo-trigger');
await sleep(150);
await page.click('#mobile-nav-crumb');
await sleep(400);
check('a breadcrumb link in the drawer closes it too', !(await state('mobile-nav-demo')).open);
await page.click('#mobile-nav-demo-trigger');
await sleep(150);
await page.click('#mobile-nav-projects');
await sleep(150);
check('a group toggle does not close it', (await state('mobile-nav-demo')).open);
await page.click('#mobile-nav-demo button[data-ax-dialog-close]');
await sleep(400);
check('the close button closes it', !(await state('mobile-nav-demo')).open);
await page.click('#mobile-nav-demo-trigger');
await sleep(150);
await page.mouse.click(900, 400);
await sleep(400);
check('a press beside the drawer closes it', !(await state('mobile-nav-demo')).open);
await page.click('#mobile-nav-demo-trigger');
await sleep(150);
await page.keyboard.press('Escape');
await sleep(400);
s = await state('mobile-nav-demo');
check('Escape closes it, focus back on the trigger', !s.open && s.activeIsTrigger);

console.log('Sides');
await page.click('#mobile-nav-start-trigger');
await sleep(150);
s = await state('mobile-nav-start');
check('side="start": from the left in LTR, 280px', s.open && s.left === 0 && s.width === 280 && s.side === 'start', JSON.stringify(s));
check('a heading component as the header', await page.evaluate(() => document.querySelector('#mobile-nav-start .ax-mobile-nav-header .astryx-side-nav-heading') != null));
await page.keyboard.press('Escape');
await sleep(400);
await page.click('#mobile-nav-rtl-trigger');
await sleep(150);
s = await state('mobile-nav-rtl');
check('RTL side="start": from the right', s.open && s.right === s.vw, JSON.stringify(s));
await page.keyboard.press('Escape');
await sleep(400);
await page.setViewportSize({width: 360, height: 700});
await page.click('#mobile-nav-demo-trigger');
await sleep(150);
s = await state('mobile-nav-demo');
check('never wider than 85vw on a phone', s.width <= Math.ceil(360 * 0.85), JSON.stringify(s));
await page.keyboard.press('Escape');
await sleep(400);

console.log('NavHeadingMenu');
await page.setViewportSize({width: 1100, height: 800});
await open('nav-heading-menu');
const act = () => page.evaluate(() => ({id: document.activeElement?.id ?? '', text: document.activeElement?.textContent?.trim() ?? ''}));
check('role=menu with the size hook; items stamped with it', await page.evaluate(() => {
  const m = document.getElementById('nav-menu-md');
  const sm = document.getElementById('nav-menu-sm');
  return m.getAttribute('role') === 'menu' && m.classList.contains('astryx-nav-heading-menu') && m.getAttribute('data-size') === 'md'
    && [...sm.querySelectorAll('.astryx-nav-heading-menu-item')].every((i) => i.getAttribute('data-size') === 'sm');
}));
check('rows: role=menuitem, tabindex -1; a disabled link row drops its href', await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#nav-menu-md [role="menuitem"]')];
  const dis = document.getElementById('nav-menu-disabled-link');
  return rows.every((r) => r.getAttribute('tabindex') === '-1') && dis.getAttribute('aria-disabled') === 'true' && !dis.hasAttribute('href');
}));
await page.focus('#nav-menu-first');
await page.keyboard.press('ArrowDown');
check('ArrowDown moves to the next row', (await act()).text.startsWith('Projects'));
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
check('disabled rows are skipped (wraps to the first)', (await act()).id === 'nav-menu-first');
await page.keyboard.press('p');
check('typeahead', (await act()).text.startsWith('Projects'));
await page.evaluate(() => { window.__clicked = 0; document.getElementById('nav-menu-action').addEventListener('click', () => window.__clicked++); });
await page.keyboard.press('End');
await page.keyboard.press('Enter');
check('Enter on an action row clicks it', (await act()).id === 'nav-menu-action' && (await page.evaluate(() => window.__clicked)) === 1);

await done();
