#!/usr/bin/env node
/**
 * Drawer: modal (scrim) and non-modal (popover="manual") hosts, sides + RTL, width budget and
 * the mobile reveal, data-autofocus, Escape / scrim press per purpose, the exit keeps the host
 * until the slide-out ends, focus return, scroll lock, Tab containment.
 *   node tools/tests/drawer.test.mjs
 */
import {setup, sleep, activeId} from './_harness.mjs';

// Astryx useTooltip: a visible tooltip is the topmost layer and consumes the first Escape
// (the dialog stays open); a second Escape reaches the dialog.
async function escapeThroughTooltip(page) {
  const tipOpen = await page.evaluate(() => !!document.querySelector('ax-tooltip:popover-open, [role="tooltip"]:popover-open'));
  await page.keyboard.press('Escape');
  if (tipOpen) { await new Promise((r) => setTimeout(r, 40)); await page.keyboard.press('Escape'); }
  return tipOpen;
}


const {page, check, open, done} = await setup({height: 700});
await open('drawer');

const state = (id) => page.evaluate((i) => {
  const d = document.getElementById(i);
  let popover = false;
  try { popover = d.matches(':popover-open'); } catch {}
  return {open: d.open, modal: d.matches(':modal'), popover, host: d.parentElement.isOpen};
}, id);
const rect = (id) => page.evaluate((i) => {
  const r = document.getElementById(i).getBoundingClientRect();
  return {left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), top: Math.round(r.top), height: Math.round(r.height)};
}, id);
const vw = () => page.evaluate(() => innerWidth);
const htmlOverflow = () => page.evaluate(() => getComputedStyle(document.documentElement).overflow);

console.log('Server wiring');
check('side end + data-side theme hook', (await page.getAttribute('#drawer-end', 'data-side')) === 'end' && (await page.getAttribute('#drawer-end', 'class')).includes('astryx-drawer'));
check('named by label, aria-modal', (await page.getAttribute('#drawer-end', 'aria-label')) === 'Host details: web-01' && (await page.getAttribute('#drawer-end', 'aria-modal')) === 'true');
check('non-modal: popover="manual", no aria-modal', (await page.getAttribute('#drawer-inspector', 'popover')) === 'manual' && (await page.getAttribute('#drawer-inspector', 'aria-modal')) == null);
check('non-modal trigger toggles the popover', (await page.getAttribute('#drawer-inspector-trigger', 'command')) === 'toggle-popover');
check('non-modal header close is a hide-popover invoker', (await page.evaluate(() => document.querySelector('#drawer-inspector [data-ax-dialog-close]').getAttribute('command'))) === 'hide-popover');
check('required modal drawer is an alertdialog', (await page.getAttribute('#drawer-required', 'role')) === 'alertdialog');

console.log('Modal drawer, end side');
await page.click('#drawer-end-trigger');
await sleep(80);
let s = await state('drawer-end');
check('opens as a native modal', s.modal && s.host);
let r = await rect('drawer-end');
const width = await vw();
check('anchored to the inline end (right in LTR), full height', r.right >= width - 16 && r.height === 700 && r.top === 0, JSON.stringify(r));
check('desktop width budget 400px', r.width === 400, JSON.stringify(r));
check('data-autofocus control focused', (await activeId(page)) === 'drawer-end-first');
check('page scroll locked', (await htmlOverflow()) === 'hidden');
const tabs = [];
for (let i = 0; i < 7; i++) {
  await page.keyboard.press('Tab');
  tabs.push(await page.evaluate(() => document.getElementById('drawer-end').contains(document.activeElement)));
}
check('Tab stays inside the drawer', tabs.every(Boolean));
await escapeThroughTooltip(page);
await sleep(150);
s = await state('drawer-end');
check('Escape closes after the slide-out', !s.open && !s.host);
check('focus returns to the trigger', (await activeId(page)) === 'drawer-end-trigger');
check('scroll lock released', (await htmlOverflow()) !== 'hidden');

console.log('Exit keeps the host through the slide-out');
await page.emulateMedia({reducedMotion: 'no-preference'});
await page.click('#drawer-end-trigger');
await sleep(600);
await page.evaluate(() => document.getElementById('drawer-end').parentElement.hide());
const mid = await page.evaluate(() => {
  const d = document.getElementById('drawer-end');
  return {open: d.open, closing: d.hasAttribute('data-ax-closing'), lock: getComputedStyle(document.documentElement).overflow};
});
check('during the exit the dialog is still open and marked closing', mid.open && mid.closing, JSON.stringify(mid));
check('the page scrolls again as the exit starts', mid.lock !== 'hidden', mid.lock);
await page.keyboard.press('Escape');
await sleep(700);
s = await state('drawer-end');
check('after the transition the host hides', !s.open && !s.host);
await page.emulateMedia({reducedMotion: 'reduce'});

