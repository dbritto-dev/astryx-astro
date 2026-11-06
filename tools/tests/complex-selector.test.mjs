#!/usr/bin/env node
/**
 * ComplexSelector: combobox trigger with a dialog popup (aria-haspopup=dialog,
 * aria-expanded, aria-controls → content), click / ArrowDown open, initial focus in the
 * content, Escape + focus return, the commit protocol (data-ax-commit / -label / data-ax-close,
 * astryx-commit, el.commit) → astryx-change + trigger text + aria-checked/pressed sync,
 * disabled blocks opening, caller trigger slot (renderTrigger).
 *   node tools/tests/complex-selector.test.mjs
 */
import {setup, isOpen, activeId, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('complex-selector');

const attr = (sel, name) => page.getAttribute(sel, name);
const layerOf = (id) => page.evaluate((i) => '#' + document.getElementById(i).closest('ax-complex-selector').getAttribute('data-ax-layer'), id);
await page.evaluate(() => {
  window.__changes = [];
  document.addEventListener('astryx-change', (e) => { if (e.target.matches('ax-complex-selector')) window.__changes.push(e.detail.value); });
});
const lastChange = () => page.evaluate(() => window.__changes.at(-1));
// Close the open-by-default popup first.
await page.keyboard.press('Escape');

const T = '#cs-colour';
const L = await layerOf('cs-colour');
console.log('Server markup');
check('trigger: button role=combobox aria-haspopup=dialog', (await attr(T, 'role')) === 'combobox' && (await attr(T, 'aria-haspopup')) === 'dialog');
check('aria-controls → content inside the dialog', await page.evaluate((s) => {
  const c = document.getElementById(document.querySelector(s).getAttribute('aria-controls'));
  return !!c && c.closest('[role="dialog"]') != null;
}, T));
check('dialog named by the label, aria-modal', (await attr(`${L} [role="dialog"]`, 'aria-label')) === 'Accent colour' && (await attr(`${L} [role="dialog"]`, 'aria-modal')) === 'true');
check('trigger labelled by the field label', await page.evaluate((s) => document.getElementById(document.querySelector(s).getAttribute('aria-labelledby'))?.textContent.includes('Accent colour'), T));

console.log('Open / commit / close');
await page.click(T);
await sleep(100);
check('click opens', await isOpen(page, L));
check('aria-expanded true', (await attr(T, 'aria-expanded')) === 'true');
check('focus moves into the content', await page.evaluate((l) => document.querySelector(l).contains(document.activeElement), L));
check('chevron expanded', (await page.evaluate((s) => document.querySelector(s).closest('ax-complex-selector').querySelector('.astryx-complex-selector-indicator-icon').dataset.state, T)) === 'expanded');
await page.click(`${L} [aria-label="Purple"]`);
await sleep(80);
check('data-ax-commit commits (astryx-change {value})', (await lastChange()) === 'purple');
check('data-ax-commit-label updates the trigger', (await page.evaluate((s) => document.querySelector(s).textContent.trim(), T)) === 'Purple');
check('data-ax-close closes', !(await isOpen(page, L)));
check('focus returns to the trigger', (await activeId(page)) === 'cs-colour');
check('aria-checked follows the value', (await attr(`${L} [aria-label="Purple"]`, 'aria-checked')) === 'true' && (await attr(`${L} [aria-label="Teal"]`, 'aria-checked')) === 'false');
check('el.value', (await page.evaluate((s) => document.querySelector(s).closest('ax-complex-selector').value, T)) === 'purple');

await page.focus(T);
await page.keyboard.press('ArrowDown');
await sleep(80);
check('ArrowDown opens', await isOpen(page, L));
await page.keyboard.press('Escape');
await sleep(80);
check('Escape closes, focus back', !(await isOpen(page, L)) && (await activeId(page)) === 'cs-colour');

console.log('Matrix: commit without closing, astryx-commit, el.commit');
const M = '#cs-matrix';
const ML = await layerOf('cs-matrix');
await page.click(M);
await sleep(80);
await page.click(`${ML} [aria-label="Apple, Green"]`);
await sleep(40);
check('commit keeps the popup open without data-ax-close', await isOpen(page, ML));
check('object value', JSON.stringify(await lastChange()) === JSON.stringify({fruit: 'Apple', ripeness: 'Green'}));
check('aria-pressed follows the value', (await attr(`${ML} [aria-label="Apple, Green"]`, 'aria-pressed')) === 'true' && (await attr(`${ML} [aria-label="Mango, Ripe"]`, 'aria-pressed')) === 'false');
await page.evaluate((l) => document.querySelector(`${l} [aria-label="Banana, Ripe"]`).dispatchEvent(new CustomEvent('astryx-commit', {bubbles: true, detail: {value: {fruit: 'Banana', ripeness: 'Ripe'}, label: 'Banana · Ripe', close: true}})), ML);
await sleep(60);
check('astryx-commit from content commits and closes', !(await isOpen(page, ML)) && (await page.evaluate((s) => document.querySelector(s).textContent.trim(), M)) === 'Banana · Ripe');
await page.evaluate((s) => document.querySelector(s).closest('ax-complex-selector').commit({fruit: 'Mango', ripeness: 'Overripe'}, {label: 'Mango · Overripe'}), M);
check('el.commit', (await page.evaluate((s) => document.querySelector(s).textContent.trim(), M)) === 'Mango · Overripe');

console.log('Disabled');
const D = '#cs-disabled';
check('disabled: aria-disabled, focusable', (await attr(D, 'aria-disabled')) === 'true' && (await attr(D, 'disabled')) == null);
await page.click(D, {force: true});
await page.focus(D);
await page.keyboard.press('ArrowDown');
await sleep(60);
check('disabled never opens', !(await isOpen(page, await layerOf('cs-disabled'))));

console.log('Caller trigger (renderTrigger)');
const C = '#cs-custom';
check('caller button becomes the combobox named by the label', (await attr(C, 'role')) === 'combobox' && (await attr(C, 'aria-haspopup')) === 'dialog' && (await attr(C, 'aria-label')) === 'Assignee');
const CL = await layerOf('cs-custom');
await page.click(C);
await sleep(80);
check('caller trigger opens the popup', await isOpen(page, CL));
check('aria-expanded synced on the caller trigger', (await attr(C, 'aria-expanded')) === 'true');
await page.click(`${CL} [data-ax-commit]`);
await sleep(80);
check('commit from a caller-trigger popup', (await lastChange()) === 'ada' && !(await isOpen(page, CL)));

await done();
