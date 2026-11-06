#!/usr/bin/env node
/**
 * TabList / Tab / TabMenu: SSR semantics (navigation landmark vs tablist), roving (arrows both
 * axes in nav, horizontal-only in a tablist, Home/End, wrap, disabled skipped, RTL), manual
 * activation (click / Enter / Space) with astryx-change and its veto, the indicator following,
 * link tabs (aria-current, disabled link without href), TabMenu (open + focus first row, pick
 * re-emitted once as the TabList's change, trigger label / indicator, ↓ on the closed trigger
 * stays with the strip), scroll overflow (fades, buttons, selected tab kept in view), size from a
 * Toolbar provider, keyboard hint, programmatic value.
 *   node tools/tests/tab-list.test.mjs
 */
import {setup, isOpen, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('tab-list');

await page.evaluate(() => {
  window.__changes = [];
  document.addEventListener('astryx-change', (e) => window.__changes.push(`${e.target.id || e.target.tagName}:${e.detail.value}`));
});
const changes = () => page.evaluate(() => window.__changes.splice(0));
const state = (id) => page.evaluate((id) => {
  const el = document.getElementById(id);
  const tabs = [...el.querySelectorAll('[data-tab-value]')];
  const stops = [...el.querySelectorAll('[data-tab-value],[data-tab-menu]')];
  const a = document.activeElement;
  return {
    value: el.value,
    current: tabs.filter((t) => t.getAttribute('aria-current') === 'true').map((t) => t.dataset.tabValue).join(','),
    selectedAttr: tabs.filter((t) => t.dataset.selected === 'selected').map((t) => t.dataset.tabValue).join(','),
    indicator: tabs.filter((t) => t.querySelector('.astryx-tab-indicator')?.dataset.selected === 'selected').map((t) => t.dataset.tabValue).join(','),
    ariaSelected: tabs.filter((t) => t.getAttribute('aria-selected') === 'true').map((t) => t.dataset.tabValue).join(','),
    stops: stops.filter((s) => s.getAttribute('tabindex') === '0').map((s) => s.dataset.tabValue ?? 'menu').join(','),
    focused: a?.dataset?.tabValue ?? (a?.hasAttribute?.('data-tab-menu') ? 'menu' : a?.getAttribute?.('role') ?? a?.tagName),
  };
}, id);

console.log('SSR: navigation pattern');
let s = await state('tl-nav');
check('root is a named navigation landmark with the size hook', await page.evaluate(() => {
  const el = document.getElementById('tl-nav');
  return el.getAttribute('role') === 'navigation' && el.getAttribute('aria-label') === 'Project' && el.classList.contains('astryx-tab-list') &&
    el.dataset.size === 'md' && el.hasAttribute('data-astryx-edge-comp') && el.querySelector(':scope > .astryx-tab-strip')?.getAttribute('role') === null;
}));
check('value="overview": aria-current, data-selected, indicator, the only stop', s.current === 'overview' && s.selectedAttr === 'overview' && s.indicator === 'overview' && s.stops === 'overview', JSON.stringify(s));
check('tabs are buttons with edge comp; no role=tab in nav', await page.evaluate(() =>
  [...document.querySelectorAll('#tl-nav [data-tab-value]')].every((t) => t.tagName === 'BUTTON' && t.type === 'button' && !t.hasAttribute('role') && t.hasAttribute('data-astryx-edge-comp'))));
check('default name "Tabs" when no aria-label', await page.evaluate(() => document.getElementById('tl-sm').getAttribute('aria-label') === 'Settings (sm)'));

console.log('Keyboard hint (first: an arrow spends it for good)');
// The docs toolbar's last control is right before the first demo control in tab order.
await page.focus('#docs-mode');
await page.keyboard.press('Tab');
const hint = '#tl-nav > [data-ax-keyboard-hint]';
check('Tab reaches the first TabList on its selected tab', (await state('tl-nav')).focused === 'overview');
await sleep(50);
check('the hint shows on keyboard entry, below the tab', await isOpen(page, hint));
await page.keyboard.press('ArrowRight');
await sleep(50);
check('an arrow dismisses it', !(await isOpen(page, hint)));
await page.keyboard.press('ArrowLeft');

console.log('Keyboard: roving (nav pattern takes both axes)');
await page.focus('#tl-nav [data-tab-value="overview"]');
await page.keyboard.press('ArrowRight');
s = await state('tl-nav');
check('ArrowRight → activity (focus only, no selection)', s.focused === 'activity' && s.current === 'overview' && (await changes()).length === 0, JSON.stringify(s));
await page.keyboard.press('ArrowDown');
check('ArrowDown → members', (await state('tl-nav')).focused === 'members');
await page.keyboard.press('ArrowRight');
s = await state('tl-nav');
check('ArrowRight skips the disabled archive → the TabMenu trigger', s.focused === 'menu', JSON.stringify(s));
await page.keyboard.press('ArrowDown');
s = await state('tl-nav');
const menuLayer = await page.evaluate(() => '#' + document.getElementById('tl-nav-more').getAttribute('popovertarget'));
check('ArrowDown on the closed TabMenu trigger moves on (wraps to overview), menu stays closed', s.focused === 'overview' && !(await isOpen(page, menuLayer)), JSON.stringify(s));
await page.keyboard.press('ArrowUp');
check('ArrowUp → back to the TabMenu trigger', (await state('tl-nav')).focused === 'menu');
await page.keyboard.press('Home');
check('Home → overview', (await state('tl-nav')).focused === 'overview');
await page.keyboard.press('End');
check('End → TabMenu trigger', (await state('tl-nav')).focused === 'menu');
await page.keyboard.press('ArrowLeft');
check('ArrowLeft skips archive back to members', (await state('tl-nav')).focused === 'members');

console.log('Activation');
await changes();
await page.keyboard.press('Enter');
s = await state('tl-nav');
check('Enter selects members (aria-current, data-selected, indicator, stop)', s.current === 'members' && s.selectedAttr === 'members' && s.indicator === 'members' && s.stops === 'members', JSON.stringify(s));
check('astryx-change {value: members} once', (await changes()).join() === 'tl-nav:members');
check('demo log updated', (await page.textContent('#tl-log')) === 'value: members');
await page.keyboard.press('ArrowLeft');
await page.keyboard.press(' ');
check('Space selects activity', (await state('tl-nav')).current === 'activity' && (await changes()).join() === 'tl-nav:activity');
await page.click('#tl-nav [data-tab-value="overview"]');
s = await state('tl-nav');
check('click selects overview; el.value follows', s.current === 'overview' && s.value === 'overview' && (await changes()).join() === 'tl-nav:overview', JSON.stringify(s));
await page.click('#tl-nav [data-tab-value="archive"]', {force: true});
check('click on the aria-disabled tab selects nothing', (await state('tl-nav')).current === 'overview' && (await changes()).length === 0);
await page.evaluate(() => document.getElementById('tl-nav').addEventListener('astryx-change', (e) => e.preventDefault(), {once: true}));
await page.click('#tl-nav [data-tab-value="members"]');
check('preventDefault() keeps the selection', (await state('tl-nav')).current === 'overview');
await changes();

console.log('TabMenu');
await page.click('#tl-nav-more');
await sleep(120);
check('click opens the menu, aria-expanded', (await isOpen(page, menuLayer)) && (await page.getAttribute('#tl-nav-more', 'aria-expanded')) === 'true');
check('focus lands on the first row (Astryx focusFirst)', await page.evaluate(() => document.activeElement?.dataset?.value === 'settings'));
check('menu semantics: role=menu named "More", heading presentational, menuitemradio rows', await page.evaluate((l) => {
  const m = document.querySelector(l).querySelector('[role="menu"]');
  const rows = [...m.querySelectorAll('[role="menuitemradio"]')];
  return m.getAttribute('aria-label') === 'More' && m.classList.contains('astryx-tab-menu-dropdown') && m.querySelector('[role="presentation"]')?.textContent === 'More' &&
    rows.length === 3 && rows.every((r) => r.classList.contains('astryx-tab-menu-item') && r.getAttribute('aria-checked') === 'false');
}, menuLayer));
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await sleep(120);
s = await state('tl-nav');
const menuState = await page.evaluate(() => {
  const t = document.getElementById('tl-nav-more');
  const m = document.getElementById(t.getAttribute('aria-controls'));
  return {
    label: t.querySelector('.ax-tab-menu-label-text').textContent,
    selected: t.hasAttribute('data-ax-selected'),
    indicator: t.querySelector('.astryx-tab-indicator')?.dataset.selected,
    checked: [...m.querySelectorAll('[aria-checked="true"]')].map((r) => r.dataset.value).join(),
    tabindex: t.getAttribute('tabindex'),
  };
});
check('Enter on a row picks it: TabList value, no tab current', s.value === 'integrations' && s.current === '', JSON.stringify(s));
check('trigger shows the option label, selected weight and indicator; the row is checked', menuState.label === 'Integrations' && menuState.selected && menuState.indicator === 'selected' && menuState.checked === 'integrations' && menuState.tabindex === '0', JSON.stringify(menuState));
check('one astryx-change, from the TabList (the menu group\'s is taken over)', (await changes()).join() === 'tl-nav:integrations');
check('menu closed, focus back on the trigger', !(await isOpen(page, menuLayer)) && (await state('tl-nav')).focused === 'menu');
await page.keyboard.press('Enter');
await sleep(120);
check('Enter on the trigger opens it on the first row', (await isOpen(page, menuLayer)) && await page.evaluate(() => document.activeElement?.dataset?.value === 'settings'));
await page.keyboard.press('Escape');
await sleep(80);
check('Escape closes and returns focus to the trigger', !(await isOpen(page, menuLayer)) && (await state('tl-nav')).focused === 'menu');
await page.click('#tl-nav [data-tab-value="overview"]');
check('selecting a tab clears the TabMenu (label back, no indicator)', await page.evaluate(() => {
  const t = document.getElementById('tl-nav-more');
  return t.querySelector('.ax-tab-menu-label-text').textContent === 'More' && !t.hasAttribute('data-ax-selected') && !t.querySelector('.astryx-tab-indicator') && t.getAttribute('tabindex') === '-1';
}));
await changes();

console.log('Tabs pattern (role="tablist")');
s = await state('tl-tabs');
check('strip is role=tablist named "Order"; root has no role/name', await page.evaluate(() => {
  const el = document.getElementById('tl-tabs');
  const strip = el.querySelector('.astryx-tab-strip');
  return !el.hasAttribute('role') && !el.hasAttribute('aria-label') && strip.getAttribute('role') === 'tablist' && strip.getAttribute('aria-label') === 'Order';
}));
check('tabs: role=tab, aria-selected, aria-controls → panel', await page.evaluate(() =>
  [...document.querySelectorAll('#tl-tabs [data-tab-value]')].every((t) => t.getAttribute('role') === 'tab' && t.getAttribute('aria-controls') === `tl-panel-${t.dataset.tabValue}` && !t.hasAttribute('aria-current'))));
check('details selected', s.ariaSelected === 'details' && s.stops === 'details', JSON.stringify(s));
await page.focus('#tl-tab-details');
await page.keyboard.press('ArrowDown');
check('ArrowDown is not a tablist key', (await state('tl-tabs')).focused === 'details');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('Enter');
s = await state('tl-tabs');
check('ArrowRight + Enter selects shipping (aria-selected moves)', s.ariaSelected === 'shipping' && s.focused === 'shipping', JSON.stringify(s));
check('the page swapped the panel on astryx-change', await page.evaluate(() => !document.getElementById('tl-panel-shipping').hidden && document.getElementById('tl-panel-details').hidden));
check('fill layout: tabs stretch equally', await page.evaluate(() => {
  const w = [...document.querySelectorAll('#tl-tabs [data-tab-value]')].map((t) => Math.round(t.getBoundingClientRect().width));
  return w.every((x) => Math.abs(x - w[0]) <= 1) && w[0] > 150;
}));
await changes();

console.log('Link tabs');
check('href tabs are anchors; the disabled one has no href; TabMenu holds the value', await page.evaluate(() => {
  const tabs = [...document.querySelectorAll('#tl-links [data-tab-value]')];
  const audit = tabs.find((t) => t.dataset.tabValue === 'audit');
  return tabs.every((t) => t.tagName === 'A') && tabs.find((t) => t.dataset.tabValue === 'team').getAttribute('href') === '#team' &&
    !audit.hasAttribute('href') && audit.getAttribute('aria-disabled') === 'true' && tabs.every((t) => !t.hasAttribute('aria-current')) &&
    document.querySelector('#tl-links [data-tab-menu] .ax-tab-menu-label-text').textContent === 'Billing';
}));
await page.click('#tl-links [data-tab-value="team"]');
s = await state('tl-links');
check('clicking a link tab: aria-current="true" moves there', s.current === 'team' && (await changes()).join() === 'tl-links:team', JSON.stringify(s));
await page.evaluate(() => { const el = document.getElementById('tl-links'); el.parentElement.append(el); });
check('a moved element keeps its value', (await state('tl-links')).value === 'team');

console.log('Overflow (scroll)');
const ov = await page.evaluate(() => {
  const el = document.getElementById('tl-narrow');
  const strip = el.querySelector('.astryx-tab-strip');
  const sel = el.querySelector('[data-tab-value="reports"]');
  const sb = strip.getBoundingClientRect();
  const tb = sel.getBoundingClientRect();
  const buttons = [...el.querySelectorAll(':scope > .astryx-tab-scroll-button')].map((b) => ({side: b.dataset.axSide, hidden: b.hidden, hiddenAria: b.getAttribute('aria-hidden'), tabindex: b.getAttribute('tabindex')}));
  return {overflows: strip.scrollWidth > strip.clientWidth, inView: tb.left >= sb.left - 1 && tb.right <= sb.right + 1, fade: strip.dataset.axFade, buttons, scrollLeft: strip.scrollLeft};
});
check('the strip overflows and the selected "Reports" was scrolled into view', ov.overflows && ov.inView && ov.scrollLeft > 0, JSON.stringify(ov));
check('both edges fade; both scroll buttons shown, aria-hidden, tabindex -1', ov.fade === 'both' && ov.buttons.every((b) => !b.hidden && b.hiddenAria === 'true' && b.tabindex === '-1'), JSON.stringify(ov));
await page.click('#tl-narrow .astryx-tab-scroll-button[data-ax-side="start"]');
await sleep(400);
const afterStart = await page.evaluate(() => {
  const el = document.getElementById('tl-narrow');
  const strip = el.querySelector('.astryx-tab-strip');
  return {scrollLeft: strip.scrollLeft, fade: strip.dataset.axFade, startHidden: el.querySelector('[data-ax-side="start"]').hidden, focused: document.activeElement?.className};
});
check('start button scrolls to the start; start fade and button go away; it took no focus', afterStart.scrollLeft <= 1 && afterStart.fade === 'end' && afterStart.startHidden && !String(afterStart.focused).includes('scroll-button'), JSON.stringify(afterStart));
await page.click('#tl-narrow [data-tab-value="projects"]');
s = await state('tl-narrow');
check('indicator follows the selection', s.indicator === 'projects' && s.selectedAttr === 'projects');
await changes();
await page.evaluate(() => { document.getElementById('tl-narrow').value = 'settings'; });
await sleep(50);
check('programmatic value: selects, reveals the last tab, fires nothing', await page.evaluate(() => {
  const el = document.getElementById('tl-narrow');
  const strip = el.querySelector('.astryx-tab-strip');
  const t = el.querySelector('[data-tab-value="settings"]').getBoundingClientRect();
  const sb = strip.getBoundingClientRect();
  return t.right <= sb.right + 1 && el.querySelector('[data-tab-value="settings"]').getAttribute('aria-current') === 'true';
}) && (await changes()).length === 0);
await page.focus('#tl-narrow [data-tab-value="settings"]');
await page.keyboard.press('Home');
await sleep(50);
check('arrowing/Home to an off-screen stop reveals it', await page.evaluate(() => {
  const el = document.getElementById('tl-narrow');
  const t = el.querySelector('[data-tab-value="home"]').getBoundingClientRect();
  return document.activeElement?.dataset.tabValue === 'home' && t.left >= el.querySelector('.astryx-tab-strip').getBoundingClientRect().left - 1;
}));
check('overflow="visible": no scroll container, no buttons', await page.evaluate(() => {
  const el = document.getElementById('tl-visible');
  return !el.querySelector('.astryx-tab-strip').hasAttribute('data-ax-scroll') && !el.querySelector('.astryx-tab-scroll-button') && getComputedStyle(el.querySelector('.astryx-tab-strip')).overflowX === 'visible';
}));

console.log('Divider, size, provider');
const sizes = await page.evaluate(() => ['sm', 'md', 'lg'].map((sz) => Math.round(document.querySelector(`#tl-${sz} [data-tab-value]`).getBoundingClientRect().height)));
check('tab heights 28 / 32 / 36', sizes.join() === '28,32,36', sizes.join());
check('divider: indicator sits on the rail', await page.evaluate(() => {
  const el = document.getElementById('tl-md');
  const ind = el.querySelector('[data-tab-value="general"] .astryx-tab-indicator').getBoundingClientRect();
  const rail = el.getBoundingClientRect().bottom;
  return Math.abs(ind.bottom - rail) <= 1.5;
}));
check('inside a Toolbar size="sm" the TabList takes sm (cascade key size)', await page.evaluate(() => {
  const el = document.getElementById('tl-toolbar');
  return el.dataset.size === 'sm' && Math.round(el.querySelector('[data-tab-value]').getBoundingClientRect().height) === 28 && !el.hasAttribute('data-ax-inherit');
}));

console.log('RTL');
await page.focus('#tl-rtl [data-tab-value="b"]');
await page.keyboard.press('ArrowLeft');
check('ArrowLeft moves forward in RTL', (await state('tl-rtl')).focused === 'c');
await page.keyboard.press('ArrowRight');
check('ArrowRight moves back in RTL', (await state('tl-rtl')).focused === 'b');

await done();
