#!/usr/bin/env node
/**
 * Slider in a real browser (run `cd apps/docs && npx astro build` first): role="slider" thumbs
 * (values, bounds, names, group in range mode), APG keys (arrows, PageUp/Down, Home/End) with
 * astryx-change / astryx-change-end, RTL keys and pointer, vertical, track press + drag, thumb
 * press without a jump, range thumbs never crossing (minStepsBetweenThumbs), marks, value tooltip
 * (held open while dragging, formatted), text display and Intl formatting, keyboard-only focus
 * ring, disabled + reason, required (explicit and FormLayout), native form submit / reset.
 *   node tools/tests/slider.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('slider');

const single = (t) => `[role="slider"][data-test="${t}"]`;
const group = (t) => `[role="group"][data-test="${t}"]`;
const sliderOf = (sel) => page.evaluate((s) => {
  const host = document.querySelector(s).closest('ax-slider');
  const thumbs = [...host.querySelectorAll('[role="slider"]')];
  return {
    values: thumbs.map((t) => Number(t.getAttribute('aria-valuenow'))),
    mins: thumbs.map((t) => Number(t.getAttribute('aria-valuemin'))),
    maxs: thumbs.map((t) => Number(t.getAttribute('aria-valuemax'))),
    texts: thumbs.map((t) => t.getAttribute('aria-valuetext')),
    progress: thumbs.map((t) => Number(t.style.getPropertyValue('--_slider-progress'))),
    text: host.querySelector('[data-ax-slider-text]')?.textContent ?? null,
    inputs: [...host.querySelectorAll('input[type="hidden"]')].map((i) => i.value),
  };
}, sel);

await page.evaluate(() => {
  window.__events = [];
  for (const type of ['astryx-change', 'astryx-change-end']) {
    document.addEventListener(type, (e) => window.__events.push({type, value: JSON.stringify(e.detail.value), tag: e.target.tagName}));
  }
});
const events = () => page.evaluate(() => window.__events.splice(0));

// ── wiring ──
const wiring = await page.evaluate((sel) => {
  const t = document.querySelector(sel);
  const label = document.getElementById(t.getAttribute('aria-labelledby'));
  return {
    tab: t.tabIndex, now: t.getAttribute('aria-valuenow'), min: t.getAttribute('aria-valuemin'), max: t.getAttribute('aria-valuemax'),
    orientation: t.getAttribute('aria-orientation'), label: label?.textContent?.trim(), labelTag: label?.tagName,
    hooks: ['.astryx-slider', '.astryx-slider-control', '.astryx-slider-track', '.astryx-slider-thumb'].every((c) => !!t.closest('ax-slider').matches(c) || !!t.closest('ax-slider').querySelector(`${c}[data-orientation="horizontal"]`)),
    id: t.id,
  };
}, single('single'));
check('single: a focusable role="slider" thumb with value and bounds', wiring.tab === 0 && wiring.now === '40' && wiring.min === '0' && wiring.max === '100' && wiring.orientation === 'horizontal', JSON.stringify(wiring));
check('single: named by the field label (a span, aria-labelledby); base props on the thumb', wiring.label === 'Volume' && wiring.labelTag === 'SPAN' && !!wiring.id, JSON.stringify(wiring));
check('theme targets carry data-orientation', wiring.hooks, JSON.stringify(wiring));
const range = await page.evaluate((sel) => {
  const g = document.querySelector(sel);
  const thumbs = [...g.querySelectorAll('[role="slider"]')];
  return {label: document.getElementById(g.getAttribute('aria-labelledby'))?.textContent?.trim(), names: thumbs.map((t) => t.getAttribute('aria-label')), texts: thumbs.map((t) => t.getAttribute('aria-valuetext'))};
}, group('range'));
check('range: role="group" named by the label; thumbs "Minimum value" / "Maximum value"', range.label === 'Price range' && range.names.join() === 'Minimum value,Maximum value', JSON.stringify(range));
check('range: formatValue → aria-valuetext', range.texts.join() === '$200,$800', JSON.stringify(range));

// ── keyboard ──
await page.focus(single('single'));
const keys = [['ArrowRight', 41], ['ArrowUp', 42], ['ArrowLeft', 41], ['ArrowDown', 40], ['PageUp', 50], ['PageDown', 40], ['End', 100], ['Home', 0]];
const seen = [];
for (const [key] of keys) {
  await page.keyboard.press(key);
  seen.push((await sliderOf(single('single'))).values[0]);
}
check('keys: ←/→/↑/↓ by step, PageUp/PageDown by 10 steps, Home/End to the bounds', seen.join() === keys.map((k) => k[1]).join(), seen.join());
let ev = await events();
check('each key: astryx-change {value} then astryx-change-end {value} from <ax-slider>', ev.length === keys.length * 2 && ev[0].type === 'astryx-change' && ev[0].value === '41' && ev[1].type === 'astryx-change-end' && ev[1].value === '41' && ev[0].tag === 'AX-SLIDER', JSON.stringify(ev.slice(0, 4)));
await page.keyboard.press('Home');
ev = await events();
check('a key that changes nothing still ends (change-end only)', ev.length === 1 && ev[0].type === 'astryx-change-end', JSON.stringify(ev));
let st = await sliderOf(single('single'));
check('thumb progress follows the value', st.progress[0] === 0, JSON.stringify(st));

// RTL
await page.focus(single('rtl'));
await page.keyboard.press('ArrowLeft');
st = await sliderOf(single('rtl'));
check('RTL: ArrowLeft increases (the value grows toward the left)', st.values[0] === 31, JSON.stringify(st));
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
st = await sliderOf(single('rtl'));
check('RTL: ArrowRight decreases', st.values[0] === 29, JSON.stringify(st));
await events();

// vertical
await page.focus(single('vertical'));
await page.keyboard.press('ArrowUp');
await page.keyboard.press('ArrowRight');
st = await sliderOf(single('vertical'));
check('vertical: ArrowUp / ArrowRight increase', st.values[0] === 32, JSON.stringify(st));
check('vertical: aria-orientation="vertical"', await page.evaluate((s) => document.querySelector(s).getAttribute('aria-orientation') === 'vertical', single('vertical')));
await events();

// ── range: thumbs never cross ──
const gap = group('range-gap');
await page.focus(`${gap} [data-ax-thumb="0"]`);
let gapState = await sliderOf(gap);
check('range bounds: each thumb\'s aria-valuemin/max follow the other thumb and the gap', gapState.maxs[0] === 50 && gapState.mins[1] === 30, JSON.stringify(gapState));
await page.keyboard.press('End');
gapState = await sliderOf(gap);
check('range: the lower thumb stops minStepsBetweenThumbs before the upper', gapState.values.join() === '50,60' && gapState.text === '50 – 60', JSON.stringify(gapState));
await page.focus(`${gap} [data-ax-thumb="1"]`);
await page.keyboard.press('Home');
gapState = await sliderOf(gap);
check('range: the upper thumb stops above the lower one', gapState.values.join() === '50,60', JSON.stringify(gapState));
await page.keyboard.press('PageUp');
gapState = await sliderOf(gap);
check('range: text display shows both values', gapState.values.join() === '50,70' && gapState.text === '50 – 70', JSON.stringify(gapState));
await events();

// ── pointer ──
const box = async (sel) => {
  await page.locator(sel).scrollIntoViewIfNeeded();
  return page.locator(sel).boundingBox();
};
const controlOf = (sel) => page.evaluate((s) => {
  const c = document.querySelector(s).closest('.astryx-slider-control');
  c.id ||= `ctl-${Math.random().toString(36).slice(2)}`;
  return `#${c.id}`;
}, sel);
const singleCtl = await controlOf(single('single'));
let b = await box(singleCtl);
// travel is inset by half a thumb (10px) at each end
const at = (bb, fraction) => ({x: bb.x + 10 + fraction * (bb.width - 20), y: bb.y + bb.height / 2});
let p = at(b, 0.75);
await page.mouse.move(p.x, p.y);
await page.mouse.down();
st = await sliderOf(single('single'));
const pressed = await page.evaluate((s) => document.querySelector(s).hasAttribute('data-ax-pressed'), single('single'));
const tipOpen = await page.evaluate((s) => document.getElementById(document.querySelector(s).getAttribute('data-ax-tooltip'))?.matches(':popover-open'), single('single'));
check('track press moves the thumb to the pointer and focuses it', st.values[0] === 75 && await page.evaluate((s) => document.activeElement === document.querySelector(s), single('single')), JSON.stringify(st));
check('while dragging: pressed paint and the value tooltip shown', pressed && tipOpen, JSON.stringify({pressed, tipOpen}));
p = at(b, 0.3);
await page.mouse.move(p.x, p.y, {steps: 4});
st = await sliderOf(single('single'));
check('dragging follows the pointer', st.values[0] === 30, JSON.stringify(st));
check('tooltip content follows the value', await page.evaluate((s) => document.getElementById(document.querySelector(s).getAttribute('data-ax-tooltip'))?.textContent === '30', single('single')));
await page.mouse.up();
ev = await events();
check('drag: astryx-change per value, one astryx-change-end at release', ev.filter((e) => e.type === 'astryx-change-end').length === 1 && ev.at(-1).type === 'astryx-change-end' && ev.at(-1).value === '30', JSON.stringify(ev));
check('release: pressed paint cleared', !(await page.evaluate((s) => document.querySelector(s).hasAttribute('data-ax-pressed'), single('single'))));
check('mouse focus draws no ring on the thumb', await page.evaluate((s) => getComputedStyle(document.querySelector(s)).outlineStyle === 'none', single('single')));
await page.keyboard.press('ArrowRight');
check('a key after a mouse drag brings the ring back', await page.evaluate((s) => getComputedStyle(document.querySelector(s)).outlineStyle !== 'none', single('single')));
await events();

// thumb press: no jump, drags from the grab point
const thumbBox = await box(single('single'));
await page.mouse.move(thumbBox.x + thumbBox.width / 2 + 6, thumbBox.y + thumbBox.height / 2);
await page.mouse.down();
st = await sliderOf(single('single'));
check('a press on the thumb (off-centre) leaves the value where it is', st.values[0] === 31, JSON.stringify(st));
const px = (b.width - 20) / 100;
await page.mouse.move(thumbBox.x + thumbBox.width / 2 + 6 + 10 * px, thumbBox.y + thumbBox.height / 2, {steps: 3});
await page.mouse.up();
st = await sliderOf(single('single'));
check('dragging the thumb moves it by the pointer\'s travel', st.values[0] === 41, JSON.stringify(st));
await events();

// range drag: the dragged thumb stops against the other
const rangeCtl = await controlOf(`${group('range-gap')} [role="slider"]`);
b = await box(rangeCtl);
p = at(b, 0.5);
await page.mouse.move(p.x, p.y);
await page.mouse.down();
p = at(b, 0.95);
await page.mouse.move(p.x, p.y, {steps: 5});
await page.mouse.up();
gapState = await sliderOf(gap);
check('range drag: the nearest thumb is taken and stops at the gap (cannot cross)', gapState.values.join() === '60,70', JSON.stringify(gapState));
await events();

// coincident thumbs separate toward the first movement, and hand the drag over when passed
await page.evaluate((s) => { document.querySelector(s).closest('ax-slider').value = [500, 500]; }, group('range'));
const priceCtl = await controlOf(`${group('range')} [role="slider"]`);
b = await box(priceCtl);
p = at(b, 0.5);
await page.mouse.move(p.x, p.y);
await page.mouse.down();
let price = await sliderOf(group('range'));
check('coincident: a press on the shared value moves nothing', price.values.join() === '500,500', JSON.stringify(price));
p = at(b, 0.7);
await page.mouse.move(p.x, p.y, {steps: 4});
price = await sliderOf(group('range'));
check('coincident: moving right takes the upper thumb', price.values.join() === '500,700', JSON.stringify(price));
p = at(b, 0.3);
await page.mouse.move(p.x, p.y, {steps: 6});
price = await sliderOf(group('range'));
const focusedThumb = await page.evaluate(() => document.activeElement?.getAttribute('data-ax-thumb'));
check('coincident: passing the other thumb hands the drag over (focus follows)', price.values.join() === '300,500' && focusedThumb === '0', JSON.stringify({price, focusedThumb}));
await page.mouse.up();
await events();

// RTL pointer
const rtlCtl = await controlOf(single('rtl'));
b = await box(rtlCtl);
await page.mouse.click(b.x + 10 + 0.2 * (b.width - 20), b.y + b.height / 2);
st = await sliderOf(single('rtl'));
check('RTL: a press near the left end means a high value', st.values[0] === 80, JSON.stringify(st));
await events();

// vertical pointer
const vCtl = await controlOf(single('vertical'));
b = await box(vCtl);
await page.mouse.click(b.x + b.width / 2, b.y + 10 + 0.25 * (b.height - 20));
st = await sliderOf(single('vertical'));
check('vertical: a press a quarter from the top means 75', st.values[0] === 75, JSON.stringify(st));
await events();

// marks
const markLabel = await page.evaluate(() => {
  const thumb = document.querySelector('[role="slider"][data-test="marks"]');
  const lbl = [...thumb.closest('.astryx-slider-control').querySelectorAll('.ax-slider-mark-label')].find((n) => n.textContent === '75°');
  lbl.id ||= 'mark-75';
  return `#${lbl.id}`;
});
await page.click(markLabel);
st = await sliderOf(single('marks'));
check('a press on a mark label snaps to its value', st.values[0] === 75 && st.texts[0] === '75°', JSON.stringify(st));
check('marks at or behind the thumb take the fill colour', await page.evaluate(() => {
  const marks = [...document.querySelector('[role="slider"][data-test="marks"]').closest('.astryx-slider-control').querySelectorAll('.ax-slider-mark')];
  return marks.map((m) => m.hasAttribute('data-ax-filled')).join() === 'true,true,true,true,false';
}));
await events();

// ── value tooltip on hover, formatting ──
const rangeThumb = `${group('range')} [data-ax-thumb="1"]`;
await page.hover(rangeThumb);
await sleep(150);
const hoverTip = await page.evaluate((s) => {
  const t = document.querySelector(s);
  const tip = document.getElementById(t.getAttribute('data-ax-tooltip'));
  return {open: tip?.matches(':popover-open'), text: tip?.textContent, described: (t.getAttribute('aria-describedby') ?? '').includes(tip?.id)};
}, rangeThumb);
check('hover shows the formatted value tooltip (formatValue)', hoverTip.open && hoverTip.text === '$500' && hoverTip.described, JSON.stringify(hoverTip));
await page.mouse.move(5, 5);
await page.focus(single('percent'));
await page.keyboard.press('ArrowRight');
st = await sliderOf(single('percent'));
check('formatOptions (Intl percent): text + aria-valuetext follow the value', st.values[0] === 0.4 && st.text === '40%' && st.texts[0] === '40%', JSON.stringify(st));
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
st = await sliderOf(single('percent'));
check('fractional steps carry no floating-point error', st.values[0] === 0.55, JSON.stringify(st));
await events();

// ── disabled ──
const dis = await page.evaluate((s) => {
  const t = document.querySelector(s);
  const host = t.closest('ax-slider');
  return {aria: t.getAttribute('aria-disabled'), tab: t.tabIndex, hidden: host.querySelectorAll('input[type="hidden"]').length, ctl: host.querySelector('.astryx-slider-control').dataset.disabled, tip: t.hasAttribute('data-ax-tooltip')};
}, single('disabled'));
check('disabled: thumbs keep the tab stop (aria-disabled), no hidden input submitted', dis.aria === 'true' && dis.tab === 0 && dis.hidden === 0 && dis.ctl === 'disabled', JSON.stringify(dis));
await page.focus(single('disabled'));
await page.keyboard.press('ArrowRight');
await page.keyboard.press('End');
b = await box(await controlOf(single('disabled')));
await page.mouse.click(b.x + b.width - 12, b.y + b.height / 2);
st = await sliderOf(single('disabled'));
check('disabled: keys and presses change nothing; no events', st.values[0] === 30 && (await events()).length === 0, JSON.stringify(st));
const reason = await page.evaluate((s) => {
  const t = document.querySelector(s);
  const ctl = t.closest('.astryx-slider-control');
  const id = ctl.getAttribute('data-ax-tooltip');
  return {id, valueTip: t.hasAttribute('data-ax-tooltip'), described: (t.getAttribute('aria-describedby') ?? '').split(' ').includes(id), text: document.getElementById(id)?.textContent};
}, single('disabled-message'));
check('disabledMessage: the reason replaces the value tooltip and describes the thumb', !reason.valueTip && reason.described && reason.text === 'Volume is locked while sharing your screen', JSON.stringify(reason));
await page.focus(single('disabled'));
await page.keyboard.press('Tab');
await page.keyboard.press('Tab');
await page.keyboard.press('Tab');
await sleep(150);
check('disabledMessage: keyboard focus on the thumb shows the reason', await page.evaluate((id) => document.getElementById(id)?.matches(':popover-open'), reason.id));

// ── status / required ──
const req = await page.evaluate(() => {
  const describedText = (t) => (t.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)).filter(Boolean)
    .map((n) => n.textContent || getComputedStyle(n, '::before').content.replace(/^"|"$/g, '').replace(/^none$/, '')).join('|');
  const quality = document.querySelector('[role="slider"][data-test="required"]');
  const seats = document.querySelector('[role="slider"][data-test="form-seats"]');
  const discount = document.querySelector('[role="slider"][data-test="form-seats"]').closest('.astryx-form-layout').querySelectorAll('ax-slider')[2].querySelector('[role="slider"]');
  const err = document.querySelector('[role="slider"][data-test="status-error"]');
  return {quality: describedText(quality), seats: describedText(seats), discount: describedText(discount), ariaRequired: quality.hasAttribute('aria-required'), invalid: err.getAttribute('aria-invalid'), err: describedText(err)};
});
check('isRequired: the thumb is described by "Required" (no aria-required on role=slider)', req.quality.includes('Required') && !req.ariaRequired, JSON.stringify(req));
check('FormLayout required default: an unmarked slider is described as Required', req.seats.includes('Required'), JSON.stringify(req));
check('FormLayout: an isOptional slider is not', !req.discount.includes('Required'), JSON.stringify(req));
const strayAria = await page.evaluate(() => [...document.querySelectorAll('ax-slider [aria-required]')].filter((n) => !n.matches('input')).map((n) => n.id || n.className));
check('no aria-required on non-input Slider parts (FormLayout marks the hidden "Required" with data-form-optionality)', strayAria.length === 0, JSON.stringify(strayAria));
check('error status: aria-invalid + described by the detached message', req.invalid === 'true' && req.err.includes('Budget exceeds the plan limit'), JSON.stringify(req));

// ── form submit / reset ──
await page.focus(single('form-seats'));
await page.keyboard.press('ArrowRight');
await page.focus(`${group('form-hours')} [data-ax-thumb="1"]`);
await page.keyboard.press('ArrowLeft');
await page.click('form[data-test="form"] button[type="submit"]');
let out = JSON.parse(await page.textContent('[data-test="form-output"]'));
check('form submit: hidden inputs carry the value (two for a range)', out.seats?.join() === '6' && out.hours?.join() === '9,16' && out.discount?.join() === '0', JSON.stringify(out));
await page.click('form[data-test="form"] button[type="reset"]');
await sleep(50);
const seatsAfter = await sliderOf(single('form-seats'));
const hoursAfter = await sliderOf(group('form-hours'));
check('form reset: initial values, thumbs, text and hidden inputs restored', seatsAfter.values.join() === '5' && seatsAfter.text === '5' && seatsAfter.inputs.join() === '5' && hoursAfter.values.join() === '9,17' && hoursAfter.inputs.join() === '9,17', JSON.stringify({seatsAfter, hoursAfter}));
await page.click('form[data-test="form"] button[type="submit"]');
out = JSON.parse(await page.textContent('[data-test="form-output"]'));
check('form submit after reset', out.seats?.join() === '5' && out.hours?.join() === '9,17', JSON.stringify(out));

await done();
