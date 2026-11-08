#!/usr/bin/env node
/**
 * Anchor positioning: every placement × alignment lands beside its trigger with the
 * clearance; layers flip near a viewport edge and keep the gutter; RTL mirrors start/end;
 * names compose on a shared trigger and exist only while shown (until the exit ends); a
 * keep-clear tooltip never covers its trigger.
 *   node tools/tests/anchor.test.mjs
 */
import {setup, isOpen, sleep} from './_harness.mjs';

const {page, context, check, open, done} = await setup({width: 1100, height: 800});
const TOL = 2;
const GAP = 4; // spacing-1

async function measure(triggerSel, layerSel) {
  return page.evaluate(([t, l]) => {
    const a = document.querySelector(t).getBoundingClientRect();
    const b = document.querySelector(l).getBoundingClientRect();
    return {a: {l: a.left, r: a.right, t: a.top, b: a.bottom, w: a.width, h: a.height}, b: {l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height}};
  }, [triggerSel, layerSel]);
}

function besides({a, b}, placement, alignment, rtl = false) {
  const near = (x, y) => Math.abs(x - y) <= TOL;
  let main;
  if (placement === 'above') main = near(a.t - b.b, GAP);
  else if (placement === 'below') main = near(b.t - a.b, GAP);
  else if ((placement === 'start') !== rtl) main = near(a.l - b.r, GAP);
  else main = near(b.l - a.r, GAP);
  let cross;
  if (placement === 'above' || placement === 'below') {
    if (alignment === 'center') cross = near(b.l + b.w / 2, a.l + a.w / 2);
    else if ((alignment === 'start') !== rtl) cross = near(b.l, a.l);
    else cross = near(b.r, a.r);
  } else if (alignment === 'center') cross = near(b.t + b.h / 2, a.t + a.h / 2);
  else if (alignment === 'start') cross = near(b.t, a.t);
  else cross = near(b.b, a.b);
  return main && cross;
}

const placements = ['above', 'below', 'start', 'end'];
const alignments = ['start', 'center', 'end'];

console.log('\nEvery placement × alignment');
await open('layer');
for (const p of placements) {
  for (const a of alignments) {
    const trig = `[data-demo-trigger="${p}-${a}"]`;
    const layer = `#layer-${p}-${a}`;
    await page.click(trig);
    await sleep(60);
    const m = await measure(trig, layer);
    check(`${p}/${a} beside its trigger`, (await isOpen(page, layer)) && besides(m, p, a), JSON.stringify(m));
    await page.keyboard.press('Escape');
    await sleep(30);
  }
}

console.log('Flips near a viewport edge, keeps the gutter');
// Pin the "below/start" trigger to the bottom edge: the layer must open above it.
await page.evaluate(() => {
  const t = document.querySelector('[data-demo-trigger="below-start"]');
  t.style.cssText += ';position:fixed;bottom:6px;left:300px;z-index:1';
});
await page.click('[data-demo-trigger="below-start"]');
await sleep(60);
let m = await measure('[data-demo-trigger="below-start"]', '#layer-below-start');
check('below flips above at the bottom edge', Math.abs(m.a.t - m.b.b - GAP) <= TOL, JSON.stringify(m));
await page.keyboard.press('Escape');
await sleep(30);
// Pin the "end/center" trigger to the right edge: it must flip to the start side.
await page.evaluate(() => {
  const t = document.querySelector('[data-demo-trigger="end-center"]');
  t.style.cssText += ';position:fixed;top:300px;right:4px;z-index:1';
});
await page.click('[data-demo-trigger="end-center"]');
await sleep(60);
m = await measure('[data-demo-trigger="end-center"]', '#layer-end-center');
check('end flips to start at the right edge', Math.abs(m.a.l - m.b.r - GAP) <= TOL, JSON.stringify(m));
await page.keyboard.press('Escape');
await sleep(30);
// Above/center near the left edge: it slides to keep the 16px gutter instead of overflowing.
await page.evaluate(() => {
  const t = document.querySelector('[data-demo-trigger="above-center"]');
  t.style.cssText += ';position:fixed;top:300px;left:0;width:24px;overflow:hidden;z-index:1';
});
await page.click('[data-demo-trigger="above-center"]');
await sleep(60);
m = await measure('[data-demo-trigger="above-center"]', '#layer-above-center');
check('centered layer slides to keep the viewport gutter', m.b.l >= 16 - TOL && Math.abs(m.a.t - m.b.b - GAP) <= TOL, JSON.stringify(m));
await page.keyboard.press('Escape');
await sleep(30);

