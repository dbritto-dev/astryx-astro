#!/usr/bin/env node
/**
 * Link behaviour in a real browser (system Chrome), against the built docs (run
 * `cd apps/docs && npx astro build` first):
 *   - element by role: <a href>, <button> without href, disabled <a role=link> with no
 *     destination that keeps a tab stop and is inert (click, Enter, Space);
 *   - target="_blank" merges noopener noreferrer; isExternalLink adds the icon and the
 *     "(opens in new tab)" text;
 *   - a blocked `javascript:` href renders an inert anchor;
 *   - focus ring only for keyboard focus; hover underline only when enabled.
 * Exit code 1 on any failure.   node tools/tests/link.test.mjs
 */
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync, existsSync, statSync} from 'node:fs';
import {join, extname} from 'node:path';

const root = new URL('../../apps/docs/dist/', import.meta.url).pathname;
if (!existsSync(join(root, 'components/link/index.html'))) {
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

const url = `${base}/components/link/`;
await page.goto(url);
await page.waitForLoadState('networkidle');

const info = (sel) => page.$eval(sel, (el) => ({
  tag: el.tagName, href: el.getAttribute('href'), target: el.getAttribute('target'), rel: el.getAttribute('rel'),
  role: el.getAttribute('role'), aria: el.getAttribute('aria-disabled'), tabindex: el.getAttribute('tabindex'), text: el.textContent,
}));

const ext = await info('[data-test="external"]');
check('isExternalLink: _blank + noopener noreferrer + icon + new-tab text',
  ext.tag === 'A' && ext.target === '_blank' && ext.rel === 'noopener noreferrer' && ext.text.includes('(opens in new tab)')
  && (await page.$('[data-test="external"] .astryx-icon')) != null, JSON.stringify(ext));
const blank = await info('[data-test="blank"]');
check('target="_blank" merges noopener noreferrer into rel', blank.rel === 'author noopener noreferrer', JSON.stringify(blank));
const asButton = await info('[data-test="as-button"]');
check('no href renders <button type=button>', asButton.tag === 'BUTTON', JSON.stringify(asButton));

// disabled anchor
const dis = await info('[data-test="disabled"]');
check('disabled link: <a role=link aria-disabled tabindex=0>, no href', dis.tag === 'A' && dis.role === 'link' && dis.aria === 'true' && dis.tabindex === '0' && dis.href === null, JSON.stringify(dis));
await page.evaluate(() => {
  window.__hits = 0;
  for (const s of ['[data-test="disabled"]', '[data-test="disabled-button"]']) document.querySelector(s).addEventListener('click', () => window.__hits++);
});
for (const sel of ['[data-test="disabled"]', '[data-test="disabled-button"]']) {
  await page.focus(sel);
  const focused = await page.$eval(sel, (el) => document.activeElement === el);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await page.click(sel, {force: true});
  check(`${sel}: focusable and inert (click, Enter, Space)`, focused && (await page.evaluate(() => window.__hits)) === 0 && page.url() === url);
}
const disStyle = await page.$eval('[data-test="disabled"]', (el) => [getComputedStyle(el).opacity, getComputedStyle(el).pointerEvents]);
check('disabled link: 50% opacity, no pointer events', disStyle[0] === '0.5' && disStyle[1] === 'none', JSON.stringify(disStyle));

// blocked
const blocked = await info('[data-test="blocked"]');
check('javascript: href renders <a> without href', blocked.tag === 'A' && blocked.href === null, JSON.stringify(blocked));
await page.click('[data-test="blocked"]');
check('blocked link navigates nowhere', page.url() === url && errors.length === 0);

// custom link component (`as`): used for a safe href, never for a blocked one
const custom = await page.$eval('[data-test="custom"]', (el) => [el.tagName, el.getAttribute('href'), el.hasAttribute('data-demo-router'), el.classList.contains('astryx-link')]);
check('`as` component renders the link with the checked href and the hooks', JSON.stringify(custom) === '["A","/components/button/",true,true]', JSON.stringify(custom));
const customBlocked = await page.$eval('[data-test="custom-blocked"]', (el) => [el.getAttribute('href'), el.hasAttribute('data-demo-router')]);
check('a blocked href never reaches the custom component', customBlocked[0] === null && customBlocked[1] === false, JSON.stringify(customBlocked));

// focus ring + hover underline
const a = page.locator('[data-test="colors"] .astryx-link').first();
await a.hover();
const deco = await a.evaluate((el) => getComputedStyle(el).textDecorationLine);
check('hover underlines an enabled link', deco === 'underline', deco);
await page.mouse.move(0, 0);
await page.click('[data-test="as-button"]');
const mouseRing = await page.$eval('[data-test="as-button"]', (el) => getComputedStyle(el).outlineStyle);
check('no ring after a mouse press', mouseRing === 'none', mouseRing);
await page.keyboard.press('Tab');
const kbRing = await page.evaluate(() => [document.activeElement.className, getComputedStyle(document.activeElement).outlineStyle]);
check('ring on keyboard focus', kbRing[0].includes('astryx-link') && kbRing[1] === 'solid', JSON.stringify(kbRing));

check('no page errors', errors.length === 0, errors.join('\n'));
await browser.close();
server.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
