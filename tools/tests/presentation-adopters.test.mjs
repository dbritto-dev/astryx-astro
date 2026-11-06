#!/usr/bin/env node
/**
 * The presentation contract (elements/sheet/presentation.ts + surface.ts) in DropdownMenu
 * (data items), Selector, MultiSelector and DateInput — Astryx useAdaptivePresentation /
 * useSelectorPresentation / resolvePickerPresentation:
 *  - desktop (fine pointer): "adaptive" / "adaptive-bottom-sheet" stay the anchored popover
 *    (desktop behaviour unchanged); "bottom-sheet" is a modal sheet — unanchored, the layer
 *    covering the viewport, the surface themed `astryx-bottom-sheet`, a dialog named by the
 *    label, the trigger `aria-haspopup="dialog"`, scroll lock, focus inside (menu rows by
 *    keyboard, the listbox / search row, the calendar's focus day), a press above the panel or
 *    Escape closes it and focus returns to the trigger;
 *  - phone (390×844, isMobile, hasTouch): the adaptive ones open as sheets.
 *   node tools/tests/presentation-adopters.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, browser, port, check, open, done} = await setup({reducedMotion: 'reduce'});

/** Surface facts of a layer (by id). */
const info = (p, layerId) => p.evaluate((id) => {
  const l = document.getElementById(id);
  const s = l.querySelector(':scope > .ax-sheet-surface');
  const r = s.getBoundingClientRect();
  const lr = l.getBoundingClientRect();
  let open = false;
  try { open = l.matches(':popover-open'); } catch {}
  return {
    open,
    surface: l.getAttribute('data-ax-surface'),
    sheet: s.classList.contains('astryx-bottom-sheet'),
    popoverClass: s.classList.contains('astryx-popover'),
    role: s.getAttribute('role'),
    modal: s.getAttribute('aria-modal'),
    label: s.getAttribute('aria-label'),
    anchorName: [...document.querySelectorAll('*')].some((el) => el.style?.getPropertyValue('anchor-name')?.includes('--astryx-layer') && l.style.getPropertyValue('position-anchor') !== ''),
    panel: {top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), left: Math.round(r.left)},
    layer: {height: Math.round(lr.height), width: Math.round(lr.width)},
    lock: getComputedStyle(document.documentElement).overflow,
    focusInside: l.contains(document.activeElement),
    active: document.activeElement?.id || document.activeElement?.getAttribute('role') || document.activeElement?.tagName,
  };
}, layerId);
const vp = () => page.evaluate(() => ({w: innerWidth, h: innerHeight}));
// The panel reaches below the screen by its reserve (48px under a fine pointer).
const isSheetGeometry = (s, v) => s.open && s.surface === 'bottom-sheet' && s.sheet && !s.popoverClass && s.layer.height === v.h && s.layer.width === v.w && s.panel.bottom >= v.h && s.panel.top < v.h && s.panel.width === Math.min(640, v.w);

