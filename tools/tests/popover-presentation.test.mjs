#!/usr/bin/env node
/**
 * Popover `presentation`: "adaptive" stays anchored on a desktop (fine pointer) and becomes a
 * bottom sheet at compact + coarse (390×844, isMobile, hasTouch); "bottom-sheet" is always a
 * sheet. The sheet is the same layer restyled: no anchor name, the surface themed as
 * astryx-bottom-sheet, a modal dialog named by its label (or the trigger's text), scroll lock,
 * a press beside the panel / a swipe down / Escape dismiss it, focus in and back. The surface
 * is latched while open (a resize past the breakpoint keeps the sheet).
 *   node tools/tests/popover-presentation.test.mjs
 */
import {setup, sleep, activeId} from './_harness.mjs';

const {page, browser, port, check, open, done} = await setup({reducedMotion: 'reduce'});
await open('popover');

const info = (p, id) => p.evaluate((i) => {
  const l = document.getElementById(i);
  const s = l.querySelector('.ax-popover-surface');
  const r = s.getBoundingClientRect();
  const lr = l.getBoundingClientRect();
  let open = false;
  try { open = l.matches(':popover-open'); } catch {}
  return {
    open,
    surface: l.getAttribute('data-ax-surface'),
    sheetClass: s.classList.contains('astryx-bottom-sheet'),
    popoverClass: s.classList.contains('astryx-popover'),
    role: s.getAttribute('role'),
    modal: s.getAttribute('aria-modal'),
    label: s.getAttribute('aria-label'),
    anchorName: (document.getElementById(`${i}-anchor`)?.style.getPropertyValue('anchor-name') ?? '').trim(),
    panel: {top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), bottom: Math.round(r.bottom)},
    layer: {top: Math.round(lr.top), height: Math.round(lr.height), width: Math.round(lr.width)},
    lock: getComputedStyle(document.documentElement).overflow,
    haspopup: document.getElementById(`${i}-trigger`).getAttribute('aria-haspopup'),
  };
}, id);

console.log('Desktop (fine pointer): adaptive stays anchored');
check('server: adaptive renders the anchored surface + a hidden grab handle', await page.evaluate(() => {
  const l = document.getElementById('pop-adaptive');
  const h = l.querySelector('.ax-popover-sheet-handle');
  return l.getAttribute('data-ax-presentation') === 'adaptive' && l.querySelector('.astryx-popover') != null && h != null && getComputedStyle(h).display === 'none';
}));
check('server: a plain popover renders no handle', await page.evaluate(() => document.querySelector('#pop-basic .ax-popover-sheet-handle') == null));
await page.evaluate(() => document.getElementById('pop-adaptive-trigger').scrollIntoView({block: 'start'}));
await page.click('#pop-adaptive-trigger');
await sleep(100);
let s = await info(page, 'pop-adaptive');
check('opens anchored (data-ax-surface="popover", astryx-popover, anchor-name set)', s.open && s.surface === 'popover' && s.popoverClass && !s.sheetClass && s.anchorName.includes('--astryx-layer'), JSON.stringify(s));
const trig = await page.evaluate(() => { const r = document.getElementById('pop-adaptive-trigger').getBoundingClientRect(); return {top: r.top, bottom: r.bottom}; });
const adjacent = (s.panel.top >= trig.bottom - 1 && s.panel.top - trig.bottom < 16) || (s.panel.bottom <= trig.top + 1 && trig.top - s.panel.bottom < 16);
check('anchored next to its trigger (below, or flipped above), with its own width', adjacent && s.panel.width === 280, JSON.stringify({panel: s.panel, trig}));
check('no scroll lock for the anchored surface', s.lock !== 'hidden');
await page.keyboard.press('Escape');
await sleep(100);
check('Escape closes the anchored surface', !(await info(page, 'pop-adaptive')).open);

