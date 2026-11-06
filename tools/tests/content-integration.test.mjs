#!/usr/bin/env node
/**
 * Integration of the content batch with the shared runtime and the Button family (system
 * Chrome, built docs — `cd apps/docs && npx astro build` first):
 *   - Avatar / AvatarGroupOverflow `isClickable` → `astryx-click` {event};
 *   - Thumbnail `isClickable` / `isRemovable` → `astryx-click` / `astryx-remove` {event} on the
 *     root; Remove stops at the button; inert Open / Remove cancel click and Enter/Space;
 *     Remove is a real secondary sm icon-only Button (20px, overlay scrim);
 *   - AvatarGroup roving over `[data-avatar-item]` (one tab stop, arrows, Home/End, wrap);
 *   - runtime disabled interaction: covers opt-in `data-ax-disabled-interaction` elements and
 *     never swallows clicks inside an aria-disabled group;
 *   - Spinner inserted after load speaks through the runtime polite region (label, else name);
 *     server-rendered spinners stay silent;
 *   - Popover's fallback close is a real secondary Button that closes the popover.
 *   node tools/tests/content-integration.test.mjs
 */
import {setup, sleep, isOpen} from './_harness.mjs';

const {page, check, open, done} = await setup();

const record = (rootSel, names) => page.evaluate(([sel, evs]) => {
  window.__events = [];
  const root = document.querySelector(sel);
  for (const name of evs) {
    document.addEventListener(name, (e) => {
      if (root.contains(e.target) || e.target === root) {
        window.__events.push({name, target: e.target.className || e.target.tagName, bubbles: e.bubbles, composed: e.composed, isMouse: e.detail?.event instanceof MouseEvent});
      }
    });
  }
}, [rootSel, names]);
const events = () => page.evaluate(() => window.__events);
const reset = () => page.evaluate(() => { window.__events = []; });

console.log('Avatar');
await open('avatar');
const clickable = '.demo [data-case="clickable"]';
const av = await page.$eval(clickable, (el) => ({tag: el.tagName, type: el.getAttribute('type'), hook: el.hasAttribute('data-ax-click-event')}));
check('isClickable renders <button type="button">', av.tag === 'BUTTON' && av.type === 'button' && av.hook, JSON.stringify(av));
await record(clickable, ['astryx-click']);
await page.click(clickable);
let ev = await events();
check('a click dispatches astryx-click {event: MouseEvent} (bubbles, composed)', ev.length === 1 && ev[0].isMouse && ev[0].bubbles && ev[0].composed, JSON.stringify(ev));
const plainLink = await page.$eval('.demo a.astryx-avatar', (el) => el.hasAttribute('data-ax-click-event'));
check('a link avatar without isClickable dispatches nothing extra', !plainLink);

console.log('AvatarGroup');
await open('avatar-group');
const group = '[data-test="avatar-group-interactive"] .astryx-avatar-group';
const items = () => page.$$eval(`${group} [data-avatar-item]`, (els) => els.map((e) => e.getAttribute('tabindex')).join(','));
const roving = await page.$eval(group, (el) => ({o: el.getAttribute('data-astryx-roving'), items: el.getAttribute('data-astryx-roving-items')}));
check('roving hook: horizontal over [data-avatar-item]', roving.o === 'horizontal' && roving.items === '[data-avatar-item]', JSON.stringify(roving));
check('one tab stop on load', (await items()) === '0,-1,-1,-1', await items());
const focusedName = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
await page.focus(`${group} [data-avatar-item]`);
await page.keyboard.press('ArrowRight');
check('ArrowRight → next avatar', (await focusedName()) === 'Grace Hopper');
await page.keyboard.press('End');
check('End → the overflow button', (await focusedName()) === '4 more');
await page.keyboard.press('ArrowRight');
check('wraps to the first', (await focusedName()) === 'Ada Lovelace');
await page.keyboard.press('ArrowLeft');
check('ArrowLeft wraps to the last', (await focusedName()) === '4 more');
check('the tab stop follows focus', (await items()) === '-1,-1,-1,0', await items());
await record(group, ['astryx-click']);
await page.keyboard.press('Enter');
ev = await events();
check('AvatarGroupOverflow isClickable: Enter dispatches astryx-click', ev.length === 1 && ev[0].isMouse, JSON.stringify(ev));
const staticGroup = await page.$eval('.demo .astryx-avatar-group', (el) => el.hasAttribute('data-astryx-roving'));
check('a group without interactive members has no roving', !staticGroup);

console.log('Thumbnail');
await open('thumbnail');
const thumb = '.astryx-thumbnail[aria-label="night.png — Night sky"]';
const rm = await page.$eval(`${thumb} .ax-thumbnail-remove`, (el) => {
  const cs = getComputedStyle(el);
  const probe = document.createElement('span');
  probe.style.backgroundColor = 'var(--color-overlay)';
  el.parentElement.append(probe);
  const scrim = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return {cls: el.className, variant: el.dataset.variant, size: el.dataset.size, iconOnly: el.hasAttribute('data-ax-icon-only'), h: Math.round(el.getBoundingClientRect().height), w: Math.round(el.getBoundingClientRect().width), bg: cs.backgroundColor, scrim, icon: el.querySelector('.astryx-icon')?.dataset.size};
});
check('Remove is a secondary sm icon-only Button (20×20, overlay scrim, xsm close icon)',
  rm.cls.includes('astryx-button') && rm.variant === 'secondary' && rm.size === 'sm' && rm.iconOnly && rm.h === 20 && rm.w === 20 && rm.bg === rm.scrim && rm.icon === 'xsm', JSON.stringify(rm));
