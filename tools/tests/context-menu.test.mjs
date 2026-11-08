#!/usr/bin/env node
/**
 * ContextMenu: lazy content, right-click opens at the pointer (and moves on a second
 * right-click), focus on the first row without a ring, keyboard invocation (Shift+F10, the
 * Menu key, a keyboard contextmenu at 0,0) at the area's bottom-start with a ring, arrows /
 * typeahead, submenu keys and Escape one level, selection + astryx-select + focus return,
 * outside press (start AND end outside), Tab, one context menu at a time, disabled area,
 * inline trigger in prose, compound rows (checkbox / radio), size and width.
 *   node tools/tests/context-menu.test.mjs
 */
import {setup, isOpen, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('context-menu');

const layerFor = (areaId) => page.evaluate((id) => '#' + document.querySelector(`ax-menu[data-ax-context-target="${id}"]`).id, areaId);
const active = () => page.evaluate(() => {
  const a = document.activeElement;
  return a ? (a.dataset.id || a.id || a.tagName) : null;
});
await page.evaluate(() => {
  window.__events = [];
  for (const type of ['astryx-select', 'astryx-change', 'astryx-open-change', 'contextmenu']) {
    document.addEventListener(type, (e) => window.__events.push({type, id: e.target.dataset?.id || e.target.id, value: e.detail?.value, isOpen: e.detail?.isOpen, prevented: e.defaultPrevented}), type === 'contextmenu' ? false : true);
  }
});
const events = () => page.evaluate(() => window.__events.splice(0));

const basic = await layerFor('cm-basic-area');
const area = await page.locator('#cm-basic-area').boundingBox();

console.log('Server markup');
check('menu is popover=manual, a layer root, its content waiting in a template', await page.evaluate((s) => {
  const l = document.querySelector(s);
  return l.getAttribute('popover') === 'manual' && l.hasAttribute('data-astryx-layer-root') && !l.querySelector('[role="menu"]') && !!l.querySelector(':scope > template[data-ax-menu-content]');
}, basic));
check('trigger area holds the 1px cursor anchor', await page.evaluate(() => {
  const a = document.querySelector('#cm-basic-area .ax-context-menu-anchor');
  const r = a.getBoundingClientRect();
  return a.getAttribute('aria-hidden') === 'true' && r.width === 1 && r.height === 1;
}));

console.log('Right-click');
await events();
await page.mouse.click(area.x + 120, area.y + 40, {button: 'right'});
await sleep(100);
check('right-click opens', await isOpen(page, basic));
check('the native menu is suppressed', (await events()).some((e) => e.type === 'contextmenu' && e.prevented));
const menu = await page.evaluate((s) => {
  const m = document.querySelector(s).querySelector('[role="menu"]');
  const r = m.getBoundingClientRect();
  return {x: r.left, y: r.top, w: r.width, label: m.getAttribute('aria-label'), cls: m.className, rows: m.querySelectorAll('[role="menuitem"]').length};
}, basic);
check('menu materialized: role=menu named "Context menu"', menu.label === 'Context menu' && menu.cls.includes('astryx-context-menu') && menu.rows >= 5, JSON.stringify(menu));
check('menu opens at the pointer', Math.abs(menu.x - (area.x + 120)) <= 2 && Math.abs(menu.y - (area.y + 41)) <= 2, `${menu.x},${menu.y} vs ${area.x + 120},${area.y + 40}`);
check('min width 160px', menu.w >= 160, String(menu.w));
check('focus on the first row', (await active()) === 'cut');
check('…without a keyboard ring after a pointer open', await page.evaluate(() => !document.activeElement.matches(':focus-visible')));
await page.keyboard.press('ArrowDown');
check('ArrowDown → Copy', (await active()) === 'copy');
await page.keyboard.press('ArrowDown');
check('the disabled Paste row is skipped', (await page.evaluate(() => document.activeElement.querySelector('.ax-item-label')?.textContent)) === 'Share');
await page.keyboard.press('d');
check('typeahead "d" → Delete', (await active()) === 'delete');

console.log('Second right-click moves the open menu');
await page.mouse.click(area.x + 300, area.y + 80, {button: 'right'});
await sleep(100);
const moved = await page.evaluate((s) => document.querySelector(s).querySelector('[role="menu"]').getBoundingClientRect().left, basic);
check('still open after a right-click elsewhere in the area', await isOpen(page, basic));
check('…now at the new point', Math.abs(moved - (area.x + 300)) <= 2, String(moved));

console.log('Outside press');
const mr = await page.evaluate((s) => {
  const r = document.querySelector(s).querySelector('[role="menu"]').getBoundingClientRect();
  return {x: r.left, y: r.top};
}, basic);
await page.mouse.move(mr.x + 20, mr.y + 10);
await page.mouse.down();
await page.mouse.move(1000, 880);
await page.mouse.up();
await sleep(80);
check('a press starting inside and ending outside keeps it open', await isOpen(page, basic));
await page.mouse.click(area.x + 20, area.y + 20);
await sleep(80);
check('a left click in the trigger area closes it', !(await isOpen(page, basic)));

console.log('Keyboard invocation');
await page.focus('#cm-basic-target');
await page.keyboard.press('Shift+F10');
await sleep(100);
check('Shift+F10 opens', await isOpen(page, basic));
const kb = await page.evaluate((s) => {
  const r = document.querySelector(s).querySelector('[role="menu"]').getBoundingClientRect();
  return {x: r.left, y: r.top};
}, basic);
// Chromium reports a keyboard contextmenu at the focused element's center; browsers that
// report (0, 0) get the area's bottom-start (both are Astryx's placement).
const target = await page.locator('#cm-basic-target').boundingBox();
const atCenter = Math.abs(kb.x - (target.x + target.width / 2)) <= 3 && Math.abs(kb.y - (target.y + target.height / 2)) <= 3;
const atBottomStart = Math.abs(kb.x - area.x) <= 2 && Math.abs(kb.y - (area.y + area.height)) <= 2;
check('…at the focused element (Chromium: its center) or the area\'s bottom-start', atCenter || atBottomStart, `${kb.x},${kb.y}`);
check('first row focused with the keyboard ring', (await active()) === 'cut' && (await page.evaluate(() => document.activeElement.matches(':focus-visible'))));
await page.keyboard.press('Escape');
await sleep(80);
check('Escape closes', !(await isOpen(page, basic)));
check('focus returns to the element focused before', (await active()) === 'cm-basic-target');
await page.keyboard.press('ContextMenu');
await sleep(100);
check('the Menu key opens', await isOpen(page, basic));
await page.keyboard.press('Escape');
await sleep(80);
// A platform that sends no contextmenu for the key: the area's own fallback opens the menu.
await page.evaluate(() => document.getElementById('cm-basic-target').dispatchEvent(new KeyboardEvent('keydown', {key: 'F10', shiftKey: true, bubbles: true, cancelable: true})));
await sleep(100);
check('Shift+F10 without a native contextmenu still opens (at the bottom-start)', (await isOpen(page, basic)) && (await page.evaluate(([s, ax, ay]) => {
  const r = document.querySelector(s).querySelector('[role="menu"]').getBoundingClientRect();
  return Math.abs(r.left - ax) <= 2 && Math.abs(r.top - ay) <= 2;
}, [basic, area.x, area.y + area.height])));
await page.keyboard.press('Escape');
await sleep(80);
await page.evaluate(() => document.getElementById('cm-basic-target').dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true, clientX: 0, clientY: 0})));
await sleep(100);
check('a keyboard contextmenu event (0,0, detail 0) opens at the bottom-start', await page.evaluate(([s, ax, ay]) => {
  const r = document.querySelector(s).querySelector('[role="menu"]').getBoundingClientRect();
  return Math.abs(r.left - ax) <= 2 && Math.abs(r.top - ay) <= 2;
}, [basic, area.x, area.y + area.height]));