console.log('Desktop: presentation="bottom-sheet" is always a sheet');
check('server: the sheet surface is themed as astryx-bottom-sheet, a modal dialog', await page.evaluate(() => {
  const s = document.querySelector('#pop-sheet .ax-popover-surface');
  return s.classList.contains('astryx-bottom-sheet') && s.getAttribute('role') === 'dialog' && s.getAttribute('aria-modal') === 'true';
}));
check('server: its trigger announces a dialog', (await page.getAttribute('#pop-sheet-trigger', 'aria-haspopup')) === 'dialog');
await page.click('#pop-sheet-trigger');
await sleep(150);
s = await info(page, 'pop-sheet');
const vp = await page.evaluate(() => ({w: innerWidth, h: innerHeight}));
check('opens as a sheet: not anchored, the layer covers the viewport', s.open && s.surface === 'bottom-sheet' && s.anchorName === '' && s.layer.height === vp.h && s.layer.width === vp.w, JSON.stringify(s));
check('the panel rises from the bottom, centred, ≤ 640px, tall (≈ 8dvh from the top)', s.panel.width === 640 && Math.abs(s.panel.left - (vp.w - 640) / 2) <= 1 && Math.abs(s.panel.top - Math.round(vp.h * 0.08)) <= 4, JSON.stringify(s.panel));
check('named by the trigger’s text (no label)', s.label === 'Sort (bottom-sheet)', s.label);
check('page scroll locked', s.lock === 'hidden');
check('focus on the first content control', (await activeId(page)) === 'pop-sheet-first');
const tabs = [];
for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); tabs.push(await page.evaluate(() => document.getElementById('pop-sheet').contains(document.activeElement))); }
check('Tab is contained in the sheet', tabs.every(Boolean));
await page.mouse.click(vp.w / 2, 20);
await sleep(150);
check('a press above the panel closes it', !(await info(page, 'pop-sheet')).open);
check('focus returns to the trigger', (await activeId(page)) === 'pop-sheet-trigger');
check('scroll lock released', (await info(page, 'pop-sheet')).lock !== 'hidden');
await page.click('#pop-sheet-trigger');
await sleep(150);
await page.mouse.move(vp.w / 2, 30);
await page.mouse.down();
await page.mouse.move(vp.w / 2, vp.h - 40);
await page.mouse.up();
await sleep(100);
check('a press that starts on the backdrop and ends on the panel does not close', (await info(page, 'pop-sheet')).open);
const hd = await page.evaluate(() => { const r = document.querySelector('#pop-sheet .ax-popover-sheet-handle').getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; });
await page.mouse.move(hd.x, hd.y);
await page.mouse.down();
for (let i = 1; i <= 6; i++) { await page.mouse.move(hd.x, hd.y + 90 * i); await sleep(10); }
await page.mouse.up();
await sleep(200);
check('dragging the handle down dismisses it (the sheet always light-dismisses)', !(await info(page, 'pop-sheet')).open);
await page.click('#pop-sheet-trigger');
await sleep(150);
await page.keyboard.press('Escape');
await sleep(150);
check('Escape closes the sheet', !(await info(page, 'pop-sheet')).open);

// ── Compact + coarse ────────────────────────────────────────────────────────
console.log('Phone (390×844, isMobile, hasTouch): adaptive becomes a sheet');
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
await tp.goto(`http://localhost:${port}/components/popover/`);
await tp.waitForLoadState('load');
await sleep(150);
check('closed adaptive trigger announces a dialog on a compact touch screen', (await tp.getAttribute('#pop-adaptive-trigger', 'aria-haspopup')) === 'dialog');
await tp.tap('#pop-adaptive-trigger');
await sleep(200);
s = await info(tp, 'pop-adaptive');
check('adaptive opens as a sheet (no anchor name, astryx-bottom-sheet)', s.open && s.surface === 'bottom-sheet' && s.sheetClass && !s.popoverClass && s.anchorName === '', JSON.stringify(s));
check('the panel spans the phone width at the bottom; width prop ignored', s.panel.width === 390 && s.panel.left === 0 && Math.abs(s.panel.top - Math.round(844 * 0.08)) <= 4, JSON.stringify(s.panel));
check('modal dialog named by its label', s.role === 'dialog' && s.modal === 'true' && s.label === 'Filters');
check('focus on the first content control', (await activeId(tp)) === 'pop-adaptive-first');
check('page scroll locked', s.lock === 'hidden');
await tp.setViewportSize({width: 1100, height: 900});
await sleep(150);
s = await info(tp, 'pop-adaptive');
check('latched: growing past the breakpoint while open keeps the sheet', s.open && s.surface === 'bottom-sheet', JSON.stringify(s));
await tp.setViewportSize({width: 390, height: 844});
await sleep(100);
const cdp = await phone.newCDPSession(tp);
const touch = async (x, from, to, steps = 4, stepMs = 12) => {
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y: from}]});
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x, y: from + ((to - from) * i) / steps}]});
    await sleep(stepMs);
  }
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
};
const th = await tp.evaluate(() => { const r = document.querySelector('#pop-adaptive .ax-popover-sheet-handle').getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; });
await touch(th.x, th.y, th.y + 320);
await sleep(300);
check('a swipe down on the handle dismisses it', !(await info(tp, 'pop-adaptive')).open);
check('focus returns to the trigger', (await activeId(tp)) === 'pop-adaptive-trigger');
await tp.evaluate(() => document.getElementById('pop-adaptive').show({source: document.getElementById('pop-adaptive-trigger')}));
await sleep(200);
check('reopens as a sheet', (await info(tp, 'pop-adaptive')).surface === 'bottom-sheet');
await tp.touchscreen.tap(195, 30);
await sleep(200);
check('a tap above the panel closes it', !(await info(tp, 'pop-adaptive')).open);

console.log('Not compact (touch, wide): adaptive stays anchored');
await tp.setViewportSize({width: 1100, height: 900});
await sleep(150);
check('closed trigger follows the query (aria-haspopup stays dialog: the surface is a dialog)', (await tp.getAttribute('#pop-adaptive-trigger', 'aria-haspopup')) === 'dialog');
await tp.evaluate(() => document.getElementById('pop-adaptive').show({source: document.getElementById('pop-adaptive-trigger')}));
await sleep(200);
s = await info(tp, 'pop-adaptive');
check('a wide touch screen opens the anchored surface', s.open && s.surface === 'popover' && s.popoverClass && s.anchorName.includes('--astryx-layer'), JSON.stringify(s));
check('…with its own width again', s.panel.width === 280, JSON.stringify(s.panel));
check('phone: no page errors', errors.length === 0, errors.join(' | '));
await phone.close();

await done();
