#!/usr/bin/env node
/**
 * MoreMenu: the "…" icon-only trigger (translated label as aria-label + tooltip), the menu
 * theme hooks, alignment end, explicit sizes, a size inherited from a Toolbar reaching the rows,
 * the disabled trigger (aria-disabled: no click / Enter / ArrowDown open), data sections.
 *   node tools/tests/more-menu.test.mjs
 */
import {setup, isOpen, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('more-menu');

const t = (id) => `[data-testid="${id}"]`;
const layerOf = (id) => page.evaluate((s) => '#' + document.querySelector(s).getAttribute('popovertarget'), t(id));
const menuOf = (id) => page.evaluate((s) => document.querySelector(s).getAttribute('aria-controls'), t(id));

console.log('Trigger');
const trig = await page.evaluate((s) => {
  const b = document.querySelector(s);
  return {label: b.getAttribute('aria-label'), iconOnly: b.hasAttribute('data-ax-icon-only'), variant: b.getAttribute('data-variant'), tip: b.getAttribute('data-ax-tooltip'), haspopup: b.getAttribute('aria-haspopup'), text: b.querySelector('.ax-button-label')};
}, t('more-card-trigger'));
check('icon-only ghost button named "More options"', trig.label === 'More options' && trig.iconOnly && trig.variant === 'ghost' && trig.text === null);
check('the label is also its tooltip, which does not describe it', !!trig.tip && (await page.getAttribute(t('more-card-trigger'), 'aria-describedby')) == null);
check('aria-haspopup=menu', trig.haspopup === 'menu');
check('custom label', (await page.getAttribute(t('more-secondary-trigger'), 'aria-label')) === 'Row actions');

console.log('Menu');
const layer = await layerOf('more-card-trigger');
const menuId = await menuOf('more-card-trigger');
check('menu element carries astryx-more-menu + astryx-dropdown-menu', await page.evaluate((id) => {
  const m = document.getElementById(id);
  return m.classList.contains('astryx-more-menu') && m.classList.contains('astryx-dropdown-menu') && m.getAttribute('aria-label') === 'More options';
}, menuId));
await page.click(t('more-card-trigger'));
await sleep(100);
check('click opens', await isOpen(page, layer));
const tr = await page.locator(t('more-card-trigger')).boundingBox();
const lr = await page.locator(layer).boundingBox();
check('alignment end: the menu ends at the trigger\'s end', Math.abs((lr.x + lr.width) - (tr.x + tr.width)) <= 2, `${lr.x + lr.width} vs ${tr.x + tr.width}`);
check('a data section is a named group with an aria-hidden heading', await page.evaluate((id) => {
  const g = document.getElementById(id).querySelector('[role="group"]');
  const h = g?.querySelector('.astryx-dropdown-menu-section-heading');
  return g?.getAttribute('aria-label') === 'Danger zone' && h?.getAttribute('aria-hidden') === 'true';
}, menuId));
await page.keyboard.press('Escape');
await sleep(60);
check('Escape returns focus to the trigger', await page.evaluate((s) => document.activeElement === document.querySelector(s), t('more-card-trigger')));

console.log('Sizes');
for (const size of ['sm', 'md', 'lg']) {
  const id = `more-${size}-trigger`;
  const btn = await page.getAttribute(t(id), 'data-size');
  const rows = await page.evaluate((m) => [...document.getElementById(m).querySelectorAll('[data-ax-menu-row]')].map((r) => r.getAttribute('data-size')), await menuOf(id));
  check(`size ${size}: trigger and rows`, btn === size && rows.every((r) => r === size), `${btn} / ${rows.join()}`);
}
const toolbarTrigger = t('more-toolbar-trigger');
check('inside a sm Toolbar the trigger inherits sm', (await page.getAttribute(toolbarTrigger, 'data-size')) === 'sm');
await page.click(toolbarTrigger);
await sleep(100);
const tbRows = await page.evaluate((m) => [...document.getElementById(m).querySelectorAll('[data-ax-menu-row]')].map((r) => r.getAttribute('data-size')), await menuOf('more-toolbar-trigger'));
check('…and its rows follow once open (useSize)', tbRows.length > 0 && tbRows.every((r) => r === 'sm'), tbRows.join());
await page.keyboard.press('Escape');
await sleep(60);

console.log('Disabled');
const dis = t('more-disabled-trigger');
const disLayer = await layerOf('more-disabled-trigger');
check('disabled trigger uses aria-disabled (it has a tooltip)', (await page.getAttribute(dis, 'aria-disabled')) === 'true');
await page.click(dis, {force: true});
await sleep(80);
check('click does not open', !(await isOpen(page, disLayer)));
await page.focus(dis);
await page.keyboard.press('Enter');
await sleep(80);
check('Enter does not open', !(await isOpen(page, disLayer)));
await page.keyboard.press('ArrowDown');
await sleep(80);
check('ArrowDown does not open', !(await isOpen(page, disLayer)));

await done();
