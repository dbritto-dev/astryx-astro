#!/usr/bin/env node
/**
 * ButtonGroup in system Chrome against the built docs (`cd apps/docs && npx astro build`):
 *   - roving focus (useListFocus): one Tab stop, arrows along the orientation, Home/End, wrap,
 *     disabled members skipped, vertical keys, RTL arrows;
 *   - connected geometry: outer-only radius, dividers, trailing end cap past a tooltip layer
 *     and a script, no press scale, one shadow on the group (members paint none);
 *   - size stamping: explicit group size reaches members and their slot icons, an explicit
 *     member size wins, a size-less group inherits an outer provider's size;
 *   - group-disabled: native disabled + 50% opacity, tooltip members aria-disabled but
 *     focusable, link members become <button>, busy members natively disabled, and nothing
 *     activates (click, Enter, Space reach no listener).
 *   node tools/tests/button-group.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('button-group');

const focused = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim());
const tabindexes = (sel) => page.evaluate((s) => [...document.querySelectorAll(`${s} > .astryx-button`)].map((b) => b.getAttribute('tabindex')).join(','), sel);

console.log('Roving focus');
const basic = '[data-test="basic"]';
check('one tab stop on load', (await tabindexes(basic)) === '0,-1,-1', await tabindexes(basic));
check('group is role=group named by label', await page.evaluate((s) => {
  const g = document.querySelector(s);
  return g.getAttribute('role') === 'group' && g.getAttribute('aria-label') === 'Clipboard';
}, basic));
// Tab into the group from the element before it.
await page.evaluate((s) => {
  const before = document.createElement('button');
  before.id = 'before-basic';
  before.textContent = 'before';
  document.querySelector(s).before(before);
}, basic);
await page.focus('#before-basic');
await page.keyboard.press('Tab');
check('Tab enters on the first member', (await focused()) === 'Copy');
await page.keyboard.press('ArrowRight');
check('ArrowRight → next member', (await focused()) === 'Cut');
check('the tab stop follows focus', (await tabindexes(basic)) === '-1,0,-1', await tabindexes(basic));
await page.keyboard.press('End');
check('End → last', (await focused()) === 'Paste');
await page.keyboard.press('ArrowRight');
check('wraps to the first', (await focused()) === 'Copy');
await page.keyboard.press('ArrowLeft');
check('ArrowLeft wraps to the last', (await focused()) === 'Paste');
await page.keyboard.press('Home');
check('Home → first', (await focused()) === 'Copy');
await page.keyboard.press('ArrowDown');
check('vertical keys ignored in a horizontal group', (await focused()) === 'Copy');
await page.keyboard.press('Tab');
const outside = await page.evaluate((s) => !document.querySelector(s).contains(document.activeElement), basic);
check('Tab leaves the group (single tab stop)', outside);

const partial = '[data-case="partial"]';
await page.focus(`${partial} > .astryx-button:first-child`);
await page.keyboard.press('ArrowRight');
check('a disabled member is skipped', (await focused()) === 'Third');

const vertical = '[data-test="vertical"]';
await page.focus(`${vertical} > .astryx-button:first-child`);
await page.keyboard.press('ArrowDown');
check('vertical: ArrowDown → next', (await focused()) === 'Middle');
await page.keyboard.press('ArrowUp');
check('vertical: ArrowUp → previous', (await focused()) === 'Top');
await page.keyboard.press('ArrowRight');
check('vertical: horizontal keys ignored', (await focused()) === 'Top');

const rtl = '[data-test="rtl"] .astryx-button-group';
await page.focus(`${rtl} > .astryx-button:first-child`);
await page.keyboard.press('ArrowLeft');
check('RTL: ArrowLeft moves forward', (await focused()) === 'Second');
await page.keyboard.press('ArrowRight');
check('RTL: ArrowRight moves back', (await focused()) === 'First');

console.log('Connected geometry');
const geo = await page.evaluate((s) => [...document.querySelectorAll(`${s} > .astryx-button`)].map((b) => {
  const cs = getComputedStyle(b);
  return {start: cs.borderStartStartRadius, end: cs.borderStartEndRadius, divider: cs.borderInlineStartWidth, group: b.dataset.axGroup};
}), basic);
check('members are stamped data-ax-group="horizontal"', geo.every((g) => g.group === 'horizontal'));
check('first member: rounded start, square end, no divider', geo[0].start !== '0px' && geo[0].end === '0px' && geo[0].divider === '0px', JSON.stringify(geo[0]));
check('middle member: square corners, 1px divider', geo[1].start === '0px' && geo[1].end === '0px' && geo[1].divider === '1px', JSON.stringify(geo[1]));
check('last member: rounded end', geo[2].end !== '0px' && geo[2].start === '0px', JSON.stringify(geo[2]));
const tooltipLast = await page.evaluate(() => {
  const g = document.querySelector('[data-case="tooltip-last"]');
  const last = [...g.querySelectorAll(':scope > .astryx-button')].at(-1);
  return {end: getComputedStyle(last).borderStartEndRadius, after: last.nextElementSibling?.tagName.toLowerCase()};
});
check('trailing end cap holds with the member\'s tooltip layer after it', tooltipLast.end !== '0px' && tooltipLast.after === 'ax-tooltip', JSON.stringify(tooltipLast));
const busyLast = await page.evaluate(() => {
  const last = [...document.querySelectorAll('[data-case="partial"] > .astryx-button')].at(-1);
  return getComputedStyle(last).borderStartEndRadius;
});
check('trailing end cap holds with a script element after the member', busyLast !== '0px', busyLast);
const vgeo = await page.evaluate((s) => [...document.querySelectorAll(`${s} > .astryx-button`)].map((b) => {
  const cs = getComputedStyle(b);
  return {top: cs.borderStartStartRadius, bottom: cs.borderEndStartRadius, divider: cs.borderBlockStartWidth};
}), vertical);
check('vertical: top rounded, bottom rounded on the last, block dividers', vgeo[0].top !== '0px' && vgeo[0].bottom === '0px' && vgeo[1].divider === '1px' && vgeo[2].bottom !== '0px', JSON.stringify(vgeo));
const solid = await page.evaluate(() => {
  const b = document.querySelector('[aria-label="Allow options"]');
  const probe = document.createElement('span');
  probe.style.color = 'var(--color-on-accent)';
  b.parentElement.append(probe);
  const want = getComputedStyle(probe).color;
  probe.remove();
  return {got: getComputedStyle(b).borderInlineStartColor, want};
});
check('primary members draw the divider in on-accent', solid.got === solid.want, JSON.stringify(solid));

// No press scale on members.
const copy = page.locator(`${basic} > .astryx-button`).first();
const box = await copy.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
const pressed = await copy.evaluate((el) => getComputedStyle(el).transform);
await page.mouse.up();
check('members never scale on press', pressed === 'none', pressed);

const elev = await page.evaluate(() => {
  const g = document.querySelector('[data-test="elevation"] [data-case="high"]');
  const m = g.querySelector('.astryx-button');
  return {group: getComputedStyle(g).boxShadow, member: getComputedStyle(m).boxShadow, memberAttr: m.dataset.elevation, groupAttr: g.dataset.elevation};
});
check('elevation: one shadow on the group, members paint none (data-elevation="none")',
  elev.group !== 'none' && elev.member === 'none' && elev.memberAttr === 'none' && elev.groupAttr === 'high', JSON.stringify(elev));

console.log('Size stamping');
const sizes = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-test="sizes"] [data-case]')].map((g) => [g.dataset.case, {
  group: g.dataset.size,
  members: [...g.querySelectorAll(':scope > .astryx-button')].map((b) => ({
    size: b.dataset.size, h: Math.round(b.getBoundingClientRect().height), explicit: b.hasAttribute('data-explicit'),
    icon: b.querySelector('.astryx-icon')?.dataset.size ?? null,
    iconPx: Math.round(b.querySelector('.astryx-icon')?.getBoundingClientRect().width ?? 0),
  })),
}])));
const iconFor = {sm: ['sm', 16], md: ['sm', 16], lg: ['md', 20]};
const heightFor = {sm: 28, md: 32, lg: 36};
for (const size of ['sm', 'md', 'lg']) {
  const g = sizes[size];
  const [save, search, explicit] = g.members;
  check(`size ${size}: group and members ${size} (${heightFor[size]}px), icons ${iconFor[size][0]} (${iconFor[size][1]}px)`,
    g.group === size && save.size === size && search.size === size && save.h === heightFor[size] && search.h === heightFor[size]
    && save.icon === iconFor[size][0] && save.iconPx === iconFor[size][1] && search.icon === iconFor[size][0] && search.iconPx === iconFor[size][1],
    JSON.stringify(g));
  check(`size ${size}: an explicit member size wins`, explicit.explicit && explicit.size === 'sm' && explicit.h === 28, JSON.stringify(explicit));
}
const inherited = sizes.inherited;
check('a size-less group inherits the outer provider (lg) and so do its members and icons',
  inherited.group === 'lg' && inherited.members.every((m) => m.size === 'lg' && m.h === 36 && m.icon === 'md' && m.iconPx === 20), JSON.stringify(inherited));

console.log('Group-disabled');
const dis = await page.evaluate(() => {
  const g = document.querySelector('[data-case="disabled"]');
  const pick = (el) => ({tag: el.tagName, disabled: el.disabled, aria: el.getAttribute('aria-disabled'), href: el.getAttribute('href'), opacity: getComputedStyle(el).opacity, elevation: el.dataset.elevation});
  return {
    group: g.getAttribute('aria-disabled'),
    plain: pick(g.querySelector('.astryx-button')),
    tooltip: pick(g.querySelector('[data-case-member="tooltip"]')),
    link: pick(g.querySelector('[data-case-member="link"]')),
    busy: {...pick(g.querySelector('[data-case-member="busy"]')), busyAttr: g.querySelector('[data-case-member="busy"]').getAttribute('aria-busy')},
  };
});
check('group carries aria-disabled', dis.group === 'true');
check('members: native disabled, 50% opacity', dis.plain.disabled && dis.plain.aria === null && dis.plain.opacity === '0.5', JSON.stringify(dis.plain));
check('tooltip member: aria-disabled, not native disabled', !dis.tooltip.disabled && dis.tooltip.aria === 'true' && dis.tooltip.opacity === '0.5', JSON.stringify(dis.tooltip));
check('link member renders <button disabled> without href', dis.link.tag === 'BUTTON' && dis.link.disabled && dis.link.href === null, JSON.stringify(dis.link));
check('busy member: native disabled, aria-busy kept, own aria-disabled dropped', dis.busy.disabled && dis.busy.aria === null && dis.busy.busyAttr === 'true', JSON.stringify(dis.busy));

const tip = '[data-case="disabled"] [data-case-member="tooltip"]';
await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  window.__hits = {self: 0, ancestor: 0};
  el.addEventListener('click', () => window.__hits.self++);
  document.querySelector('[data-case="disabled"]').addEventListener('click', () => window.__hits.ancestor++);
}, tip);
await page.click(tip, {force: true});
await page.focus(tip);
const tipFocused = await page.$eval(tip, (el) => document.activeElement === el);
await page.keyboard.press('Enter');
await page.keyboard.press('Space');
const hits = await page.evaluate(() => window.__hits);
check('disabled group cancels activation (click, Enter, Space reach no listener)', hits.self === 0 && hits.ancestor === 0, JSON.stringify(hits));
check('the tooltip member stays focusable', tipFocused);
await page.evaluate(() => document.activeElement?.blur());
await page.mouse.move(5, 5);
await sleep(400);
const tipBox = await page.locator(tip).boundingBox();
await page.mouse.move(tipBox.x + tipBox.width / 2, tipBox.y + tipBox.height / 2, {steps: 2});
await sleep(350);
const shown = await page.$eval(tip, (el) => {
  const layer = document.getElementById(el.getAttribute('data-ax-tooltip'));
  return {open: layer.matches(':popover-open'), describes: el.getAttribute('aria-describedby') === layer.id};
});
check('…and still shows its tooltip on hover (described by it)', shown.open && shown.describes, JSON.stringify(shown));
await page.mouse.move(5, 5);
const enabledCount = await page.evaluate(() => [...document.querySelectorAll('[data-case="disabled"] > button')].filter((b) => !b.disabled && b.getAttribute('aria-disabled') !== 'true').length);
check('no member of a disabled group can act', enabledCount === 0, String(enabledCount));

await done();