// ── DropdownMenu ────────────────────────────────────────────────────────────
console.log('DropdownMenu (data items)');
await open('dropdown-menu');
const menuLayer = (menuId) => page.evaluate((id) => document.getElementById(id).closest('ax-menu').id, menuId);
const dmAdaptive = await menuLayer('dm-adaptive-menu');
const dmSheet = await menuLayer('dm-sheet-menu');
const dmSheetTrigger = '[data-testid="dm-sheet-trigger"]';
check('server: adaptive renders the anchored popover surface + hidden handle and heading', await page.evaluate((id) => {
  const l = document.getElementById(id);
  const s = l.querySelector(':scope > .ax-sheet-surface');
  return l.getAttribute('data-ax-presentation') === 'adaptive' && s.classList.contains('astryx-popover') && getComputedStyle(s.querySelector('.ax-sheet-handle')).display === 'none' && getComputedStyle(s.querySelector('.ax-sheet-heading')).display === 'none';
}, dmAdaptive));
check('server: bottom-sheet renders the sheet surface, a modal dialog; the trigger says dialog; data-presentation="bottom-sheet"', await page.evaluate(([id, trig]) => {
  const l = document.getElementById(id);
  const s = l.querySelector(':scope > .ax-sheet-surface');
  return s.classList.contains('astryx-bottom-sheet') && s.getAttribute('role') === 'dialog' && s.getAttribute('aria-modal') === 'true' && s.getAttribute('aria-label') === 'Share' &&
    document.querySelector(trig).getAttribute('aria-haspopup') === 'dialog' && document.getElementById('dm-sheet-menu').getAttribute('data-presentation') === 'bottom-sheet';
}, [dmSheet, dmSheetTrigger]));
check('a compound menu ignores presentation (Astryx: data items only)', await page.evaluate(() => !document.getElementById('dm-compound-menu').closest('ax-menu').hasAttribute('data-ax-presentation')));
await page.click('[data-testid="dm-adaptive-trigger"]');
await sleep(120);
let s = await info(page, dmAdaptive);
check('desktop: adaptive opens anchored (data-ax-surface="popover", astryx-popover, anchored)', s.open && s.surface === 'popover' && s.popoverClass && !s.sheet && s.anchorName && s.lock !== 'hidden', JSON.stringify(s));
check('…its trigger keeps aria-haspopup="menu"', (await page.getAttribute('[data-testid="dm-adaptive-trigger"]', 'aria-haspopup')) === 'menu');
await page.keyboard.press('Escape');
await sleep(100);
check('…Escape closes it', !(await info(page, dmAdaptive)).open);
await page.focus(dmSheetTrigger);
await page.keyboard.press('Enter');
await sleep(150);
let v = await vp();
s = await info(page, dmSheet);
check('bottom-sheet: opens unanchored, the layer covers the viewport, the panel at the bottom', isSheetGeometry(s, v) && !s.anchorName, JSON.stringify(s));
check('…a modal dialog named by the label, with the level-3 heading shown', s.role === 'dialog' && s.modal === 'true' && s.label === 'Share' && await page.evaluate((id) => {
  const h = document.getElementById(id).querySelector('.ax-sheet-heading');
  return h.tagName === 'H3' && h.textContent.trim() === 'Share' && getComputedStyle(h).display !== 'none';
}, dmSheet), JSON.stringify(s));
check('…page scroll locked; a keyboard open focuses the first row', s.lock === 'hidden' && await page.evaluate(() => document.activeElement?.getAttribute('role') === 'menuitem' && document.activeElement.textContent.includes('Edit project')));
await page.keyboard.press('ArrowDown');
check('…the menu keys still work (↓ moves to the next row)', await page.evaluate(() => document.activeElement?.textContent.includes('Duplicate project')));
await page.keyboard.press('Enter');
await sleep(150);
check('…Enter activates the row and closes the sheet; focus returns to the trigger', !(await info(page, dmSheet)).open && await page.evaluate((t) => document.activeElement === document.querySelector(t), dmSheetTrigger));
check('…scroll lock released', (await info(page, dmSheet)).lock !== 'hidden');
await page.click(dmSheetTrigger);
await sleep(150);
check('a pointer open shows the sheet too', (await info(page, dmSheet)).surface === 'bottom-sheet');
await page.mouse.click(v.w / 2, 20);
await sleep(150);
check('a press above the panel closes it', !(await info(page, dmSheet)).open);

// ── Selector ────────────────────────────────────────────────────────────────
console.log('Selector');
await open('selector');
const selLayer = (id) => page.evaluate((i) => document.getElementById(i).closest('ax-selector').getAttribute('data-ax-layer'), id);
const selAdaptive = await selLayer('sel-adaptive');
const selSheet = await selLayer('sel-sheet');
const selSearch = await selLayer('sel-sheet-search');
check('server: bottom-sheet trigger says dialog, adaptive says listbox', (await page.getAttribute('#sel-sheet', 'aria-haspopup')) === 'dialog' && (await page.getAttribute('#sel-adaptive', 'aria-haspopup')) === 'listbox');
await page.click('#sel-adaptive');
await sleep(120);
s = await info(page, selAdaptive);
check('desktop: adaptive opens the anchored listbox popup; focus stays on the trigger', s.open && s.surface === 'popover' && s.popoverClass && await page.evaluate((id) => document.getElementById(id).querySelector('.ax-sheet-surface').classList.contains('astryx-selector-popup'), selAdaptive) && (await page.evaluate(() => document.activeElement?.id)) === 'sel-adaptive', JSON.stringify(s));
await page.keyboard.press('Escape');
await sleep(100);
await page.focus('#sel-sheet');
await page.keyboard.press('ArrowDown');
await sleep(150);
v = await vp();
s = await info(page, selSheet);
check('bottom-sheet: a modal sheet named by the label, the popup classes swapped out', isSheetGeometry(s, v) && s.role === 'dialog' && s.label === 'Fruit (bottom sheet)' && await page.evaluate((id) => !document.getElementById(id).querySelector('.ax-sheet-surface').classList.contains('astryx-selector-popup'), selSheet), JSON.stringify(s));
const lb = await page.evaluate((id) => {
  const l = document.getElementById(id).querySelector('[role="listbox"]');
  return {focused: document.activeElement === l, tab: l.tabIndex, ad: l.getAttribute('aria-activedescendant'), first: l.querySelector('[role="option"]')?.id};
}, selSheet);
check('…focus moves to the listbox (a Tab stop) naming the first option', lb.focused && lb.tab === 0 && lb.ad === lb.first, JSON.stringify(lb));
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
check('…the trigger\'s keys work on the listbox (↓ moves the highlight)', await page.evaluate((id) => {
  const l = document.getElementById(id).querySelector('[role="listbox"]');
  return document.getElementById(l.getAttribute('aria-activedescendant'))?.textContent.includes('Cherry');
}, selSheet));
await page.keyboard.press('Enter');
await sleep(150);
check('…Enter picks the option, closes the sheet, focus back on the trigger', !(await info(page, selSheet)).open && (await page.evaluate(() => document.activeElement?.id)) === 'sel-sheet' && (await page.textContent('#sel-sheet')).includes('Cherry'));
check('…the listbox loses its Tab stop again', await page.evaluate((id) => !document.getElementById(id).querySelector('[role="listbox"]').hasAttribute('tabindex'), selSheet));
await page.click('#sel-sheet-search');
await sleep(150);
check('with search: focus moves to the search row', (await info(page, selSearch)).surface === 'bottom-sheet' && await page.evaluate(() => document.activeElement?.matches('[data-ax-panel-search] input')));
await page.keyboard.press('Escape');
await sleep(150);
check('…Escape closes it and focus returns to the trigger', !(await info(page, selSearch)).open && (await page.evaluate(() => document.activeElement?.id)) === 'sel-sheet-search');

