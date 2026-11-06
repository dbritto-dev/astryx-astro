#!/usr/bin/env node
/**
 * Toolbar in system Chrome against the built docs (`cd apps/docs && npx astro build`):
 *   - semantics: role=toolbar named by label, aria-orientation, theme data-size;
 *   - roving focus (useListFocus): one Tab stop, arrows, Home/End, wrap, disabled items
 *     (native and aria-disabled) skipped, vertical keys, RTL arrows, the caret guard in a text
 *     field, a nested ButtonGroup keeps its own arrows;
 *   - size stamping reaches Buttons, IconButtons, their slot icons and a nested ButtonGroup;
 *     explicit sizes win;
 *   - layout: start/end/center slots, edge compensation pulls a ghost button's slot in;
 *   - keyboard hint: shown on the first keyboard entry, dismissed by an arrow key, never again.
 *   node tools/tests/toolbar.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('toolbar');

const focused = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim());
const row = (test) => `[data-test="${test}"] .astryx-toolbar, .astryx-toolbar[data-test="${test}"]`;
const enterFromBefore = async (test) => {
  await page.evaluate((sel) => {
    const tb = document.querySelector(sel);
    const before = document.createElement('button');
    before.className = 'tab-anchor';
    before.textContent = 'before';
    tb.closest('.ax-section-outer').before(before);
    before.focus();
  }, row(test));
  await page.keyboard.press('Tab');
};

console.log('Semantics');
const sem = await page.$eval(row('basic'), (el) => ({
  role: el.getAttribute('role'), label: el.getAttribute('aria-label'), orientation: el.getAttribute('aria-orientation'),
  size: el.dataset.size, cls: el.className, section: el.closest('.astryx-section') != null,
}));
check('role=toolbar named by label, aria-orientation, data-size, inside a Section',
  sem.role === 'toolbar' && sem.label === 'Document actions' && sem.orientation === 'horizontal' && sem.size === 'md' && sem.cls === 'astryx-toolbar' && sem.section,
  JSON.stringify(sem));

console.log('Roving focus');
const stops = await page.$$eval(`${row('basic')} :is(button, a[href], input, [tabindex])`, (els) => els.filter((e) => !e.closest('[popover]')).map((e) => e.getAttribute('tabindex')));
check('one tab stop on load', stops.filter((t) => t === '0').length === 1 && stops[0] === '0', JSON.stringify(stops));
await enterFromBefore('basic');
check('Tab enters on the first item', (await focused()) === 'Back');
await sleep(50);
const hintOpen = () => page.$eval(row('basic'), (el) => document.getElementById(el.getAttribute('data-ax-keyboard-hint'))?.matches(':popover-open'));
check('keyboard hint shows on the first keyboard entry', await hintOpen());
const hintGeo = await page.$eval(row('basic'), (el) => {
  const hint = document.getElementById(el.getAttribute('data-ax-keyboard-hint'));
  const a = document.activeElement.getBoundingClientRect();
  const h = hint.getBoundingClientRect();
  return {below: h.top >= a.bottom, start: Math.abs(h.left - a.left) < 2, text: hint.textContent, hidden: hint.firstElementChild.getAttribute('aria-hidden')};
});
check('hint sits below the focused item, start-aligned, aria-hidden ("← → to navigate")', hintGeo.below && hintGeo.start && hintGeo.text.includes('to navigate') && hintGeo.hidden === 'true', JSON.stringify(hintGeo));
await page.keyboard.press('ArrowRight');
check('ArrowRight → next item', (await focused()) === 'Search');
check('an arrow key dismisses the hint', !(await hintOpen()));
await page.keyboard.press('ArrowRight');
check('… → Share', (await focused()) === 'Share');
await page.keyboard.press('End');
check('End → last', (await focused()) === 'Publish');
await page.keyboard.press('ArrowRight');
check('wraps to the first', (await focused()) === 'Back');
await page.keyboard.press('ArrowLeft');
check('ArrowLeft wraps to the last', (await focused()) === 'Publish');
await page.keyboard.press('Home');
check('Home → first', (await focused()) === 'Back');
await page.keyboard.press('Tab');
const left = await page.$eval(row('basic'), (el) => !el.contains(document.activeElement));
check('Tab leaves the toolbar', left);
await page.keyboard.press('Shift+Tab');
check('Shift+Tab returns to the last focused item', (await focused()) === 'Back');
await sleep(50);
check('the hint does not show again', !(await hintOpen()));

await page.focus(`${row('disabled-items')} .astryx-button`);
await page.keyboard.press('ArrowRight');
check('disabled items (native and aria-disabled) are skipped', (await focused()) === 'Four');

console.log('Caret guard');
const inputSel = `${row('end-only')} input`;
await page.focus(inputSel);
await page.keyboard.type('abc');
await page.keyboard.press('ArrowLeft');
const caret = await page.$eval(inputSel, (el) => ({active: document.activeElement === el, pos: el.selectionStart}));
check('ArrowLeft inside text moves the caret, not focus', caret.active && caret.pos === 2, JSON.stringify(caret));
await page.keyboard.press('End');
const stillIn = await page.$eval(inputSel, (el) => document.activeElement === el && el.selectionStart === 3);
check('End stays in the field (caret to the end)', stillIn);
await page.keyboard.press('ArrowRight');
check('ArrowRight at the end of the text → next item', (await focused()) === 'Apply');

console.log('Vertical and RTL');
await page.focus(`${row('vertical')} .astryx-button`);
await page.keyboard.press('ArrowDown');
check('vertical: ArrowDown → next', (await focused()) === 'Search');
await page.keyboard.press('ArrowDown');
check('vertical: ArrowDown crosses slots', (await focused()) === 'Settings');
await page.keyboard.press('ArrowLeft');
check('vertical: horizontal keys ignored', (await focused()) === 'Settings');
const vert = await page.$eval(row('vertical'), (el) => ({o: el.getAttribute('aria-orientation'), dir: getComputedStyle(el).flexDirection}));
check('vertical: aria-orientation and stacked slots', vert.o === 'vertical' && vert.dir === 'column', JSON.stringify(vert));
await page.focus(`${row('rtl')} .astryx-button`);
await page.keyboard.press('ArrowLeft');
check('RTL: ArrowLeft moves forward', (await focused()) === 'Second');
await page.keyboard.press('ArrowRight');
check('RTL: ArrowRight moves back', (await focused()) === 'First');

console.log('Nested ButtonGroup');
await page.focus(`${row('center')} [aria-label="Undo"]`);
await page.keyboard.press('ArrowRight');
check('arrows inside a ButtonGroup move within the group', (await focused()) === 'Redo');
await page.keyboard.press('ArrowRight');
check('the group wraps within itself', (await focused()) === 'Undo');

console.log('Size stamping');
const sizes = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-test="sizes"] .astryx-toolbar')].map((t) => [t.dataset.case, [...t.querySelectorAll('.astryx-button')].map((b) => ({
  name: b.getAttribute('aria-label') ?? b.textContent.trim(), size: b.dataset.size, h: Math.round(b.getBoundingClientRect().height),
  icon: b.querySelector('.astryx-icon')?.dataset.size ?? null, iconPx: Math.round(b.querySelector('.astryx-icon')?.getBoundingClientRect().width ?? 0),
}))])));
const iconFor = {sm: ['sm', 16], md: ['sm', 16], lg: ['md', 20]};
const heightFor = {sm: 28, md: 32, lg: 36};
for (const size of ['sm', 'md', 'lg']) {
  const items = sizes[size];
  const inherited = items.filter((b) => b.name !== 'Explicit sm');
  const explicit = items.find((b) => b.name === 'Explicit sm');
  check(`toolbar ${size}: Buttons and IconButtons ${size} (${heightFor[size]}px), icons ${iconFor[size][0]}`,
    inherited.every((b) => b.size === size && b.h === heightFor[size]) && inherited.filter((b) => b.icon).every((b) => b.icon === iconFor[size][0] && b.iconPx === iconFor[size][1]),
    JSON.stringify(items));
  check(`toolbar ${size}: an explicit size wins`, explicit?.size === 'sm' && explicit.h === 28, JSON.stringify(explicit));
}
const nested = await page.$eval(`${row('center')} [data-case="group"]`, (g) => ({group: g.dataset.size, members: [...g.querySelectorAll('.astryx-button')].map((b) => b.dataset.size)}));
check('a nested ButtonGroup without a size takes the toolbar size (sm), and its members too', nested.group === 'sm' && nested.members.every((s) => s === 'sm'), JSON.stringify(nested));

console.log('Layout');
const layout = await page.evaluate(() => {
  const c = document.querySelector('[data-test="center"] .astryx-toolbar, .astryx-toolbar[data-test="center"]');
  const slots = [...c.children].filter((el) => el.classList.contains('ax-toolbar-slot')).map((s) => s.getBoundingClientRect());
  const tb = c.getBoundingClientRect();
  const center = slots[1];
  return {display: getComputedStyle(c).display, slots: slots.length, centered: Math.abs((center.left + center.width / 2) - (tb.left + tb.width / 2)) < 2};
});
check('centerContent: three-slot grid with a centered middle', layout.display === 'grid' && layout.slots === 3 && layout.centered, JSON.stringify(layout));
const startOnly = await page.$eval(row('start-only'), (el) => {
  const s = el.querySelector('.ax-toolbar-start');
  return {grow: getComputedStyle(s).flexGrow, gap: getComputedStyle(s).columnGap};
});
check('a lone start slot fills; gap={3} spaces its items (12px)', startOnly.grow === '1' && startOnly.gap === '12px', JSON.stringify(startOnly));
const endOnly = await page.$eval(row('end-only'), (el) => {
  const e = el.querySelector('.ax-toolbar-end');
  return Math.round(el.getBoundingClientRect().right - e.getBoundingClientRect().right);
});
check('a lone end slot sits at the end', endOnly === 0, String(endOnly));
const edge = await page.evaluate(() => {
  const tb = document.querySelector('[data-test="card"] .astryx-toolbar');
  const start = tb.querySelector('.ax-toolbar-start');
  const end = tb.querySelector('.ax-toolbar-end');
  const section = tb.closest('.astryx-section');
  const pad = getComputedStyle(section).paddingInlineStart;
  return {start: getComputedStyle(start).marginInlineStart, end: getComputedStyle(end).marginInlineEnd, pad};
});
// inset = container padding − spacing-2 (8px).
const expectInset = `-${parseFloat(edge.pad) - 8}px`;
check('edge compensation: ghost-edged slots pull in by (container padding − spacing-2)', edge.start === expectInset && edge.end === expectInset, JSON.stringify({...edge, expectInset}));
const noComp = await page.$eval(row('basic'), (el) => getComputedStyle(el.querySelector('.ax-toolbar-end')).marginInlineEnd);
check('no compensation when the edge item is not ghost', noComp === '0px', noComp);

await done();
