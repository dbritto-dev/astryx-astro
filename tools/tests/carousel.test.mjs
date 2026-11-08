#!/usr/bin/env node
/**
 * Carousel (<ax-carousel>): APG semantics (region + carousel roledescription, "Slide N of M"
 * groups, scroller group named like the carousel), the button layer covering the carousel
 * (pills half outside the clipped root), edge state (start hidden/disabled at rest, end at the
 * end), button scrolling, focus hand-off to the scroller when the focused button's edge runs
 * out, keyboard panning on the focused scroller, Shift+wheel, hasLoop wrap-around, the
 * CarouselHandle API, content that fits and RTL.
 *   node tools/tests/carousel.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup({reducedMotion: 'reduce'});
await open('carousel');
await page.waitForFunction(() => customElements.get('ax-carousel'));
await sleep(150);

const state = (id) => page.evaluate((id) => {
  const root = document.getElementById(id);
  const sc = root.querySelector('.astryx-carousel-scroller');
  const pill = (side) => root.querySelector(`.ax-carousel-pill[data-side="${side}"]`);
  const btn = (side) => pill(side)?.querySelector('button');
  return {
    scrollLeft: Math.round(sc.scrollLeft),
    max: sc.scrollWidth - sc.clientWidth,
    tabindex: sc.getAttribute('tabindex'),
    fade: sc.getAttribute('data-ax-fade'),
    startHidden: pill('start')?.hasAttribute('data-ax-hidden'),
    endHidden: pill('end')?.hasAttribute('data-ax-hidden'),
    startDisabled: btn('start')?.disabled,
    endDisabled: btn('end')?.disabled,
  };
}, id);

console.log('Semantics');
const sem = await page.evaluate(() => {
  const root = document.getElementById('car-default');
  const sc = root.querySelector('.astryx-carousel-scroller');
  const slides = [...sc.children];
  return {
    role: root.getAttribute('role'), rd: root.getAttribute('aria-roledescription'), label: root.getAttribute('aria-label'),
    scRole: sc.getAttribute('role'), scLabel: sc.getAttribute('aria-label'),
    count: slides.length, first: slides[0].getAttribute('aria-label'), last: slides.at(-1).getAttribute('aria-label'),
    slideRole: slides.every((s) => s.getAttribute('role') === 'group' && s.getAttribute('aria-roledescription') === 'slide'),
    defaultLabel: document.getElementById('car-fit').getAttribute('aria-label'),
    buttons: [...root.querySelectorAll('.ax-carousel-nav')].map((b) => b.getAttribute('aria-label')),
  };
});
check('region with aria-roledescription="carousel" and its label', sem.role === 'region' && sem.rd === 'carousel' && sem.label === 'Color swatches');
check('scroller is a group named like the carousel', sem.scRole === 'group' && sem.scLabel === 'Color swatches');
check('each child is a "Slide N of M" group', sem.count === 10 && sem.first === 'Slide 1 of 10' && sem.last === 'Slide 10 of 10' && sem.slideRole, JSON.stringify(sem));
check('default label is the translated "Carousel"', sem.defaultLabel === 'Carousel');
check('buttons named Scroll left / Scroll right', sem.buttons.join() === 'Scroll left,Scroll right');

console.log('Edge state + buttons');
let s = await state('car-default');
check('at rest: overflowing scroller is a tab stop, end fade only', s.tabindex === '0' && s.fade === 'end' && s.scrollLeft === 0, JSON.stringify(s));
check('at rest: start button hidden + disabled, end shown', s.startHidden && s.startDisabled && !s.endHidden && !s.endDisabled);
const geom = await page.evaluate(() => {
  const root = document.getElementById('car-default').getBoundingClientRect();
  const layer = document.querySelector('#car-default .ax-carousel-buttons');
  const l = layer.getBoundingClientRect();
  const end = document.querySelector('#car-default .ax-carousel-pill[data-side="end"]').getBoundingClientRect();
  return {open: layer.matches(':popover-open'), cover: Math.abs(l.left - root.left) < 1 && Math.abs(l.width - root.width) < 1 && Math.abs(l.top - root.top) < 1, straddles: end.left < root.right && end.right > root.right};
});
check('button layer is open and covers the carousel', geom.open && geom.cover, JSON.stringify(geom));
check('end pill straddles the edge (half outside the clipped root)', geom.straddles);
await page.click('#car-default .ax-carousel-pill[data-side="end"] button');
await sleep(150);
s = await state('car-default');
check('Scroll right scrolls about one viewport', s.scrollLeft > 400, JSON.stringify(s));
check('both edges now overflow: both buttons, both fades', !s.startHidden && !s.endHidden && s.fade === 'both');
await page.focus('#car-default .ax-carousel-pill[data-side="end"] button');
for (let i = 0; i < 4 && !(await state('car-default')).endDisabled; i++) {
  await page.keyboard.press('Enter');
  await sleep(150);
}
s = await state('car-default');
const active = await page.evaluate(() => document.activeElement?.classList.contains('astryx-carousel-scroller') && document.activeElement.closest('ax-carousel').id);
check('at the end: end button hidden + disabled, start fade only', s.scrollLeft >= s.max - 1 && s.endHidden && s.endDisabled && s.fade === 'start', JSON.stringify(s));
check('focus handed to the scroller (not <body>)', active === 'car-default', String(active));
await page.click('#car-default .ax-carousel-pill[data-side="start"] button');
await sleep(150);
check('Scroll left scrolls back', (await state('car-default')).scrollLeft < s.scrollLeft);

console.log('Keyboard + wheel');
await page.evaluate(() => { document.querySelector('#car-default .astryx-carousel-scroller').scrollLeft = 0; });
await sleep(50);
await page.focus('#car-default .astryx-carousel-scroller');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
await sleep(150);
check('arrow keys pan the focused scroller', (await state('car-default')).scrollLeft > 0);
await page.evaluate(() => { document.querySelector('#car-default .astryx-carousel-scroller').scrollLeft = 0; });
const box = await page.locator('#car-default').boundingBox();
await page.mouse.move(box.x + 100, box.y + box.height / 2);
await page.keyboard.down('Shift');
await page.mouse.wheel(0, 200);
await page.keyboard.up('Shift');
await sleep(150);
check('Shift + vertical wheel scrolls horizontally', (await state('car-default')).scrollLeft > 100, JSON.stringify(await state('car-default')));

console.log('API');
await page.evaluate(() => document.getElementById('car-default').scrollTo(9));
await sleep(150);
s = await state('car-default');
check('scrollTo(9) reaches the end', s.scrollLeft >= s.max - 1);
check('canScrollNext/Prev', await page.evaluate(() => !document.getElementById('car-default').canScrollNext() && document.getElementById('car-default').canScrollPrev()));
await page.evaluate(() => document.getElementById('car-default').scrollTo(0));
await sleep(150);
check('scrollTo(0)', (await state('car-default')).scrollLeft === 0);

console.log('Loop');
s = await state('car-loop');
check('hasLoop: both buttons at rest, both fades', !s.startHidden && !s.endHidden && !s.startDisabled && s.fade === 'both', JSON.stringify(s));
await page.click('#car-loop .ax-carousel-pill[data-side="start"] button');
await sleep(150);
s = await state('car-loop');
check('Prev at the start wraps to the end', s.scrollLeft >= s.max - 1, JSON.stringify(s));
await page.click('#car-loop .ax-carousel-pill[data-side="end"] button');
await sleep(150);
check('Next at the end wraps to the start', (await state('car-loop')).scrollLeft === 0);

console.log('Variants');
s = await state('car-fit');
check('content that fits: no tab stop, buttons hidden, no fade', s.tabindex === '-1' && s.startHidden && s.endHidden && s.fade === null, JSON.stringify(s));
check('hasButtons false: no layer', await page.evaluate(() => !document.querySelector('#car-plain .ax-carousel-buttons')));
check('hasEdgeFade false: no fade', (await state('car-plain')).fade === null);
check('snap + padding theme attrs', await page.evaluate(() => {
  const sc = document.querySelector('#car-snap .astryx-carousel-scroller');
  return sc.dataset.snap === 'snap' && sc.dataset.padding === '3' && sc.dataset.gap === '3' && getComputedStyle(sc).scrollSnapType.startsWith('x');
}));

console.log('RTL');
s = await state('car-rtl');
check('RTL at rest: end button shown', !s.endHidden && s.startHidden);
const rtlPill = await page.evaluate(() => {
  const root = document.getElementById('car-rtl').getBoundingClientRect();
  const end = document.querySelector('#car-rtl .ax-carousel-pill[data-side="end"]').getBoundingClientRect();
  return end.left < root.left && end.right > root.left;
});
check('RTL: the end pill sits on the left edge', rtlPill);
await page.click('#car-rtl .ax-carousel-pill[data-side="end"] button');
await sleep(150);
check('RTL: Scroll toward the end moves to negative scrollLeft', (await state('car-rtl')).scrollLeft < -100, JSON.stringify(await state('car-rtl')));

await done();