console.log('\nThe first painted frame is final (native popovertarget show)');
await open('layer');
const frames = await page.evaluate(async () => {
  const trigger = document.querySelector('[data-demo-trigger="end-start"]');
  const layer = document.getElementById('layer-end-start');
  const read = () => { const r = layer.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; };
  // A real click runs the native invoker; the runtime's own frame callback was queued in
  // beforetoggle, so this one runs after it and before the first paint of the layer.
  let first = null;
  layer.addEventListener('beforetoggle', () => requestAnimationFrame(() => { first = read(); }), {once: true});
  trigger.click();
  await new Promise((r) => setTimeout(r, 200));
  return {first, final: read()};
});
check('geometry at the first frame equals the settled geometry', JSON.stringify(frames.first) === JSON.stringify(frames.final), JSON.stringify(frames));

console.log('\nRTL mirrors start/end');
await open('popover');
await page.click('#pop-rtl-trigger');
await sleep(60);
m = await measure('#pop-rtl-anchor', '#pop-rtl');
check('RTL alignment start aligns the right edges', Math.abs(m.a.r - m.b.r) <= TOL && Math.abs(m.b.t - m.a.b - GAP) <= TOL, JSON.stringify(m));
await page.keyboard.press('Escape');

console.log('\nAnchor names compose on a shared trigger and exist only while shown');
await open('layer');
const names = await page.evaluate(async () => {
  const trigger = document.querySelector('[data-demo-trigger="below-start"]');
  const a = document.getElementById('layer-below-start');
  const b = document.getElementById('layer-above-end');
  const read = () => trigger.style.getPropertyValue('anchor-name');
  // Two unrelated popover="auto" layers cannot be open together; make them manual.
  a.setAttribute('popover', 'manual');
  b.setAttribute('popover', 'manual');
  const before = read();
  a.show({anchor: trigger});
  b.show({anchor: trigger});
  const both = read();
  const rectA = a.getBoundingClientRect(), rectB = b.getBoundingClientRect(), rt = trigger.getBoundingClientRect();
  b.hide();
  await new Promise((r) => setTimeout(r, 50));
  const afterB = read();
  a.hide();
  await new Promise((r) => setTimeout(r, 50));
  return {before, both, afterB, after: read(), belowOk: rectA.top >= rt.bottom - 1, aboveOk: rectB.bottom <= rt.top + 1};
});
check('no anchor-name while closed', names.before === '');
check('two layers on one trigger: two names', names.both.split(',').length === 2, names.both);
check('both layers anchored to the shared trigger', names.belowOk && names.aboveOk);
check('closing one keeps the other name', names.afterB.split(',').length === 1 && names.afterB !== '', names.afterB);
check('closing the last removes it', names.after === '', names.after);

console.log('\nThe name stays until the exit transition ends (motion on)');
const motion = await context.browser().newContext({viewport: {width: 1100, height: 800}, reducedMotion: 'no-preference'});
const mp = await motion.newPage();
await mp.route('https://fonts.googleapis.com/**', (r) => r.abort());
await mp.goto(page.url());
await mp.waitForLoadState('load');
const exit = await mp.evaluate(async () => {
  const trigger = document.querySelector('[data-demo-trigger="below-center"]');
  const layer = document.getElementById('layer-below-center');
  layer.show({anchor: trigger});
  await new Promise((r) => setTimeout(r, 400));
  const durationMs = parseFloat(getComputedStyle(layer).transitionDuration) * 1000;
  layer.hide();
  await new Promise((r) => setTimeout(r, 30));
  const during = trigger.style.getPropertyValue('anchor-name');
  const stillPainted = getComputedStyle(layer).display !== 'none';
  await new Promise((r) => setTimeout(r, durationMs + 300));
  return {during, stillPainted, after: trigger.style.getPropertyValue('anchor-name'), durationMs};
});
check('during the exit the trigger keeps its anchor name', exit.during !== '' && exit.stillPainted, JSON.stringify(exit));
check('after the exit it is removed', exit.after === '', JSON.stringify(exit));
await motion.close();

console.log('\nKeep-clear: a tooltip taller than the room above and below never covers its trigger');
await open('tooltip');
const keep = await page.evaluate(async () => {
  const trigger = document.getElementById('tip-above-trigger');
  const id = trigger.getAttribute('data-ax-tooltip');
  const tip = document.getElementById(id);
  tip.querySelector('.ax-tooltip-content').textContent = 'Long '.repeat(600);
  trigger.style.cssText += ';position:fixed;top:380px;left:40px';
  tip.show({anchor: trigger});
  await new Promise((r) => setTimeout(r, 100));
  const a = trigger.getBoundingClientRect();
  const b = tip.getBoundingClientRect();
  const covers = b.left < a.right && a.left < b.right && b.top < a.bottom && a.top < b.bottom;
  return {covers, switched: tip.hasAttribute('data-astryx-clears-anchor'), scrolls: tip.hasAttribute('data-astryx-layer-scrolls'), b: [b.left, b.top, b.width, b.height], a: [a.left, a.top, a.width, a.height]};
});
check('switched to the anchor-clear list', keep.switched, JSON.stringify(keep));
check('does not cover the trigger', !keep.covers, JSON.stringify(keep));

await done();
