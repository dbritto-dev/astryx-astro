#!/usr/bin/env node
/**
 * AppShell: landmarks, the skip link, the responsive switch (data-astryx-shell-mobile follows the
 * md width point; the rail hides, the TopNav becomes the mobile bar with the toggle; `main`
 * keeps its element and scroll position across breakpoints), the drawer (TopNav items in drawer
 * mode, a divider, the SideNav items; aria-current; a navigation closes it via astryx-navigate;
 * Escape and focus return; leaving mobile closes it), the phone bar of a SideNav-only shell, and
 * main's keyboard stop while it overflows.
 *   node tools/tests/app-shell.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup({width: 1280, height: 900});
await open('app-shell');

const shell = '#app-shell-demo';
const st = () => page.evaluate((sel) => {
  const root = document.querySelector(sel);
  const rail = root.querySelector('.astryx-app-shell-sidenav');
  const toggle = root.querySelector('.ax-mobile-nav-toggle');
  const bar = root.querySelector('.astryx-top-nav');
  const overview = root.querySelector('#app-shell-overview');
  return {
    mobile: root.getAttribute('data-astryx-shell-mobile'),
    rail: rail.getClientRects().length > 0,
    toggle: !!toggle && toggle.getClientRects().length > 0,
    barMode: bar.getAttribute('data-mode'),
    barItems: !!overview && overview.getClientRects().length > 0,
  };
}, shell);

console.log('Desktop');
check('landmarks: banner, navigation (top + side), main', await page.evaluate((sel) => {
  const r = document.querySelector(sel);
  return r.querySelectorAll('[role="banner"]').length === 1 && r.querySelector('[role="main"]') != null && r.querySelector('nav[aria-label="Main navigation"]') != null && r.querySelector('nav[aria-label="Side navigation"]') != null;
}, shell));
check('theme hooks: app-shell / header / sidenav with data-variant', await page.evaluate((sel) => {
  const r = document.querySelector(sel);
  return r.classList.contains('astryx-app-shell') && r.getAttribute('data-variant') === 'elevated' && r.querySelector('.astryx-app-shell-header').getAttribute('data-variant') === 'elevated' && r.querySelector('.astryx-app-shell-sidenav').getAttribute('data-variant') === 'elevated';
}, shell));
check('a layout root (container padding reset)', await page.evaluate((sel) => document.querySelector(sel).classList.contains('ax-layout-root-reset'), shell));
let s = await st();
check('desktop: not mobile, rail shown, toggle hidden, bar items shown', s.mobile === 'false' && s.rail && !s.toggle && s.barItems && s.barMode === null, JSON.stringify(s));
check('the drawer exists but is closed (the shell\'s id on the toggle\'s aria-controls)', await page.evaluate((sel) => {
  const r = document.querySelector(sel);
  const toggle = r.querySelector('.ax-mobile-nav-toggle');
  const dialog = document.getElementById(toggle.getAttribute('aria-controls'));
  return dialog?.tagName === 'DIALOG' && !dialog.open && toggle.getAttribute('commandfor') === dialog.id;
}, shell));
check('elevated: the content surface has a rounded start corner', await page.evaluate((sel) => {
  const b = document.querySelector(sel).querySelector('.ax-app-shell-elevated-backdrop');
  return b.getClientRects().length > 0 && parseFloat(getComputedStyle(b).borderStartStartRadius) > 0;
}, shell));

console.log('Main');
const mainInfo = () => page.evaluate((sel) => {
  const m = document.querySelector(sel).querySelector('[role="main"]');
  return {tabindex: m.getAttribute('tabindex'), scrollTop: m.scrollTop, same: m === window.__main};
}, shell);
await page.evaluate((sel) => { window.__main = document.querySelector(sel).querySelector('[role="main"]'); window.__main.scrollTop = 240; }, shell);
await sleep(100);
let m = await mainInfo();
check('an overflowing main is a keyboard stop (tabindex 0)', m.tabindex === '0', JSON.stringify(m));

console.log('Skip link');
await page.evaluate(() => document.activeElement?.blur());
await page.focus('#app-shell-demo [data-testid="skip-to-content"]');
const skipVisible = await page.evaluate(() => {
  const a = document.querySelector('#app-shell-demo [data-testid="skip-to-content"]');
  return a.getBoundingClientRect().width > 20 && a.textContent === 'Skip to content';
});
check('the skip link shows when focused', skipVisible);
await page.keyboard.press('Enter');
await sleep(80);
check('activating it focuses main', await page.evaluate(() => document.activeElement?.getAttribute('role') === 'main'));
check('programmatic focus draws no ring on main', await page.evaluate(() => !document.activeElement.hasAttribute('data-ax-tab-focus')));

console.log('Responsive switch (390px)');
await page.evaluate(() => { window.__changes = []; document.addEventListener('astryx-mobile-change', (e) => window.__changes.push(e.detail.isMobile)); });
await page.setViewportSize({width: 390, height: 800});
await sleep(150);
s = await st();
check('below md: data-astryx-shell-mobile="true"', s.mobile === 'true');
check('astryx-mobile-change {isMobile: true}', (await page.evaluate(() => window.__changes)).includes(true));
check('the rail leaves, the toggle shows, the bar items leave', !s.rail && s.toggle && !s.barItems, JSON.stringify(s));
check('the TopNav root reports data-mode="mobile-bar"', s.barMode === 'mobile-bar');
m = await mainInfo();
check('main keeps its element across the switch', m.same);
check('main keeps its scroll position', m.scrollTop === 240, JSON.stringify(m));

console.log('Drawer');
const drawer = () => page.evaluate((sel) => {
  const toggle = document.querySelector(sel).querySelector('.ax-mobile-nav-toggle');
  const d = document.getElementById(toggle.getAttribute('aria-controls'));
  return {open: d.open, modal: d.matches(':modal'), expanded: toggle.getAttribute('aria-expanded'), activeInside: d.contains(document.activeElement), activeIsToggle: document.activeElement === toggle};
}, shell);
await page.click('#app-shell-demo .ax-mobile-nav-toggle');
await sleep(150);
let d = await drawer();
check('the toggle opens the drawer as a modal, aria-expanded true, focus inside', d.open && d.modal && d.expanded === 'true' && d.activeInside, JSON.stringify(d));
check('drawer: TopNav items as nav rows, a divider, then the SideNav items', await page.evaluate((sel) => {
  const toggle = document.querySelector(sel).querySelector('.ax-mobile-nav-toggle');
  const dlg = document.getElementById(toggle.getAttribute('aria-controls'));
  const items = dlg.querySelector('.ax-top-nav-drawer-items');
  const topItem = items.querySelector('.astryx-top-nav-item[data-mode="drawer"]');
  const divider = dlg.querySelector('.ax-top-nav-drawer-divider');
  const side = dlg.querySelector('.ax-top-nav-drawer-extra .astryx-side-nav-item');
  return !!topItem && topItem.classList.contains('ax-nav-item') && !!divider && !!side && (items.compareDocumentPosition(divider) & 4) && (divider.compareDocumentPosition(side) & 4);
}, shell));
check('drawer: the heading is the drawer header; the dialog is named', await page.evaluate((sel) => {
  const toggle = document.querySelector(sel).querySelector('.ax-mobile-nav-toggle');
  const dlg = document.getElementById(toggle.getAttribute('aria-controls'));
  return dlg.querySelector('.ax-mobile-nav-header .astryx-top-nav-heading') != null && dlg.getAttribute('aria-label') === 'Navigation' && dlg.classList.contains('astryx-mobile-nav');
}, shell));
check('drawer: aria-current on the selected TopNav and SideNav rows', await page.evaluate((sel) => {
  const toggle = document.querySelector(sel).querySelector('.ax-mobile-nav-toggle');
  const dlg = document.getElementById(toggle.getAttribute('aria-controls'));
  const cur = [...dlg.querySelectorAll('[aria-current="page"]')].map((e) => e.textContent.trim());
  return cur.includes('Overview') && cur.includes('Home');
}, shell));
check('side auto: the toggle sits in the end half, so the drawer comes from the end edge (85vw cap)', await page.evaluate((sel) => {
  const toggle = document.querySelector(sel).querySelector('.ax-mobile-nav-toggle');
  const dlg = document.getElementById(toggle.getAttribute('aria-controls'));
  const panel = dlg.querySelector('.ax-mobile-nav-drawer').getBoundingClientRect();
  return dlg.getAttribute('data-side') === 'end' && Math.abs(panel.right - innerWidth) < 2 && panel.width <= innerWidth * 0.85 + 1;
}, shell));
await page.evaluate(() => { window.__nav = []; document.addEventListener('astryx-navigate', (e) => window.__nav.push(e.detail.href)); });
await page.evaluate((sel) => {
  const toggle = document.querySelector(sel).querySelector('.ax-mobile-nav-toggle');
  const dlg = document.getElementById(toggle.getAttribute('aria-controls'));
  [...dlg.querySelectorAll('.astryx-side-nav-item')].find((e) => e.textContent.trim() === 'Inbox').click();
}, shell);
await sleep(400);
d = await drawer();
check('a drawer row dispatches astryx-navigate and the drawer closes', (await page.evaluate(() => window.__nav)).includes('#inbox') && !d.open && d.expanded === 'false', JSON.stringify(d));
check('focus returns to the toggle', d.activeIsToggle);
await page.keyboard.press('Enter');
await sleep(150);
check('the toggle reopens it from the keyboard', (await drawer()).open);
await page.evaluate((sel) => {
  const toggle = document.querySelector(sel).querySelector('.ax-mobile-nav-toggle');
  const dlg = document.getElementById(toggle.getAttribute('aria-controls'));
  dlg.querySelector('button[data-ax-nav-disclosure]').click();
}, shell);
await sleep(80);
check('a collapsible drawer section (TopNavMenu) expands without closing the drawer', await page.evaluate((sel) => {
  const toggle = document.querySelector(sel).querySelector('.ax-mobile-nav-toggle');
  const dlg = document.getElementById(toggle.getAttribute('aria-controls'));
  const b = dlg.querySelector('button[data-ax-nav-disclosure]');
  return dlg.open && b.getAttribute('aria-expanded') === 'true' && !document.getElementById(b.getAttribute('aria-controls')).hasAttribute('inert');
}, shell));
await page.keyboard.press('Escape');
await sleep(400);
d = await drawer();
check('Escape closes it, focus back on the toggle', !d.open && d.activeIsToggle);
await page.click('#app-shell-demo .ax-mobile-nav-toggle');
await sleep(150);
await page.setViewportSize({width: 1280, height: 900});
await sleep(500);
d = await drawer();
s = await st();
check('back above md: the drawer closes, rail and bar items return', !d.open && s.mobile === 'false' && s.rail && s.barItems && s.barMode === null, JSON.stringify({d, s}));
check('main is still the same element', (await mainInfo()).same);

console.log('SideNav-only shell (phone bar)');
await open('side-nav');
await page.setViewportSize({width: 390, height: 800});
await sleep(150);
const phone = await page.evaluate(() => {
  const r = document.getElementById('side-nav-shell');
  const bar = r.querySelector('.ax-app-shell-phone-bar');
  const topbar = bar.querySelector('.astryx-side-nav[data-mode="topbar"]');
  const toggle = bar.querySelector('.ax-mobile-nav-toggle');
  return {mobile: r.getAttribute('data-astryx-shell-mobile'), bar: bar.getClientRects().length > 0, role: bar.getAttribute('role'), topbar: !!topbar && topbar.querySelector('.astryx-side-nav-heading') != null, toggle: !!toggle && toggle.getClientRects().length > 0, nav: bar.querySelector('[role="navigation"]').getAttribute('aria-label')};
});
check('below md the phone bar shows the SideNav heading + footer icons and the toggle', phone.mobile === 'true' && phone.bar && phone.topbar && phone.toggle && phone.role === 'banner' && phone.nav === 'Mobile navigation', JSON.stringify(phone));
await page.click('#side-nav-shell .ax-mobile-nav-toggle');
await sleep(150);
check('its drawer is the SideNav in drawer mode (heading as header)', await page.evaluate(() => {
  const toggle = document.querySelector('#side-nav-shell .ax-mobile-nav-toggle');
  const dlg = document.getElementById(toggle.getAttribute('aria-controls'));
  return dlg.open && dlg.querySelector('.ax-mobile-nav-header .astryx-side-nav-heading') != null && dlg.querySelectorAll('.astryx-side-nav-item').length === 2;
}));
await page.keyboard.press('Escape');
await sleep(300);

await done();
