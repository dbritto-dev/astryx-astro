#!/usr/bin/env node
/**
 * Item (components/Item, behaviors/clickable.ts) against the built docs.
 * Covers: whole-row activation retargeted to the row's own button (one click), nested
 * controls keep their own clicks, link rows forward surface clicks (modifier keys kept) and
 * open a middle click in a new tab, delegate rows proxy to the nested control, disabled and
 * blocked rows, item-description stamping, aria-current / aria-selected.
 */
import {setup} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('item');
await page.waitForFunction(() => document.querySelector('[data-test="button-row"]'));

const sel = (t) => `[data-test="${t}"]`;
await page.evaluate(() => {
  window.__clicks = [];
  window.__opened = [];
  window.open = (...args) => { window.__opened.push(args); return null; };
  document.querySelector('[data-test="interactive"]').addEventListener('click', (e) => {
    const t = e.target;
    window.__clicks.push({cls: t.closest('.ax-item-action') ? 'ax-item-action' : (t.className?.baseVal ?? t.className), test: t.closest('[data-test]')?.dataset.test, ctrl: e.ctrlKey, tag: t.tagName});
  });
});
const clicks = () => page.evaluate(() => window.__clicks.splice(0));

// Button row: surface click → one click, on the action button.
await page.click(`${sel('button-row')} .ax-item-start`);
let c = await clicks();
check('button row: surface click retargets to the action button', c.length === 1 && String(c[0].cls).includes('ax-item-action'), JSON.stringify(c));
await page.click(`${sel('button-row')} .ax-item-action`);
c = await clicks();
check('button row: click on the action fires once', c.length === 1 && String(c[0].cls).includes('ax-item-action'), JSON.stringify(c));
await page.click(sel('nested'));
c = await clicks();
check('button row: nested button keeps its own click (row action not fired)', c.length === 1 && c[0].test === 'nested', JSON.stringify(c));

// Link row.
await page.evaluate(() => history.replaceState(null, '', location.pathname));
await page.click(`${sel('link-row')} .ax-item-start`);
c = await clicks();
check('link row: surface click forwards to the link', c.length === 1 && c[0].tag === 'A', JSON.stringify(c));
check('link row: surface click navigates', await page.evaluate(() => location.hash) === '#item-target');
await page.evaluate(() => history.replaceState(null, '', location.pathname));
await page.click(sel('nested-link'));
c = await clicks();
check('link row: nested button does not navigate', c.length === 1 && c[0].test === 'nested-link' && await page.evaluate(() => location.hash) === '', JSON.stringify(c));
// Modifier click: re-dispatched on the anchor with the modifier.
await page.evaluate(() => document.querySelector('[data-test="link-row"] a').addEventListener('click', (e) => e.preventDefault(), {once: true}));
await page.click(`${sel('link-row')} .ax-item-start`, {modifiers: ['Control']});
c = await clicks();
check('link row: Ctrl-click reaches the link with ctrlKey', c.length === 1 && c[0].tag === 'A' && c[0].ctrl === true, JSON.stringify(c));
await page.click(`${sel('link-row')} .ax-item-start`, {button: 'middle'});
const opened = await page.evaluate(() => window.__opened.splice(0));
check('link row: middle click opens a new tab (noopener)', opened.length === 1 && opened[0][0].endsWith('#item-target') && opened[0][1] === '_blank' && opened[0][2] === 'noopener', JSON.stringify(opened));
await page.click(sel('nested-link'), {button: 'middle'});
check('link row: middle click on a nested control opens nothing', (await page.evaluate(() => window.__opened.length)) === 0);

// Delegate row.
const checked = () => page.$eval(sel('delegate-input'), (el) => el.checked);
await page.click(`${sel('delegate-row')} .ax-item-label`);
check('delegate row: surface click toggles the nested checkbox', await checked() === true);
await page.click(sel('delegate-input'));
check('delegate row: click on the checkbox toggles it once', await checked() === false);
check('delegate row is a pressable container with one tab stop', await page.$eval(sel('delegate-row'), (el) => el.getAttribute('data-pressable-container') === 'true' && el.querySelectorAll('button, a').length === 0));
check('item-description cascade: the control is described by the row description', await page.$eval(sel('delegate-input'), (el) => {
  const id = el.getAttribute('aria-describedby');
  return id != null && document.getElementById(id)?.textContent?.includes('interactiveRef');
}));

// Disabled / blocked / selection semantics.
await clicks();
await page.click(sel('disabled-row'), {force: true});
c = await clicks();
check('disabled button row: no activation', c.every((x) => !String(x.cls).includes('ax-item-action')), JSON.stringify(c));
check('disabled button row: native disabled button', await page.$eval(`${sel('disabled-row')} button`, (b) => b.disabled));
check('disabled link row: no destination, aria-disabled link', await page.$eval(`${sel('disabled-link')} a`, (a) => !a.hasAttribute('href') && a.getAttribute('role') === 'link' && a.getAttribute('aria-disabled') === 'true'));
check('blocked destination renders no href', await page.$eval(`${sel('blocked')} a`, (a) => !a.hasAttribute('href')));
check('selected plain row: aria-current="true" + data-selected', await page.$eval(sel('selected'), (el) => el.getAttribute('aria-current') === 'true' && el.getAttribute('data-selected') === 'selected'));
check('selected option: aria-selected', await page.$eval('[role="option"][data-selected]', (el) => el.getAttribute('aria-selected') === 'true' && !el.hasAttribute('aria-current')));
check('swipe panels are inert at rest', await page.$$eval('.astryx-item-swipe-panel', (els) => els.length > 0 && els.every((p) => p.inert && p.getBoundingClientRect().width === 0)));

// Keyboard: Enter on the action button activates once.
await page.focus(`${sel('button-row')} .ax-item-action`);
await clicks();
await page.keyboard.press('Enter');
c = await clicks();
check('keyboard: Enter on the row button is one click', c.length === 1 && String(c[0].cls).includes('ax-item-action'), JSON.stringify(c));
check('focus ring paints on the row (focus-within)', await page.$eval(sel('button-row'), (el) => getComputedStyle(el).outlineStyle !== 'none'));

await done();
