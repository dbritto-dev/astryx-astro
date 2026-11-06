#!/usr/bin/env node
/**
 * BottomSheet: server wiring, open/close, Escape and scrim press per purpose, focus in and
 * return, Tab containment, scroll lock, the no-scrim popover host, snap points with a mouse
 * drag, stacking (recede, one scrim, top-only Escape, focus into the revealed sheet, "Close
 * all"), the replace handoff; at phone size with touch emulation (CDP touch events): drag
 * between snap points, flick to dismiss, a pull-down at the top of the content, a form sheet
 * that refuses the swipe.
 *   node tools/tests/bottom-sheet.test.mjs
 */
import {setup, sleep, activeId} from './_harness.mjs';

const {page, browser, port, check, open, done} = await setup({height: 800});
await open('bottom-sheet');

const state = (id) => page.evaluate((i) => {
  const d = document.getElementById(i);
  let popover = false;
  try { popover = d.matches(':popover-open'); } catch {}
  const p = d.querySelector('.astryx-bottom-sheet');
  return {
    open: d.open || popover,
    modal: d.matches(':modal'),
    popover,
    host: d.parentElement.isOpen,
    stack: d.getAttribute('data-sheet-stack'),
    depth: d.getAttribute('data-sheet-stack-depth'),
    inert: d.hasAttribute('inert'),
    scrim: d.style.getPropertyValue('--_sheet-scrim-opacity'),
    replaced: p.getAttribute('data-sheet-replaced'),
    top: Math.round(p.getBoundingClientRect().top),
  };
}, id);
const htmlOverflow = () => page.evaluate(() => getComputedStyle(document.documentElement).overflow);
const inside = (id) => page.evaluate((i) => document.getElementById(i).contains(document.activeElement), id);
const vh = await page.evaluate(() => innerHeight);
const vw = await page.evaluate(() => innerWidth);

console.log('Server wiring');
check('dialog hosts the sheet, named by label', (await page.getAttribute('#bs-capped', 'aria-label')) === 'Nearby places' && (await page.getAttribute('#bs-capped', 'class')).includes('ax-bottom-sheet-dialog'));
check('modal sheet: aria-modal + scrim + layer root', (await page.getAttribute('#bs-capped', 'aria-modal')) === 'true' && (await page.getAttribute('#bs-capped', 'data-ax-scrim')) != null && (await page.getAttribute('#bs-capped', 'data-astryx-layer-root')) != null);
check('panel carries the theme target and DOM props', await page.evaluate(() => {
  const p = document.querySelector('#bs-capped > .astryx-bottom-sheet');
  return !!p && p.getAttribute('data-testid') === 'bs-capped-panel' && p.getAttribute('tabindex') === '-1';
}));
check('scroll area is a named group; handle is decorative', await page.evaluate(() => {
  const b = document.querySelector('#bs-capped .ax-bottom-sheet-body');
  const h = document.querySelector('#bs-capped .ax-bottom-sheet-handle');
  return b.getAttribute('role') === 'group' && b.getAttribute('aria-label') === 'Nearby places' && h.getAttribute('aria-hidden') === 'true';
}));
check('required sheet is an alertdialog', (await page.getAttribute('#bs-required', 'role')) === 'alertdialog');
check('no-scrim sheet is a manual popover without aria-modal', (await page.getAttribute('#bs-nearby', 'popover')) === 'manual' && (await page.getAttribute('#bs-nearby', 'aria-modal')) == null);
check('trigger is a show-modal invoker', (await page.getAttribute('#bs-capped-trigger', 'command')) === 'show-modal' && (await page.getAttribute('#bs-capped-trigger', 'commandfor')) === 'bs-capped');
check('a content close control is stamped as a close invoker', (await page.evaluate(() => document.querySelector('#bs-form-save').getAttribute('command'))) === 'close');
check('content padding publishes the bottom-sheet chain', (await page.evaluate(() => getComputedStyle(document.querySelector('#bs-capped .ax-bottom-sheet-content')).getPropertyValue('--container-padding-inline-start').trim())) !== '');

