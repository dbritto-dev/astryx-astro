#!/usr/bin/env node
/**
 * The tooltip attachment contract on components that own their trigger (system Chrome, built
 * docs): Button `tooltip` (hover after the delay, keyboard focus-visible at once, not on mouse
 * focus; the layer is the trigger's next sibling; aria-describedby composed with the caller's
 * ids unless the tooltip repeats the name; a disabled Button with a tooltip stays focusable and
 * shows it), Link `tooltip`, and the former stand-ins: StatusDot (no native title), Avatar
 * (name vs custom string), ProgressBar marks (focusTrigger "always"), Thumbnail labels.
 *   node tools/tests/tooltip-wiring.test.mjs
 */
import {setup, sleep, isOpen} from './_harness.mjs';

const {page, check, open, done} = await setup();

const layerOf = (sel) => page.$eval(sel, (el) => el.getAttribute('data-ax-tooltip'));
const hover = async (sel) => {
  const b = await page.locator(sel).first().boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, {steps: 2});
};
const away = async () => { await page.mouse.move(1090, 890, {steps: 2}); await sleep(450); };
/** Focus `sel` by keyboard: Tab from a button inserted right before it. */
const tabTo = async (sel) => {
  await page.evaluate((s) => {
    document.querySelectorAll('.tab-anchor').forEach((el) => el.remove());
    const target = document.querySelector(s);
    const before = document.createElement('button');
    before.className = 'tab-anchor';
    before.textContent = 'before';
    target.before(before);
    before.focus();
  }, sel);
  await page.keyboard.press('Tab');
};
const blur = () => page.evaluate(() => document.activeElement?.blur());

console.log('Button');
await open('button');
const btn = '[data-test="tooltip"]';
const id = await layerOf(btn);
const wiring = await page.$eval(btn, (el) => {
  const layer = document.getElementById(el.getAttribute('data-ax-tooltip'));
  return {
    describedby: el.getAttribute('aria-describedby'), next: el.nextElementSibling === layer, inside: el.contains(layer),
    role: layer.getAttribute('role'), popover: layer.getAttribute('popover'), placement: layer.dataset.placement, text: layer.textContent,
  };
});
check('server HTML: aria-describedby = the layer id; the layer is the next sibling, not inside the button',
  wiring.describedby === id && wiring.next && !wiring.inside, JSON.stringify(wiring));
check('layer: role=tooltip popover=hint placement above, text = tooltip', wiring.role === 'tooltip' && wiring.popover === 'hint' && wiring.placement === 'above' && wiring.text === 'Moves the thread out of your inbox', JSON.stringify(wiring));
await hover(btn);
await sleep(80);
check('hover: not before the delay', !(await isOpen(page, `#${id}`)));
await sleep(250);
check('hover: shown after the delay', await isOpen(page, `#${id}`));
const geo = await page.evaluate(([s, l]) => {
  const t = document.querySelector(s).getBoundingClientRect();
  const r = document.getElementById(l).getBoundingClientRect();
  return {above: r.bottom <= t.top + 0.5, centered: Math.abs((r.left + r.width / 2) - (t.left + t.width / 2)) < 2};
}, [btn, id]);
check('placed above the button, centered', geo.above && geo.centered, JSON.stringify(geo));
await away();
check('leaving hides it', !(await isOpen(page, `#${id}`)));
await page.click(btn);
await sleep(300);
check('mouse focus (a click) does not show it', !(await isOpen(page, `#${id}`)));
await blur();
await away();
await tabTo(btn);
await sleep(30);
check('keyboard focus-visible shows it at once', await isOpen(page, `#${id}`));
await page.keyboard.press('Tab');
await sleep(50);
check('blur hides it', !(await isOpen(page, `#${id}`)));

const name = await page.$eval('[data-test="tooltip-name"]', (el) => ({describedby: el.getAttribute('aria-describedby'), tip: el.getAttribute('data-ax-tooltip'), label: el.getAttribute('aria-label')}));
check('a tooltip that repeats the name is not a description (no aria-describedby), still a trigger', name.describedby === null && name.tip && name.label === 'Settings', JSON.stringify(name));
await hover('[data-test="tooltip-name"]');
await sleep(320);
check('…and shows on hover', await isOpen(page, `#${name.tip}`));
await away();
const composed = await page.$eval('[data-test="tooltip-composed"]', (el) => ({d: el.getAttribute('aria-describedby'), t: el.getAttribute('data-ax-tooltip')}));
check('caller aria-describedby is composed with the layer id', composed.d === `export-help ${composed.t}`, JSON.stringify(composed));
const asLink = await page.$eval('[data-test="tooltip-link"]', (el) => ({tag: el.tagName, d: el.getAttribute('aria-describedby'), t: el.getAttribute('data-ax-tooltip'), next: el.nextElementSibling?.id}));
check('a link Button is a trigger too (layer after the <a>)', asLink.tag === 'A' && asLink.d === asLink.t && asLink.next === asLink.t, JSON.stringify(asLink));

