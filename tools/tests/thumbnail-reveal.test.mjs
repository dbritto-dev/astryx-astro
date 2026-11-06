#!/usr/bin/env node
/**
 * Thumbnail in system Chrome against the built docs (`cd apps/docs && npx astro build`
 * first): the remove button's hover/focus reveal (useContainerReveal as CSS), `always`,
 * names of the group and actions, inert actions while disabled/loading, and the image
 * error → placeholder swap. Exit code 1 on any failure.
 *   node tools/tests/thumbnail-reveal.test.mjs
 */
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync, existsSync, statSync} from 'node:fs';
import {join, extname} from 'node:path';

const root = new URL('../../apps/docs/dist/', import.meta.url).pathname;
if (!existsSync(join(root, 'components/thumbnail/index.html'))) {
  console.error('✗ apps/docs/dist not built — run `cd apps/docs && npx astro build` first');
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

let failures = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log(`✓ ${name}`);
  else { failures++; console.log(`✗ ${name}${detail ? `\n    ${detail}` : ''}`); }
};

const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox']});
// Reduced motion: reveal transitions land at once, so computed opacity is final.
const page = await browser.newPage({reducedMotion: 'reduce'});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto(`${base}/components/thumbnail/`);
await page.waitForLoadState('load');
await page.waitForTimeout(200);

// Busy overlay announces once (read before the region clears after 2s).
const announced = await page.evaluate(() => [...document.querySelectorAll('[data-astryx-live-region="polite"]')].map((r) => r.textContent).join('|'));
check('loading with src announces "Loading" politely', announced.includes('Loading'), announced);

const opacity = (c) => page.$eval(`[data-case="${c}"] .ax-thumbnail-remove-slot`, (el) => getComputedStyle(el).opacity);
const hoverMedia = await page.evaluate(() => matchMedia('(hover: hover)').matches && !matchMedia('(any-pointer: coarse)').matches);
check('environment: fine pointer with hover', hoverMedia);

check('hover reveal: remove hidden at rest (opacity 0)', (await opacity('hover')) === '0');
check('showRemoveOn="always": visible at rest', (await opacity('always')) === '1');

// Keyboard focus reveals at once (focus-within), and the button keeps focus.
const remove = page.locator('[data-case="hover"] .ax-thumbnail-remove');
await page.locator('[data-case="hover"]').evaluate((el) => el.scrollIntoView());
await page.mouse.move(0, 0);
await page.focus('body');
// Tab from the element before it so focus arrives by keyboard (focus-visible).
await page.locator('[data-case="hover"]').evaluate((el) => {
  const before = document.createElement('button');
  before.textContent = 'before';
  before.id = 'tab-anchor';
  el.prepend(before);
});
await page.focus('#tab-anchor');
await page.keyboard.press('Tab');
const focused = await remove.evaluate((el) => document.activeElement === el && el.matches(':focus-visible'));
check('Tab reaches the hidden remove button (still in the tab order)', focused);
check('focus inside reveals the remove button (opacity 1)', (await opacity('hover')) === '1');
const ring = await page.$eval('[data-case="hover"] .ax-thumbnail-media', (el) => getComputedStyle(el).outlineStyle);
check('media container paints the focus-within ring', ring !== 'none', ring);
await page.keyboard.press('Shift+Tab');
check('focus leaving hides it again', (await opacity('hover')) === '0');

// Pointer hover reveals.
await page.hover('[data-case="hover"] .ax-thumbnail-media');
check('hover reveals the remove button', (await opacity('hover')) === '1');
await page.mouse.move(0, 0);
check('pointer leaving hides it', (await opacity('hover')) === '0');

// Names and inert actions.
check('group named "label — alt"', (await page.getByRole('group', {name: 'night.png — Night sky'}).count()) === 1);
check('open action named "Open night.png — Night sky"', (await page.getByRole('button', {name: 'Open night.png — Night sky'}).count()) === 1);
check('remove action named "Remove beach.jpg — Beach"', (await page.getByRole('button', {name: 'Remove beach.jpg — Beach'}).count()) === 1);
const inert = await page.$$eval('.astryx-thumbnail[aria-label="abstract.png — Abstract"] button', (els) => els.map((b) => b.getAttribute('aria-disabled')));
check('disabled: open and remove stay mounted with aria-disabled', inert.length === 2 && inert.every((v) => v === 'true'), JSON.stringify(inert));
const loading = await page.$eval('.astryx-thumbnail[aria-label="processing.png — Processing"] .ax-thumbnail-open', (b) => b.getAttribute('aria-disabled'));
check('loading: open is inert', loading === 'true', String(loading));
const decorative = await page.$eval('.astryx-thumbnail[aria-label="sunset.jpg"] img', (img) => [img.getAttribute('alt'), img.getAttribute('role'), img.getAttribute('aria-hidden')].join('|'));
check('image without alt is decorative', decorative === '|presentation|true', decorative);
const es = await page.getByRole('button', {name: 'Quitar diagram.svg — Diagram'}).count();
check('es-ES remove label', es === 1);

// Image error → placeholder (and no inset border).
const broken = await page.$eval('[data-case="broken"] .ax-thumbnail-media', (el) => ({
  img: el.querySelector('img') != null, border: el.querySelector('.ax-thumbnail-inset-border') != null,
  placeholder: el.querySelector('.ax-thumbnail-placeholder svg') != null,
}));
check('load error → placeholder, no image, no inset border', !broken.img && !broken.border && broken.placeholder, JSON.stringify(broken));

check('no page errors', errors.length === 0, errors.join('\n    '));
await browser.close();
server.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
