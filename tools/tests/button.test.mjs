#!/usr/bin/env node
/**
 * Button behaviour in a real browser (system Chrome), against the built docs
 * (run `cd apps/docs && npx astro build` first):
 *   - keyboard activation (Enter / Space) of a native button;
 *   - focus ring only for keyboard focus (contract #19);
 *   - aria-disabled buttons (busy-only, disabled + tooltip) cancel clicks and Enter/Space,
 *     and nothing reaches listeners on the button or its ancestors (AST-085);
 *   - loading keeps the button's geometry and accessible name (contract #3);
 *   - a blocked `javascript:` href renders an inert anchor (contract #16);
 *   - icon-size stamping: sm/md → 16px icon box, lg → 20px; a size provider restamps
 *     inherited Buttons and their icons (cascade keys size / button-icon-size).
 * Exit code 1 on any failure.   node tools/tests/button.test.mjs
 */
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync, existsSync, statSync} from 'node:fs';
import {join, extname} from 'node:path';

const root = new URL('../../apps/docs/dist/', import.meta.url).pathname;
if (!existsSync(join(root, 'components/button/index.html'))) {
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

await page.goto(`${base}/components/button/`);
await page.waitForLoadState('networkidle');

// Count clicks on a button and on the document (ancestor) for one target.
const arm = (selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  window.__hits = {self: 0, ancestor: 0};
  el.addEventListener('click', () => window.__hits.self++);
  document.addEventListener('click', (e) => { if (el.contains(e.target)) window.__hits.ancestor++; });
}, selector);
const hits = () => page.evaluate(() => window.__hits);

// 1. keyboard activation
const save = '[data-test="variants"] .astryx-button[data-variant="primary"][data-size="md"]';
await arm(save);
await page.focus(save);
await page.keyboard.press('Enter');
await page.keyboard.press('Space');
check('Enter and Space activate a native button', (await hits()).self === 2, JSON.stringify(await hits()));

// 2. focus ring only for keyboard focus
const first = page.locator('[data-test="variants"] .astryx-button').first();
await first.click();
const mouseRing = await first.evaluate((el) => getComputedStyle(el).outlineStyle);
check('no ring after a mouse press', mouseRing === 'none', mouseRing);
await page.keyboard.press('Tab');
const kb = await page.evaluate(() => {
  const el = document.activeElement;
  const cs = getComputedStyle(el);
  return {cls: el.className, style: cs.outlineStyle, width: cs.outlineWidth, offset: cs.outlineOffset};
});
check('ring on keyboard focus (2px solid, offset = --button-focus-offset 3px)',
  kb.cls.includes('astryx-button') && kb.style === 'solid' && kb.width === '2px' && kb.offset === '3px', JSON.stringify(kb));
// The destructive variant re-colors only the ring (after a keyboard move, programmatic
// focus shows the ring too).
const destructiveRing = await page.evaluate(() => {
  const el = document.querySelector('[data-test="variants"] .astryx-button[data-variant="destructive"]');
  el.focus();
  const probe = document.createElement('span');
  probe.style.color = 'var(--color-error)';
  el.parentElement.append(probe);
  const want = getComputedStyle(probe).color;
  probe.remove();
  const cs = getComputedStyle(el);
  return {got: cs.outlineColor, want, width: cs.outlineWidth};
});
check('destructive ring is error-colored, same width', destructiveRing.got === destructiveRing.want && destructiveRing.width === '2px', JSON.stringify(destructiveRing));

