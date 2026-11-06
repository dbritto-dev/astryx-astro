#!/usr/bin/env node
/**
 * TopNav: landmark + item ARIA (aria-current, disabled, icon only), the hover menu (useMenuHover:
 * delay, leave close, click-after-hover pins, keyboard open on the first row, roving stop,
 * typeahead, Escape refocuses the trigger), the mega menu (anchored to the bar, role=group, arrow
 * keys over its links), the heading menu (whole heading opens at once, a row closes it) and RTL.
 *   node tools/tests/top-nav.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup({width: 1280, reducedMotion: 'reduce'});
await open('top-nav');

const menu = (triggerId) => page.evaluate((id) => {
  const t = document.getElementById(id);
  const l = document.getElementById(t.getAttribute('aria-controls'));
  return {expanded: t.getAttribute('aria-expanded'), open: l.matches(':popover-open'), active: document.activeElement?.textContent?.trim() ?? '', activeId: document.activeElement?.id ?? ''};
}, triggerId);

console.log('Landmark and items');
check('nav landmark with label', await page.evaluate(() => {
  const n = document.getElementById('top-nav-main');
  return n.tagName === 'NAV' && n.getAttribute('role') === 'navigation' && n.getAttribute('aria-label') === 'Main navigation' && n.classList.contains('astryx-top-nav');
}));
check('selected item: aria-current="page" + data-selected', await page.evaluate(() => {
  const a = document.getElementById('top-nav-overview');
  return a.getAttribute('aria-current') === 'page' && a.getAttribute('data-selected') === 'selected' && a.tagName === 'A';
}));
check('unselected item has no aria-current', (await page.getAttribute('#top-nav-with-icon', 'aria-current')) === null);
check('disabled item: <a> without href, aria-disabled, tabindex -1', await page.evaluate(() => {
  const a = document.getElementById('top-nav-disabled');
  return !a.hasAttribute('href') && a.getAttribute('aria-disabled') === 'true' && a.getAttribute('tabindex') === '-1';
}));
check('icon-only item named by aria-label, no visible text', await page.evaluate(() => {
  const a = document.getElementById('top-nav-icon-only');
  return a.getAttribute('aria-label') === 'Notifications' && a.textContent.trim() === '';
}));
check('menu trigger: native invoker + aria-haspopup/expanded/controls', await page.evaluate(() => {
  const t = document.getElementById('top-nav-solutions');
  return t.getAttribute('popovertarget') === t.getAttribute('aria-controls') && t.getAttribute('aria-haspopup') === 'true' && t.getAttribute('aria-expanded') === 'false' && t.classList.contains('astryx-top-nav-menu');
}));

console.log('Hover menu');
await page.hover('#top-nav-solutions');
await sleep(60);
check('not open before the 150ms delay', !(await menu('top-nav-solutions')).open);
await sleep(250);
let s = await menu('top-nav-solutions');
check('opens on hover, aria-expanded true', s.open && s.expanded === 'true');
check('a hover open keeps focus off the menu', !s.active.startsWith('Analytics'));
await page.mouse.down();
await page.mouse.up();
await sleep(80);
check('a click right after the hover open pins it', (await menu('top-nav-solutions')).open);
await page.mouse.move(600, 700);
await sleep(400);
check('a pinned menu stays open after the pointer leaves', (await menu('top-nav-solutions')).open);
await page.keyboard.press('Escape');
await sleep(80);
check('Escape closes it', !(await menu('top-nav-solutions')).open);
await sleep(350);
await page.hover('#top-nav-solutions');
await sleep(300);
check('hover opens again', (await menu('top-nav-solutions')).open);
// A real pointer keeps moving: the safe triangle holds the menu only while it heads for it.
await page.mouse.move(600, 700, {steps: 8});
await sleep(450);
check('a hover-opened menu closes after the pointer leaves', !(await menu('top-nav-solutions')).open);

console.log('Keyboard menu');
await page.focus('#top-nav-solutions');
await page.keyboard.press('Enter');
await sleep(80);
s = await menu('top-nav-solutions');
check('Enter opens and lands on the first row', s.open && s.active.startsWith('Analytics'), s.active);
check('rows are role=menuitem in a role=menu named by the label', await page.evaluate(() => {
  const m = document.activeElement.closest('[role="menu"]');
  return m.getAttribute('aria-label') === 'Solutions' && m.querySelectorAll('[role="menuitem"]').length === 3;
}));
check('one roving tab stop', await page.evaluate(() => [...document.activeElement.closest('[role="menu"]').querySelectorAll('[role="menuitem"]')].filter((r) => r.tabIndex === 0).length === 1));
await page.keyboard.press('ArrowDown');
check('ArrowDown moves to the next row', (await menu('top-nav-solutions')).active.startsWith('Messaging'));
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
check('ArrowDown wraps', (await menu('top-nav-solutions')).active.startsWith('Analytics'));
await page.keyboard.press('End');
check('End moves to the last row', (await menu('top-nav-solutions')).active.startsWith('Automation'));
await page.keyboard.press('m');
check('typeahead jumps to "Messaging"', (await menu('top-nav-solutions')).active.startsWith('Messaging'));
await page.keyboard.press('Escape');
await sleep(80);
s = await menu('top-nav-solutions');
check('Escape closes and refocuses the trigger', !s.open && s.activeId === 'top-nav-solutions' && s.expanded === 'false');
await page.keyboard.press(' ');
await sleep(80);
check('Space opens on the first row', (await menu('top-nav-solutions')).active.startsWith('Analytics'));
await page.keyboard.press('Escape');
await sleep(80);

console.log('Mega menu');
await page.focus('#top-nav-platform');
await page.keyboard.press('Enter');
await sleep(120);
s = await menu('top-nav-platform');
check('keyboard open focuses the first panel link', s.open && s.active.startsWith('Compute'), s.active);
check('panel is role=group named by the label', await page.evaluate(() => document.activeElement.closest('[role="group"]')?.getAttribute('aria-label') === 'Platform'));
const geo = await page.evaluate(() => {
  const layer = document.getElementById(document.getElementById('top-nav-platform').getAttribute('aria-controls'));
  const nav = document.getElementById('top-nav-main').getBoundingClientRect();
  const r = layer.getBoundingClientRect();
  return {top: r.top, navBottom: nav.bottom, width: r.width};
});
check('panel anchored below the whole bar', Math.abs(geo.top - geo.navBottom) < 4, JSON.stringify(geo));
await page.keyboard.press('ArrowDown');
check('ArrowDown moves to the next link', (await menu('top-nav-platform')).active.startsWith('Data'));
check('featured card renders with a decorative image', await page.evaluate(() => {
  const img = document.querySelector('.astryx-top-nav-mega-menu-featured-card img');
  return img.getAttribute('alt') === '' && img.getAttribute('aria-hidden') === 'true' && img.getAttribute('role') === 'presentation';
}));
await page.keyboard.press('Escape');
await sleep(80);
s = await menu('top-nav-platform');
check('Escape closes and refocuses the mega trigger', !s.open && s.activeId === 'top-nav-platform');

console.log('Heading menu');
const headingLayer = () => page.evaluate(() => {
  const t = document.querySelector('#top-nav-heading button[aria-haspopup]');
  return document.getElementById(t.getAttribute('aria-controls')).matches(':popover-open');
});
check('chevron trigger named "{heading}, Open menu"', (await page.evaluate(() => document.querySelector('#top-nav-heading button[aria-haspopup]').getAttribute('aria-label'))) === 'Acme Cloud, Open menu');
await page.hover('#top-nav-heading .ax-heading-logo');
await sleep(60);
check('hovering the heading opens its menu at once', await headingLayer());
await page.mouse.move(600, 700, {steps: 8});
await sleep(350);
check('leaving closes the hover-opened heading menu', !(await headingLayer()));
await page.click('#top-nav-heading button[aria-haspopup]');
await sleep(80);
check('the chevron click opens it', await headingLayer());
await page.evaluate(() => {
  const t = document.querySelector('#top-nav-heading button[aria-haspopup]');
  const m = document.getElementById(t.getAttribute('aria-controls'));
  m.querySelector('[role="menuitem"]:last-child').click();
});
await sleep(80);
check('a row closes the heading menu (NavHeadingCloseContext)', !(await headingLayer()));

console.log('RTL');
await page.focus('#top-nav-rtl-menu');
await page.keyboard.press('Enter');
await sleep(120);
const rtl = await page.evaluate(() => {
  const t = document.getElementById('top-nav-rtl-menu').getBoundingClientRect();
  const l = document.getElementById(document.getElementById('top-nav-rtl-menu').getAttribute('aria-controls')).getBoundingClientRect();
  return {tRight: t.right, lRight: l.right, lLeft: l.left};
});
check('RTL: the menu aligns to the trigger\'s inline start (right)', Math.abs(rtl.tRight - rtl.lRight) < 2, JSON.stringify(rtl));
await page.keyboard.press('Escape');

await done();
