#!/usr/bin/env node
/**
 * Behaviour test for ScrollableArea / <ax-scrollable-area> against the built docs.
 *   node tools/tests/scrollable-area.test.mjs        exit 1 on failure
 * Covers: tab stop only while an axis scrolls, edge flags on scroll, overflow ownership
 * (clip → auto), live re-measurement on content and size changes, overscroll containment,
 * accessible name and role.
 */
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync, existsSync, statSync} from 'node:fs';
import {join, extname} from 'node:path';

const root = new URL('../../apps/docs/dist/', import.meta.url).pathname;
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json'};
const server = createServer((req, res) => {
  let p = join(root, decodeURIComponent(req.url.split('?')[0]));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'content-type': types[extname(p)] ?? 'application/octet-stream'});
  res.end(readFileSync(p));
}).listen(0);
const url = `http://localhost:${server.address().port}/components/scrollable-area/`;
const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox']});
const page = await browser.newPage({viewport: {width: 1200, height: 900}});
const errors = [];
page.on('console', (m) => m.type() === 'error' && !m.text().includes('ERR_FAILED') && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`✓ ${name}`);
  else { failures++; console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, actual, expected) => check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
const frames = (n = 2) => page.evaluate((count) => new Promise((r) => {
  let i = 0;
  const tick = () => (++i >= count ? r() : requestAnimationFrame(tick));
  requestAnimationFrame(tick);
}), n);
const state = (sel) => page.$eval(sel, (el) => ({
  tabindex: el.getAttribute('tabindex'),
  role: el.getAttribute('role'),
  label: el.getAttribute('aria-label'),
  scrollableBlock: el.getAttribute('data-scrollable-block'),
  scrollableInline: el.getAttribute('data-scrollable-inline'),
  blockStart: el.getAttribute('data-scroll-block-start'),
  blockEnd: el.getAttribute('data-scroll-block-end'),
  inlineStart: el.getAttribute('data-scroll-inline-start'),
  inlineEnd: el.getAttribute('data-scroll-inline-end'),
  overflowX: getComputedStyle(el).overflowX,
  overflowY: getComputedStyle(el).overflowY,
  overscrollX: getComputedStyle(el).overscrollBehaviorX,
  overscrollY: getComputedStyle(el).overscrollBehaviorY,
}));

try {
  await page.goto(url);
  await page.waitForFunction(() => customElements.get('ax-scrollable-area') != null);
  await frames();

  // ── Overflowing block viewport ────────────────────────────────────────
  let s = await state('#sa-block');
  eq('role group (default)', s.role, 'group');
  eq('aria-label from label', s.label, 'Activity history');
  eq('overflowing: tabindex 0', s.tabindex, '0');
  eq('overflowing: data-scrollable-block', s.scrollableBlock, 'true');
  eq('at rest: block start edge', s.blockStart, 'true');
  eq('at rest: not at block end', s.blockEnd, null);
  eq('overflowing axis becomes auto', s.overflowY, 'auto');
  eq('the other axis is hidden', s.overflowX, 'hidden');
  eq('inactive inline axis reports both edges', `${s.inlineStart}/${s.inlineEnd}`, 'true/true');
  await page.$eval('#sa-block', (el) => { el.scrollTop = el.scrollHeight; });
  await frames();
  s = await state('#sa-block');
  eq('scrolled to the end: block end edge', s.blockEnd, 'true');
  eq('scrolled to the end: no block start edge', s.blockStart, null);
  await page.$eval('#sa-block', (el) => { el.scrollTop = 40; });
  await frames();
  s = await state('#sa-block');
  eq('mid-scroll: neither edge', `${s.blockStart}/${s.blockEnd}`, 'null/null');
  await page.focus('#sa-block');
  await page.keyboard.press('Home');
  const reached = await page.waitForFunction(() => document.querySelector('#sa-block').getAttribute('data-scroll-block-start') === 'true', null, {timeout: 3000}).then(() => true, () => false);
  check('keyboard scroll (Home) on the focused viewport reaches the start edge', reached);

  // ── Fitting viewport ──────────────────────────────────────────────────
  s = await state('#sa-fit');
  eq('fits: no tab stop', s.tabindex, null);
  eq('fits: not scrollable', s.scrollableBlock, null);
  eq('fits: both block edges', `${s.blockStart}/${s.blockEnd}`, 'true/true');
  eq('fits: overflow stays clip', s.overflowY, 'clip');
  // Shrink the viewport: it starts to scroll and enters the tab order.
  await page.$eval('#sa-fit', (el) => { el.style.height = '60px'; });
  await frames(3);
  s = await state('#sa-fit');
  eq('shrunk below its content: tabindex 0', s.tabindex, '0');
  eq('shrunk below its content: scrollable', s.scrollableBlock, 'true');
  eq('shrunk below its content: overflow auto', s.overflowY, 'auto');
  // Remove content from the overflowing one: it leaves the tab order.
  await page.$eval('#sa-block > [data-scroll-content]', (c) => { while (c.children.length > 2) c.lastElementChild.remove(); });
  await frames(3);
  s = await state('#sa-block');
  check('content removed: keeps -1 only while focused, else no tab stop', s.tabindex === '-1' || s.tabindex === null, `tabindex ${s.tabindex}`);
  eq('content removed: not scrollable', s.scrollableBlock, null);
  eq('content removed: overflow back to clip', s.overflowY, 'clip');
  await page.focus('#sa-fit');
  await frames();
  eq('focus moved away: no stale tab stop on the fitting area', (await state('#sa-block')).tabindex, null);

  // ── Inline axis ───────────────────────────────────────────────────────
  s = await state('#sa-inline');
  eq('inline: tabindex 0', s.tabindex, '0');
  eq('inline: data-scrollable-inline', s.scrollableInline, 'true');
  eq('inline: overflow-x auto', s.overflowX, 'auto');
  eq('inline: overflow-y hidden', s.overflowY, 'hidden');
  await page.$eval('#sa-inline', (el) => { el.scrollLeft = el.scrollWidth; });
  await frames();
  s = await state('#sa-inline');
  eq('inline: scrolled to the end edge', `${s.inlineStart}/${s.inlineEnd}`, 'null/true');

  // ── Both axes, region, overscroll contain ─────────────────────────────
  s = await state('#sa-both');
  eq('both: role region', s.role, 'region');
  eq('both: scrollable inline and block', `${s.scrollableInline}/${s.scrollableBlock}`, 'true/true');
  eq('both: overscroll contain on the scrolling axes', `${s.overscrollX}/${s.overscrollY}`, 'contain/contain');
  eq('allow (default): overscroll auto', (await state('#sa-inline')).overscrollX, 'auto');

  // ── Content box publishes its padding ─────────────────────────────────
  const cp = await page.$eval('#sa-block > [data-scroll-content]', (el) => getComputedStyle(el).getPropertyValue('--container-padding-inline-start').trim());
  check('content box publishes --container-padding-inline-start', cp !== '' && cp !== '0px', cp);

  check('no console errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  failures++;
  console.log(`✗ threw: ${e.stack ?? e}`);
} finally {
  await browser.close();
  server.close();
}
console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
process.exit(failures ? 1 : 0);
