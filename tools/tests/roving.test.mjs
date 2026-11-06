#!/usr/bin/env node
/**
 * Runtime singletons other components build on: roving focus (arrows, Home/End, wrap,
 * disabled skipped, RTL, one tab stop), typeahead, modality, disabled interaction, announce.
 *   node tools/tests/roving.test.mjs
 */
import {setup, activeId, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('layer');

const focusedText = () => page.evaluate(() => document.activeElement?.textContent?.trim());
const tabindexes = (sel) => page.evaluate((s) => [...document.querySelectorAll(`${s} button, ${s} [role="menuitem"]`)].map((b) => b.getAttribute('tabindex')).join(''), sel);

console.log('Roving tabindex (LTR toolbar)');
check('one tab stop on load', (await tabindexes('#roving-ltr')) === '0-1-1-1');
await page.focus('#roving-ltr button:first-child');
await page.keyboard.press('ArrowRight');
check('ArrowRight → next', (await focusedText()) === 'Italic');
await page.keyboard.press('ArrowRight');
check('aria-disabled item skipped', (await focusedText()) === 'Strike');
check('tab stop follows focus', (await tabindexes('#roving-ltr')) === '-1-1-10');
await page.keyboard.press('ArrowRight');
check('wraps to the first item', (await focusedText()) === 'Bold');
await page.keyboard.press('ArrowLeft');
check('ArrowLeft wraps to the last', (await focusedText()) === 'Strike');
await page.keyboard.press('Home');
check('Home → first', (await focusedText()) === 'Bold');
await page.keyboard.press('End');
check('End → last enabled', (await focusedText()) === 'Strike');
await page.keyboard.press('ArrowDown');
check('vertical arrows ignored in a horizontal list', (await focusedText()) === 'Strike');
await page.keyboard.press('Shift+Tab');
await page.keyboard.press('Tab');
check('Tab returns to the last focused item (single tab stop)', (await focusedText()) === 'Strike');
await page.click('#roving-ltr button:nth-child(2)');
check('a click moves the tab stop', (await tabindexes('#roving-ltr')) === '-10-1-1');

console.log('RTL');
await page.focus('#roving-rtl button:first-child');
await page.keyboard.press('ArrowLeft');
check('ArrowLeft moves forward in RTL', (await focusedText()) === 'שתיים');
await page.keyboard.press('ArrowRight');
check('ArrowRight moves back in RTL', (await focusedText()) === 'אחד');
await page.keyboard.press('ArrowRight');
check('wrap=false stops at the start', (await focusedText()) === 'אחד');
await page.keyboard.press('End');
await page.keyboard.press('ArrowLeft');
check('wrap=false stops at the end', (await focusedText()) === 'שלוש');

console.log('Vertical menu with typeahead');
await page.focus('#roving-menu [role="menuitem"]');
await page.keyboard.press('ArrowDown');
check('ArrowDown → next', (await focusedText()) === 'Banana');
await page.keyboard.press('c');
check('typeahead "c" → Cherry', (await focusedText()) === 'Cherry');
await sleep(800);
await page.keyboard.press('b');
check('typeahead "b" from Cherry wraps to Banana', (await focusedText()) === 'Banana');
await page.keyboard.press('b');
check('repeating "b" cycles to Blueberry', (await focusedText()) === 'Blueberry');
await sleep(800);
await page.keyboard.type('ap');
check('"ap" → Apple', (await focusedText()) === 'Apple');

console.log('Modality');
await page.mouse.click(1000, 860);
check('pointer press → data-astryx-modality=pointer', (await page.getAttribute('html', 'data-astryx-modality')) === 'pointer');
await page.keyboard.down('Control');
await page.keyboard.press('KeyA');
await page.keyboard.up('Control');
check('a Ctrl chord keeps pointer', (await page.getAttribute('html', 'data-astryx-modality')) === 'pointer');
await page.keyboard.press('ArrowDown');
check('key press → keyboard', (await page.getAttribute('html', 'data-astryx-modality')) === 'keyboard');

console.log('Disabled interaction (aria-disabled)');
const disabled = await page.evaluate(() => {
  const b = document.querySelector('#roving-ltr [aria-disabled="true"]');
  let clicks = 0;
  b.addEventListener('click', () => { clicks++; });
  b.click();
  const ev = new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true});
  b.dispatchEvent(ev);
  return {clicks, enterPrevented: ev.defaultPrevented};
});
check('a click on an aria-disabled control never reaches its handlers', disabled.clicks === 0);
check('Enter on an aria-disabled control is cancelled', disabled.enterPrevented);

console.log('Announce routing (a pinned InfoTip inside a modal dialog)');
await open('info-tip');
const routed = await page.evaluate(async () => {
  const dialog = document.createElement('dialog');
  const btn = document.querySelector('#infotip-metric');
  const tip = document.getElementById(btn.getAttribute('data-ax-tooltip'));
  dialog.append(btn, tip);
  document.body.append(dialog);
  dialog.showModal();
  // Moving the tooltip reconnects it; its InfoTip wiring runs in a microtask.
  await new Promise((r) => setTimeout(r, 20));
  btn.focus();
  btn.click();
  await new Promise((r) => setTimeout(r, 100));
  const inDialog = dialog.querySelector(':scope > [data-astryx-modal-live-region="polite"]')?.textContent ?? '';
  return {inDialog};
});
check('an announcement inside an open modal goes to the modal\'s own region', routed.inDialog.includes('30-day'), JSON.stringify(routed));

await done();