console.log('Submenu');
await page.keyboard.press('s');
check('typeahead "s" → Share (a submenu row)', (await page.evaluate(() => document.activeElement.querySelector('.ax-item-label')?.textContent)) === 'Share');
const shareFly = await page.evaluate(() => '#' + document.activeElement.getAttribute('data-ax-submenu'));
await page.keyboard.press('ArrowRight');
await sleep(60);
check('ArrowRight opens the flyout on its first row', (await isOpen(page, shareFly)) && (await active()) === 'email');
await page.keyboard.press('Escape');
await sleep(60);
check('Escape closes only the flyout', !(await isOpen(page, shareFly)) && (await isOpen(page, basic)));
await page.keyboard.press('ArrowRight');
await sleep(60);
await events();
await page.keyboard.press('Enter');
await sleep(80);
const picked = await events();
check('a flyout row acts: astryx-select, the whole menu closes', picked.some((e) => e.type === 'astryx-select' && e.id === 'email') && !(await isOpen(page, basic)) && !(await isOpen(page, shareFly)), JSON.stringify(picked));
check('focus returns to the element focused before', (await active()) === 'cm-basic-target');

console.log('Tab');
await page.keyboard.press('Shift+F10');
await sleep(100);
await page.keyboard.press('Tab');
await sleep(80);
check('Tab closes the menu', !(await isOpen(page, basic)));

