#!/usr/bin/env node
/**
 * SideNav: landmark, aria-current, disabled rows, nested groups (row toggle + independent
 * chevron, astryx-collapse-change), the collapsed rail (width, labels → aria-label + end-side
 * tooltips, a parent's flyout dialog with hover and keyboard, AR3 focus moves, the inside and
 * outside toggles), the resize handle, the default-collapsed rail and RTL.
 *   node tools/tests/side-nav.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup({width: 1280, height: 1000});
await open('side-nav');

const navState = (id) => page.evaluate((i) => {
  const n = document.getElementById(i);
  const r = n.getBoundingClientRect();
  return {collapsed: n.getAttribute('data-ax-collapsed'), width: Math.round(r.width), right: Math.round(r.right), left: Math.round(r.left)};
}, id);
const active = () => page.evaluate(() => ({id: document.activeElement?.id ?? '', label: document.activeElement?.getAttribute('aria-label') ?? '', text: document.activeElement?.textContent?.trim() ?? ''}));
const visible = (sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!el && el.getClientRects().length > 0; }, sel);

console.log('Landmark and rows');
check('nav landmark labelled "Side navigation"', await page.evaluate(() => {
  const n = document.getElementById('side-nav-main');
  return n.tagName === 'NAV' && n.getAttribute('aria-label') === 'Side navigation' && n.classList.contains('astryx-side-nav');
}));
check('selected row: aria-current="page", data-selected, selectedIcon', await page.evaluate(() => {
  const a = document.getElementById('side-nav-home');
  return a.getAttribute('aria-current') === 'page' && a.getAttribute('data-selected') === 'selected' && a.querySelector('path[fill="currentColor"]') != null;
}));
check('theme hooks: data-size on rows', (await page.getAttribute('#side-nav-home', 'data-size')) === 'md');
check('disabled row: button with aria-disabled, keeps its tab stop', await page.evaluate(() => {
  const b = document.getElementById('side-nav-disabled');
  return b.tagName === 'BUTTON' && b.getAttribute('aria-disabled') === 'true' && b.tabIndex === 0 && b.getAttribute('data-disabled') === 'disabled';
}));
check('section is a group named by its title', await page.evaluate(() => {
  const s = document.querySelector('#side-nav-main .astryx-side-nav-section');
  return s.getAttribute('role') === 'group' && document.getElementById(s.getAttribute('aria-labelledby')).textContent === 'Main';
}));

console.log('Nested groups');
const group = (id) => page.evaluate((i) => {
  const b = document.getElementById(i);
  const g = document.getElementById(b.getAttribute('aria-controls'));
  return {expanded: b.getAttribute('aria-expanded'), hidden: g.getAttribute('aria-hidden'), inert: g.hasAttribute('inert')};
}, id);
let g = await group('side-nav-projects');
check('a parent with no link of its own is the toggle (expanded by default)', g.expanded === 'true' && g.hidden === null);
await page.evaluate(() => { window.__collapse = []; document.addEventListener('astryx-collapse-change', (e) => window.__collapse.push(e.detail.isCollapsed)); });
await page.click('#side-nav-projects');
await sleep(60);
g = await group('side-nav-projects');
check('clicking it collapses the group (aria-hidden + inert)', g.expanded === 'false' && g.hidden === 'true' && g.inert);
check('astryx-collapse-change {isCollapsed: true}', (await page.evaluate(() => window.__collapse)).at(-1) === true);
await page.focus('#side-nav-projects');
await page.keyboard.press('Enter');
await sleep(60);
check('Enter expands it again', (await group('side-nav-projects')).expanded === 'true');
const reports = await page.evaluate(() => {
  const link = document.getElementById('side-nav-reports');
  const toggle = link.parentElement.querySelector('.ax-side-nav-expand-toggle');
  return {href: link.getAttribute('href'), label: toggle.getAttribute('aria-label'), expanded: toggle.getAttribute('aria-expanded')};
});
check('a parent with href keeps its link and gets an independent chevron (defaultIsCollapsed)', reports.href === '#reports' && reports.label === 'Expand Reports' && reports.expanded === 'false');
await page.click('#side-nav-reports + .ax-side-nav-expand-toggle');
await sleep(60);
check('the chevron toggles and relabels ("Collapse Reports")', await page.evaluate(() => {
  const t = document.querySelector('#side-nav-reports + .ax-side-nav-expand-toggle');
  return t.getAttribute('aria-expanded') === 'true' && t.getAttribute('aria-label') === 'Collapse Reports';
}));
check('nested rows are full width, indented one --spacing-6 step per level inside the row', await page.evaluate(() => {
  const pad = (id) => parseFloat(getComputedStyle(document.getElementById(id)).paddingInlineStart);
  const l1 = document.getElementById('side-nav-apollo').getBoundingClientRect();
  const l0 = document.getElementById('side-nav-home').getBoundingClientRect();
  const launch = document.querySelector('a[href="#gemini-launch"]');
  return Math.abs(l1.left - l0.left) < 1 && pad('side-nav-home') === 8 && pad('side-nav-apollo') === 32 && parseFloat(getComputedStyle(launch).paddingInlineStart) === 56;
}));

console.log('Collapse to the rail');
let s = await navState('side-nav-main');
check('expanded: 260px', s.collapsed === 'false' && s.width === 260, JSON.stringify(s));
await page.focus('#side-nav-apollo');
await page.evaluate(() => document.querySelector('ax-side-nav[data-ax-nav="side-nav-main"]').collapse());
await sleep(80);
s = await navState('side-nav-main');
check('collapse(): data-ax-collapsed and a 48px rail', s.collapsed === 'true' && s.width === 48, JSON.stringify(s));
let a = await active();
check('AR3: focus on a nested row (dropped by the rail) moves to the collapse toggle', a.label === 'Expand sidebar', JSON.stringify(a));
check('labels leave the rail; the leaf control is named by aria-label', await page.evaluate(() => {
  const home = document.getElementById('side-nav-home');
  return home.getAttribute('aria-label') === 'Home' && home.querySelector('.ax-side-nav-item-label').getClientRects().length === 0;
}));
check('rows without an icon leave the rail', !(await visible('#side-nav-noicon')));
check('section titles are visually hidden but kept', await page.evaluate(() => {
  const h = document.querySelector('#side-nav-main .ax-side-nav-section-header');
  const r = h.getBoundingClientRect();
  return r.width <= 1 && h.textContent.includes('Main');
}));
check('the resize handle hides while collapsed', !(await visible('#side-nav-main + .ax-side-nav-resize-handle, .ax-side-nav-resizable > .ax-side-nav-resize-handle')));
check('toggle relabels to "Expand sidebar"', await page.evaluate(() => document.querySelector('#side-nav-main [data-ax-side-nav-toggle=""]').getAttribute('aria-label') === 'Expand sidebar'));
check('the leaf is described by its tooltip while collapsed', await page.evaluate(() => {
  const home = document.getElementById('side-nav-home');
  const tip = document.getElementById(home.getAttribute('data-ax-tooltip'));
  return home.getAttribute('aria-describedby') === tip.id && tip.getAttribute('data-ax-enabled') !== 'false';
}));
await page.hover('#side-nav-inbox');
await sleep(400);
const tip = await page.evaluate(() => {
  const t = document.getElementById(document.getElementById('side-nav-inbox').getAttribute('data-ax-tooltip'));
  const r = t.getBoundingClientRect();
  const c = document.getElementById('side-nav-inbox').getBoundingClientRect();
  return {open: t.matches(':popover-open'), text: t.textContent.trim(), right: r.left >= c.right - 1};
});
check('hovering a rail leaf shows its label tooltip on the end side', tip.open && tip.text === 'Inbox' && tip.right, JSON.stringify(tip));
await page.mouse.move(900, 900, {steps: 4});
await sleep(200);

console.log('Rail flyout');
const flyout = () => page.evaluate(() => {
  const t = document.querySelector('#side-nav-main .ax-side-nav-rail-control[aria-label="Projects"]');
  const f = document.getElementById(t.getAttribute('aria-controls'));
  const surface = f.querySelector('.astryx-popover');
  return {open: f.matches(':popover-open'), expanded: t.getAttribute('aria-expanded'), role: surface.getAttribute('role'), label: surface.getAttribute('aria-label'), activeInside: f.contains(document.activeElement), left: f.getBoundingClientRect().left, railRight: t.getBoundingClientRect().right};
});
await page.focus('#side-nav-main .ax-side-nav-rail-control[aria-label="Projects"]');
await page.keyboard.press('Enter');
await sleep(100);
let f = await flyout();
check('Enter opens the flyout dialog beside the rail, focus inside', f.open && f.role === 'dialog' && f.label === 'Projects submenu' && f.activeInside && f.left >= f.railRight, JSON.stringify(f));
check('the flyout lists the children as top-level rows', await page.evaluate(() => {
  const t = document.querySelector('#side-nav-main .ax-side-nav-rail-control[aria-label="Projects"]');
  const f = document.getElementById(t.getAttribute('aria-controls'));
  return f.querySelector('.ax-side-nav-flyout-header').textContent === 'Projects' && [...f.querySelectorAll('.astryx-side-nav-item')].some((r) => r.textContent.includes('Apollo'));
}));
await page.keyboard.press('Escape');
await sleep(80);
f = await flyout();
a = await active();
check('Escape closes it and refocuses the rail control', !f.open && a.label === 'Projects');
await sleep(350);
await page.hover('#side-nav-main .ax-side-nav-rail-control[aria-label="Projects"]');
await sleep(300);
f = await flyout();
check('hover opens it without moving focus', f.open && !f.activeInside);
await page.click('#side-nav-main .ax-side-nav-rail-control[aria-label="Projects"]');
await sleep(80);
check('a click toggles it shut (clickGuardMs 0)', !(await flyout()).open);

console.log('Expand again');
await page.focus('#side-nav-main [data-ax-side-nav-toggle=""]');
await page.keyboard.press('Enter');
await sleep(80);
s = await navState('side-nav-main');
a = await active();
check('the footer toggle expands it, focus stays on the toggle', s.collapsed === 'false' && s.width === 260 && a.label === 'Collapse sidebar', JSON.stringify({s, a}));
check('the leaf loses its rail name and description', await page.evaluate(() => {
  const home = document.getElementById('side-nav-home');
  return !home.hasAttribute('aria-label') && !home.hasAttribute('aria-describedby');
}));
await page.focus('#side-nav-people');
await page.evaluate(() => document.querySelector('ax-side-nav[data-ax-nav="side-nav-main"]').collapse());
await sleep(80);
a = await active();
check('AR3: focus on a kept row with actions moves to that row\'s rail control', a.label === 'People', JSON.stringify(a));
await page.evaluate(() => document.querySelector('ax-side-nav[data-ax-nav="side-nav-main"]').expand());
await sleep(80);
check('AR3: and back to the expanded row on expand', (await active()).id === 'side-nav-people');
await page.click('#side-nav-outside-toggle');
await sleep(80);
check('an outside toggle (controls) collapses it', (await navState('side-nav-main')).collapsed === 'true');
await page.click('#side-nav-outside-toggle');
await sleep(80);
check('and expands it', (await navState('side-nav-main')).collapsed === 'false');

console.log('Resize');
const handle = '.ax-side-nav-resizable > .ax-side-nav-resize-handle';
check('the handle is a separator controlling the nav', await page.evaluate((h) => {
  const el = document.querySelector(h);
  return el.getAttribute('role') === 'separator' && el.getAttribute('aria-controls') === 'side-nav-main' && el.getAttribute('aria-valuenow') === '260';
}, handle));
await page.focus(handle);
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
await sleep(60);
check('ArrowRight widens the nav (10px steps)', (await navState('side-nav-main')).width === 280);
await page.keyboard.press('Home');
await sleep(60);
check('Home goes to the minimum (200)', (await navState('side-nav-main')).width === 200);

console.log('Default-collapsed rail and RTL');
s = await navState('side-nav-rail');
check('defaultIsCollapsed renders the rail on the server', s.collapsed === 'true' && s.width === 48);
check('rail heading is a link named by the heading', await page.evaluate(() => {
  const h = document.querySelector('#side-nav-rail .ax-side-nav-heading-rail');
  return h.tagName === 'A' && h.getAttribute('aria-label') === 'Acme' && h.getClientRects().length > 0;
}));
check('the rail leaf is named on the server', (await page.getAttribute('#side-nav-rail-reports', 'aria-label')) === 'Reports');
const rtl = await page.evaluate(() => {
  const n = document.getElementById('side-nav-rtl');
  const home = n.querySelector('.astryx-side-nav-item');
  const icon = home.querySelector('svg').getBoundingClientRect();
  const label = home.querySelector('.ax-side-nav-item-label').getBoundingClientRect();
  return {iconRight: icon.left > label.left};
});
check('RTL: the icon sits at the inline start (right)', rtl.iconRight);
await page.evaluate(() => document.querySelector('ax-side-nav[data-ax-nav="side-nav-rtl"]').collapse());
await sleep(80);
const chev = await page.evaluate(() => getComputedStyle(document.querySelector('#side-nav-rtl .ax-side-nav-chevron-mirror')).transform);
check('RTL: the collapse chevron is mirrored', chev.startsWith('matrix(-1'), chev);

await done();
