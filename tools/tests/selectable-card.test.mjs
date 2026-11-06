#!/usr/bin/env node
/**
 * SelectableCard: native input keyboard (Space, Enter), whole-surface click, nested links,
 * :has(:checked) styling + data-selected sync, astryx-change, disabled, radio sets, focus ring.
 *   node tools/tests/selectable-card.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('selectable-card');

const card = (id) => page.evaluate((id) => {
  const el = document.getElementById(id);
  const input = el.querySelector(':scope > input');
  const cs = getComputedStyle(el);
  return {
    checked: input.checked, selected: el.dataset.selected, shadow: cs.boxShadow, border: cs.borderTopColor,
    outline: cs.outlineStyle, focused: document.activeElement === input, type: input.type,
    label: input.getAttribute('aria-label'), classes: el.className,
  };
}, id);
await page.evaluate(() => {
  window.__changes = [];
  document.addEventListener('astryx-change', (e) => window.__changes.push(`${e.target.id}:${e.detail.isSelected}`));
});
const changes = () => page.evaluate(() => window.__changes.splice(0));

console.log('Markup');
let c = await card('sel-pro');
check('Card + selectable-card hooks, native checkbox named by label', c.classes.includes('astryx-card') && c.classes.includes('astryx-selectable-card') && c.type === 'checkbox' && c.label === 'Pro plan');
check('SSR isSelected → checked, data-selected="true", inset ring', c.checked && c.selected === 'true' && c.shadow.includes('inset'), JSON.stringify(c));
c = await card('sel-starter');
check('unselected → data-selected="false", no ring', !c.checked && c.selected === 'false' && !c.shadow.includes('inset'));

console.log('Keyboard via the native input');
await page.focus('#docs-mode');
await page.keyboard.press('Tab');
c = await card('sel-starter');
check('Tab reaches the hidden input', c.focused);
check('the card paints the focus ring (focus-within)', c.outline !== 'none', c.outline);
await page.keyboard.press('Space');
c = await card('sel-starter');
check('Space toggles on: :checked ring + data-selected', c.checked && c.selected === 'true' && c.shadow.includes('inset'), JSON.stringify(c));
check('astryx-change {isSelected: true}', (await changes()).join() === 'sel-starter:true');
await page.keyboard.press('Enter');
c = await card('sel-starter');
check('Enter toggles off', !c.checked && c.selected === 'false');
check('astryx-change {isSelected: false}', (await changes()).join() === 'sel-starter:false');

console.log('Pointer');
await page.click('#sel-starter p');
check('a click anywhere on the surface toggles', (await card('sel-starter')).checked);
await page.click('#sel-starter p');
check('a second click toggles back', !(await card('sel-starter')).checked);
await changes();
const outerClicks = await page.evaluate(() => new Promise((resolve) => {
  let n = 0;
  const count = () => { n++; };
  document.body.addEventListener('click', count);
  document.querySelector('#sel-starter p').click();
  setTimeout(() => { document.body.removeEventListener('click', count); resolve(n); }, 50);
}));
check('the surface click stops; one click (the input\'s) reaches the page', outerClicks === 1, String(outerClicks));
await page.click('#sel-starter p');
await page.click('#sel-nested-link');
check('a nested link does not toggle', !(await card('sel-nested')).checked);

console.log('Disabled');
await page.click('#sel-enterprise p', {force: true});
c = await card('sel-enterprise');
check('a click does not toggle a disabled card', !c.checked);
await page.focus('#sel-enterprise input');
await page.keyboard.press('Space');
await page.keyboard.press('Enter');
c = await card('sel-enterprise');
check('Space / Enter do not toggle; the input stays focusable', !c.checked && c.focused, JSON.stringify(c));
check('dimmed', (await page.evaluate(() => getComputedStyle(document.getElementById('sel-enterprise')).opacity)) === '0.5');
check('no change events from the disabled card', !(await changes()).some((e) => e.startsWith('sel-enterprise')));

console.log('Radio set (port extension)');
await page.click('#sel-express p');
const radios = await page.evaluate(() => ['sel-standard', 'sel-express'].map((id) => document.getElementById(id).dataset.selected).join());
check('choosing express deselects standard (data-selected synced)', radios === 'false,true', radios);
await page.click('#sel-express p');
check('a radio card never deselects itself', (await card('sel-express')).checked);
check('the form submits the choice', (await page.evaluate(() => new FormData(document.getElementById('sel-form')).get('shipping'))) === 'express');

await done();
