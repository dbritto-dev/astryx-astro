#!/usr/bin/env node
/**
 * Overlay: always / hover / focus reveal, media theming inside the scrim, controlled mode
 * (inert + element API), radius sync, and the hover-mode tap toggle without hover.
 * SnapPaging (in the same demo): goTo / next / prev, index + settle events, user scroll.
 *   node tools/tests/overlay.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, context, check, open, done} = await setup();
await open('overlay');

const scrim = (id) => page.evaluate((id) => {
  const s = document.querySelector(`#${id} > .astryx-overlay-scrim`);
  const cs = getComputedStyle(s);
  return {visible: cs.visibility === 'visible' && cs.opacity === '1', inert: s.inert, position: s.dataset.position, media: s.querySelector('[data-astryx-media]')?.getAttribute('data-astryx-media') ?? null};
}, id);

console.log('Reveal');
check('showOn="always" is visible, dark media context', (await scrim('ov-always')).visible && (await scrim('ov-always')).media === 'dark');
check('scrim hook: .astryx-overlay-scrim[data-position]', (await scrim('ov-hover')).position === 'bottom');
check('showOn="hover" starts hidden', !(await scrim('ov-hover')).visible);
await page.hover('#ov-hover');
await sleep(50);
check('hover reveals it', (await scrim('ov-hover')).visible);
await page.mouse.move(2, 2);
await sleep(50);
check('leaving hides it', !(await scrim('ov-hover')).visible);
await page.focus('#ov-hover-media');
await sleep(50);
check('focus inside reveals a hover-mode scrim (focus-within)', (await scrim('ov-hover')).visible);
await page.keyboard.press('Tab');
check('…and its content is then reachable by Tab', (await page.evaluate(() => document.activeElement?.id)) === 'ov-hover-action');
check('showOn="focus" starts hidden', !(await scrim('ov-focus')).visible);
await page.hover('#ov-focus');
await sleep(50);
check('hover alone does not reveal showOn="focus"', !(await scrim('ov-focus')).visible);
await page.focus('#ov-focus-link');
await sleep(50);
check('focus reveals showOn="focus"', (await scrim('ov-focus')).visible);
await page.focus('#ov-toggle');
await sleep(50);
check('blur hides it again', !(await scrim('ov-focus')).visible);
check('light scrim → light media context', (await scrim('ov-light')).media === 'light');

console.log('Controlled');
let s = await scrim('ov-controlled');
check('isOpen={false}: hidden and inert', !s.visible && s.inert);
await page.click('#ov-toggle');
await sleep(50);
s = await scrim('ov-controlled');
check('el.toggle() opens it (inert removed)', s.visible && !s.inert);
await page.evaluate(() => { document.getElementById('ov-controlled').isOpen = false; });
await sleep(50);
check('el.isOpen = false closes it', !(await scrim('ov-controlled')).visible && (await page.evaluate(() => document.getElementById('ov-controlled').isOpen)) === false);

console.log('Radius sync');
check('the wrapper copies the media radius', await page.evaluate(() => {
  const el = document.getElementById('ov-always');
  return getComputedStyle(el).borderTopLeftRadius === getComputedStyle(el.firstElementChild).borderTopLeftRadius && getComputedStyle(el).borderTopLeftRadius !== '0px';
}));

console.log('SnapPaging');
await page.evaluate(() => {
  window.__pager = [];
  const p = document.getElementById('ov-pager');
  p.addEventListener('astryx-index-change', (e) => window.__pager.push(`index:${e.detail.index}:${e.detail.reason}`));
  p.addEventListener('astryx-settle', (e) => window.__pager.push(`settle:${e.detail.index}:${e.detail.previous}`));
});
const pager = () => page.evaluate(() => {
  const p = document.getElementById('ov-pager');
  return {index: p.index, count: p.pageCount, pos: Math.round(p.position), offset1: Math.round(p.pageOffset(1)), offset3: Math.round(p.pageOffset(3)), log: window.__pager.splice(0)};
});
let p = await pager();
check('five viewport pages measured', p.count === 5 && p.index === 0, JSON.stringify(p));
await page.click('#ov-next');
await sleep(400);
p = await pager();
check('next() → index 1 (reason goTo), settles on page 1', p.index === 1 && Math.abs(p.pos - p.offset1) <= 1 && p.log.includes('index:1:goTo') && p.log.includes('settle:1:0'), JSON.stringify(p));
check('the demo indicator follows', (await page.textContent('#ov-page')) === '2 / 5');
await page.evaluate(() => { const el = document.getElementById('ov-pager'); el.scrollTo({left: el.pageOffset(3), behavior: 'instant'}); });
await sleep(400);
p = await pager();
check('a user scroll reports reason "drag" and settles', p.index === 3 && p.log.some((l) => l.endsWith(':drag')) && p.log.includes('settle:3:1'), JSON.stringify(p));
await page.click('#ov-prev');
await sleep(400);
check('prev() → index 2', (await pager()).index === 2);
await page.evaluate(() => document.getElementById('ov-pager').goTo(99));
await sleep(400);
check('goTo clamps to the last page', (await pager()).index === 4);

console.log('Touch toggle (no hover)');
const touch = await context.browser().newContext({hasTouch: true, isMobile: true, reducedMotion: 'reduce', viewport: {width: 800, height: 900}});
const tpage = await touch.newPage();
await tpage.goto(page.url());
await tpage.waitForLoadState('load');
await sleep(100);
const tscrim = () => tpage.evaluate(() => {
  const s = document.querySelector('#ov-light > .astryx-overlay-scrim');
  return {open: s.dataset.axOpen, visible: getComputedStyle(s).visibility === 'visible'};
});
let t = await tscrim();
check('without hover, a hover-mode scrim is tap-controlled and starts hidden', t.open === 'false' && !t.visible, JSON.stringify(t));
// Tap near the bottom of the media: the top strip covers its upper part once open.
const tapMedia = async () => {
  await tpage.evaluate(() => document.getElementById('ov-light').scrollIntoView({block: 'center'}));
  const box = await tpage.locator('#ov-light > div:first-child').boundingBox();
  await tpage.touchscreen.tap(box.x + 20, box.y + box.height - 20);
  await sleep(400);
};
await tapMedia();
check('a tap on the media shows it', (await tscrim()).visible);
await tapMedia();
check('a second tap hides it', !(await tscrim()).visible);
await touch.close();

await done();