// 3. aria-disabled cancels click and Enter/Space (busy-only and tooltip-disabled)
for (const [name, sel] of [
  ['busy-only (isLoading)', '[data-test="loading"] .astryx-button[data-variant="primary"]'],
  ['disabled + tooltip', '[data-test="disabled-tooltip"]'],
]) {
  const attrs = await page.$eval(sel, (el) => ({disabled: el.disabled, ariaDisabled: el.getAttribute('aria-disabled'), busy: el.getAttribute('aria-busy')}));
  check(`${name}: focusable aria-disabled, not native disabled`, attrs.disabled === false && attrs.ariaDisabled === 'true', JSON.stringify(attrs));
  await arm(sel);
  await page.click(sel, {force: true});
  await page.focus(sel);
  const focused = await page.$eval(sel, (el) => document.activeElement === el);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  const h = await hits();
  check(`${name}: click, Enter and Space reach no listener`, h.self === 0 && h.ancestor === 0 && focused, JSON.stringify({...h, focused}));
}
const trulyDisabled = await page.$eval('[data-test="disabled"] .astryx-button', (el) => ({tag: el.tagName, disabled: el.disabled, aria: el.getAttribute('aria-disabled')}));
check('isDisabled without tooltip keeps native disabled', trulyDisabled.disabled === true && trulyDisabled.aria === null, JSON.stringify(trulyDisabled));
const disabledHref = await page.$eval('[data-test="disabled-href"]', (el) => ({tag: el.tagName, href: el.getAttribute('href'), disabled: el.disabled}));
check('disabled button with href falls back to <button disabled>', disabledHref.tag === 'BUTTON' && disabledHref.href === null && disabledHref.disabled, JSON.stringify(disabledHref));

// 4. loading keeps geometry and name
const twins = await page.evaluate(() => {
  const box = (s) => document.querySelector(s).getBoundingClientRect();
  const idle = box('[data-test="idle-twin"]');
  const busy = box('[data-test="loading-twin"]');
  const el = document.querySelector('[data-test="loading-twin"]');
  const content = el.querySelector('.ax-button-content');
  return {
    idle: [idle.width, idle.height], busy: [busy.width, busy.height],
    label: el.getAttribute('aria-label'), busyAttr: el.getAttribute('aria-busy'),
    contentHidden: content.getAttribute('aria-hidden'), color: getComputedStyle(content).color,
    spinner: !!el.querySelector('.ax-button-spinner .astryx-spinner'),
  };
});
check('loading keeps width and height', twins.idle[0] === twins.busy[0] && twins.idle[1] === twins.busy[1], JSON.stringify(twins));
check('loading keeps its name (aria-label) and is aria-busy with a spinner',
  twins.label === 'Saving changes' && twins.busyAttr === 'true' && twins.spinner && twins.contentHidden === 'true', JSON.stringify(twins));
check('loading content stays in place but paints nothing', /rgba\(0, 0, 0, 0\)|transparent/.test(twins.color), twins.color);
await page.waitForTimeout(100);
const live = await page.$eval('[data-test="loading-twin"] [role="status"]', (el) => el.textContent);
check('loading live region announces "Loading" after mount', live === 'Loading', JSON.stringify(live));
const idleLive = await page.$eval('[data-test="idle-twin"] [role="status"]', (el) => el.textContent);
check('idle live region stays empty', idleLive === '', JSON.stringify(idleLive));
const interruptible = await page.$eval('[data-test="interruptible"]', (el) => ({aria: el.getAttribute('aria-disabled'), disabled: el.disabled, busy: el.getAttribute('aria-busy')}));
check('interruptible loading stays enabled (aria-busy only)', interruptible.aria === null && !interruptible.disabled && interruptible.busy === 'true', JSON.stringify(interruptible));

// 5. blocked href renders inert
const blocked = await page.$eval('[data-test="blocked"]', (el) => {
  el.focus();
  return {tag: el.tagName, href: el.getAttribute('href'), focusable: document.activeElement === el};
});
check('javascript: href renders an <a> without href (not focusable)', blocked.tag === 'A' && blocked.href === null && !blocked.focusable, JSON.stringify(blocked));
const before = page.url();
await page.click('[data-test="blocked"]');
check('clicking a blocked destination navigates nowhere', page.url() === before && errors.length === 0, page.url());
const link = await page.$eval('[data-test="link"]', (el) => ({tag: el.tagName, href: el.getAttribute('href'), deco: getComputedStyle(el).textDecorationLine}));
check('href renders <a href> without underline', link.tag === 'A' && link.href === '/components/link/' && link.deco === 'none', JSON.stringify(link));

