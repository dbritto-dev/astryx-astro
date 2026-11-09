#!/usr/bin/env node
/**
 * InputGroup in a real browser (run `cd apps/docs && npx astro build` first): group naming
 * (role=group + aria-labelledby/-describedby), member naming ("<group> <input>"), the Field
 * shell removed from members, connected geometry (corners, -1 border overlap, one row,
 * group height per size), focus raising the focused member (z-index 2) with the ring fully
 * visible, Button addon markers, status in the group, the disabled cascade, and a member
 * in a horizontal-labels FormLayout.   node tools/tests/input-group.test.mjs
 */
import {setup, isOpen, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('input-group');

const names = await page.evaluate(() => {
  const text = (ids) => (ids ?? '').split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)?.textContent.trim()).join(' ');
  const group = document.querySelector('[data-test="website"]');
  const input = group.querySelector('input');
  return {
    role: group.getAttribute('role'), groupName: text(group.getAttribute('aria-labelledby')), groupDesc: text(group.getAttribute('aria-describedby')),
    inputName: text(input.getAttribute('aria-labelledby')), inputDesc: text(input.getAttribute('aria-describedby')),
    noShell: !group.querySelector('.astryx-field'), labelEl: document.getElementById(group.getAttribute('aria-labelledby'))?.tagName,
    hiddenLabel: input.parentElement.querySelector('.ax-visually-hidden')?.textContent,
  };
});
check('role=group named by the group label (a span, not <label>) and described', names.role === 'group' && names.groupName === 'Website' && names.labelEl === 'SPAN' && names.groupDesc === 'Your public homepage', JSON.stringify(names));
check('member input named "<group> <own label>", described by the group text', names.inputName === 'Website Domain' && names.inputDesc === 'Your public homepage', JSON.stringify(names));
check('members render without their own Field shell; own label visually hidden', names.noShell && names.hiddenLabel === 'Domain', JSON.stringify(names));

const geo = await page.evaluate(() => {
  const g = document.querySelector('[data-test="price"]');
  const items = [...g.children].filter((c) => c.hasAttribute('data-astryx-input-group-item'));
  const rects = items.map((i) => i.getBoundingClientRect());
  const cs = items.map((i) => getComputedStyle(i));
  return {
    count: items.length, oneRow: rects.every((r) => Math.abs(r.top - rects[0].top) < 0.5 && Math.abs(r.height - rects[0].height) < 0.5),
    overlap: rects[1].left - rects[0].right, groupHeight: g.getBoundingClientRect().height,
    firstRadius: [cs[0].borderStartStartRadius, cs[0].borderStartEndRadius], middleRadius: [cs[1].borderStartStartRadius, cs[1].borderEndEndRadius],
    lastRadius: [cs[2].borderStartStartRadius, cs[2].borderStartEndRadius],
  };
});
check('three members on one row at the group height', geo.count === 3 && geo.oneRow && Math.round(geo.groupHeight) === 32, JSON.stringify(geo));
check('borders overlap by one border width', Math.abs(geo.overlap + 1) < 0.6, JSON.stringify(geo));
check('only the outer corners are rounded', geo.firstRadius[0] !== '0px' && geo.firstRadius[1] === '0px' && geo.middleRadius.every((r) => r === '0px') && geo.lastRadius[0] === '0px' && geo.lastRadius[1] !== '0px', JSON.stringify(geo));

for (const [size, px] of [['sm', 28], ['md', 32], ['lg', 36]]) {
  const h = await page.evaluate((s) => {
    const g = document.querySelector(`[data-test="size-${s}"]`);
    const [input, button] = [g.querySelector('.astryx-text-input'), g.querySelector('.astryx-button')];
    return {g: g.getBoundingClientRect().height, i: input.getBoundingClientRect().height, b: button.getBoundingClientRect().height, iSize: input.dataset.size, bSize: button.dataset.size, marker: button.hasAttribute('data-astryx-input-group-item')};
  }, size);
  check(`size ${size}: group, input and Button addon are ${px}px; size stamped on members`, Math.round(h.g) === px && Math.round(h.i) === px && Math.round(h.b) === px && h.iSize === size && h.bSize === size && h.marker, JSON.stringify(h));
}