console.log('Open / Escape / focus return / scroll lock');
await page.click('#bs-capped-trigger');
await sleep(120);
let s = await state('bs-capped');
check('opens as a native modal', s.open && s.modal && s.host, JSON.stringify(s));
check('panel rests at the bottom (capped ≈ 62dvh visible)', Math.abs(s.top - Math.round(vh * 0.38)) <= 4, `top ${s.top}`);
check('focus moved into the sheet', await inside('bs-capped'));
check('page scroll locked', (await htmlOverflow()) === 'hidden');
check('overflowing scroll area is a tab stop', (await page.getAttribute('#bs-capped .ax-bottom-sheet-body', 'tabindex')) === '0');
const tabs = [];
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('Tab');
  tabs.push(await inside('bs-capped'));
}
check('Tab stays inside the sheet', tabs.every(Boolean));
await page.keyboard.press('Escape');
await sleep(150);
s = await state('bs-capped');
check('Escape closes', !s.open && !s.host);
check('focus returns to the trigger', (await activeId(page)) === 'bs-capped-trigger');
check('scroll lock released', (await htmlOverflow()) !== 'hidden');

console.log('Scrim press per purpose');
await page.click('#bs-capped-trigger');
await sleep(120);
await page.mouse.move(vw / 2, 40);
await page.mouse.down();
await page.mouse.move(vw / 2, vh - 60);
await page.mouse.up();
await sleep(100);
check('a press from the scrim into the panel does not close', (await state('bs-capped')).open);
await page.mouse.click(vw / 2, 40);
await sleep(150);
check('info: a scrim press closes', !(await state('bs-capped')).open);
await page.click('#bs-form-trigger');
await sleep(120);
await page.mouse.click(vw / 2, 20);
await sleep(100);
check('form: a scrim press does not close', (await state('bs-form')).open);
await page.keyboard.press('Escape');
await sleep(150);
check('form: Escape closes', !(await state('bs-form')).open);
await page.click('#bs-required-trigger');
await sleep(120);
await page.keyboard.press('Escape');
await sleep(80);
await page.mouse.click(vw / 2, 20);
await sleep(100);
check('required: neither Escape nor the scrim closes', (await state('bs-required')).open);
await page.click('#bs-required-accept');
await sleep(150);
check('required: its own control closes', !(await state('bs-required')).open);
check('…and focus returns to its trigger', (await activeId(page)) === 'bs-required-trigger');

console.log('No scrim (manual popover)');
await page.click('#bs-nearby-trigger');
await sleep(120);
s = await state('bs-nearby');
check('shown as a manual popover, not modal', s.popover && !s.modal, JSON.stringify(s));
check('the page stays scrollable', (await htmlOverflow()) !== 'hidden');
check('the page behind stays interactive', await page.evaluate(() => {
  const b = document.getElementById('bs-capped-trigger');
  const r = b.getBoundingClientRect();
  return document.elementFromPoint(r.left + 5, r.top + 5) === b || b.contains(document.elementFromPoint(r.left + 5, r.top + 5));
}));
await page.keyboard.press('Escape');
await sleep(150);
check('Escape closes a no-scrim sheet', !(await state('bs-nearby')).open);

