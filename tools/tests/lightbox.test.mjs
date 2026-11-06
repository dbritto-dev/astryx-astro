#!/usr/bin/env node
/**
 * Lightbox (<ax-lightbox>): useLightbox triggers (click, Enter/Space on role=button), modal
 * <dialog> (top layer, scroll lock, name = alt), close button / Escape (one layer per press) /
 * backdrop press, focus return without scrolling, Tab containment, gallery navigation by
 * buttons and arrow keys (RTL-aware), disabled ends, counter, captions, video items,
 * announcements in the dialog's live region, zoom (double-click, Enter/Space, +/-) and pan
 * (arrows, drag), astryx-open-change / astryx-index-change.
 *   node tools/tests/lightbox.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('lightbox');
await page.waitForFunction(() => customElements.get('ax-lightbox'));
await page.evaluate(() => {
  window.__events = [];
  for (const type of ['astryx-open-change', 'astryx-index-change']) document.addEventListener(type, (e) => window.__events.push({type, id: e.target.id, detail: e.detail}));
});

const dlg = (id) => `#${id} > dialog`;
const st = (id) => page.evaluate((id) => {
  const d = document.querySelector(`#${id} > dialog`);
  const media = d.querySelector('.ax-lightbox-image-wrapper img, .ax-lightbox-image-wrapper video');
  const navs = [...d.querySelectorAll('.ax-lightbox-nav')];
  return {
    open: d.open,
    modal: d.matches(':modal'),
    label: d.getAttribute('aria-label'),
    tag: media?.tagName,
    alt: media?.getAttribute('alt') ?? media?.getAttribute('aria-label'),
    caption: d.querySelector('.ax-lightbox-caption').hidden ? null : d.querySelector('.ax-lightbox-caption').textContent,
    counter: d.querySelector('.ax-lightbox-counter')?.textContent ?? null,
    prevDisabled: navs.find((n) => n.dataset.side === 'prev')?.disabled,
    nextDisabled: navs.find((n) => n.dataset.side === 'next')?.disabled,
    active: document.activeElement?.id || document.activeElement?.className || document.activeElement?.tagName,
    inDialog: d.contains(document.activeElement),
    rootOverflow: getComputedStyle(document.documentElement).overflow,
  };
}, id);
const live = () => page.evaluate(() => [...document.querySelectorAll('[data-astryx-modal-live-region], [data-astryx-live-region]')].map((r) => r.textContent).join(' | '));
const events = () => page.evaluate(() => window.__events.splice(0));

console.log('Closed at rest');
let s = await st('lb-gallery');
check('closed dialog, theme class, no counter text change', !s.open && (await page.getAttribute(dlg('lb-gallery'), 'class')).includes('astryx-lightbox') && s.counter === '1 / 5');
check('trigger props: role=button, tabindex, aria-haspopup=dialog', await page.evaluate(() => {
  const t = document.getElementById('lb-thumb-1');
  return t.getAttribute('role') === 'button' && t.getAttribute('tabindex') === '0' && t.getAttribute('aria-haspopup') === 'dialog';
}));

console.log('Open from a trigger (keyboard)');
await page.evaluate(() => window.scrollTo(0, 0));
await page.focus('#lb-thumb-1');
const scrollBefore = await page.evaluate(() => window.scrollY);
await page.keyboard.press('Enter');
await sleep(100);
s = await st('lb-gallery');
check('Enter on a role=button trigger opens at its index', s.open && s.modal && s.counter === '2 / 5' && s.alt === 'Dunes at dusk', JSON.stringify(s));
check('dialog named by the current alt', s.label === 'Dunes at dusk');
check('caption shown', s.caption === 'Late light over the dunes.');
check('page scroll locked', s.rootOverflow === 'hidden');
check('focus moved into the viewer', s.inDialog);
check('astryx-open-change {isOpen: true}', JSON.stringify((await events()).map((e) => e.detail)) === '[{"isOpen":true}]');

console.log('Gallery navigation');
await page.keyboard.press('ArrowRight');
await sleep(50);
s = await st('lb-gallery');
check('ArrowRight → next item', s.counter === '3 / 5' && s.alt === 'Night ridge' && s.caption === null);
check('move announced in the dialog\'s own region', (await page.evaluate(() => document.querySelector('#lb-gallery > dialog > [data-astryx-modal-live-region]')?.textContent ?? '')).includes('Night ridge, 3 of 5'), await live());
await page.keyboard.press('ArrowRight');
await sleep(50);
s = await st('lb-gallery');
check('no alt → "Media viewer" name; announcement "Image 4 of 5"', s.label === 'Media viewer' && (await live()).includes('Image 4 of 5'), `${s.label} ${await live()}`);
await page.keyboard.press('ArrowRight');
await sleep(50);
s = await st('lb-gallery');
check('video item: <video controls> named by its alt', s.tag === 'VIDEO' && s.alt === 'Test pattern clip' && (await page.$eval(`${dlg('lb-gallery')} video`, (v) => v.controls)), JSON.stringify(s));
check('last item: Next disabled, Prev enabled', s.nextDisabled && !s.prevDisabled);
await page.keyboard.press('ArrowRight');
check('ArrowRight at the end stays', (await st('lb-gallery')).counter === '5 / 5');
check('astryx-index-change per move', (await events()).filter((e) => e.type === 'astryx-index-change').map((e) => e.detail.index).join() === '2,3,4');
await page.click(`${dlg('lb-gallery')} .ax-lightbox-nav[data-side="prev"]`);
s = await st('lb-gallery');
check('Previous button', s.counter === '4 / 5' && s.tag === 'IMG');
await page.keyboard.press('ArrowLeft');
await page.keyboard.press('ArrowLeft');
await page.keyboard.press('ArrowLeft');
s = await st('lb-gallery');
check('first item: Prev disabled (focus kept inside)', s.counter === '1 / 5' && s.prevDisabled && !s.nextDisabled && s.inDialog, JSON.stringify(s));

console.log('Tab containment');
const order = [];
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('Tab');
  order.push(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName));
}
check('Tab cycles inside the viewer', order.every((n) => ['Close', 'Next', 'Zoom', 'Previous'].includes(n)) && order.includes('Close') && order.includes('Zoom'), order.join());
await page.keyboard.down('Shift');
for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
await page.keyboard.up('Shift');
check('Shift+Tab stays inside', (await st('lb-gallery')).inDialog);

console.log('Zoom + pan');
const zoom = () => page.evaluate(() => {
  const w = document.querySelector('#lb-gallery .ax-lightbox-image-wrapper');
  return {pressed: w.getAttribute('aria-pressed'), role: w.getAttribute('role'), transform: w.querySelector('img').style.transform, cursor: getComputedStyle(w).cursor};
});
let z = await zoom();
check('zoom target: role=button "Zoom", aria-pressed=false, zoom-in cursor', z.role === 'button' && z.pressed === 'false' && z.cursor === 'zoom-in', JSON.stringify(z));
await page.focus('#lb-gallery .ax-lightbox-image-wrapper');
await page.keyboard.press('Enter');
await sleep(30);
z = await zoom();
check('Enter zooms to 2×; announced', z.pressed === 'true' && z.transform.startsWith('scale(2)') && (await live()).includes('Zoomed in, use arrow keys to pan'), JSON.stringify(z));
await page.keyboard.press('ArrowRight');
z = await zoom();
check('arrows pan while zoomed (no navigation)', z.transform === 'scale(2) translate(-25px, 0px)' && (await st('lb-gallery')).counter === '1 / 5', z.transform);
const wrap = await page.locator('#lb-gallery .ax-lightbox-image-wrapper').boundingBox();
await page.mouse.move(wrap.x + wrap.width / 2, wrap.y + wrap.height / 2);
await page.mouse.down();
await page.mouse.move(wrap.x + wrap.width / 2 + 40, wrap.y + wrap.height / 2 + 20, {steps: 4});
z = await zoom();
check('drag pans (grabbing)', z.transform === 'scale(2) translate(-5px, 10px)' && z.cursor === 'grabbing', JSON.stringify(z));
await page.mouse.up();
check('releasing a drag over the backdrop does not close', (await st('lb-gallery')).open);
await page.keyboard.press('-');
z = await zoom();
await sleep(50);
check('"-" zooms out; announced', z.pressed === 'false' && z.transform === '' && (await live()).includes('Zoomed out'), `${JSON.stringify(z)} ${await live()}`);
await page.keyboard.press('+');
check('"+" zooms in', (await zoom()).pressed === 'true');
await page.dblclick('#lb-gallery .ax-lightbox-image-wrapper');
check('double-click toggles zoom', (await zoom()).pressed === 'false');
await page.keyboard.press('+');
await page.keyboard.press('ArrowLeft');
await page.click(`${dlg('lb-gallery')} .ax-lightbox-nav[data-side="next"]`);
check('a new item starts unzoomed', (await zoom()).pressed === 'false' && (await st('lb-gallery')).counter === '2 / 5');

console.log('Close: Escape, focus return');
await events();
await page.keyboard.press('Escape');
await sleep(50);
s = await st('lb-gallery');
check('Escape closes', !s.open);
check('focus returns to the opener', s.active === 'lb-thumb-1', s.active);
check('scroll unlocked, page not scrolled', s.rootOverflow !== 'hidden' && (await page.evaluate(() => window.scrollY)) === scrollBefore);
check('astryx-open-change {isOpen: false}', JSON.stringify((await events()).map((e) => e.detail)) === '[{"isOpen":false}]');

console.log('Close button, backdrop, click trigger');
await page.click('#lb-single-open');
await sleep(50);
s = await st('lb-single');
check('click trigger opens a single item (no gallery controls)', s.open && s.counter === null && (await page.$$(`${dlg('lb-single')} .ax-lightbox-nav`)).length === 0);
await page.click(`${dlg('lb-single')} .ax-lightbox-close`);
s = await st('lb-single');
check('close button closes and returns focus', !s.open && s.active === 'lb-single-open', s.active);
await page.click('#lb-single-open');
await sleep(50);
await page.mouse.click(550, 30); // above the letterboxed image: the container (backdrop)
await sleep(50);
check('a backdrop press closes', !(await st('lb-single')).open);

console.log('RTL + autoplay');
await page.click('#lb-rtl-open');
await sleep(50);
s = await st('lb-rtl');
check('RTL opens at data-ax-lightbox-index', s.open && s.counter === '2 / 4');
check('RTL labels translated', (await page.getAttribute(`${dlg('lb-rtl')} .ax-lightbox-close`, 'aria-label')) !== 'Close');
await page.keyboard.press('ArrowLeft');
check('RTL: ArrowLeft → next', (await st('lb-rtl')).counter === '3 / 4');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
check('RTL: ArrowRight → previous', (await st('lb-rtl')).counter === '1 / 4');
const navGeom = await page.evaluate(() => {
  const p = document.querySelector('#lb-rtl .ax-lightbox-nav[data-side="prev"]').getBoundingClientRect();
  const n = document.querySelector('#lb-rtl .ax-lightbox-nav[data-side="next"]').getBoundingClientRect();
  return n.left < p.left;
});
check('RTL: Next button on the left', navGeom);
await page.keyboard.press('Escape');
await page.click('#lb-video-open');
await sleep(300);
check('hasAutoPlay plays the video on open', await page.$eval(`${dlg('lb-video')} video`, (v) => !v.paused));
await page.keyboard.press('Escape');
await sleep(50);
check('…and pauses it on close', await page.$eval(`${dlg('lb-video')} video`, (v) => v.paused));

console.log('API');
await page.evaluate(() => document.getElementById('lb-gallery').open(3));
s = await st('lb-gallery');
check('open(3)', s.open && s.counter === '4 / 5');
await page.evaluate(() => document.getElementById('lb-gallery').close());
check('close()', !(await st('lb-gallery')).open);

await done();