// ── MultiSelector ───────────────────────────────────────────────────────────
console.log('MultiSelector');
await open('multi-selector');
const msSheet = await page.evaluate(() => document.getElementById('ms-sheet').closest('ax-multi-selector').getAttribute('data-ax-layer'));
const msAdaptive = await page.evaluate(() => document.getElementById('ms-adaptive').closest('ax-multi-selector').getAttribute('data-ax-layer'));
await page.click('#ms-adaptive');
await sleep(120);
check('desktop: adaptive stays the anchored popup', (await info(page, msAdaptive)).surface === 'popover');
await page.keyboard.press('Escape');
await sleep(100);
await page.focus('#ms-sheet');
await page.keyboard.press('Enter');
await sleep(150);
v = await vp();
s = await info(page, msSheet);
check('bottom-sheet: a modal sheet, focus on the listbox', isSheetGeometry(s, v) && s.label === 'Columns (bottom sheet)' && await page.evaluate((id) => document.activeElement === document.getElementById(id).querySelector('[role="listbox"]'), msSheet), JSON.stringify(s));
await page.keyboard.press('ArrowDown');
await page.keyboard.press(' ');
await sleep(80);
check('…Space toggles and keeps the sheet open', (await info(page, msSheet)).open);
await page.keyboard.press('Escape');
await sleep(150);
check('…Escape closes it, focus back on the trigger', !(await info(page, msSheet)).open && (await page.evaluate(() => document.activeElement?.id)) === 'ms-sheet');

// ── DateInput ───────────────────────────────────────────────────────────────
console.log('DateInput');
await open('date-input');
const dateLayer = (t) => page.evaluate((test) => document.querySelector(`ax-date-input:has(> input[data-test="${test}"]) ax-picker-popover`).id, t);
const diSheet = await dateLayer('sheet');
const diAdaptive = await dateLayer('adaptive-sheet');
check('server: a non-Gregorian calendar maps the default (adaptive-native) to adaptive-bottom-sheet; Gregorian keeps the popover', await page.evaluate(() => {
  const layer = (t) => document.querySelector(`ax-date-input:has(> input[data-test="${t}"]) ax-picker-popover`);
  return layer('buddhist').getAttribute('data-ax-presentation') === 'adaptive-bottom-sheet' && !layer('basic').hasAttribute('data-ax-presentation');
}));
await page.click(`ax-date-input:has(> input[data-test="adaptive-sheet"]) [data-ax-date-toggle]`);
await sleep(150);
check('desktop (fine pointer): adaptive-bottom-sheet opens the anchored popover', (await info(page, diAdaptive)).surface === 'popover');
await page.keyboard.press('Escape');
await sleep(120);
await page.click(`input[data-test="sheet"]`);
await sleep(200);
v = await vp();
s = await info(page, diSheet);
check('bottom-sheet: a click in the field opens the calendar as a modal sheet named by the dialog label', isSheetGeometry(s, v) && s.role === 'dialog' && s.modal === 'true' && !!s.label, JSON.stringify(s));
check('…focus moves onto the calendar\'s focus day', await page.evaluate((id) => {
  const a = document.activeElement;
  return document.getElementById(id).contains(a) && a.matches('.astryx-calendar-day') && a.getAttribute('data-date') === '2026-03-21';
}, diSheet));
check('…scroll locked', s.lock === 'hidden');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('Enter');
await sleep(200);
check('…picking a day commits it and closes the sheet', !(await info(page, diSheet)).open && (await page.inputValue('input[data-test="sheet"]')).includes('22'));
await page.click(`ax-date-input:has(> input[data-test="sheet"]) [data-ax-date-toggle]`);
await sleep(200);
await page.mouse.click(v.w / 2, 20);
await sleep(200);
check('…a press above the panel closes it', !(await info(page, diSheet)).open);