console.log('Snap points: mouse drag on the handle');
await page.click('#bs-half-trigger');
await sleep(150);
s = await state('bs-half');
const fullTop = s.top;
check('tall sheet opens fully (≈ 8dvh from the top)', Math.abs(fullTop - Math.round(vh * 0.08)) <= 4, `top ${fullTop}`);
const handle = await page.evaluate(() => { const r = document.querySelector('#bs-half .ax-bottom-sheet-handle').getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; });
await page.mouse.move(handle.x, handle.y);
await page.mouse.down();
for (let i = 1; i <= 12; i++) { await page.mouse.move(handle.x, handle.y + (vh * 0.42 * i) / 12); await sleep(16); }
check('the sheet follows the pointer while dragging', (await page.evaluate(() => document.querySelector('#bs-half > .astryx-bottom-sheet').hasAttribute('data-sheet-dragging'))));
await sleep(150);
await page.mouse.up();
await sleep(250);
s = await state('bs-half');
check('a slow release settles at the half detent', Math.abs(s.top - Math.round(vh * 0.5)) <= 6, `top ${s.top}`);
check('the resized detent gives up layout height (scroll area shrinks)', await page.evaluate(() => {
  const p = document.querySelector('#bs-half > .astryx-bottom-sheet');
  return p.style.height !== '' && p.getBoundingClientRect().bottom <= innerHeight + parseFloat(getComputedStyle(p).paddingBottom) + 2;
}));
const h2 = await page.evaluate(() => { const r = document.querySelector('#bs-half .ax-bottom-sheet-handle').getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; });
await page.mouse.move(h2.x, h2.y);
await page.mouse.down();
for (let i = 1; i <= 12; i++) { await page.mouse.move(h2.x, h2.y - (vh * 0.4 * i) / 12); await sleep(16); }
await sleep(150);
await page.mouse.up();
await sleep(250);
s = await state('bs-half');
check('dragging back up settles fully open', Math.abs(s.top - fullTop) <= 4, `top ${s.top}`);
await page.keyboard.press('Escape');
await sleep(150);

console.log('Stacking');
await page.click('#bs-orders-trigger');
await sleep(150);
await page.click('#bs-order-trigger');
await sleep(150);
let orders = await state('bs-orders');
let order = await state('bs-order');
check('the order sits on top, the list recedes one step', order.stack === 'top' && orders.stack === 'covered' && orders.depth === '1', JSON.stringify({orders, order}));
check('one scrim: the list owns it, the order’s backdrop is clear', orders.scrim === '1' && order.scrim === '0', `${orders.scrim}/${order.scrim}`);
check('the receded dialog is transformed (scale < 1)', await page.evaluate(() => getComputedStyle(document.getElementById('bs-orders')).transform !== 'none'));
await page.click('#bs-edit-trigger');
await sleep(150);
orders = await state('bs-orders');
order = await state('bs-order');
let editS = await state('bs-edit');
check('a third sheet: depths 2 / 1 / top', orders.depth === '2' && order.depth === '1' && editS.stack === 'top', JSON.stringify([orders.depth, order.depth, editS.stack]));
check('the covered sheet that contains no presented sheet is inert', order.inert && !orders.inert);
await page.keyboard.press('Escape');
await sleep(200);
editS = await state('bs-edit');
order = await state('bs-order');
check('Escape closes only the top sheet', !editS.open && order.open && (await state('bs-orders')).open);
check('focus returns into the revealed sheet (its opener there)', (await activeId(page)) === 'bs-edit-trigger');
check('the revealed sheet is on top again, not inert', order.stack === 'top' && !order.inert);
await page.click('#bs-close-all');
await sleep(250);
check('"Close all": every sheet of the stack closes', !(await state('bs-orders')).open && !(await state('bs-order')).open);
check('focus returns once, to the bottom sheet’s opener', (await activeId(page)) === 'bs-orders-trigger');
check('scroll lock released after the stack', (await htmlOverflow()) !== 'hidden');

console.log('Replacing (close + open in one task, from inside the closing sheet)');
await page.emulateMedia({reducedMotion: 'no-preference'});
await page.click('#bs-step-trigger');
await sleep(500);
check('step 1 open', (await state('bs-step-details')).open);
await page.click('#bs-step-continue');
await sleep(60);
let details = await state('bs-step-details');
let confirm = await state('bs-step-confirm');
check('the next step opens above; the previous is retained and inert', confirm.open && details.open && details.replaced != null && details.inert, JSON.stringify({details, confirm}));
check('the retained step keeps the scrim, the entering one is clear', details.scrim === '1' && confirm.scrim === '0', `${details.scrim}/${confirm.scrim}`);
check('focus moved into the entering step', await inside('bs-step-confirm'));
check('the taller retained step moves down to meet the entering one', details.replaced === 'aligning' || details.replaced === 'fading', details.replaced);
await sleep(900);
details = await state('bs-step-details');
confirm = await state('bs-step-confirm');
check('after the handoff the previous step is gone and the scrim handed over', !details.open && confirm.open && confirm.scrim === '1', JSON.stringify({details, confirm}));
await page.click('#bs-step-back');
await sleep(900);
check('Back replaces again', (await state('bs-step-details')).open && !(await state('bs-step-confirm')).open);
await page.click('#bs-step-continue');
await sleep(900);
await page.click('#bs-step-done');
await sleep(700);
check('the flow closes', !(await state('bs-step-confirm')).open && !(await state('bs-step-details')).open);
check('focus returns to the element that opened the flow', (await activeId(page)) === 'bs-step-trigger');
await page.emulateMedia({reducedMotion: 'reduce'});

