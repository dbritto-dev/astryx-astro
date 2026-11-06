#!/usr/bin/env node
/**
 * Nested roving lists (runtime/roving.ts) with useListFocus's nested semantics: a ButtonGroup
 * inside a Toolbar is swept into the Toolbar's items (its `[role="toolbar"], [popover]` boundary
 * does not stop at `role="group"`), the inner list syncs first and the outer one keeps the first
 * `tabindex="0"` (React runs a child's layout effect before its parent's), every enclosing list
 * re-syncs on focus and tab-stop moves, and a key the inner list consumed never reaches the
 * outer one while a key it ignores does.
 *
 * Fixture: a static page served by this test (page.route), built from the real server markup
 * of the Toolbar, ButtonGroup and SegmentedControl docs pages (fetched raw, so no script has
 * touched it), with the ButtonGroup moved to the first / middle / last position, into a
 * vertical toolbar and into an RTL toolbar, plus a SegmentedControl inside a Toolbar and
 * templates for dynamic insertion. Run after `cd apps/docs && npx astro build`.
 *   node tools/tests/roving-nested.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done, port} = await setup();

/** Labels of the Tab stops inside a toolbar row (layers excluded). */
const stopsIn = (selector) => page.evaluate((sel) => {
  const row = document.querySelector(sel);
  return [...row.querySelectorAll('button, input, a[href], [tabindex]')]
    .filter((el) => !el.closest('[popover]') && el.tabIndex >= 0 && !el.disabled)
    .map((el) => el.getAttribute('aria-label') ?? el.textContent.trim());
}, selector);
const focused = () => page.evaluate(() => {
  const a = document.activeElement;
  return a?.getAttribute('aria-label') ?? a?.textContent?.trim() ?? null;
});
const row = (name) => `[data-fixture="${name}"]`;
const button = (name, label) => page.evaluateHandle(({sel, label}) =>
  [...document.querySelectorAll(`${sel} button`)].find((b) => (b.getAttribute('aria-label') ?? b.textContent.trim()) === label), {sel: row(name), label});
const focusItem = async (name, label) => (await button(name, label)).asElement().focus();
const clickItem = async (name, label) => (await button(name, label)).asElement().click();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Press a key and check where focus went and that the toolbar still has one stop, on it. */
const press = async (name, key, expected, what) => {
  await page.keyboard.press(key);
  const now = await focused();
  const stops = await stopsIn(row(name));
  check(`${what}: ${key} → ${expected} (one stop, on it)`, now === expected && same(stops, [expected]), JSON.stringify({now, stops}));
};

console.log('Docs page: every toolbar has one Tab stop');
await open('toolbar');
const docsStops = await page.evaluate(() => [...document.querySelectorAll('[role="toolbar"]')].map((tb) =>
  [...tb.querySelectorAll('button, input, a[href], [tabindex]')].filter((el) => !el.closest('[popover]') && el.tabIndex >= 0 && !el.disabled).length));
check(`all ${docsStops.length} toolbars on /components/toolbar/ have exactly one stop`, docsStops.length > 5 && docsStops.every((n) => n === 1), JSON.stringify(docsStops));
const groupFirst = await stopsIn('[data-test="center"]');
check('Toolbar > ButtonGroup (group first, docs demo): one stop, on the group\'s first member', same(groupFirst, ['Undo']), JSON.stringify(groupFirst));

