#!/usr/bin/env node
/**
 * Behaviour test for ResizeHandle / <ax-resizable> against the built docs (apps/docs/dist).
 *   node tools/tests/resizable.test.mjs        exit 1 on failure
 * Covers: separator ARIA, pointer drag (capture, clamping, data-resizing), keyboard steps,
 * Home/End, Enter / double-click collapse, drag-to-collapse, inert pane + focus move,
 * reversed and RTL-free direction maths, snap points, disabled, persistence, events.
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
const url = `http://localhost:${server.address().port}/components/resizable/`;
const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox']});
const context = await browser.newContext({viewport: {width: 1200, height: 900}});
const page = await context.newPage();
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

const aria = (sel) => page.$eval(sel, (el) => ({
  role: el.getAttribute('role'),
  orientation: el.getAttribute('aria-orientation'),
  now: el.getAttribute('aria-valuenow'),
  min: el.getAttribute('aria-valuemin'),
  max: el.getAttribute('aria-valuemax'),
  text: el.getAttribute('aria-valuetext'),
  disabled: el.getAttribute('aria-disabled'),
  tabindex: el.getAttribute('tabindex'),
  label: el.getAttribute('aria-label'),
}));
const paneWidth = (sel) => page.$eval(sel, (el) => Math.round(el.getBoundingClientRect().width));
const paneHeight = (sel) => page.$eval(sel, (el) => Math.round(el.getBoundingClientRect().height));
const prevPane = '#rz-preview';

async function drag(handleSel, dx, dy = 0, {steps = 8, hold} = {}) {
  const hit = await page.$(`${handleSel} > .ax-resize-handle-hit`);
  const box = await hit.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, {steps});
  if (hold) await hold();
  await page.mouse.move(x + dx, y + dy, {steps});
  await page.mouse.up();
}

try {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => customElements.get('ax-resizable') != null);

  // ── ARIA at rest ──────────────────────────────────────────────────────
  let a = await aria(prevPane);
  eq('role separator', a.role, 'separator');
  eq('horizontal handle → aria-orientation vertical', a.orientation, 'vertical');
  eq('aria-valuenow = default size', a.now, '220');
  eq('aria-valuemin', a.min, '160');
  eq('aria-valuemax', a.max, '360');
  eq('tab stop', a.tabindex, '0');
  eq('accessible name', a.label, 'Resize invoice preview');
  const previewPaneSel = '#rz-preview >> xpath=preceding-sibling::div[1]';
  eq('pane sized to the region', await paneWidth(previewPaneSel), 220);

  // ── Pointer drag ──────────────────────────────────────────────────────
  const sizes = [];
  await page.$eval(prevPane, (el) => {
    window.__sizes = [];
    el.addEventListener('astryx-size-change', (e) => window.__sizes.push(e.detail.size));
  });
  let resizingDuring = null;
  await drag(prevPane, 50, 0, {hold: async () => { resizingDuring = await page.$eval(prevPane, (el) => el.hasAttribute('data-resizing')); }});
  eq('data-resizing while dragging', resizingDuring, true);
  eq('data-resizing cleared after drop', await page.$eval(prevPane, (el) => el.hasAttribute('data-resizing')), false);
  a = await aria(prevPane);
  eq('drag +50 → aria-valuenow 270', a.now, '270');
  eq('drag +50 → pane 270px', await paneWidth(previewPaneSel), 270);
  sizes.push(...(await page.evaluate(() => window.__sizes)));
  check('astryx-size-change fired during drag', sizes.length > 0 && sizes.at(-1) === 270, JSON.stringify(sizes));
  eq('body cursor released after drop', await page.evaluate(() => document.body.style.cursor), '');
  await drag(prevPane, 400);
  eq('drag past max clamps to 360', (await aria(prevPane)).now, '360');
  await drag(prevPane, -600);
  eq('drag past min clamps to 160', (await aria(prevPane)).now, '160');

  // ── Keyboard ──────────────────────────────────────────────────────────
  await page.focus(prevPane);
  await page.keyboard.press('ArrowRight');
  eq('ArrowRight +10', (await aria(prevPane)).now, '170');
  await page.keyboard.press('Shift+ArrowRight');
  eq('Shift+ArrowRight +50', (await aria(prevPane)).now, '220');
  await page.keyboard.press('ArrowLeft');
  eq('ArrowLeft -10', (await aria(prevPane)).now, '210');
  await page.keyboard.press('End');
  eq('End → max', (await aria(prevPane)).now, '360');
  await page.keyboard.press('Home');
  eq('Home → min', (await aria(prevPane)).now, '160');
  eq('pane follows keyboard', await paneWidth(previewPaneSel), 160);
  await page.keyboard.press('ArrowUp');
  eq('ArrowUp on a horizontal handle shrinks (stays at min)', (await aria(prevPane)).now, '160');
  await page.keyboard.press('Enter');
  eq('Enter on a non-collapsible region does nothing', (await aria(prevPane)).text, null);

  // ── Collapse (Layout panel, collapsible, persisted) ──────────────────
  const nav = '#rz-nav';
  const navPane = '#rz-nav-pane';
  a = await aria(nav);
  eq('nav initial aria-valuenow', a.now, '200');
  eq('unbounded? no — nav aria-valuemax', a.max, '320');
  // A focusable child inside the pane hands focus to the handle as it collapses.
  await page.$eval(navPane, (el) => {
    const b = document.createElement('button');
    b.id = 'rz-probe';
    b.textContent = 'probe';
    el.prepend(b);
  });
  await page.focus('#rz-probe');
  await page.$eval(nav, (el) => el.collapse());
  eq('collapse(): focus moved to the handle', await page.evaluate(() => document.activeElement?.id), 'rz-nav');
  a = await aria(nav);
  eq('collapsed aria-valuetext', a.text, 'Collapsed');
  eq('collapsed aria-valuenow = min', a.now, '140');
  const navState = () => page.$eval('#rz-nav-pane', (el) => ({inert: el.inert, hidden: el.getAttribute('aria-hidden'), zero: el.hasAttribute('data-zero-width'), w: Math.round(el.getBoundingClientRect().width)}));
  let s = await navState();
  check('collapsed pane is inert, aria-hidden, zero width', s.inert && s.hidden === 'true' && s.zero && s.w === 0, JSON.stringify(s));
  eq('pill flips to the open side while collapsed', await page.$eval(nav, (el) => el.dataset.pillSide), 'end');
  await page.focus(nav);
  await page.keyboard.press('ArrowLeft');
  eq('collapsed: shrink arrow is a no-op', (await aria(nav)).text, 'Collapsed');
  await page.keyboard.press('Enter');
  a = await aria(nav);
  eq('Enter expands to the size before collapsing', a.now, '200');
  s = await navState();
  check('expanded pane is interactive again', !s.inert && s.hidden == null && !s.zero && s.w === 200, JSON.stringify(s));
  await page.dblclick(`${nav} > .ax-resize-handle-hit`);
  eq('double-click collapses', (await aria(nav)).text, 'Collapsed');
  await page.dblclick(`${nav} > .ax-resize-handle-hit`);
  eq('double-click expands', (await aria(nav)).now, '200');
  await drag(nav, -190);
  eq('dragging under collapsedSize collapses', (await aria(nav)).text, 'Collapsed');
  await page.focus(nav);
  await page.keyboard.press('ArrowRight');
  eq('collapsed: grow arrow opens one step above min', (await aria(nav)).now, '150');
  await page.keyboard.press('Shift+ArrowRight');
  eq('then Shift+ArrowRight +50', (await aria(nav)).now, '200');
  await page.keyboard.press('Shift+ArrowRight');
  const stored = await page.evaluate(() => localStorage.getItem('astryx-resizable:docs-resizable-files'));
  eq('persisted in the React format', stored, JSON.stringify({size: 250, isCollapsed: false}));
  await page.reload();
  await page.waitForFunction(() => customElements.get('ax-resizable') != null);
  eq('persisted size restored after reload', (await aria(nav)).now, '250');
  eq('persisted pane width restored', await paneWidth(navPane), 250);
  await page.$eval(nav, (el) => el.collapse());
  await page.reload();
  await page.waitForFunction(() => customElements.get('ax-resizable') != null);
  eq('persisted collapse restored', (await aria(nav)).text, 'Collapsed');
  await page.$eval(nav, (el) => el.expand());
  eq('expand after a collapsed reload restores the saved size', (await aria(nav)).now, '250');

  // ── Reversed (end panel): ArrowLeft grows ─────────────────────────────
  const insp = '#rz-inspector';
  eq('reversed initial', (await aria(insp)).now, '180');
  await page.focus(insp);
  await page.keyboard.press('ArrowLeft');
  eq('reversed: ArrowLeft grows', (await aria(insp)).now, '190');
  await drag(insp, -30);
  eq('reversed: dragging toward start grows', (await aria(insp)).now, '220');
  // Astro writes a component's <script> right after its first instance: one between the handle
  // and its pane is skipped, the pane is the next sibling that renders.
  const inspPane = await page.$eval(insp, (el) => {
    const pane = el.nextElementSibling;
    pane.id ||= 'rz-inspector-pane';
    const script = document.createElement('script');
    script.type = 'text/plain';
    script.id = 'rz-stray-script';
    el.after(script);
    return `#${pane.id}`;
  });
  const inspBefore = await paneWidth(inspPane);
  await page.focus(insp);
  await page.keyboard.press('ArrowLeft');
  eq('reversed, a <script> after the handle: ArrowLeft grows the pane', `${(await aria(insp)).now} +${await paneWidth(inspPane) - inspBefore}px`, '230 +10px');
  check('…and never sizes the script', await page.$eval('#rz-stray-script', (s) => s.style.length === 0));
  await page.$eval('#rz-stray-script', (s) => s.remove());

  // ── Vertical with snaps (reversed: the pane is below) ────────────────
  const term = '#rz-terminal';
  a = await aria(term);
  eq('vertical handle → aria-orientation horizontal', a.orientation, 'horizontal');
  eq('vertical initial', a.now, '90');
  eq('vertical pane height', await paneHeight('#rz-terminal-pane'), 90);
  await page.focus(term);
  await page.keyboard.press('ArrowUp');
  eq('snaps: ArrowUp grows to the next snap', (await aria(term)).now, '130');
  await page.keyboard.press('ArrowDown');
  eq('snaps: ArrowDown back to the previous snap', (await aria(term)).now, '90');
  await page.keyboard.press('Shift+ArrowUp');
  eq('snaps: Shift moves two snap points', (await aria(term)).now, '160');
  await drag(term, 0, 60);
  eq('snaps: a drag rests on the nearest snap', (await aria(term)).now, '90');
  eq('vertical pane follows', await paneHeight('#rz-terminal-pane'), 90);

  // ── Disabled ──────────────────────────────────────────────────────────
  const disabled = 'ax-resizable[aria-disabled="true"]';
  a = await aria(disabled);
  eq('disabled: aria-disabled', a.disabled, 'true');
  eq('disabled: keeps its tab stop', a.tabindex, '0');
  await page.focus(disabled);
  await page.keyboard.press('ArrowRight');
  eq('disabled: keyboard ignored', (await aria(disabled)).now, '140');

  // ── Overlay: resizes the panel it sits in ─────────────────────────────
  eq('overlay pane sized', await paneWidth('#rz-overlay-pane'), 200);
  await page.focus('#rz-overlay');
  await page.keyboard.press('ArrowRight');
  eq('overlay: keyboard resizes its parent pane', await paneWidth('#rz-overlay-pane'), 210);

  // ── RTL: the inline axis flips for keys and drags ─────────────────────
  await page.evaluate(() => { document.documentElement.dir = 'rtl'; });
  await page.focus(prevPane);
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowLeft');
  eq('RTL: ArrowLeft grows a start pane', (await aria(prevPane)).now, '170');
  await drag(prevPane, -40);
  eq('RTL: dragging left grows a start pane', (await aria(prevPane)).now, '210');
  await page.evaluate(() => { document.documentElement.dir = ''; });

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
