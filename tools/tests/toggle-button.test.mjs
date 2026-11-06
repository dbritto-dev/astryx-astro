#!/usr/bin/env node
/**
 * ToggleButton / ToggleButtonGroup behaviour in a real browser (system Chrome), against
 * the built docs (run `cd apps/docs && npx astro build` first):
 *   - aria-pressed + data-is-pressed toggle on click and on Space, reversibly, and each
 *     toggle dispatches `astryx-pressed-change` with {isPressed, event};
 *   - cancelling `astryx-pressed-change` (or the click) keeps the state;
 *   - pressing never changes the outer size (semibold width reservation, contract #4);
 *   - pressedIcon swaps in while pressed;
 *   - group single: select, switch, re-click deselects (value null), `astryx-change`
 *     detail {value}; group multiple: toggled list; the `value` property;
 *   - group disabled: members are disabled (native, or aria-disabled with a tooltip) and
 *     never toggle; group size stamping.
 * Exit code 1 on any failure.   node tools/tests/toggle-button.test.mjs
 */
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync, existsSync, statSync} from 'node:fs';
import {join, extname} from 'node:path';

const root = new URL('../../apps/docs/dist/', import.meta.url).pathname;
if (!existsSync(join(root, 'components/toggle-button/index.html'))) {
  console.error('✗ build the docs first (cd apps/docs && npx astro build)');
  process.exit(1);
}
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json'};
const server = createServer((req, res) => {
  let p = join(root, decodeURIComponent(req.url.split('?')[0]));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'content-type': types[extname(p)] ?? 'application/octet-stream'});
  res.end(readFileSync(p));
}).listen(0);
const base = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox']});
const page = await browser.newPage({viewport: {width: 1100, height: 900}});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());

let failures = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log(`✓ ${name}`);
  else { failures++; console.log(`✗ ${name}${detail ? `\n    ${detail}` : ''}`); }
};

await page.goto(`${base}/components/toggle-button/`);
await page.waitForLoadState('networkidle');

await page.evaluate(() => {
  window.__pressed = [];
  window.__changes = [];
  document.addEventListener('astryx-pressed-change', (e) => window.__pressed.push({
    test: e.target.dataset.test ?? e.target.getAttribute('aria-label'), isPressed: e.detail.isPressed, isClick: e.detail.event instanceof MouseEvent,
  }));
  document.addEventListener('astryx-change', (e) => window.__changes.push({test: e.target.dataset.test, value: e.detail.value}));
});
const state = (sel) => page.$eval(sel, (el) => ({
  aria: el.getAttribute('aria-pressed'), data: el.getAttribute('data-is-pressed'),
  w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height,
}));

// standalone toggle
const bold = '[data-test="bold"]';
const s0 = await state(bold);
check('Bold starts unpressed (aria-pressed=false, data-is-pressed=false)', s0.aria === 'false' && s0.data === 'false', JSON.stringify(s0));
await page.click(bold);
const s1 = await state(bold);
check('click presses it', s1.aria === 'true' && s1.data === 'true', JSON.stringify(s1));
check('pressing never changes the outer size', s1.w === s0.w && s1.h === s0.h, `${s0.w}x${s0.h} → ${s1.w}x${s1.h}`);
const weight = await page.$eval(`${bold} .ax-toggle-button-label-text`, (el) => getComputedStyle(el).fontWeight);
check('pressed label is semibold', weight === '600', weight);
await page.focus(bold);
await page.keyboard.press('Space');
const s2 = await state(bold);
check('Space toggles it back (reversible)', s2.aria === 'false' && s2.data === 'false', JSON.stringify(s2));
const pressedEvents = await page.evaluate(() => window.__pressed.filter((e) => e.test === 'bold'));
check('astryx-pressed-change fired per toggle with {isPressed, event}',
  pressedEvents.length === 2 && pressedEvents[0].isPressed === true && pressedEvents[1].isPressed === false && pressedEvents.every((e) => e.isClick),
  JSON.stringify(pressedEvents));

// cancellation
await page.evaluate(() => {
  const el = document.querySelector('[data-test="italic"]');
  el.addEventListener('astryx-pressed-change', (e) => e.preventDefault(), {once: true});
});
await page.click('[data-test="italic"]');
const italic = await state('[data-test="italic"]');
check('cancelling astryx-pressed-change keeps the state', italic.aria === 'true', JSON.stringify(italic));
await page.evaluate(() => {
  document.querySelector('[data-test="italic"]').addEventListener('click', (e) => e.preventDefault(), {once: true});
});
const firedBefore = await page.evaluate(() => window.__pressed.length);
await page.click('[data-test="italic"]');
const italic2 = await state('[data-test="italic"]');
const firedAfter = await page.evaluate(() => window.__pressed.length);
check('a click cancelled by an earlier listener does not toggle', italic2.aria === 'true' && firedAfter === firedBefore, JSON.stringify({italic2, firedBefore, firedAfter}));
const prop = await page.$eval('[data-test="italic"]', (el) => { const was = el.isPressed; el.isPressed = false; return [was, el.getAttribute('aria-pressed')]; });
check('isPressed property gets and sets the state', prop[0] === true && prop[1] === 'false', JSON.stringify(prop));