const buttons = await page.evaluate(() => {
  const g = document.querySelector('[data-test="buttons"]');
  const [first, , last] = [...g.children].filter((c) => c.hasAttribute('data-astryx-input-group-item'));
  const a = getComputedStyle(first);
  const b = getComputedStyle(last);
  return {firstEnd: a.borderStartEndRadius, firstStart: a.borderStartStartRadius, lastStart: b.borderStartStartRadius, lastEnd: b.borderEndEndRadius};
});
check('Button addons join: inner corners square, outer corners kept', buttons.firstEnd === '0px' && buttons.firstStart !== '0px' && buttons.lastStart === '0px' && buttons.lastEnd !== '0px', JSON.stringify(buttons));

// focus raises the member above its neighbours
await page.click('[data-test="price"] input');
const z = await page.evaluate(() => {
  const g = document.querySelector('[data-test="price"]');
  const box = g.querySelector('.astryx-number-input');
  const text = g.querySelector('.astryx-input-group-text');
  const r = box.getBoundingClientRect();
  // The left border column of the focused box (shared with the "$" cell) must be the box's.
  const hit = document.elementFromPoint(r.left + 0.5, r.top + r.height / 2);
  return {z: getComputedStyle(box).zIndex, shadow: getComputedStyle(box).boxShadow, top: box.contains(hit) || hit === box, textZ: getComputedStyle(text).zIndex};
});
check('focused member is raised (z-index 2) and draws its focus ring on top', z.z === '2' && z.shadow.includes('inset') && z.top, JSON.stringify(z));
await page.keyboard.press('Tab');
await page.keyboard.press('Tab');

// status: the group's message describes the group and the input; member border keeps its status
const status = await page.evaluate(() => {
  const g = document.querySelector('[data-test="status"]');
  const input = g.querySelector('input');
  const text = (ids) => (ids ?? '').split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)?.textContent.trim()).join(' | ');
  return {
    groupStatus: g.dataset.status, inputDesc: text(input.getAttribute('aria-describedby')), invalid: input.getAttribute('aria-invalid'),
    icon: !!g.querySelector('.astryx-input-status-icon'), box: g.closest('.astryx-field').querySelector('.astryx-field-status')?.dataset.variant,
  };
});
check('group status: data-status, detached message describing the input; no member status icon', status.groupStatus === 'error' && status.inputDesc === 'This code has expired' && status.box === 'detached' && !status.icon && status.invalid === 'true', JSON.stringify(status));

// disabled cascade
const dis = await page.evaluate(() => {
  const g = document.querySelector('[data-test="disabled"]');
  const input = g.querySelector('input');
  const button = g.querySelector(':scope > .astryx-button');
  return {
    group: g.getAttribute('aria-disabled'), input: input.getAttribute('aria-disabled'), readOnly: input.readOnly, name: input.getAttribute('name'),
    box: input.closest('.astryx-text-input').dataset.disabled, clear: !!g.querySelector('[data-ax-input-clear]'), button: button.disabled, opacity: getComputedStyle(g).opacity,
  };
});
check('disabled group: member inputs aria-disabled + readonly, no name, no clear; Buttons disabled', dis.group === 'true' && dis.input === 'true' && dis.readOnly && dis.name === null && dis.box === 'disabled' && !dis.clear && dis.button && dis.opacity === '0.5', JSON.stringify(dis));

const formLayout = await page.evaluate(() => {
  const input = document.querySelector('input[name="budget"]');
  const g = input.closest('.astryx-input-group');
  const field = g.closest('.astryx-field');
  return {required: input.getAttribute('aria-required'), dir: field.dataset.formDirection, display: getComputedStyle(field).display};
});
check('in a horizontal-labels FormLayout: group field dissolves; member aria-required stamped', formLayout.required === 'true' && formLayout.dir === 'horizontal-labels' && formLayout.display === 'contents', JSON.stringify(formLayout));

// Tooltips on a page whose first Tooltip sits in a member's removed Field shell: Astro renders a
// component's <script> after its first instance only, so the group must keep that script.
const tip = await page.evaluate(() => {
  const icon = document.querySelector('[data-test="status"]').closest('.astryx-field').querySelector('[data-ax-label-tip]');
  const r = icon.getBoundingClientRect();
  return {defined: !!customElements.get('ax-tooltip'), id: icon.getAttribute('data-ax-tooltip'), x: r.left + r.width / 2, y: r.top + r.height / 2};
});
await page.mouse.move(tip.x, tip.y, {steps: 2});
let tipOpen = false;
for (let i = 0; i < 20 && !tipOpen; i++) { await sleep(50); tipOpen = await isOpen(page, `#${tip.id}`); }
check('group label tooltip: <ax-tooltip> is defined and opens on hover', tip.defined && tipOpen, JSON.stringify({...tip, tipOpen}));
await page.mouse.move(0, 0);

await done();