const custom = await page.$eval('[data-test="custom"]', (el) => [el.tagName, el.getAttribute('href'), el.hasAttribute('data-demo-router'), el.dataset.variant]);
check('`as` link component receives the href and the theme hooks', JSON.stringify(custom) === '["A","/components/link/",true,"secondary"]', JSON.stringify(custom));

// 6. icon-size stamping
const sizes = await page.evaluate(() => {
  const out = {};
  for (const c of document.querySelectorAll('[data-test="button-cascade"] [data-case]')) {
    const b = c.querySelector('.astryx-button');
    const i = b.querySelector('.astryx-icon');
    out[c.dataset.case] = {
      button: b.dataset.size, h: b.getBoundingClientRect().height, icon: i.dataset.size,
      iconPx: i.getBoundingClientRect().width, box: b.querySelector('.ax-button-icon').getBoundingClientRect().width,
      marker: b.getAttribute('data-ax-inherit'), iconMarker: i.getAttribute('data-ax-inherit'),
    };
  }
  return out;
});
const expectSizes = {
  sm: ['sm', 28, 'sm', 16], md: ['md', 32, 'sm', 16], lg: ['lg', 36, 'md', 20], 'explicit-icon': ['lg', 36, 'xsm', 12],
  default: ['md', 32, 'sm', 16], 'provider-lg': ['lg', 36, 'md', 20], 'provider-lg-explicit': ['sm', 28, 'sm', 16],
  'nested-sm': ['sm', 28, 'sm', 16], 'null-provider': ['md', 32, 'sm', 16],
};
for (const [kase, [button, h, icon, px]] of Object.entries(expectSizes)) {
  const s = sizes[kase];
  check(`icon-size ${kase}: button ${button} (${h}px), icon ${icon} (${px}px)`,
    s && s.button === button && Math.round(s.h) === h && s.icon === icon && Math.round(s.iconPx) === px, JSON.stringify(s));
}
check('only an inherited Button keeps its markers (size / button-icon-size)',
  sizes.default.marker === 'size' && sizes.default.iconMarker === 'button-icon-size' && sizes.sm.marker === null
  && sizes['provider-lg'].marker === null && sizes['provider-lg'].iconMarker === null, JSON.stringify(sizes.default));
check('icon box follows the button size (16px sm/md, 20px lg)', sizes.sm.box === 16 && sizes.md.box === 16 && sizes.lg.box === 20 && sizes['provider-lg'].box === 20, JSON.stringify([sizes.sm.box, sizes.lg.box]));

// 7. edge compensation marker and icon-only geometry
const misc = await page.evaluate(() => {
  const ghost = document.querySelector('.astryx-button[data-variant="ghost"]');
  const primary = document.querySelector('.astryx-button[data-variant="primary"]');
  const only = [...document.querySelectorAll('.astryx-button[data-ax-icon-only]')].map((el) => {
    const r = el.getBoundingClientRect();
    return [r.width, r.height, el.getAttribute('aria-label')];
  });
  return {ghost: ghost.hasAttribute('data-astryx-edge-comp'), primary: primary.hasAttribute('data-astryx-edge-comp'), only};
});
check('ghost buttons carry data-astryx-edge-comp, others do not', misc.ghost && !misc.primary);
check('icon-only buttons are square and named by label', misc.only.length > 0 && misc.only.every(([w, h, l]) => Math.abs(w - h) < 0.5 && l), JSON.stringify(misc.only.slice(0, 3)));

check('no page errors', errors.length === 0, errors.join('\n'));
await browser.close();
server.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
