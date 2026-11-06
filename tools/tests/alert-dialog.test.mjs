#!/usr/bin/env node
/**
 * AlertDialog: role and naming, Cancel takes initial focus, Escape cancels, the backdrop does
 * not dismiss, Cancel closes with focus return, astryx-action + actionLoading keep focus on the
 * action, narrow layout (action above Cancel in DOM order, vertical Stack attributes).
 *   node tools/tests/alert-dialog.test.mjs
 */
import {setup, sleep, activeId} from './_harness.mjs';

const {page, check, open, done} = await setup({height: 700});
await open('alert-dialog');

const isModal = () => page.evaluate(() => document.getElementById('alert-delete').matches(':modal'));
const focusedAttr = (attr) => page.evaluate((a) => document.activeElement?.hasAttribute(a), attr);

console.log('Semantics');
const sem = await page.evaluate(() => {
  const d = document.getElementById('alert-delete');
  return {
    role: d.getAttribute('role'),
    name: document.getElementById(d.getAttribute('aria-labelledby'))?.textContent,
    desc: document.getElementById(d.getAttribute('aria-describedby'))?.textContent,
    theme: d.classList.contains('astryx-alert-dialog') && d.classList.contains('astryx-dialog'),
    closedby: d.getAttribute('closedby'),
    cancel: d.querySelector('[data-ax-alert-cancel]')?.textContent.trim(),
  };
});
check('role="alertdialog"', sem.role === 'alertdialog');
check('named by the title', sem.name === 'Delete project?');
check('described by the consequence', sem.desc?.startsWith('The project, its 24 files'));
check('root carries astryx-dialog + astryx-alert-dialog', sem.theme);
check('purpose form: closedby="closerequest"', sem.closedby === 'closerequest');
check('Cancel label translated', sem.cancel === 'Cancel');
check('inline preview uses role="group"', (await page.evaluate(() => document.querySelector('.astryx-alert-dialog[data-ax-inline]')?.getAttribute('role'))) === 'group');

console.log('Open, initial focus, dismissal');
await page.click('#alert-delete-trigger');
await sleep(60);
check('opens modal', await isModal());
check('Cancel (least destructive) takes initial focus', await focusedAttr('data-ax-alert-cancel'));
await page.mouse.click(20, 20);
await sleep(60);
check('a backdrop press does not dismiss', await isModal());
await page.keyboard.press('Escape');
await sleep(60);
check('Escape cancels', !(await isModal()));
check('focus returns to the trigger', (await activeId(page)) === 'alert-delete-trigger');
await page.click('#alert-delete-trigger');
await sleep(60);
await page.click('#alert-delete [data-ax-alert-cancel]');
await sleep(60);
check('Cancel closes', !(await isModal()));

console.log('Action: astryx-action, actionLoading');
await page.evaluate(() => {
  window.__actions = 0;
  document.getElementById('alert-delete').parentElement.addEventListener('astryx-action', () => window.__actions++);
});
await page.click('#alert-delete-trigger');
await sleep(60);
await page.focus('#alert-delete [data-ax-alert-action]');
await page.keyboard.press('Enter');
await sleep(80);
check('astryx-action dispatched on the host', (await page.evaluate(() => window.__actions)) >= 1);
const busy = await page.evaluate(() => {
  const a = document.querySelector('#alert-delete [data-ax-alert-action]');
  return {busy: a.getAttribute('aria-busy'), disabled: a.getAttribute('aria-disabled'), focused: document.activeElement === a, spinner: !!a.querySelector('.ax-button-spinner'), host: document.getElementById('alert-delete').parentElement.actionLoading};
});
check('actionLoading swaps in the busy action (aria-busy, spinner)', busy.busy === 'true' && busy.spinner && busy.host === true, JSON.stringify(busy));
check('focus stays on the action', busy.focused);
check('the dialog stays open while the action runs', await isModal());
const before = await page.evaluate(() => window.__actions);
await page.keyboard.press('Enter');
await sleep(60);
check('a busy action ignores Enter (aria-disabled)', (await page.evaluate(() => window.__actions)) === before);
await sleep(1100);
check('the demo hides the dialog when the work settles', !(await isModal()));
check('the action is back to its idle state', (await page.evaluate(() => document.querySelector('#alert-delete [data-ax-alert-action]').getAttribute('aria-busy'))) == null);

console.log('Narrow layout (≤ 640px)');
const order = () => page.evaluate(() => {
  const row = document.querySelector('#alert-delete [data-ax-alert-actions]');
  return {first: row.firstElementChild.hasAttribute('data-ax-alert-action') ? 'action' : 'cancel', dir: row.getAttribute('data-direction'), cross: row.getAttribute('data-cross-align'), wrap: row.getAttribute('data-wrap'), stacked: row.hasAttribute('data-ax-stacked')};
});
const wide = await order();
check('wide: Cancel then the action, horizontal, end-aligned, wrapping', wide.first === 'cancel' && wide.dir === 'horizontal' && wide.wrap === 'wrap' && !wide.stacked, JSON.stringify(wide));
await page.setViewportSize({width: 480, height: 700});
await sleep(80);
const narrow = await order();
check('narrow: action above Cancel in DOM order, vertical stretched Stack', narrow.first === 'action' && narrow.dir === 'vertical' && narrow.cross === 'stretch' && narrow.wrap === 'nowrap' && narrow.stacked, JSON.stringify(narrow));
await page.click('#alert-delete-trigger');
await sleep(60);
check('narrow: Cancel still takes initial focus', await focusedAttr('data-ax-alert-cancel'));
const widths = await page.evaluate(() => [...document.querySelectorAll('#alert-delete [data-ax-alert-actions] > button')].map((b) => Math.round(b.getBoundingClientRect().width)));
check('narrow: both actions fill the row', widths.length === 2 && widths[0] === widths[1] && widths[0] > 200, JSON.stringify(widths));
await page.keyboard.press('Escape');
await sleep(60);
await page.setViewportSize({width: 1100, height: 700});
await sleep(80);
check('back to wide order', (await order()).first === 'cancel');

await done();