console.log('Scrim press per purpose');
await page.click('#drawer-end-trigger');
await sleep(80);
await page.mouse.move(40, 300);
await page.mouse.down();
await page.mouse.move(width - 100, 300);
await page.mouse.up();
await sleep(80);
check('a press from the scrim into the panel does not close', (await state('drawer-end')).open);
await page.mouse.click(40, 300);
await sleep(150);
check('info: a scrim press closes', !(await state('drawer-end')).open);
await page.click('#drawer-start-trigger');
await sleep(80);
r = await rect('drawer-start');
check('side start anchors to the left in LTR', r.left === 0 && r.width === 320, JSON.stringify(r));
await page.mouse.click(width - 60, 300);
await sleep(80);
check('form: a scrim press does not close', (await state('drawer-start')).open);
await page.keyboard.press('Escape');
await sleep(150);
check('form: Escape closes', !(await state('drawer-start')).open);
await page.click('#drawer-required-trigger');
await sleep(80);
await page.keyboard.press('Escape');
await sleep(150);
await page.mouse.click(40, 300);
await sleep(150);
check('required: neither Escape nor the scrim closes', (await state('drawer-required')).open);
await page.click('#drawer-required-done');
await sleep(150);
check('required: its own control closes', !(await state('drawer-required')).open);

console.log('RTL');
await page.click('#drawer-rtl-trigger');
await sleep(80);
r = await rect('drawer-rtl');
check('side end sits on the left under dir="rtl"', r.left === 0, JSON.stringify(r));
await page.keyboard.press('Escape');
await sleep(150);

console.log('Non-modal drawer');
await page.click('#drawer-inspector-trigger');
await sleep(80);
s = await state('drawer-inspector');
check('shown as a top-layer popover, not modal', s.popover && !s.modal && s.host, JSON.stringify(s));
r = await rect('drawer-inspector');
check('width "22rem" (352px)', r.width === 352, JSON.stringify(r));
check('page not scroll locked', (await htmlOverflow()) !== 'hidden');
await page.focus('#drawer-start-trigger');
check('the page behind stays interactive (focusable)', (await activeId(page)) === 'drawer-start-trigger');
await page.keyboard.press('Escape');
await sleep(150);
check('Escape closes it through the stack', !(await state('drawer-inspector')).popover);
await page.click('#drawer-inspector-trigger');
await sleep(80);
await page.click('#drawer-inspector-trigger', {force: true}).catch(() => {});
await sleep(150);
check('a second press on its toggle invoker closes it', !(await state('drawer-inspector')).popover);

console.log('Toasts above drawers');
await page.click('#drawer-end-trigger');
await sleep(80);
await page.click('#drawer-end-toast');
await sleep(200);
const hosted = await page.evaluate(() => {
  const d = document.getElementById('drawer-end');
  const vpEl = document.querySelector('ax-toast-viewport');
  const card = vpEl.querySelector('ax-toast');
  const r = card.getBoundingClientRect();
  return {
    inDrawer: vpEl.parentElement === d,
    above: card.contains(document.elementFromPoint(r.left + 12, r.top + r.height / 2)),
    region: d.querySelector(':scope > [data-astryx-modal-live-region="polite"]')?.textContent,
  };
});
check('a modal drawer hosts the toast viewport, toast painted above it', hosted.inDrawer && hosted.above, JSON.stringify(hosted));
check('announced in the drawer\'s own live region', hosted.region === 'Restart scheduled', hosted.region);
await page.keyboard.press('Escape');
await sleep(150);
check('the viewport goes home as the drawer closes', await page.evaluate(() => document.querySelector('ax-toast-viewport').parentElement.classList.contains('ax-toast-home')));
await page.evaluate(() => { const v = document.querySelector('ax-toast-viewport'); for (const t of [...v.toasts]) v.context.removeToast(t.id, 'manual'); });
await sleep(100);
await page.click('#drawer-inspector-trigger');
await sleep(80);
await page.click('#drawer-inspector-toast');
await sleep(200);
const raised = await page.evaluate(() => {
  const card = document.querySelector('ax-toast-viewport ax-toast');
  const r = card.getBoundingClientRect();
  const drawer = document.getElementById('drawer-inspector').getBoundingClientRect();
  return {overlaps: r.right > drawer.left, above: card.contains(document.elementFromPoint(r.left + 12, r.top + r.height / 2))};
});
check('a non-modal drawer shown later does not cover the toast (viewport re-raised)', raised.overlaps && raised.above, JSON.stringify(raised));
await page.keyboard.press('Escape');
await sleep(150);

console.log('Mobile reveal');
await page.setViewportSize({width: 400, height: 700});
await page.click('#drawer-end-trigger');
await sleep(80);
r = await rect('drawer-end');
check('below 640px the panel leaves a 56px reveal', r.width === 400 - 56 || r.width === 400 - 56 - 15, JSON.stringify(r));
await page.keyboard.press('Escape');
await sleep(150);
await page.click('#drawer-required-trigger');
await sleep(80);
r = await rect('drawer-required');
check('experimental.isFullWidthOnMobile covers the viewport', r.width >= 385 && r.left <= 15, JSON.stringify(r));
await page.click('#drawer-required-done');
await sleep(150);

await done();
