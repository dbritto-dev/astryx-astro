/**
 * Shared harness for the overlay/runtime browser tests: serves apps/docs/dist (same static
 * server pattern as tools/shot.mjs), launches system Chrome, and collects assertion results.
 * Each test file exits 1 when any check fails. Run after `cd apps/docs && npx astro build`.
 */
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync, existsSync, statSync} from 'node:fs';
import {join, extname} from 'node:path';

const root = new URL('../../apps/docs/dist/', import.meta.url).pathname;
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json'};

export async function setup({width = 1100, height = 900, colorScheme = 'light', reducedMotion = 'reduce'} = {}) {
  const server = createServer((req, res) => {
    let p = join(root, decodeURIComponent(req.url.split('?')[0]));
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
    if (!existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, {'content-type': types[extname(p)] ?? 'application/octet-stream'});
    res.end(readFileSync(p));
  }).listen(0);
  const port = server.address().port;
  const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox']});
  // Reduced motion: transitions are instant under a fine pointer, so geometry reads are final.
  const context = await browser.newContext({viewport: {width, height}, colorScheme, reducedMotion});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_')) errors.push(m.text()); });
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
  let failures = 0;
  let passes = 0;
  const check = (name, ok, detail = '') => {
    if (ok) { passes++; console.log(`  ✓ ${name}`); }
    else { failures++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
  };
  const open = async (slug) => {
    await page.goto('about:blank');
    await page.goto(`http://localhost:${port}/components/${slug}/`);
    await page.waitForLoadState('load');
    await page.waitForTimeout(100);
  };
  const done = async () => {
    check('no page errors', errors.length === 0, errors.join(' | '));
    await browser.close();
    server.close();
    console.log(`\n${passes} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
  };
  return {page, context, browser, check, open, done, port};
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Bounding rects of an element (by selector) and whether it is :popover-open. */
export function rectOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    let open = false;
    try { open = el.matches(':popover-open'); } catch {}
    return {left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, open};
  }, selector);
}

export const isOpen = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  try { return !!el && el.matches(':popover-open'); } catch { return false; }
}, selector);

export const activeId = (page) => page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