console.log('Compound rows, size and width');
const compound = await layerFor('cm-compound-area');
const carea = await page.locator('#cm-compound-area').boundingBox();
await page.mouse.click(carea.x + 50, carea.y + 30, {button: 'right'});
await sleep(100);
check('compound context menu opens', await isOpen(page, compound));
const cinfo = await page.evaluate((s) => {
  const m = document.querySelector(s).querySelector('[role="menu"]');
  return {label: m.getAttribute('aria-label'), w: m.getBoundingClientRect().width, sizes: [...m.querySelectorAll('[data-ax-menu-row]')].map((r) => r.getAttribute('data-size'))};
}, compound);
check('label prop names the menu', cinfo.label === 'Layer actions');
check('size="sm" reaches every row (flyout included)', cinfo.sizes.length >= 9 && cinfo.sizes.every((s) => s === 'sm'), cinfo.sizes.join());
check('menuWidth 220', cinfo.w >= 219, String(cinfo.w));
await events();
await page.click('#cm-locked');
await sleep(60);
check('checkbox toggles and the menu stays open', (await page.getAttribute('#cm-locked', 'aria-checked')) === 'true' && (await isOpen(page, compound)));
check('…astryx-change {value: true}', (await events()).some((e) => e.type === 'astryx-change' && e.id === 'cm-locked' && e.value === true));
await page.click('#cm-multiply');
await sleep(80);
check('radio selects and closes', (await page.getAttribute('#cm-multiply', 'aria-checked')) === 'true' && (await page.getAttribute('#cm-normal', 'aria-checked')) === 'false' && !(await isOpen(page, compound)));

console.log('One context menu at a time');
await page.mouse.click(area.x + 60, area.y + 60, {button: 'right'});
await sleep(100);
await page.mouse.click(carea.x + 60, carea.y + 60, {button: 'right'});
await sleep(100);
check('opening another context menu closes the first', (await isOpen(page, compound)) && !(await isOpen(page, basic)));
await page.mouse.click(1000, 880);
await sleep(80);
check('press outside closes it', !(await isOpen(page, compound)));

console.log('Disabled area, inline trigger');
await events();
const darea = await page.locator('#cm-disabled-area').boundingBox();
await page.evaluate(() => document.getElementById('cm-disabled-area').dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true, clientX: 10, clientY: 10, detail: 1})));
await sleep(80);
check('a disabled area leaves the native menu', (await events()).some((e) => e.type === 'contextmenu' && !e.prevented) && !(await isOpen(page, await layerFor('cm-disabled-area'))));
void darea;
check('the inline trigger keeps its paragraph whole', await page.evaluate(() => {
  const span = document.getElementById('cm-inline-area');
  const p = span.closest('p');
  return span.tagName === 'SPAN' && !!p && p.textContent.includes('while the text keeps flowing');
}));
console.log('Touch long press');
const touchOpen = await page.evaluate(async ([s, x, y]) => {
  const target = document.getElementById('cm-basic-target');
  const touch = (cx, cy) => new Touch({identifier: 1, target, clientX: cx, clientY: cy});
  const fire = (type, cx, cy) => target.dispatchEvent(new TouchEvent(type, {bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [touch(cx, cy)], changedTouches: [touch(cx, cy)]}));
  const layer = document.querySelector(s);
  // A press that moves more than 10px is a scroll, not a long press.
  fire('touchstart', x, y);
  fire('touchmove', x + 20, y);
  await new Promise((r) => setTimeout(r, 600));
  const afterMove = layer.matches(':popover-open');
  fire('touchend', x + 20, y);
  // A short tap is not one either.
  fire('touchstart', x, y);
  await new Promise((r) => setTimeout(r, 200));
  fire('touchend', x, y);
  await new Promise((r) => setTimeout(r, 400));
  const afterTap = layer.matches(':popover-open');
  // Held 500ms: opens at the finger.
  fire('touchstart', x, y);
  await new Promise((r) => setTimeout(r, 600));
  const held = layer.matches(':popover-open');
  const r = layer.querySelector('[role="menu"]').getBoundingClientRect();
  fire('touchend', x, y);
  return {afterMove, afterTap, held, x: r.left, y: r.top};
}, [basic, area.x + 150, area.y + 50]);
check('a moving press or a short tap does not open', !touchOpen.afterMove && !touchOpen.afterTap);
check('a 500ms hold opens at the finger', touchOpen.held && Math.abs(touchOpen.x - (area.x + 150)) <= 2 && Math.abs(touchOpen.y - (area.y + 50)) <= 2, JSON.stringify(touchOpen));
await page.keyboard.press('Escape');
await sleep(60);

const inline = await layerFor('cm-inline-area');
const ir = await page.locator('#cm-inline-area').boundingBox();
await page.mouse.click(ir.x + 10, ir.y + 5, {button: 'right'});
await sleep(100);
check('the inline trigger opens its menu', await isOpen(page, inline));
await page.keyboard.press('Escape');
await sleep(60);

await done();
