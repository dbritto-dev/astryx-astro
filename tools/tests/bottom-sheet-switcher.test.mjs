#!/usr/bin/env node
/**
 * BottomSheetSwitcher: one active step, the handoff (retained → aligning → fading, one scrim),
 * focus into the next step and back to the flow's opener, the step's purpose deciding
 * dismissal (Escape closes a form step; its scrim does not), `astryx-active-sheet-change`,
 * the `activeSheet` property, and a no-scrim flow.
 *   node tools/tests/bottom-sheet-switcher.test.mjs
 */
import {setup, sleep, activeId} from './_harness.mjs';

const {page, check, open, done} = await setup({height: 800, reducedMotion: 'no-preference'});
await open('bottom-sheet-switcher');

const state = (id) => page.evaluate((i) => {
  const d = document.getElementById(i);
  let popover = false;
  try { popover = d.matches(':popover-open'); } catch {}
  const p = d.querySelector('.astryx-bottom-sheet');
  return {open: d.open || popover, modal: d.matches(':modal'), inert: d.hasAttribute('inert'), replaced: p.getAttribute('data-sheet-replaced'), scrim: d.style.getPropertyValue('--_sheet-scrim-opacity')};
}, id);
const active = () => page.evaluate(() => document.getElementById('sw-flow').activeSheet);
const label = () => page.textContent('#sw-state');
const inside = (id) => page.evaluate((i) => document.getElementById(i).contains(document.activeElement), id);
const vw = await page.evaluate(() => innerWidth);

console.log('Server wiring');
check('steps are standalone dialogs with their sheetId', (await page.getAttribute('ax-bottom-sheet:has(#sw-details)', 'data-ax-sheet-id')) === 'details');
check('closed flow: no step open, no activeSheet', !(await state('sw-details')).open && (await active()) === null);

console.log('Opening the flow');
await page.click('#sw-trigger');
await sleep(500);
check('the first step opens modally', (await state('sw-details')).modal);
check('activeSheet follows (event)', (await active()) === 'details' && (await label()) === 'activeSheet: details');
check('focus moved into the step', await inside('sw-details'));

console.log('Handoff');
await page.click('#sw-continue');
await sleep(60);
let a = await state('sw-details');
let b = await state('sw-confirm');
check('the next step enters above; the previous is retained, inert', b.open && a.open && a.inert && a.replaced != null, JSON.stringify({a, b}));
check('one scrim: the retained step keeps it', a.scrim === '1' && b.scrim === '0', `${a.scrim}/${b.scrim}`);
check('the taller step moves down to meet the shorter one', a.replaced === 'aligning', a.replaced);
check('focus is in the entering step', await inside('sw-confirm'));
check('activeSheet = confirm', (await active()) === 'confirm' && (await label()) === 'activeSheet: confirm');
await sleep(900);
a = await state('sw-details');
b = await state('sw-confirm');
check('after the motions the previous step fades out and closes; the scrim is handed over', !a.open && b.open && b.scrim === '1', JSON.stringify({a, b}));

console.log('Purpose of the active step');
await page.mouse.click(vw / 2, 20);
await sleep(200);
check('form step: a scrim press does not close the flow', (await state('sw-confirm')).open && (await active()) === 'confirm');
await page.keyboard.press('Escape');
await sleep(700);
check('form step: Escape closes the flow', !(await state('sw-confirm')).open && (await active()) === null && (await label()) === 'activeSheet: null');
check('focus returns to the flow’s opener', (await activeId(page)) === 'sw-trigger');

console.log('activeSheet property + data-ax-switch-to');
await page.evaluate(() => { document.getElementById('sw-flow').activeSheet = 'confirm'; });
await sleep(500);
check('setting activeSheet opens that step', (await state('sw-confirm')).open && !(await state('sw-details')).open);
await page.click('#sw-back');
await sleep(900);
check('Back (data-ax-switch-to) hands off to the first step', (await state('sw-details')).open && !(await state('sw-confirm')).open && (await active()) === 'details');
await page.mouse.click(vw / 2, 20);
await sleep(700);
check('info step: a scrim press closes the flow', !(await state('sw-details')).open && (await active()) === null);

console.log('No-scrim flow');
await page.click('#sw-plain-trigger');
await sleep(500);
let pick = await state('sw-plain-pick');
check('a no-scrim step is a manual popover, not modal', pick.open && !pick.modal);
await page.click('#sw-plain-pick [data-ax-switch-to="done"]');
await sleep(900);
check('steps hand off without a scrim', !(await state('sw-plain-pick')).open && (await page.evaluate(() => document.querySelector('#sw-plain [data-ax-sheet-id="done"]').isOpen)));
await page.click('#sw-plain [data-ax-sheet-id="done"] [data-ax-switch-to=""]');
await sleep(700);
check('the no-scrim flow closes', !(await page.evaluate(() => document.querySelector('#sw-plain [data-ax-sheet-id="done"]').isOpen)));

await done();