await record(thumb, ['astryx-click', 'astryx-remove']);
await page.evaluate((s) => {
  window.__openClicks = 0;
  document.querySelector(`${s} .ax-thumbnail-open`).addEventListener('click', () => window.__openClicks++);
}, thumb);
await page.click(`${thumb} .ax-thumbnail-open`, {position: {x: 10, y: 50}});
ev = await events();
check('Open dispatches astryx-click {event} on the thumbnail root', ev.length === 1 && ev[0].name === 'astryx-click' && ev[0].isMouse && String(ev[0].target).includes('astryx-thumbnail'), JSON.stringify(ev));
await reset();
await page.hover(`${thumb} .ax-thumbnail-media`);
await page.click(`${thumb} .ax-thumbnail-remove`);
ev = await events();
const openClicks = await page.evaluate(() => window.__openClicks);
check('Remove dispatches astryx-remove {event} only; its click never reaches Open', ev.length === 1 && ev[0].name === 'astryx-remove' && ev[0].isMouse && openClicks === 1, JSON.stringify({ev, openClicks}));

const loading = '.astryx-thumbnail[aria-label="processing.png — Processing"]';
await record(loading, ['astryx-click', 'astryx-remove']);
await page.focus(`${loading} .ax-thumbnail-open`);
await page.keyboard.press('Enter');
await page.keyboard.press('Space');
await page.$eval(`${loading} .ax-thumbnail-open`, (el) => el.click());
ev = await events();
check('loading: the inert Open cancels click, Enter and Space (no astryx-click)', ev.length === 0, JSON.stringify(ev));
const loadingFocus = await page.$eval(`${loading} .ax-thumbnail-open`, (el) => document.activeElement === el);
check('loading: the inert Open keeps focus', loadingFocus);
await page.focus(`${loading} .ax-thumbnail-remove`);
await page.keyboard.press('Enter');
ev = await events();
check('loading: Remove still acts (astryx-remove)', ev.length === 1 && ev[0].name === 'astryx-remove', JSON.stringify(ev));

const disabled = '.astryx-thumbnail[aria-label="abstract.png — Abstract"]';
await record(disabled, ['astryx-click', 'astryx-remove']);
await page.focus(`${disabled} .ax-thumbnail-remove`);
await page.keyboard.press('Enter');
await page.keyboard.press('Space');
await page.$eval(`${disabled} .ax-thumbnail-remove`, (el) => el.click());
await page.$eval(`${disabled} .ax-thumbnail-open`, (el) => el.click());
ev = await events();
check('disabled: Remove and Open are inert (Enter, Space, click)', ev.length === 0, JSON.stringify(ev));

console.log('Runtime disabled interaction');
await open('button');
const guard = await page.evaluate(() => {
  const counts = {groupChild: 0, optIn: 0};
  const groupEl = document.createElement('div');
  groupEl.setAttribute('role', 'group');
  groupEl.setAttribute('aria-disabled', 'true');
  const child = document.createElement('button');
  child.textContent = 'inside';
  child.addEventListener('click', () => counts.groupChild++);
  groupEl.append(child);
  const optIn = document.createElement('span');
  optIn.setAttribute('aria-disabled', 'true');
  optIn.setAttribute('data-ax-disabled-interaction', '');
  optIn.addEventListener('click', () => counts.optIn++);
  document.body.append(groupEl, optIn);
  child.click();
  optIn.click();
  groupEl.remove();
  optIn.remove();
  return counts;
});
check('an aria-disabled group does not swallow its content\'s clicks', guard.groupChild === 1, JSON.stringify(guard));
check('an opt-in data-ax-disabled-interaction element is inert while aria-disabled', guard.optIn === 0, JSON.stringify(guard));

console.log('Spinner');
await open('spinner');
const polite = () => page.evaluate(() => [...document.querySelectorAll('[data-astryx-live-region="polite"]')].map((r) => r.textContent).join('|'));
const atLoad = await polite();
check('server-rendered spinners are silent at load', !atLoad.includes('Loading'), atLoad);
const hidden = await page.$eval('.demo [aria-hidden="true"].astryx-spinner, .demo .astryx-spinner[aria-hidden="true"]', (el) => el.hasAttribute('data-ax-announce-rendered-text'));
check('an aria-hidden (composed) spinner does not opt into announcing', !hidden);
await page.click('[data-test="spinner-insert"] [data-insert]');
await sleep(120);
const spoken = await polite();
check('spinners inserted after load are announced once, politely (label, else the name)', spoken === 'Loading comments Loading', spoken);

console.log('Popover fallback close');
await open('popover');
await page.click('#pop-basic-trigger');
await sleep(80);
const close = await page.$eval('#pop-basic [data-astryx-popover-fallback-close] > *', (el) => ({tag: el.tagName, cls: el.className, variant: el.dataset.variant, size: el.dataset.size, target: el.getAttribute('popovertarget'), action: el.getAttribute('popovertargetaction'), text: el.textContent.trim()}));
check('the fallback close is a secondary md Button with popovertarget hide', close.tag === 'BUTTON' && close.cls.includes('astryx-button') && close.variant === 'secondary' && close.size === 'md' && close.target === 'pop-basic' && close.action === 'hide' && close.text === 'Close popover', JSON.stringify(close));
await page.focus('#pop-basic [data-astryx-popover-fallback-close] > button');
await page.keyboard.press('Enter');
await sleep(80);
check('activating it closes the popover', !(await isOpen(page, '#pop-basic')));

await done();