console.log('Exit motion keeps the dialog until the slide-out ends');
await page.emulateMedia({reducedMotion: 'no-preference'});
await page.click('#bs-hug-trigger');
await sleep(500);
await page.evaluate(() => document.getElementById('bs-hug').parentElement.hide());
await sleep(40);
const mid = await page.evaluate(() => {
  const d = document.getElementById('bs-hug');
  return {open: d.open, exit: d.querySelector('.astryx-bottom-sheet').hasAttribute('data-sheet-exit'), lock: getComputedStyle(document.documentElement).overflow};
});
check('during the exit the dialog is still open and the panel exiting', mid.open && mid.exit, JSON.stringify(mid));
check('the page scrolls again as the exit starts', mid.lock !== 'hidden');
await sleep(600);
check('after the slide-out the dialog closes', !(await state('bs-hug')).open);
await page.emulateMedia({reducedMotion: 'reduce'});

console.log('Zero JS: the invoker presents the sheet natively');
const noJs = await browser.newContext({javaScriptEnabled: false, viewport: {width: 1100, height: 800}});
const nj = await noJs.newPage();
await nj.route('https://fonts.googleapis.com/**', (r) => r.abort());
await nj.goto(`http://localhost:${port}/components/bottom-sheet/`);
await nj.click('#bs-capped-trigger');
await sleep(400);
const njState = await nj.evaluate(() => {
  const d = document.getElementById('bs-capped');
  const r = d.querySelector('.astryx-bottom-sheet').getBoundingClientRect();
  return {open: d.open, modal: d.matches(':modal'), top: Math.round(r.top)};
});
check('no-JS: the trigger opens a modal sheet resting at the bottom', njState.open && njState.modal && Math.abs(njState.top - Math.round(800 * 0.38)) <= 4, JSON.stringify(njState));
await nj.keyboard.press('Escape');
await sleep(200);
check('no-JS: Escape closes it (native close request)', !(await nj.evaluate(() => document.getElementById('bs-capped').open)));
await noJs.close();

// ── Phone size, touch emulation ─────────────────────────────────────────────
console.log('Touch (390×844, isMobile, hasTouch)');
const phone = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, reducedMotion: 'no-preference'});
// The docs layout overflows at phone width (its grid column lacks min-width: 0); fix it for the test.
await phone.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
  const s = document.createElement('style');
  s.textContent = '.docs-main{min-width:0}';
  document.head.append(s);
}));
const tp = await phone.newPage();
const errors = [];
tp.on('pageerror', (e) => errors.push(e.message));
await tp.route('https://fonts.googleapis.com/**', (r) => r.abort());
await tp.goto(`http://localhost:${port}/components/bottom-sheet/`);
await tp.waitForLoadState('load');
await sleep(150);
const cdp = await phone.newCDPSession(tp);
const touch = async (x, from, to, {steps = 12, stepMs = 16, holdMs = 0} = {}) => {
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y: from}]});
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x, y: from + ((to - from) * i) / steps}]});
    await sleep(stepMs);
  }
  if (holdMs) await sleep(holdMs);
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
};
const tstate = (id) => tp.evaluate((i) => {
  const d = document.getElementById(i);
  const p = d.querySelector('.astryx-bottom-sheet');
  return {open: d.open, top: Math.round(p.getBoundingClientRect().top), reserve: parseFloat(p.style.getPropertyValue('--_sheet-reserve'))};
}, id);
// Tap by coordinates (Playwright's tap(selector) can lose its click right after a fling).
const tapEl = async (selector) => {
  const c = await tp.evaluate((sel) => {
    const el = document.querySelector(sel);
    el.scrollIntoView({block: 'center'});
    const r = el.getBoundingClientRect();
    return {x: r.left + r.width / 2, y: r.top + r.height / 2};
  }, selector);
  await tp.touchscreen.tap(c.x, c.y);
};
// After a fling, Chrome's touch emulation drops the click of the next tap that follows a
// programmatic scroll (tap suppression); open the next sheets through the host API.
const showSheet = (id) => tp.evaluate((i) => document.getElementById(i).parentElement.show({source: document.getElementById(`${i}-trigger`)}), id);
const handleOf = (id) => tp.evaluate((i) => { const r = document.querySelector(`#${i} .ax-bottom-sheet-handle`).getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; }, id);
const tvh = 844;

