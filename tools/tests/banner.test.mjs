#!/usr/bin/env node
/**
 * Banner (<ax-banner>) against the built docs.
 * Covers: disclosure ARIA (aria-expanded, aria-controls only while shown, translated
 * Expand/Collapse names), toggling by click and keyboard, astryx-open-change, defaultIsOpen
 * and collapsible={false}, header radius follows the content, dismiss (hidden, astryx-dismiss,
 * focus back to its origin), the titled dismiss name, caller-supplied role, edge compensation.
 */
import {setup} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('banner');
await page.waitForFunction(() => {
  const Banner = customElements.get('ax-banner');
  return Banner && ['banner-expand', 'banner-open', 'banner-dismiss'].every((id) => document.getElementById(id) instanceof Banner);
});
// Wait (bounded) for the state an action should produce before the checks read it: under load
// a read can land before the element has handled the input. A timeout leaves the checks to fail.
const until = (fn, arg) => page.waitForFunction(fn, arg, {timeout: 5000}).then(() => true, () => false);
const expandedIs = (id, value) => until(([i, v]) => document.querySelector(`#${i} [data-ax-banner-toggle]`)?.getAttribute('aria-expanded') === v, [id, value]);
const eventCount = (n) => until((count) => window.__events.length >= count, n);
// Only the banners' own events: the toggle and dismiss IconButtons' tooltips also bubble
// `astryx-open-change`, on their own timers (200 ms hover delay, 100 ms hide bridge after focus
// leaves), so under load one of theirs could land in any read and break the counts.
await page.evaluate(() => {
  window.__events = [];
  for (const type of ['astryx-open-change', 'astryx-dismiss']) {
    document.addEventListener(type, (e) => {
      if (e.target.localName === 'ax-banner') window.__events.push({type, id: e.target.id, detail: e.detail});
    });
  }
});
const events = () => page.evaluate(() => window.__events.splice(0));
const state = (id) => page.$eval(`#${id}`, (el) => {
  const toggle = el.querySelector('[data-ax-banner-toggle]');
  const content = el.querySelector('.astryx-banner-content');
  return {
    expanded: toggle?.getAttribute('aria-expanded') ?? null,
    controls: toggle?.getAttribute('aria-controls') ?? null,
    label: toggle?.getAttribute('aria-label') ?? null,
    hidden: content?.hidden ?? null,
    contentId: content?.id ?? null,
    radius: getComputedStyle(el.querySelector('.astryx-banner')).borderEndStartRadius,
  };
});

let s = await state('banner-expand');
check('collapsed by default: aria-expanded=false, content hidden, no aria-controls', s.expanded === 'false' && s.hidden === true && s.controls === null, JSON.stringify(s));
check('collapsed: translated "Expand" name', s.label === 'Expand');
check('collapsed card: header keeps all corners', s.radius !== '0px');
await page.click('#banner-expand [data-ax-banner-toggle]');
await expandedIs('banner-expand', 'true');
await eventCount(1);
s = await state('banner-expand');
check('click expands: aria-expanded=true, content shown, aria-controls → region', s.expanded === 'true' && s.hidden === false && s.controls === s.contentId && s.contentId, JSON.stringify(s));
check('expanded: "Collapse" name; header loses its bottom radius', s.label === 'Collapse' && s.radius === '0px', JSON.stringify(s));
let e = await events();
check('astryx-open-change {isOpen: true}', e.length === 1 && e[0].type === 'astryx-open-change' && e[0].detail.isOpen === true, JSON.stringify(e));
check('chevron turns', await page.$eval('#banner-expand .ax-banner-chevron', (el) => getComputedStyle(el).transform !== 'none'));
await page.focus('#banner-expand [data-ax-banner-toggle]');
await page.keyboard.press('Enter');
await expandedIs('banner-expand', 'false');
await eventCount(1);
s = await state('banner-expand');
check('Enter collapses again', s.expanded === 'false' && s.hidden === true && s.controls === null, JSON.stringify(s));
e = await events();
check('astryx-open-change {isOpen: false}', e.length === 1 && e[0].detail.isOpen === false);

s = await state('banner-open');
check('defaultIsOpen: starts expanded with aria-controls', s.expanded === 'true' && s.hidden === false && s.controls === s.contentId, JSON.stringify(s));
check('collapsible={false}: no toggle, content always visible', await page.$eval('#banner-pinned', (el) => !el.querySelector('[data-ax-banner-toggle]') && !el.querySelector('.astryx-banner-content').hidden));

// Dismiss: focus returns to where it came from.
const dismiss = '#banner-dismiss [data-ax-banner-dismiss]';
check('dismiss name: "Dismiss {title}"', await page.$eval(dismiss, (b) => b.getAttribute('aria-label') === 'Dismiss Payment failed'));
check('caller-supplied role is kept', await page.$eval('#banner-dismiss', (el) => el.getAttribute('role') === 'alert'));
await page.focus('[data-test="before"]');
await page.keyboard.press('Tab'); // Retry
await page.keyboard.press('Tab'); // dismiss
await until(() => document.activeElement?.hasAttribute('data-ax-banner-dismiss'));
check('Tab reaches the dismiss button', await page.evaluate(() => document.activeElement?.hasAttribute('data-ax-banner-dismiss')));
await page.keyboard.press('Enter');
await until(() => document.getElementById('banner-dismiss').hidden);
await eventCount(1);
check('dismiss hides the banner', await page.$eval('#banner-dismiss', (el) => el.hidden && el.getBoundingClientRect().height === 0));
check('focus returns to the focus origin', await page.evaluate(() => document.activeElement?.getAttribute('data-test') === 'before'));
e = await events();
check('astryx-dismiss dispatched', e.length === 1 && e[0].type === 'astryx-dismiss' && e[0].id === 'banner-dismiss', JSON.stringify(e));

// Programmatic API.
await page.evaluate(() => document.getElementById('banner-expand').open());
s = await state('banner-expand');
check('API open(): expanded without an event', s.expanded === 'true' && (await events()).length === 0);

// Edge compensation: a ghost button at the end pulls the end area out by spacing-2.
check('edge compensation on the end area', await page.$eval('#banner-expand .ax-banner-end', (el) => getComputedStyle(el).marginInlineEnd.startsWith('-')));
check('theme hooks: frame/header/content data attributes', await page.$eval('#banner-open', (el) =>
  el.matches('.astryx-banner-frame[data-container="card"][data-elevation="none"]') &&
  !!el.querySelector('.astryx-banner[data-status="info"][data-container="card"]') &&
  !!el.querySelector('.astryx-banner-content[data-status="info"]') &&
  !!el.querySelector('.astryx-icon.astryx-banner-icon[data-status="info"]')));

await done();
