#!/usr/bin/env node
/**
 * Token behaviour in a real browser (system Chrome), against the built docs (run
 * `cd apps/docs && npx astro build` first):
 *   - remove: the button is named "Remove {label}", its click dispatches `astryx-remove`
 *     with {event} once and never reaches the token's own action; keyboard works;
 *   - clickable token: a surface click is retargeted to the inner button (one click);
 *   - link + remove: the surface activates the link; the link keeps its href;
 *   - roles: static span, link, container + inner button/link;
 *   - disabled: remove / action / disabled link stay focusable but inert;
 *   - a blocked `javascript:` href renders an inert anchor.
 * Exit code 1 on any failure.   node tools/tests/token.test.mjs
 */
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync, existsSync, statSync} from 'node:fs';
import {join, extname} from 'node:path';

const root = new URL('../../apps/docs/dist/', import.meta.url).pathname;
if (!existsSync(join(root, 'components/token/index.html'))) {
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

const url = `${base}/components/token/`;
await page.goto(url);
await page.waitForLoadState('networkidle');
await page.evaluate(() => {
  window.__log = [];
  document.addEventListener('astryx-remove', (e) => window.__log.push({type: 'remove', test: e.target.dataset.test, isMouse: e.detail.event instanceof MouseEvent}));
  for (const t of document.querySelectorAll('[data-test="interactive"] > .astryx-token, [data-test="disabled"] > .astryx-token')) {
    t.addEventListener('click', (e) => window.__log.push({type: 'token-click', test: t.dataset.test, target: e.target.className}));
    const action = t.querySelector('.ax-token-action');
    action?.addEventListener('click', () => window.__log.push({type: 'action-click', test: t.dataset.test}));
  }
});
const log = () => page.evaluate(() => window.__log.splice(0));

// roles
const roles = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-test="interactive"] > .astryx-token')].map((t) => [t.dataset.test, {
  tag: t.tagName, href: t.getAttribute('href'), inner: t.querySelector('.ax-token-action')?.tagName ?? null,
  ring: t.classList.contains('ax-focus-within') ? 'within' : t.classList.contains('ax-focus-visible') ? 'visible' : null,
}])));
check('link token is <a href> with its own ring', roles.link.tag === 'A' && roles.link.href === '/components/link/' && roles.link.ring === 'visible', JSON.stringify(roles.link));
check('link + remove is a container with an inner link', roles['link-removable'].tag === 'SPAN' && roles['link-removable'].inner === 'A' && roles['link-removable'].ring === 'within', JSON.stringify(roles['link-removable']));
check('clickable token is a container with an inner button', roles.clickable.tag === 'SPAN' && roles.clickable.inner === 'BUTTON' && roles.clickable.ring === 'within', JSON.stringify(roles.clickable));
check('static removable token is a span with no ring', roles.removable.tag === 'SPAN' && roles.removable.ring === null, JSON.stringify(roles.removable));
check('blocked javascript: href renders <a> without href', roles.blocked.tag === 'A' && roles.blocked.href === null, JSON.stringify(roles.blocked));

// remove
const removeName = await page.$eval('[data-test="removable"] [data-ax-token-remove]', (b) => b.getAttribute('aria-label'));
check('remove button is named "Remove {label}"', removeName === 'Remove Ada Lovelace', removeName);
await page.click('[data-test="removable"] [data-ax-token-remove]');
let l = await log();
check('remove click dispatches astryx-remove {event} once and stops there',
  l.length === 1 && l[0].type === 'remove' && l[0].test === 'removable' && l[0].isMouse, JSON.stringify(l));
await page.focus('[data-test="removable"] [data-ax-token-remove]');
await page.keyboard.press('Enter');
l = await log();
check('remove works from the keyboard', l.length === 1 && l[0].type === 'remove', JSON.stringify(l));
await page.click('[data-test="clickable-removable"] [data-ax-token-remove]');
l = await log();
check('remove on a clickable token never runs the token action', l.length === 1 && l[0].type === 'remove', JSON.stringify(l));

// clickable token
const iconBox = await page.$eval('[data-test="clickable"] > .astryx-icon', (el) => { const r = el.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; });
await page.mouse.click(iconBox.x, iconBox.y);
l = await log();
check('surface click is retargeted to the inner button (one click)',
  l.length === 2 && l[0].type === 'action-click' && l[1].type === 'token-click' && l[1].target === 'ax-token-action', JSON.stringify(l));
await page.click('[data-test="clickable"] .ax-token-action');
l = await log();
check('inner button click runs once', l.filter((e) => e.type === 'action-click').length === 1 && l.length === 2, JSON.stringify(l));
await page.focus('[data-test="clickable"] .ax-token-action');
await page.keyboard.press('Space');
l = await log();
check('inner button activates from the keyboard', l.some((e) => e.type === 'action-click'), JSON.stringify(l));
const ring = await page.$eval('[data-test="clickable"]', (el) => getComputedStyle(el).outlineStyle);
check('keyboard focus rings the whole clickable token', ring === 'solid', ring);

// disabled
for (const sel of ['[data-test="disabled-removable"] [data-ax-token-remove]', '[data-test="disabled-clickable"] .ax-token-action', '[data-test="disabled-link"]']) {
  const info = await page.$eval(sel, (el) => { el.focus(); return {focused: document.activeElement === el, aria: el.getAttribute('aria-disabled'), href: el.getAttribute('href')}; });
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await page.click(sel, {force: true});
  l = await log();
  check(`disabled ${sel.match(/data-test="([^"]+)"/)[1]}: focusable, aria-disabled, inert`,
    info.focused && info.aria === 'true' && info.href === null && l.length === 0 && page.url() === url, JSON.stringify({info, l}));
}
const opacity = await page.$eval('[data-test="disabled-link"]', (el) => [getComputedStyle(el).opacity, el.dataset.disabled]);
check('disabled token: 50% and data-disabled="disabled"', opacity[0] === '0.5' && opacity[1] === 'disabled', JSON.stringify(opacity));

// link + remove: the surface activates the link
const surface = await page.$eval('[data-test="link-removable"]', (el) => { const r = el.getBoundingClientRect(); return {x: r.x + 4, y: r.y + r.height / 2}; });
await page.mouse.click(surface.x, surface.y);
await page.waitForURL('**/components/link/', {timeout: 3000}).catch(() => {});
check('link + remove: a surface click follows the link', page.url().endsWith('/components/link/'), page.url());

check('no page errors', errors.length === 0, errors.join('\n'));
await browser.close();
server.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