// ── Build the fixture from raw server markup ──────────────────────────────────────────
const fixture = await page.evaluate(async () => {
  const parse = async (url) => new DOMParser().parseFromString(await (await fetch(url)).text(), 'text/html');
  const tb = await parse('/components/toolbar/');
  const sc = await parse('/components/segmented-control/');
  let n = 0;
  const REFS = ['data-ax-keyboard-hint', 'data-ax-tooltip', 'aria-describedby', 'aria-labelledby', 'aria-controls', 'popovertarget', 'data-ax-anchor', 'for'];
  /** A deep copy with fresh ids (and the references to them): copies never share a layer. */
  const fresh = (el) => {
    const copy = el.cloneNode(true);
    const suffix = `-fx${++n}`;
    const ids = new Map();
    for (const node of [copy, ...copy.querySelectorAll('[id]')]) {
      if (!node.id) continue;
      ids.set(node.id, node.id + suffix);
      node.id += suffix;
    }
    for (const node of [copy, ...copy.querySelectorAll('*')]) {
      for (const attr of REFS) {
        const v = node.getAttribute(attr);
        if (v) node.setAttribute(attr, v.split(/\s+/).map((t) => ids.get(t) ?? t).join(' '));
      }
    }
    return copy;
  };
  const section = (test) => fresh(tb.querySelector(`[data-test="${test}"]`).closest('.ax-section-outer'));
  const toolbarIn = (el) => el.querySelector('[role="toolbar"]');
  const group = () => fresh(tb.querySelector('[data-test="center"] [role="group"]'));
  const wrap = (name, el) => {
    const r = toolbarIn(el);
    r.removeAttribute('data-test');
    r.setAttribute('data-fixture', name);
    return `<section style="margin-block:12px" data-case="${name}"><button id="before-${name}">before ${name}</button>${el.outerHTML}<button id="after-${name}">after ${name}</button></section>`;
  };
  const html = [];

  // Center demo: [ButtonGroup(Undo, Redo), Divider, Format] | title | [Badge, More].
  html.push(wrap('first', section('center')));
  const middle = section('center');
  toolbarIn(middle).querySelector('.ax-toolbar-start').append(toolbarIn(middle).querySelector('[role="group"]'));
  html.push(wrap('middle', middle));
  const last = section('center');
  toolbarIn(last).querySelector('.ax-toolbar-end').append(toolbarIn(last).querySelector('[role="group"]'));
  html.push(wrap('last', last));

  // Vertical toolbar [Select, Search | Settings] with a horizontal group after Select.
  const vertical = section('vertical');
  toolbarIn(vertical).querySelector('.ax-toolbar-start > button').after(group());
  html.push(wrap('vertical', vertical));

  // RTL toolbar [First, Second, Third] with the group after First.
  const rtl = fresh(tb.querySelector('[data-test="rtl"]').closest('[dir="rtl"]'));
  toolbarIn(rtl).querySelector('.ax-toolbar-start > button').after(group());
  html.push(wrap('rtl', rtl));

  // A SegmentedControl (role="radiogroup", places its own stop) after Back in the basic toolbar.
  const segmented = section('basic');
  const control = fresh(sc.querySelector('#sc-sm'));
  control.id = 'fx-segmented';
  toolbarIn(segmented).querySelector('.ax-toolbar-start > button').after(control);
  html.push(wrap('segmented', segmented));

  // Templates: a lone group, and a whole Toolbar with the group in the middle.
  html.push(`<template id="tpl-group">${group().outerHTML}</template>`);
  const dynamic = section('center');
  toolbarIn(dynamic).querySelector('.ax-toolbar-start').append(toolbarIn(dynamic).querySelector('[role="group"]'));
  html.push(`<template id="tpl-toolbar">${wrap('dynamic', dynamic)}</template><div id="dynamic-host"></div>`);

  const links = new Set();
  const scripts = new Set();
  for (const doc of [tb, sc]) {
    doc.querySelectorAll('link[rel="stylesheet"][href^="/_astro/"]').forEach((l) => links.add(`<link rel="stylesheet" href="${l.getAttribute('href')}">`));
    doc.querySelectorAll('script[type="module"][src^="/_astro/"]').forEach((s) => scripts.add(`<script type="module" src="${s.getAttribute('src')}"></script>`));
  }
  return {links: [...links].join(''), body: html.join('\n'), scripts: [...scripts].join('')};
});
const fixtureHtml = `<!doctype html><html lang="en" data-astryx-theme="neutral"><head><meta charset="utf-8"><title>Nested roving</title>${fixture.links}</head>`
  + `<body style="padding:16px;background:var(--color-background-body)">${fixture.body}${fixture.scripts}</body></html>`;
await page.route('**/__fixtures/roving-nested/', (route) => route.fulfill({status: 200, contentType: 'text/html', body: fixtureHtml}));
await page.goto(`http://localhost:${port}/__fixtures/roving-nested/`);
await page.waitForLoadState('load');
await sleep(100);