const dis = '[data-test="disabled-tooltip"]';
const disId = await layerOf(dis);
const disAttrs = await page.$eval(dis, (el) => ({disabled: el.disabled, aria: el.getAttribute('aria-disabled'), d: el.getAttribute('aria-describedby')}));
check('disabled + tooltip: aria-disabled (not native disabled), described by the tooltip', !disAttrs.disabled && disAttrs.aria === 'true' && disAttrs.d === disId, JSON.stringify(disAttrs));
await tabTo(dis);
await sleep(30);
const disFocused = await page.$eval(dis, (el) => document.activeElement === el);
check('disabled + tooltip: reachable with Tab', disFocused);
check('disabled + tooltip: keyboard focus shows the tooltip', await isOpen(page, `#${disId}`));
await blur();
await away();
await hover(dis);
await sleep(320);
check('disabled + tooltip: hover shows it', await isOpen(page, `#${disId}`));
await away();

console.log('Link');
await open('link');
const link = 'a[href="#tooltip"]';
const lid = await layerOf(link);
const lw = await page.$eval(link, (el) => ({d: el.getAttribute('aria-describedby'), next: el.nextElementSibling?.id}));
check('Link tooltip: described by the layer, layer after the link', lw.d === lid && lw.next === lid, JSON.stringify(lw));
await hover(link);
await sleep(320);
check('Link tooltip shows on hover', await isOpen(page, `#${lid}`));
await away();

console.log('StatusDot');
await open('status-dot');
const dot = '.astryx-status-dot[aria-label="Online"][data-ax-tooltip]';
const dw = await page.$eval(dot, (el) => ({title: el.getAttribute('title'), d: el.getAttribute('aria-describedby'), t: el.getAttribute('data-ax-tooltip'), text: document.getElementById(el.getAttribute('data-ax-tooltip'))?.textContent}));
check('StatusDot: no native title; described by a Tooltip layer', dw.title === null && dw.d === dw.t && dw.text === 'Connected to the build server', JSON.stringify(dw));
await hover(dot);
await sleep(320);
check('StatusDot tooltip shows on hover', await isOpen(page, `#${dw.t}`));
await away();

console.log('Avatar');
await open('avatar');
const custom = await page.$eval('.demo .astryx-avatar[aria-label="jsmith"]', (el) => ({d: el.getAttribute('aria-describedby'), t: el.getAttribute('data-ax-tooltip'), tab: el.getAttribute('tabindex'), text: document.getElementById(el.getAttribute('data-ax-tooltip'))?.textContent}));
check('Avatar custom tooltip: tab stop, described by the layer', custom.tab === '0' && custom.d === custom.t && custom.text === 'Jane Smith, Staff Engineer', JSON.stringify(custom));
const named = await page.$eval('.demo .astryx-avatar[aria-label="Sam Lee, Away"]', (el) => ({d: el.getAttribute('aria-describedby'), t: el.getAttribute('data-ax-tooltip'), text: document.getElementById(el.getAttribute('data-ax-tooltip'))?.textContent}));
check('Avatar name tooltip: a trigger showing the name, not a description', named.d === null && named.t && named.text === 'Sam Lee', JSON.stringify(named));
await tabTo('.demo .astryx-avatar[aria-label="jsmith"]');
await sleep(30);
check('Avatar tooltip shows on keyboard focus', await isOpen(page, `#${custom.t}`));
await blur();
const noTip = await page.$eval('.demo .astryx-avatar[aria-label="No Tooltip"]', (el) => el.hasAttribute('data-ax-tooltip'));
check('tooltip={false}: no trigger', !noTip);

console.log('ProgressBar marks');
await open('progress-bar');
const mark = '.astryx-progress-bar-mark';
const mw = await page.$eval(mark, (el) => ({label: el.getAttribute('aria-label'), d: el.getAttribute('aria-describedby'), t: el.getAttribute('data-ax-tooltip'),
  text: document.getElementById(el.getAttribute('data-ax-tooltip'))?.textContent, focus: document.getElementById(el.getAttribute('data-ax-tooltip'))?.dataset.axFocusTrigger}));
check('mark: Tooltip with its label (focusTrigger "always"), describing the tick', mw.d === mw.t && mw.text === mw.label && mw.focus === 'always', JSON.stringify(mw));
await tabTo(mark);
await sleep(30);
check('mark tooltip shows on keyboard focus', await isOpen(page, `#${mw.t}`));
await blur();
await away();

console.log('Thumbnail');
await open('thumbnail');
const thumb = '.astryx-thumbnail[aria-label="night.png — Night sky"]';
const tw = await page.$eval(thumb, (el) => ({d: el.getAttribute('aria-describedby'), t: el.getAttribute('data-ax-tooltip'), next: el.nextElementSibling?.id, text: document.getElementById(el.getAttribute('data-ax-tooltip'))?.textContent}));
check('labelled Thumbnail: the group is the trigger, the label the tooltip', tw.d === tw.t && tw.next === tw.t && tw.text === 'night.png', JSON.stringify(tw));
await hover(`${thumb} .ax-thumbnail-media`);
await sleep(320);
check('Thumbnail label tooltip shows on hover', await isOpen(page, `#${tw.t}`));
await away();
const unlabelled = await page.$eval('.astryx-thumbnail[aria-label="Uploading chart"]', (el) => el.hasAttribute('data-ax-tooltip'));
check('no label → no tooltip', !unlabelled);

await done();
