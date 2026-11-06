#!/usr/bin/env node
/**
 * Avatar image fallback chain + accessible names, in system Chrome against the built docs
 * (run `cd apps/docs && npx astro build` first).
 *   1. src fails → initials plate; src fails → fallbackSrc image; both fail → initials;
 *      no name → person icon (behaviors/imageFallback.ts, also for an image that failed
 *      before the script ran).
 *   2. An avatar inserted after load with a broken src falls back too.
 *   3. Names: role=img + "Jane Doe, Online" (status label composed), decorative avatar is
 *      role=presentation + aria-hidden, AvatarGroup restamps size/shape on members.
 * Exit code 1 on any failure.
 *   node tools/tests/avatar-image-fallback.test.mjs
 */
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync, existsSync, statSync} from 'node:fs';
import {join, extname} from 'node:path';

const root = new URL('../../apps/docs/dist/', import.meta.url).pathname;
if (!existsSync(join(root, 'components/avatar/index.html'))) {
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
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto(`${base}/components/avatar/`);
await page.waitForLoadState('load');
await page.waitForTimeout(200);

const state = (sel) => page.$eval(sel, (el) => ({
  imgs: [...el.querySelectorAll('img')].map((i) => ({src: i.getAttribute('src').slice(0, 30), loaded: i.complete && i.naturalWidth > 0})),
  plate: el.querySelector('.astryx-avatar-fallback')?.textContent ?? null,
  icon: el.querySelector('.ax-avatar-default-icon') != null,
  templates: el.querySelectorAll('template').length,
}));

let s = await state('[data-case="src-broken"]');
check('src fails → initials plate replaces the image', s.imgs.length === 0 && s.plate === 'BI' && s.templates === 0, JSON.stringify(s));
s = await state('[data-case="fallback-src"]');
check('src fails → fallbackSrc image loads, no plate yet', s.imgs.length === 1 && s.imgs[0].loaded && s.plate === null && s.templates === 1, JSON.stringify(s));
s = await state('[data-case="both-broken"]');
check('src and fallbackSrc fail → initials', s.imgs.length === 0 && s.plate === 'BB', JSON.stringify(s));
s = await state('[data-case="icon"]');
check('no name → person icon plate', s.imgs.length === 0 && s.icon, JSON.stringify(s));

// An avatar inserted after load (client-side render) falls back as well.
await page.evaluate(() => {
  // The demo keeps server-rendered markup for a broken src + broken fallbackSrc avatar in a
  // <template>; insert it the way client code would.
  const tpl = document.querySelector('template[data-test="avatar-insert"]');
  tpl.after(tpl.content.cloneNode(true));
});
await page.waitForTimeout(300);
s = await state('[data-case="inserted"]');
check('inserted after load: broken src → broken fallbackSrc → initials', s.imgs.length === 0 && s.plate === 'IL', JSON.stringify(s));

// Accessible names.
const name = (sel) => page.$eval(sel, (el) => ({role: el.getAttribute('role'), label: el.getAttribute('aria-label'), hidden: el.getAttribute('aria-hidden'), tag: el.tagName.toLowerCase(), tabindex: el.getAttribute('tabindex')}));
const online = await page.getByRole('img', {name: 'Jane Doe, Online'}).count();
check('status label composes into the name ("Jane Doe, Online")', online >= 1, `found ${online}`);
const busyEs = await page.getByRole('img', {name: 'Ana García, En línea'}).count();
check('es-ES status composition', busyEs === 1);
const decorative = await page.$$eval('.demo .astryx-avatar[role="presentation"]', (els) => els.map((e) => e.getAttribute('aria-hidden')));
check('nameless avatars are decorative (presentation + aria-hidden)', decorative.length >= 2 && decorative.every((v) => v === 'true'), JSON.stringify(decorative));
const link = await page.getByRole('link', {name: 'Link Person'}).count();
const button = await page.getByRole('button', {name: 'Button Person'}).count();
check('href renders a named link, isClickable a named button', link === 1 && button === 1, `link=${link} button=${button}`);
const blocked = await page.$$eval('.demo .astryx-avatar[aria-label="Blocked Link"]', (els) => els.map((e) => e.tagName.toLowerCase() + ':' + (e.getAttribute('href') ?? '')));
check('blocked href renders a static avatar', blocked.length === 1 && blocked[0] === 'div:', JSON.stringify(blocked));
const tip = await page.$eval('.demo .astryx-avatar[aria-label="jsmith"]', (el) => ({tab: el.getAttribute('tabindex'), desc: document.getElementById(el.getAttribute('aria-describedby') ?? '')?.textContent}));
check('custom tooltip string: tab stop + aria-describedby text', tip.tab === '0' && tip.desc === 'Jane Smith, Staff Engineer', JSON.stringify(tip));
const noTip = await name('.demo .astryx-avatar[aria-label="No Tooltip"]');
check('tooltip={false}: no tab stop', noTip.tabindex === null, JSON.stringify(noTip));

// AvatarGroup restamps its members.
await page.goto(`${base}/components/avatar-group/`);
await page.waitForTimeout(150);
const members = await page.$$eval('.demo .astryx-avatar-group[data-size="lg"][data-shape="rounded"] > :not(ax-tooltip)', (els) => els.map((e) => ({
  cls: e.className, size: e.getAttribute('data-size'), shape: e.getAttribute('data-shape'), w: Math.round(e.getBoundingClientRect().width),
})));
check('group size/shape win over members (lg, rounded; 48px + 2px ring each side)',
  members.length === 4 && members.slice(0, 3).every((m) => m.size === 'lg' && m.shape === 'rounded' && m.w === 52), JSON.stringify(members));
const dots = await page.$$eval('.demo .astryx-avatar-group[data-size="lg"] .astryx-avatar-status-dot', (els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
check('status dots take the group size tier (lg → 20px dot)', dots.length === 3 && dots.every((w) => w === 20), JSON.stringify(dots));
const group = await page.getByRole('group', {name: 'Project members'});
const hint = await group.getAttribute('aria-describedby');
const hintText = hint ? await page.$eval(`#${hint}`, (el) => el.textContent) : null;
check('interactive group describes its keyboard hint', hintText === 'Use arrow keys to move between avatars', String(hintText));
const overflowName = await page.getByRole('button', {name: '4 more'}).count();
check('clickable overflow is a named button ("4 more")', overflowName === 1);

check('no page errors', errors.length === 0, errors.join('\n    '));
await browser.close();
server.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