console.log('On load: one Tab stop (the inner list stamps first, the outer keeps it)');
for (const name of ['first', 'middle', 'last', 'vertical', 'rtl']) {
  const stops = await stopsIn(row(name));
  check(`${name}: one stop, on the group's first member`, same(stops, ['Undo']), JSON.stringify(stops));
}
const order = await page.evaluate((sel) => [...document.querySelector(sel).querySelectorAll('button')].filter((b) => !b.closest('[popover]')).map((b) => b.getAttribute('aria-label') ?? b.textContent.trim()), row('middle'));
check('middle fixture order is [Format, Undo, Redo, More]', same(order, ['Format', 'Undo', 'Redo', 'More']), JSON.stringify(order));
const segStops = await stopsIn(row('segmented'));
check('Toolbar > SegmentedControl: one stop, the selected segment (the control places it, the toolbar keeps it)', same(segStops, ['Week']), JSON.stringify(segStops));

console.log('Keyboard hint inside a nested group');
await page.focus('#before-first');
await page.keyboard.press('Tab');
check('Tab enters the toolbar on its one stop', (await focused()) === 'Undo');
const hint = () => page.$eval(row('first'), (el) => {
  const layer = document.getElementById(el.getAttribute('data-ax-keyboard-hint'));
  return {open: layer.matches(':popover-open'), anchor: layer.anchor?.getAttribute('aria-label') ?? null};
});
let h = await hint();
check('the toolbar\'s hint shows on keyboard entry, anchored to the item', h.open && h.anchor === 'Undo', JSON.stringify(h));
await page.keyboard.press('ArrowRight');
h = await hint();
check('an arrow the nested group consumes moves within it and leaves the toolbar\'s hint up, re-anchored', (await focused()) === 'Redo' && h.open && h.anchor === 'Redo', JSON.stringify(h));
await page.keyboard.press('ArrowDown');
h = await hint();
check('an arrow the group ignores reaches the toolbar and spends the hint', (await focused()) === 'Redo' && !h.open, JSON.stringify(h));

console.log('Tab walks: one Tab in, one Tab out');
for (const name of ['first', 'middle', 'last', 'vertical', 'rtl']) {
  await page.focus(`#before-${name}`);
  await page.keyboard.press('Tab');
  const entered = await focused();
  await page.keyboard.press('Tab');
  const left = await focused();
  await page.keyboard.press('Shift+Tab');
  const back = await focused();
  check(`${name}: Tab → the stop, Tab → past the toolbar, Shift+Tab → back`, ['Undo', 'Redo'].includes(entered) && left === `after ${name}` && back === entered, JSON.stringify({entered, left, back}));
}

console.log('Middle [Format, (Undo, Redo), More]');
await focusItem('middle', 'Format');
check('focusing an item outside the group moves the one stop there', same(await stopsIn(row('middle')), ['Format']), JSON.stringify(await stopsIn(row('middle'))));
await press('middle', 'ArrowRight', 'Undo', 'toolbar arrow into the group');
await press('middle', 'ArrowRight', 'Redo', 'arrow within the group');
await press('middle', 'ArrowRight', 'Undo', 'the group consumes ←/→ and wraps within itself (Astryx)');
await press('middle', 'End', 'Redo', 'End is the group\'s');
await focusItem('middle', 'More');
await press('middle', 'ArrowLeft', 'Redo', 'toolbar arrow back into the group lands on its last member');
await focusItem('middle', 'More');
await clickItem('middle', 'Undo');
check('a click inside the group re-syncs the toolbar too (one stop, on the clicked member)', same(await stopsIn(row('middle')), ['Undo']), JSON.stringify(await stopsIn(row('middle'))));
await page.focus('#before-middle');
await page.keyboard.press('Tab');
check('… and Tab comes back to it', (await focused()) === 'Undo');

console.log('Last [Format, More, (Undo, Redo)]');
await focusItem('last', 'Format');
await press('last', 'ArrowLeft', 'Redo', 'toolbar wrap from the first item lands on the group\'s last member');
await press('last', 'Home', 'Undo', 'Home is the group\'s');
await focusItem('last', 'More');
await press('last', 'ArrowRight', 'Undo', 'toolbar arrow into the trailing group');

console.log('Horizontal group in a vertical toolbar [Select, (Undo, Redo), Search | Settings]');
await focusItem('vertical', 'Redo');
await press('vertical', 'ArrowRight', 'Undo', 'horizontal keys stay in the group (wrap)');
await press('vertical', 'ArrowDown', 'Redo', 'a vertical key the group ignores moves through the toolbar\'s order');
await press('vertical', 'ArrowDown', 'Search', '… out of the group');
await press('vertical', 'ArrowDown', 'Settings', '… across slots');
await press('vertical', 'ArrowUp', 'Search', 'ArrowUp');
await press('vertical', 'ArrowUp', 'Redo', 'ArrowUp back into the group');
await press('vertical', 'ArrowUp', 'Undo', 'ArrowUp within the toolbar order');
await press('vertical', 'ArrowUp', 'Select', 'ArrowUp out of the group');