// pressedIcon swap
const icons = async () => page.$eval('[data-test="favorite"]', (el) => ({
  un: getComputedStyle(el.querySelector('[data-ax-toggle-icon="unpressed"]')).display,
  pr: getComputedStyle(el.querySelector('[data-ax-toggle-icon="pressed"]')).display,
}));
const i0 = await icons();
await page.click('[data-test="favorite"]');
const i1 = await icons();
check('pressedIcon swaps in while pressed', i0.un === 'contents' && i0.pr === 'none' && i1.un === 'none' && i1.pr === 'contents', JSON.stringify({i0, i1}));

// group single
const member = (group, value) => `[data-test="${group}"] [data-ax-value="${value}"]`;
const pressedValues = (group) => page.$$eval(`[data-test="${group}"] .astryx-toggle-button`, (els) => els.filter((e) => e.getAttribute('aria-pressed') === 'true').map((e) => e.dataset.axValue));
check('single group renders its value pressed', JSON.stringify(await pressedValues('group-single')) === '["grid"]');
await page.click(member('group-single', 'list'));
check('selecting another member switches', JSON.stringify(await pressedValues('group-single')) === '["list"]', JSON.stringify(await pressedValues('group-single')));
await page.click(member('group-single', 'list'));
check('re-clicking the active member deselects', JSON.stringify(await pressedValues('group-single')) === '[]');
const singleChanges = await page.evaluate(() => window.__changes.filter((c) => c.test === 'group-single'));
check('astryx-change detail.value: "list" then null', JSON.stringify(singleChanges.map((c) => c.value)) === '["list",null]', JSON.stringify(singleChanges));
const memberEvents = await page.evaluate(() => window.__pressed.filter((e) => ['List', 'Grid'].includes(e.test)));
check('group members do not dispatch their own astryx-pressed-change', memberEvents.length === 0, JSON.stringify(memberEvents));
const value = await page.$eval('[data-test="group-single"]', (el) => { el.value = 'board'; return el.value; });
check('group value property gets and sets the selection', value === 'board' && JSON.stringify(await pressedValues('group-single')) === '["board"]');
await page.evaluate(() => document.querySelector('[data-test="group-single"]').addEventListener('astryx-change', (e) => e.preventDefault(), {once: true}));
await page.click(member('group-single', 'grid'));
check('cancelling astryx-change keeps the selection', JSON.stringify(await pressedValues('group-single')) === '["board"]');

// group multiple
check('multiple group renders its values pressed', JSON.stringify(await pressedValues('group-multiple')) === '["bold","underline"]');
await page.click(member('group-multiple', 'italic'));
await page.click(member('group-multiple', 'bold'));
const multi = await page.evaluate(() => window.__changes.filter((c) => c.test === 'group-multiple').map((c) => c.value));
check('multiple: appends then removes values', JSON.stringify(multi) === '[["bold","underline","italic"],["underline","italic"]]', JSON.stringify(multi));
const mv = await page.$eval('[data-test="group-multiple"]', (el) => el.value);
check('multiple: value property keeps selection order', JSON.stringify(mv) === '["underline","italic"]', JSON.stringify(mv));
const groupSizes = await page.$$eval('[data-test="group-multiple"] .astryx-toggle-button', (els) => els.map((e) => e.dataset.size));
check('group size stamps members without an explicit size', JSON.stringify(groupSizes) === '["sm","sm","sm","lg"]', JSON.stringify(groupSizes));
const vertical = await page.$$eval('[data-test="group-vertical"] .astryx-toggle-button', (els) => els.map((e) => [e.dataset.size, e.querySelector('.astryx-icon')?.dataset.size, Math.round(e.getBoundingClientRect().height)]));
check('vertical lg group: lg members (36px) with md icons', vertical.every(([s, i, h]) => s === 'lg' && i === 'md' && h === 36), JSON.stringify(vertical));

// group disabled
const dis = await page.$$eval('[data-test="group-disabled"] .astryx-toggle-button', (els) => els.map((e) => ({
  value: e.dataset.axValue, disabled: e.disabled, aria: e.getAttribute('aria-disabled'), pressed: e.getAttribute('aria-pressed'), opacity: getComputedStyle(e).opacity,
})));
check('disabled group disables members (native; aria-disabled with a tooltip) at 50%',
  dis[0].disabled && dis[2].disabled && !dis[1].disabled && dis[1].aria === 'true' && dis.every((d) => d.opacity === '0.5'), JSON.stringify(dis));
const before = await page.evaluate(() => window.__changes.length);
await page.click(member('group-disabled', 'center'), {force: true});
await page.focus(member('group-disabled', 'center'));
await page.keyboard.press('Enter');
await page.keyboard.press('Space');
const after = await page.evaluate(() => window.__changes.length);
check('disabled members never change the selection', after === before && JSON.stringify(await pressedValues('group-disabled')) === '["start"]');

check('no page errors', errors.length === 0, errors.join('\n'));
await browser.close();
server.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
