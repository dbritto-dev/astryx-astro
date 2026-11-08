#!/usr/bin/env node
/**
 * DropdownMenu: open by click / Enter / Space / ArrowDown / ArrowUp, initial focus by modality,
 * arrows (wrap) / Home / End / typeahead, disabled rows skipped, Enter activation +
 * astryx-select + close + focus return, Escape, outside press, Tab closes, checkbox / radio
 * state and close policy, submenus (keys, hover intent, click pin, safe triangle, Escape one
 * level, sibling close, close with the root), RTL submenu keys and direction, long menu
 * overflow, sizes, custom trigger, header / footer Tab cycle, disabled trigger, tooltip.
 *   node tools/tests/dropdown-menu.test.mjs
 */
import {setup, isOpen, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('dropdown-menu');

const layerOf = (testid) => page.evaluate((t) => document.querySelector(`[data-testid="${t}"]`)?.getAttribute('popovertarget'), testid);
const active = () => page.evaluate(() => {
  const a = document.activeElement;
  return a ? (a.dataset.id || a.id || a.getAttribute('role') || a.tagName) : null;
});
const activeText = () => page.evaluate(() => document.activeElement?.querySelector?.('.ax-item-label')?.textContent ?? document.activeElement?.textContent?.trim());
const isActive = (selector) => page.evaluate((s) => document.activeElement === document.querySelector(s), selector);
const flyoutOf = (rowId) => page.evaluate((id) => '#' + document.getElementById(id).getAttribute('data-ax-submenu'), rowId);
// Every astryx-* event the menus dispatch, recorded in the page; `events()` reads and clears.
await page.evaluate(() => {
  window.__events = [];
  for (const type of ['astryx-select', 'astryx-change', 'astryx-open-change']) {
    document.addEventListener(type, (e) => window.__events.push({
      type, id: e.target.dataset?.id || e.target.id, isEvent: e.detail?.event instanceof MouseEvent, value: e.detail?.value, isOpen: e.detail?.isOpen,
    }), true);
  }
});
const events = () => page.evaluate(() => window.__events.splice(0));

const basicTrigger = '[data-testid="dm-basic-trigger"]';
const basicLayer = '#' + (await layerOf('dm-basic-trigger'));

console.log('Server markup');
check('trigger is a native invoker with menu ARIA', await page.evaluate((s) => {
  const b = document.querySelector(s);
  return b.getAttribute('aria-haspopup') === 'menu' && b.getAttribute('aria-expanded') === 'false' && b.getAttribute('aria-controls') === 'dm-basic-menu' && !!b.getAttribute('popovertarget');
}, basicTrigger));
check('layer is popover=auto, a layer root, holding role=menu named by the label', await page.evaluate((s) => {
  const l = document.querySelector(s);
  const m = l.querySelector('[role="menu"]');
  return l.getAttribute('popover') === 'auto' && l.hasAttribute('data-astryx-layer-root') && m.getAttribute('aria-label') === 'Actions' && m.classList.contains('astryx-dropdown-menu');
}, basicLayer));
check('rows are menuitems with tabindex -1; disabled rows have none', await page.evaluate((s) => {
  const rows = [...document.querySelector(s).querySelectorAll('[role="menuitem"]')];
  const disabled = rows.find((r) => r.getAttribute('aria-disabled') === 'true');
  return rows.length === 5 && rows.filter((r) => r !== disabled).every((r) => r.getAttribute('tabindex') === '-1') && disabled && !disabled.hasAttribute('tabindex');
}, basicLayer));

console.log('Pointer open');
await page.click(basicTrigger);
await sleep(80);
check('click opens', await isOpen(page, basicLayer));
check('aria-expanded true', (await page.getAttribute(basicTrigger, 'aria-expanded')) === 'true');
check('pointer open focuses the menu itself', (await active()) === 'dm-basic-menu');
await page.keyboard.press('ArrowDown');
check('ArrowDown from the menu lands on the first row', (await active()) === 'edit');
await page.click(basicTrigger);
await sleep(80);
check('second click closes', !(await isOpen(page, basicLayer)));
check('aria-expanded false', (await page.getAttribute(basicTrigger, 'aria-expanded')) === 'false');

console.log('Keyboard open');
await page.focus(basicTrigger);
await page.keyboard.press('Enter');
await sleep(80);
check('Enter opens', await isOpen(page, basicLayer));
check('Enter lands on the first row', (await active()) === 'edit');
await page.keyboard.press('Escape');
await sleep(80);
check('Escape closes', !(await isOpen(page, basicLayer)));
check('focus returns to the trigger', await isActive(basicTrigger));
await page.keyboard.press('Space');
await sleep(80);
check('Space opens on the first row', (await isOpen(page, basicLayer)) && (await active()) === 'edit');
await page.keyboard.press('Escape');
await sleep(50);
await page.keyboard.press('ArrowDown');
await sleep(80);
check('ArrowDown opens on the first row', (await isOpen(page, basicLayer)) && (await active()) === 'edit');
await page.keyboard.press('Escape');
await sleep(50);
await page.keyboard.press('ArrowUp');
await sleep(80);
check('ArrowUp opens on the last enabled row', (await isOpen(page, basicLayer)) && (await active()) === 'delete');

console.log('Navigation');
await page.keyboard.press('ArrowDown');
check('ArrowDown wraps last → first', (await active()) === 'edit');
await page.keyboard.press('ArrowUp');
check('ArrowUp wraps first → last', (await active()) === 'delete');
await page.keyboard.press('ArrowUp');
check('disabled row is skipped', (await active()) === 'share');
await page.keyboard.press('Home');
check('Home → first', (await active()) === 'edit');
await page.keyboard.press('End');
check('End → last', (await active()) === 'delete');
await page.keyboard.press('s');
check('typeahead "s" → Share', (await active()) === 'share');
await page.keyboard.press('h');
check('typeahead "sh" keeps Share (buffer)', (await active()) === 'share');
await sleep(800);
await page.keyboard.press('d');
check('typeahead "d" (after the reset) → the next "d" row after Share: Delete', (await active()) === 'delete');
await page.keyboard.press('d');
check('repeating the letter cycles → Duplicate', (await active()) === 'duplicate');
await sleep(800);
await page.keyboard.press('a');
check('typeahead never lands on a disabled row ("a" matches only Archive)', (await active()) === 'duplicate');

console.log('Activation');
await sleep(800);
await events();
await page.keyboard.press('Enter');
await sleep(80);
const sel = (await events()).find((e) => e.type === 'astryx-select');
check('Enter fires astryx-select {event} on the row', sel?.id === 'duplicate' && sel.isEvent, JSON.stringify(sel));
check('selection closes the menu', !(await isOpen(page, basicLayer)));
check('focus returns to the trigger after a pick', await isActive(basicTrigger));
check('demo log updated', (await page.textContent('#dm-basic-log')) === 'Selected: duplicate');

await page.click(basicTrigger);
await sleep(80);
await page.hover('[data-id="share"]');
check('hover moves the focus highlight', (await active()) === 'share');
await page.click('[data-id="archive"]', {force: true});
await sleep(60);
check('click on a disabled row does nothing', await isOpen(page, basicLayer));
await page.click('[data-id="share"]');
await sleep(80);
check('click on a row closes the menu', !(await isOpen(page, basicLayer)));

console.log('Outside press / Tab');
await page.click(basicTrigger);
await sleep(80);
await page.mouse.click(1000, 860);
await sleep(80);
check('press outside closes', !(await isOpen(page, basicLayer)));
await page.focus(basicTrigger);
await page.keyboard.press('Enter');
await sleep(80);
await page.keyboard.press('Tab');
await sleep(80);
check('Tab closes the menu', !(await isOpen(page, basicLayer)));
check('Tab moved on past the trigger', await page.evaluate((s) => document.activeElement !== document.querySelector(s) && !document.activeElement.closest('ax-menu'), basicTrigger));

console.log('Checkbox and radio rows');
const viewTrigger = '[data-testid="dm-view-trigger"]';
const viewLayer = '#' + (await layerOf('dm-view-trigger'));
await page.focus(viewTrigger);
await page.keyboard.press('Enter');
await sleep(80);
check('checkbox rows render aria-checked', (await page.getAttribute('#dm-grid', 'aria-checked')) === 'true' && (await page.getAttribute('#dm-rulers', 'aria-checked')) === 'false');
await events();
await page.keyboard.press('Space');
const change = (await events()).find((e) => e.type === 'astryx-change');
check('Space toggles the checkbox (astryx-change {value: false})', change?.id === 'dm-grid' && change.value === false && (await page.getAttribute('#dm-grid', 'aria-checked')) === 'false');
check('the checked marker hides, the unchecked one shows', await page.evaluate(() => {
  const row = document.getElementById('dm-grid');
  return getComputedStyle(row.querySelector('[data-ax-marker="checked"]')).display === 'none' && getComputedStyle(row.querySelector('[data-ax-marker="unchecked"]')).display !== 'none';
}));
check('a checkbox keeps the menu open', await isOpen(page, viewLayer));
await page.keyboard.press('ArrowDown');
check('ArrowDown → Show rulers', (await active()) === 'dm-rulers');
await page.keyboard.press('ArrowDown');
check('the disabled checkbox is skipped', (await active()) === 'dm-newest');
check('radio group renders the checked radio', (await page.getAttribute('#dm-newest', 'aria-checked')) === 'true' && (await page.getAttribute('#dm-oldest', 'aria-checked')) === 'false');
await page.keyboard.press('ArrowDown');
await events();
await page.keyboard.press('Enter');
await sleep(80);
const picked = await events();
const radioChange = picked.find((e) => e.type === 'astryx-change');
check('Enter picks a radio (astryx-change {value} on the group)', radioChange?.id === 'dm-sort' && radioChange.value === 'oldest', JSON.stringify(picked));
check('…then astryx-select on the radio and the close', picked.some((e) => e.type === 'astryx-select' && e.id === 'dm-oldest') && picked.some((e) => e.type === 'astryx-open-change' && e.isOpen === false));
check('radio state moved', (await page.getAttribute('#dm-oldest', 'aria-checked')) === 'true' && (await page.getAttribute('#dm-newest', 'aria-checked')) === 'false');
check('a radio closes the menu', !(await isOpen(page, viewLayer)));
check('radio markers carry the menu theme target', await page.evaluate(() => !!document.querySelector('#dm-oldest .astryx-dropdown-menu-radio[data-checked][data-size="md"]')));

console.log('Submenus (keyboard)');
const fileTrigger = '[data-testid="dm-compound-trigger"]';
const fileLayer = '#' + (await layerOf('dm-compound-trigger'));
const exportFly = await flyoutOf('dm-export');
const moreFly = await flyoutOf('dm-more');
const shareFly = await flyoutOf('dm-share');
await page.focus(fileTrigger);
await page.keyboard.press('Enter');
await sleep(80);
check('submenu row has aria-haspopup=menu, aria-expanded=false', (await page.getAttribute('#dm-export', 'aria-haspopup')) === 'menu' && (await page.getAttribute('#dm-export', 'aria-expanded')) === 'false');
await page.keyboard.press('e');
check('typeahead "e" → Export as (group heading skipped)', (await active()) === 'dm-export');
await page.keyboard.press('ArrowRight');
await sleep(60);
check('ArrowRight opens the flyout', await isOpen(page, exportFly));
check('…and focuses its first row', (await active()) === 'dm-pdf');
check('row aria-expanded + aria-controls while open', (await page.getAttribute('#dm-export', 'aria-expanded')) === 'true' && !!(await page.getAttribute('#dm-export', 'aria-controls')));
const flyRect = await page.locator(exportFly).boundingBox();
const rowRect = await page.locator('#dm-export').boundingBox();
check('flyout sits at the row\'s inline end (LTR: right)', flyRect.x >= rowRect.x + rowRect.width - 2, `${flyRect.x} vs ${rowRect.x + rowRect.width}`);
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
check('arrows stay within the flyout level', (await active()) === 'dm-more');
await page.keyboard.press('Enter');
await sleep(60);
check('Enter opens a nested flyout', (await isOpen(page, moreFly)) && (await active()) === 'dm-svg');
await page.keyboard.press('Escape');
await sleep(60);
check('Escape closes one level', !(await isOpen(page, moreFly)) && (await isOpen(page, exportFly)) && (await isOpen(page, fileLayer)));
check('…focus back on its row', (await active()) === 'dm-more');
await page.keyboard.press('ArrowLeft');
await sleep(60);
check('ArrowLeft closes the flyout, focus on its row', !(await isOpen(page, exportFly)) && (await active()) === 'dm-export');
await page.keyboard.press('ArrowLeft');
check('ArrowLeft in the root does nothing', (await isOpen(page, fileLayer)) && (await active()) === 'dm-export');
await page.keyboard.press(' ');
await sleep(60);
check('Space opens the flyout', (await isOpen(page, exportFly)) && (await active()) === 'dm-pdf');
await page.keyboard.press('Enter');
await sleep(80);
check('picking a flyout row closes the whole menu', !(await isOpen(page, exportFly)) && !(await isOpen(page, fileLayer)));
check('focus returns to the root trigger', await isActive(fileTrigger));

console.log('Submenus (pointer)');
// A flyout that just closed ignores a mouseenter for 300ms (the pointer left under a closing panel).
await sleep(350);
await page.click(fileTrigger);
await sleep(80);
await page.hover('#dm-export');
await sleep(60);
check('hover does not open before the delay', !(await isOpen(page, exportFly)));
await sleep(200);
check('hover opens after the delay', await isOpen(page, exportFly));
check('hover open keeps focus on the row', (await active()) === 'dm-export');
await page.click('#dm-export');
await sleep(60);
check('the click right after a hover open pins it', await isOpen(page, exportFly));
check('…and focuses the first flyout row', (await active()) === 'dm-pdf');
await page.hover('#dm-share');
await sleep(400);
check('opening a sibling flyout closes the other', (await isOpen(page, shareFly)) && !(await isOpen(page, exportFly)));
// Leave the hover-opened Share flyout straight down to the root's last row (out of the safe
// triangle): it closes after the delay.
const shareRow = await page.locator('#dm-share').boundingBox();
const closeRow = await page.locator('#dm-close').boundingBox();
await page.mouse.move(shareRow.x + 30, closeRow.y + closeRow.height / 2, {steps: 6});
await sleep(350);
check('leaving a hover-opened flyout closes it', !(await isOpen(page, shareFly)));
await page.hover('#dm-export');
await sleep(300);
const fr = await page.locator(exportFly).boundingBox();
const rr = await page.locator('#dm-export').boundingBox();
// Travel diagonally toward the flyout's lower part, crossing the next row (the safe triangle).
await page.mouse.move(rr.x + rr.width - 6, rr.y + rr.height / 2);
await page.mouse.move(rr.x + rr.width + 1, rr.y + rr.height + 8, {steps: 4});
await sleep(260);
check('safe triangle keeps the flyout open while heading to it', await isOpen(page, exportFly));
await page.mouse.move(fr.x + 20, fr.y + fr.height - 10, {steps: 3});
await sleep(260);
check('reaching the flyout keeps it open', await isOpen(page, exportFly));
await page.click('#dm-export');
await sleep(80);
check('a later click on the open row closes the flyout', !(await isOpen(page, exportFly)) && (await isOpen(page, fileLayer)));
await page.hover('#dm-templates');
await sleep(300);
check('a disabled submenu never opens', !(await isOpen(page, await flyoutOf('dm-templates'))));
await page.hover('#dm-export');
await sleep(300);
await page.mouse.click(1000, 860);
await sleep(80);
check('outside press closes the root and its open flyouts', !(await isOpen(page, fileLayer)) && !(await isOpen(page, exportFly)));

console.log('Busy submenu');
check('spinner row carries its busy label', (await page.getAttribute('#dm-recent', 'data-ax-busy-label')) === 'Loading');

console.log('RTL');
const rtlTrigger = '[data-testid="dm-rtl-trigger"]';
const rtlFly = await flyoutOf('dm-rtl-move');
await page.focus(rtlTrigger);
await page.keyboard.press('Enter');
await sleep(80);
await page.keyboard.press('ArrowDown');
check('focus on the RTL submenu row', (await active()) === 'dm-rtl-move');
await page.keyboard.press('ArrowRight');
await sleep(60);
check('ArrowRight does not open in RTL', !(await isOpen(page, rtlFly)));
await page.keyboard.press('ArrowLeft');
await sleep(60);
check('ArrowLeft opens in RTL', (await isOpen(page, rtlFly)) && (await active()) === 'dm-rtl-archive');
const rf = await page.locator(rtlFly).boundingBox();
const rrow = await page.locator('#dm-rtl-move').boundingBox();
check('RTL flyout opens to the left of its row', rf.x + rf.width <= rrow.x + 2, `${rf.x + rf.width} vs ${rrow.x}`);
await page.keyboard.press('ArrowRight');
await sleep(60);
check('ArrowRight closes in RTL', !(await isOpen(page, rtlFly)) && (await active()) === 'dm-rtl-move');
await page.keyboard.press('Escape');
await sleep(60);

console.log('Long menu');
const longTrigger = '[data-testid="dm-long-trigger"]';
await page.click(longTrigger);
await sleep(100);
const longInfo = await page.evaluate(() => {
  const m = document.getElementById('dm-long-menu');
  return {h: m.getBoundingClientRect().height, over: m.hasAttribute('data-ax-overflow'), overflow: getComputedStyle(m).overflowY, tab: m.getAttribute('tabindex')};
});
check('long menu caps at 300px', longInfo.h <= 301 && longInfo.h > 250, String(longInfo.h));
check('…scrolls and joins the Tab order', longInfo.over && longInfo.overflow === 'auto' && longInfo.tab === '0', JSON.stringify(longInfo));
await page.keyboard.press('End');
const scrolled = await page.evaluate(() => {
  const m = document.getElementById('dm-long-menu');
  const r = document.activeElement.getBoundingClientRect();
  const b = m.getBoundingClientRect();
  return m.scrollTop > 0 && r.bottom <= b.bottom + 1;
});
check('End scrolls the last row into view', scrolled);
await page.keyboard.press('p');
check('typeahead "p" from Raspberry wraps to Papaya', (await activeText()) === 'Papaya');
await page.keyboard.press('Escape');
await sleep(50);
await page.click('[data-testid="dm-tall-trigger"]');
await sleep(100);
const tallH = await page.evaluate(() => document.getElementById('dm-tall-menu').getBoundingClientRect().height);
check('menuMaxHeight lifts the cap', tallH > 400 && tallH <= 481, String(tallH));
await page.keyboard.press('Escape');
await sleep(50);

console.log('Sizes');
for (const size of ['sm', 'md', 'lg']) {
  const sizes = await page.evaluate((s) => [...document.getElementById(`dm-size-${s}-menu`).querySelectorAll('[data-ax-menu-row]')].map((r) => r.getAttribute('data-size')), size);
  check(`${size} trigger → ${size} rows (checkbox, radio, submenu included)`, sizes.length === 6 && sizes.every((v) => v === size), sizes.join(','));
}
check('sm menu → sm indicators', await page.evaluate(() => [...document.getElementById('dm-size-sm-menu').querySelectorAll('[data-ax-marker]')].every((m) => m.getAttribute('data-size') === 'sm')));
check('lg menu → md indicators', await page.evaluate(() => [...document.getElementById('dm-size-lg-menu').querySelectorAll('[data-ax-marker]')].every((m) => m.getAttribute('data-size') === 'md')));
await page.click('[data-testid="dm-size-sm-trigger"]');
await sleep(60);
await page.keyboard.press('Escape');
const pad = await page.evaluate(() => ['sm', 'md', 'lg'].map((s) => {
  const layer = document.getElementById(`dm-size-${s}-menu`).closest('ax-menu');
  layer.showPopover();
  const v = getComputedStyle(document.getElementById(`dm-size-${s}-menu`).querySelector('[data-ax-menu-row="item"]')).paddingTop;
  layer.hidePopover();
  return v;
}));
check('row block padding by size (4 / 6 / 8px)', pad.join() === '4px,6px,8px', pad.join());
check('flyout rows of a sm menu are sm too; the flyout is a layer root', await page.evaluate(() => {
  const fly = document.getElementById(document.getElementById('dm-size-sm-menu').querySelector('[data-ax-submenu]').getAttribute('data-ax-submenu'));
  return [...fly.querySelectorAll('[data-ax-menu-row]')].every((r) => r.getAttribute('data-size') === 'sm') && fly.hasAttribute('data-astryx-layer-root');
}));

console.log('Custom trigger, regions, disabled trigger');
const customLayer = '#' + (await page.getAttribute('#dm-custom-trigger', 'popovertarget'));
check('custom trigger stamped with the invoker + menu ARIA', (await page.getAttribute('#dm-custom-trigger', 'aria-haspopup')) === 'menu' && (await page.getAttribute('#dm-custom-trigger', 'aria-controls')) === 'dm-custom-menu');
check('menu named by the custom trigger', (await page.getAttribute('#dm-custom-menu', 'aria-labelledby')) === 'dm-custom-trigger');
await page.click('#dm-custom-trigger');
await sleep(80);
check('custom trigger opens it', await isOpen(page, customLayer));
await page.keyboard.press('Escape');
await sleep(60);
check('Escape returns focus to the custom trigger', (await active()) === 'dm-custom-trigger');

const regionsTrigger = '[data-testid="dm-regions-trigger"]';
check('with a header/footer the trigger says aria-haspopup=dialog', (await page.getAttribute(regionsTrigger, 'aria-haspopup')) === 'dialog');
await page.focus(regionsTrigger);
await page.keyboard.press('Enter');
await sleep(80);
check('keyboard open lands on the first row', (await activeText()) === 'Bug');
await page.keyboard.press('Tab');
check('Tab from the menu → footer', (await active()) === 'dm-regions-create');
await page.keyboard.press('Tab');
check('Tab wraps → header', (await active()) === 'dm-regions-filter');
await page.keyboard.press('Tab');
check('Tab → the menu (one stop)', (await active()) === 'dm-regions-menu');
await page.keyboard.press('Shift+Tab');
check('Shift+Tab → header', (await active()) === 'dm-regions-filter');
await page.keyboard.type('x');
check('typing in the header field keeps its keys', (await page.inputValue('#dm-regions-filter')) === 'x');
await page.keyboard.press('Escape');
await sleep(60);
check('Escape closes the dialog menu', !(await isOpen(page, '#' + (await layerOf('dm-regions-trigger')))));

const disabledTrigger = '[data-testid="dm-disabled-trigger"]';
await page.click(disabledTrigger, {force: true});
await sleep(60);
check('a disabled trigger never opens', !(await isOpen(page, '#' + (await layerOf('dm-disabled-trigger')))));

console.log('API and state');
await events();
await page.evaluate((s) => document.querySelector(s).show(), basicLayer);
await sleep(100);
check('show() opens on the first row', (await isOpen(page, basicLayer)) && (await active()) === 'edit');
check('…reflected in data-ax-open and astryx-open-change {isOpen: true}', (await page.getAttribute(basicLayer, 'data-ax-open')) === 'true' && (await events()).some((e) => e.type === 'astryx-open-change' && e.isOpen === true));
await page.evaluate((s) => document.querySelector(s).setAttribute('data-ax-open', 'false'), basicLayer);
await sleep(80);
check('data-ax-open="false" closes it', !(await isOpen(page, basicLayer)));
await page.focus('[data-testid="dm-sections-trigger"]');
const mounted = await page.evaluate(async (s) => {
  // A menu that connects already open does not take focus (#5976).
  const source = document.querySelector(s);
  const clone = source.cloneNode(true);
  clone.id = 'dm-mounted-open';
  clone.querySelector('[role="menu"]').id = 'dm-mounted-open-menu';
  clone.setAttribute('data-ax-open', 'true');
  source.after(clone);
  await new Promise((r) => setTimeout(r, 100));
  const result = {open: clone.matches(':popover-open'), focus: document.activeElement?.getAttribute('data-testid')};
  clone.hidePopover();
  clone.remove();
  return result;
}, basicLayer);
check('mounting open shows the menu without moving focus', mounted.open && mounted.focus === 'dm-sections-trigger', JSON.stringify(mounted));

console.log('Icon trigger tooltip');
const iconTrigger = '[data-testid="dm-icon-trigger"]';
await page.hover(iconTrigger);
await sleep(400);
const tipId = await page.getAttribute(iconTrigger, 'data-ax-tooltip');
check('tooltip shows on hover', await isOpen(page, '#' + tipId));
await page.click(iconTrigger);
await sleep(100);
check('opening the menu hides the trigger tooltip', !(await isOpen(page, '#' + tipId)));
await page.keyboard.press('Escape');
await sleep(80);

console.log('Geometry: the menu below its trigger, the flyout beside its row');
await open('dropdown-menu');
await page.focus(fileTrigger);
await page.keyboard.press('Enter');
await sleep(80);
await page.keyboard.press('e');
await page.keyboard.press('ArrowRight');
await sleep(80);
const geometry = await page.evaluate(([t, l, f]) => {
  const tr = document.querySelector(t).getBoundingClientRect();
  const lr = document.querySelector(l).getBoundingClientRect();
  const fr = document.querySelector(f).getBoundingClientRect();
  const row = document.getElementById('dm-export').getBoundingClientRect();
  return {below: lr.top >= tr.bottom && lr.top - tr.bottom < 12 && Math.abs(lr.left - tr.left) < 2, beside: fr.left >= row.right - 2 && Math.abs(fr.top - row.top) < 12};
}, [fileTrigger, fileLayer, exportFly]);
check('the menu opens below its trigger', geometry.below, JSON.stringify(geometry));
check('…and the flyout beside its row', geometry.beside, JSON.stringify(geometry));
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
await sleep(60);

await done();