console.log('RTL [First, (Undo, Redo), Second, Third]');
await focusItem('rtl', 'First');
await press('rtl', 'ArrowLeft', 'Undo', 'RTL: ArrowLeft moves forward into the group');
await press('rtl', 'ArrowLeft', 'Redo', 'RTL: ArrowLeft forward within the group');
await press('rtl', 'ArrowLeft', 'Undo', 'RTL: the group wraps');
await press('rtl', 'ArrowRight', 'Redo', 'RTL: ArrowRight moves back (wrapping in the group)');
await focusItem('rtl', 'Second');
await press('rtl', 'ArrowRight', 'Redo', 'RTL: toolbar ArrowRight back into the group');

console.log('SegmentedControl inside a Toolbar');
await focusItem('segmented', 'Share');
await page.focus('#after-segmented');
await page.$eval('#fx-segmented', (el) => { el.value = 'month'; });
const segAfter = await stopsIn(row('segmented'));
check('a programmatic selection re-syncs the toolbar (one stop)', segAfter.length === 1, JSON.stringify(segAfter));

console.log('Dynamic insertion');
await page.evaluate(() => {
  document.getElementById('dynamic-host').append(document.getElementById('tpl-toolbar').content.cloneNode(true));
});
await sleep(30);
let dyn = await stopsIn(row('dynamic'));
check('an inserted Toolbar > ButtonGroup subtree: one stop', same(dyn, ['Undo']), JSON.stringify(dyn));
await page.focus('#before-dynamic');
await page.keyboard.press('Tab');
const dynIn = await focused();
await page.keyboard.press('Tab');
check('… one Tab in, one Tab out', dynIn === 'Undo' && (await focused()) === 'after dynamic', dynIn);
const insertGroup = (where) => page.evaluate(({sel, where}) => {
  const tb = document.querySelector(sel);
  const g = document.getElementById('tpl-group').content.firstElementChild.cloneNode(true);
  g.setAttribute('aria-label', `Inserted ${where}`);
  if (where === 'end') tb.querySelector('.ax-toolbar-end').append(g);
  else tb.querySelector('.ax-toolbar-start').prepend(g);
}, {sel: row('dynamic'), where});
await insertGroup('end');
await sleep(30);
dyn = await stopsIn(row('dynamic'));
check('a ButtonGroup appended to a toolbar keeps the existing single stop', same(dyn, ['Undo']), JSON.stringify(dyn));
await focusItem('dynamic', 'Format');
await page.focus('#after-dynamic');
await page.evaluate((sel) => {
  const extra = document.createElement('button');
  extra.type = 'button';
  extra.textContent = 'Extra';
  document.querySelector(`${sel} [role="group"]`).append(extra);
}, row('dynamic'));
await sleep(30);
dyn = await stopsIn(row('dynamic'));
check('a member added to a nested group re-syncs the toolbar (the stop stays on Format)', same(dyn, ['Format']), JSON.stringify(dyn));
await insertGroup('start');
await sleep(30);
dyn = await stopsIn(row('dynamic'));
check('a ButtonGroup inserted first: one stop', dyn.length === 1, JSON.stringify(dyn));
await focusItem('dynamic', 'Extra');
await page.focus('#after-dynamic');
await page.evaluate((sel) => {
  [...document.querySelectorAll(`${sel} button`)].find((b) => b.textContent.trim() === 'Extra').disabled = true;
}, row('dynamic'));
await sleep(30);
dyn = await stopsIn(row('dynamic'));
check('disabling the stop inside a nested group moves it once (one stop)', dyn.length === 1 && dyn[0] !== 'Extra', JSON.stringify(dyn));
await page.evaluate((sel) => document.querySelector(`${sel} .ax-toolbar-start [role="group"]`).remove(), row('dynamic'));
await sleep(30);
dyn = await stopsIn(row('dynamic'));
check('removing a group keeps one stop', dyn.length === 1, JSON.stringify(dyn));

await done();