// ── Phone ───────────────────────────────────────────────────────────────────
console.log('Phone (390×844, isMobile, hasTouch): the adaptive presentations are sheets');
const phone = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, reducedMotion: 'reduce'});
await phone.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
  const st = document.createElement('style');
  st.textContent = '.docs-main{min-width:0}';
  document.head.append(st);
}));
const tp = await phone.newPage();
const errors = [];
tp.on('pageerror', (e) => errors.push(e.message));
await tp.route('https://fonts.googleapis.com/**', (r) => r.abort());
const go = async (slug) => {
  await tp.goto(`http://localhost:${port}/components/${slug}/`);
  await tp.waitForLoadState('load');
  await sleep(150);
  // The demos' open-on-load examples would cover the triggers on a phone.
  await tp.evaluate(() => document.querySelectorAll(':popover-open').forEach((p) => p.hidePopover()));
  await sleep(100);
};

await go('dropdown-menu');
const pAdaptive = await tp.evaluate(() => document.getElementById('dm-adaptive-menu').closest('ax-menu').id);
check('DropdownMenu: the closed adaptive trigger announces a dialog', (await tp.getAttribute('[data-testid="dm-adaptive-trigger"]', 'aria-haspopup')) === 'dialog');
await tp.tap('[data-testid="dm-adaptive-trigger"]');
await sleep(250);
s = await info(tp, pAdaptive);
check('DropdownMenu: adaptive opens as a sheet spanning the phone width', s.open && s.surface === 'bottom-sheet' && s.sheet && s.panel.width === 390 && s.panel.left === 0 && s.label === 'Project', JSON.stringify(s));
check('…the menu reports data-presentation="bottom-sheet"', (await tp.getAttribute('#dm-adaptive-menu', 'data-presentation')) === 'bottom-sheet');
await tp.tap(`#${pAdaptive} [role="menuitem"]:not([aria-disabled="true"])`);
await sleep(250);
check('…tapping a row acts and closes it', !(await info(tp, pAdaptive)).open);

await go('selector');
const pSel = await tp.evaluate(() => document.getElementById('sel-adaptive').closest('ax-selector').getAttribute('data-ax-layer'));
await tp.tap('#sel-adaptive');
await sleep(250);
s = await info(tp, pSel);
check('Selector: adaptive opens as a sheet; the listbox is focused', s.open && s.surface === 'bottom-sheet' && s.panel.width === 390 && await tp.evaluate((id) => document.activeElement === document.getElementById(id).querySelector('[role="listbox"]'), pSel), JSON.stringify(s));
await tp.tap(`#${pSel} [role="option"]:nth-child(3)`);
await sleep(250);
check('…tapping an option picks it and closes the sheet', !(await info(tp, pSel)).open && (await tp.textContent('#sel-adaptive')).includes('Cherry'));

await go('multi-selector');
const pMs = await tp.evaluate(() => document.getElementById('ms-adaptive').closest('ax-multi-selector').getAttribute('data-ax-layer'));
await tp.tap('#ms-adaptive');
await sleep(250);
check('MultiSelector: adaptive opens as a sheet', (await info(tp, pMs)).surface === 'bottom-sheet');
await tp.touchscreen.tap(195, 30);
await sleep(250);
check('…a tap above the panel closes it', !(await info(tp, pMs)).open);

await go('date-input');
const pDi = await tp.evaluate(() => document.querySelector('ax-date-input:has(> input[data-test="adaptive-sheet"]) ax-picker-popover').id);
await tp.tap(`ax-date-input:has(> input[data-test="adaptive-sheet"]) [data-ax-date-toggle]`);
await sleep(250);
s = await info(tp, pDi);
check('DateInput: adaptive-bottom-sheet opens as a sheet under a coarse pointer', s.open && s.surface === 'bottom-sheet' && s.panel.width === 390, JSON.stringify(s));
check('phone: no page errors', errors.length === 0, errors.join(' | '));
await phone.close();

await done();
