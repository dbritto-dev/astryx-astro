#!/usr/bin/env node
/**
 * Live-region and toggle behaviours of FieldStatus, EmptyState and MetadataList in system
 * Chrome against the built docs (`cd apps/docs && npx astro build` first):
 *  - FieldStatus: server-rendered errors are spoken assertively and warnings/successes
 *    politely at load; a status inserted later slides in (data-ax-entering +
 *    @starting-style) and is spoken; server-rendered ones never animate.
 *  - EmptyState: silent for text present at load, spoken once when inserted later.
 *  - MetadataList: "Show more" reveals the hidden items, flips aria-expanded and its label.
 * Exit code 1 on any failure.
 *   node tools/tests/status-announce.test.mjs
 */
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync, existsSync, statSync} from 'node:fs';
import {join, extname} from 'node:path';

const root = new URL('../../apps/docs/dist/', import.meta.url).pathname;
if (!existsSync(join(root, 'components/field-status/index.html'))) {
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
const regions = () => page.evaluate(() => Object.fromEntries(
  [...document.querySelectorAll('[data-astryx-live-region]')].map((r) => [r.getAttribute('data-astryx-live-region'), {text: r.textContent, role: r.getAttribute('role'), live: r.getAttribute('aria-live')}]),
));

// FieldStatus
await page.goto(`${base}/components/field-status/`);
await page.waitForLoadState('load');
await page.waitForTimeout(100);
let r = await regions();
check('regions: polite=status, assertive=alert', r.polite?.role === 'status' && r.assertive?.role === 'alert' && r.assertive?.live === 'assertive', JSON.stringify(r));
check('server-rendered errors are spoken assertively', r.assertive?.text.includes('This field is required'), r.assertive?.text);
check('warnings/successes are spoken politely', r.polite?.text.includes('This will be visible to others') && r.polite?.text.includes('Username is available'), r.polite?.text);
check('identical messages are spoken once per frame', (r.assertive?.text.match(/This field is required/g) ?? []).length === 1, r.assertive?.text);
const ssrEntering = await page.$$eval('.astryx-field-status[data-ax-entering]', (els) => els.length);
check('server-rendered statuses do not animate', ssrEntering === 0, String(ssrEntering));
await page.waitForTimeout(2200);
r = await regions();
check('regions clear after 2s', r.polite.text === '' && r.assertive.text === '', JSON.stringify(r));
await page.click('[data-test="field-status-insert"] [data-insert]');
const inserted = await page.$eval('[data-test="field-status-insert"] .astryx-field-status', (el) => ({
  entering: el.hasAttribute('data-ax-entering'),
  transition: getComputedStyle(el).transitionProperty,
  opacity: Number(getComputedStyle(el).opacity),
}));
check('inserted status animates in (data-ax-entering, opacity transition from 0)', inserted.entering && inserted.transition.includes('opacity') && inserted.opacity < 1, JSON.stringify(inserted));
await page.waitForTimeout(100);
r = await regions();
check('inserted error is spoken assertively', r.assertive.text === 'Pick a date in the future', r.assertive.text);
await page.evaluate(() => {
  const msg = document.querySelector('[data-test="field-status-insert"] .astryx-field-status .ax-field-status-content > span:last-child');
  msg.textContent = 'Pick a weekday';
});
await page.waitForTimeout(100);
r = await regions();
check('a changed message is spoken again', r.assertive.text === 'Pick a weekday', r.assertive.text);

// EmptyState
await page.goto(`${base}/components/empty-state/`);
await page.waitForLoadState('load');
await page.waitForTimeout(150);
r = await regions();
check('EmptyState text present at load is silent', !r.polite || r.polite.text === '', JSON.stringify(r));
await page.click('[data-test="empty-state-insert"] [data-clear]');
await page.waitForTimeout(150);
r = await regions();
check('EmptyState inserted later is spoken once, politely', r.polite?.text === 'List cleared This message is announced because it appeared after load.', JSON.stringify(r));

// MetadataList toggle
await page.goto(`${base}/components/metadata-list/`);
await page.waitForTimeout(100);
const list = page.locator('[data-test="metadata-collapse"] .astryx-metadata-list').first();
const before = await list.evaluate((el) => ({
  visible: [...el.querySelectorAll('dt')].filter((d) => d.checkVisibility()).map((d) => d.textContent),
  expanded: el.querySelector('button').getAttribute('aria-expanded'),
  controls: el.querySelector('button').getAttribute('aria-controls') === el.querySelector('dl').id,
}));
check('collapsed: only the first 2 items show; aria-controls → the <dl>', before.visible.join() === 'One,Two' && before.expanded === 'false' && before.controls, JSON.stringify(before));
await list.getByRole('button', {name: 'Show more'}).click();
const after = await list.evaluate((el) => ({
  visible: [...el.querySelectorAll('dt')].filter((d) => d.checkVisibility()).map((d) => d.textContent),
  expanded: el.querySelector('button').getAttribute('aria-expanded'),
  label: el.querySelector('button').textContent,
}));
check('Show more reveals all items and flips to "Show less"', after.visible.join() === 'One,Two,Three,Four' && after.expanded === 'true' && after.label === 'Show less', JSON.stringify(after));
await list.getByRole('button', {name: 'Show less'}).click();
const again = await list.evaluate((el) => [...el.querySelectorAll('dt')].filter((d) => d.checkVisibility()).length);
check('Show less collapses again', again === 2, String(again));
const inline = await page.$eval('[data-testid="meta-single"]', (el) => ({
  dt: el.querySelector('dt[data-testid="name-label"]')?.className, dd: el.querySelector('dd[data-testid="name-value"]') != null,
  wrappers: el.querySelectorAll('dl > div').length,
}));
check('side-by-side items are bare dt/dd pairs with the target on <dt>', /\bastryx-metadata-list-item\b/.test(inline.dt ?? '') && inline.dd && inline.wrappers === 0, JSON.stringify(inline));

check('no page errors', errors.length === 0, errors.join('\n    '));
await browser.close();
server.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