await tapEl('#bs-peek-trigger');
await sleep(600);
let t = await tstate('bs-peek');
check('touch: tall sheet opens fully; a finger gets the 40% reserve', t.open && Math.abs(t.top - Math.round(tvh * 0.08)) <= 4 && t.reserve === Math.ceil(tvh * 0.4), JSON.stringify(t));
let hd = await handleOf('bs-peek');
await touch(hd.x, hd.y, hd.y + tvh * 0.42, {holdMs: 160});
await sleep(600);
t = await tstate('bs-peek');
check('touch: a slow drag settles at the 50% stop', Math.abs(t.top - tvh * 0.5) <= 6, JSON.stringify(t));
hd = await handleOf('bs-peek');
await touch(hd.x, hd.y, hd.y + 300, {holdMs: 160});
await sleep(600);
t = await tstate('bs-peek');
check('touch: dragging further settles at the 96px peek', Math.abs(t.top - (tvh - 96)) <= 6, JSON.stringify(t));
check('touch: the peek thins the scrim (not below 0.3)', await tp.evaluate(() => {
  const v = parseFloat(document.getElementById('bs-peek').style.getPropertyValue('--_sheet-scrim-opacity'));
  return v >= 0.29 && v < 0.5;
}));
hd = await handleOf('bs-peek');
await touch(hd.x, hd.y, hd.y - 200, {steps: 4, stepMs: 12});
await sleep(600);
t = await tstate('bs-peek');
check('touch: an upward flick from the peek projects past half to full', Math.abs(t.top - Math.round(tvh * 0.08)) <= 6, JSON.stringify(t));
hd = await handleOf('bs-peek');
await touch(hd.x, hd.y, hd.y + 300, {steps: 4, stepMs: 12});
await sleep(700);
t = await tstate('bs-peek');
check('touch: a fast downward flick dismisses (info)', !t.open, JSON.stringify(t));

await showSheet('bs-capped');
await sleep(600);
const body = await tp.evaluate(() => { const r = document.querySelector('#bs-capped .ax-bottom-sheet-body').getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + 80}; });
await touch(body.x, body.y, body.y - 200, {steps: 8, stepMs: 16});
await sleep(400);
const scrolled = await tp.evaluate(() => document.querySelector('#bs-capped .ax-bottom-sheet-body').scrollTop);
check('touch: an upward swipe in the content scrolls it (no drag)', scrolled > 50 && (await tstate('bs-capped')).open, `scrollTop ${scrolled}`);
await tp.evaluate(() => { document.querySelector('#bs-capped .ax-bottom-sheet-body').scrollTop = 0; });
await sleep(50);
await touch(body.x, body.y, body.y + 360, {steps: 6, stepMs: 14});
await sleep(700);
check('touch: pulling down at the top of the content drags and dismisses', !(await tstate('bs-capped')).open);

await showSheet('bs-form');
await sleep(600);
hd = await handleOf('bs-form');
await touch(hd.x, hd.y, hd.y + 500, {steps: 4, stepMs: 12});
await sleep(700);
t = await tstate('bs-form');
check('touch: purpose="form" refuses the swipe and settles back', t.open && Math.abs(t.top - Math.round(tvh * 0.08)) <= 6, JSON.stringify(t));
check('touch: no page errors', errors.length === 0, errors.join(' | '));
await phone.close();

await done();
