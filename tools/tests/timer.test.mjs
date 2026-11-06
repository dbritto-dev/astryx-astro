#!/usr/bin/env node
/**
 * Timer: server first paint, <ax-timer> ticking under a controlled clock, Astryx's
 * formatting rules, ISO durations, locale digits, and stop/restart on disconnect.
 * Runs in system Chrome against the built docs (`cd apps/docs && npx astro build` first).
 * Exit code 1 on any failure.
 *   node tools/tests/timer.test.mjs
 */
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync, existsSync, statSync} from 'node:fs';
import {join, extname} from 'node:path';
import {parse} from 'node-html-parser';

const root = new URL('../../apps/docs/dist/', import.meta.url).pathname;
const pageFile = join(root, 'components/timer/index.html');
if (!existsSync(pageFile)) {
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

// 1. Server first paint (before any script): 0 elapsed, PT0S, theme hooks, locale.
const ssr = parse(readFileSync(pageFile, 'utf8'));
const ssrTimer = (c) => ssr.querySelector(`[data-case="${c}"]`);
check('SSR elapsed: "0s" in <time datetime="PT0S">',
  ssrTimer('elapsed-mount')?.text === '0s' && ssrTimer('elapsed-mount')?.getAttribute('datetime') === 'PT0S');
check('SSR clock: "0:00"', ssrTimer('clock-mount')?.text === '0:00');
const host = ssrTimer('elapsed-mount')?.parentNode;
check('root is <ax-timer class="astryx-text astryx-timer"> with Text hooks + data-locale',
  host?.tagName === 'AX-TIMER' && /\bastryx-text\b/.test(host.getAttribute('class')) && /\bastryx-timer\b/.test(host.getAttribute('class'))
    && host.getAttribute('data-type') === 'supporting' && host.getAttribute('data-color') === 'secondary' && host.getAttribute('data-locale') === 'en',
  host?.toString().slice(0, 200));
check('SSR ar-EG renders native digits at 0', ssrTimer('locale-ar')?.text === new Intl.NumberFormat('ar-EG').format(0) + 's', ssrTimer('locale-ar')?.text);

// 2. Ticking under a controlled clock.
const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox']});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.clock.install({time: new Date('2026-11-06T12:00:00Z')});
await page.goto(`${base}/components/timer/`);
await page.waitForLoadState('load');

const read = (c) => page.$eval(`[data-case="${c}"]`, (t) => ({text: t.textContent, dateTime: t.getAttribute('datetime')}));

let r = await read('elapsed-mount');
check('connect: elapsed starts at 0s', r.text === '0s' && r.dateTime === 'PT0S', JSON.stringify(r));
r = await read('elapsed-minutes');
check('startTime 2m05s ago → "2m 05s" / PT125S', r.text === '2m 05s' && r.dateTime === 'PT125S', JSON.stringify(r));
r = await read('elapsed-hours');
check('startTime 1h05m ago → "1h 05m" / whole minutes PT3900S', r.text === '1h 05m' && r.dateTime === 'PT3900S', JSON.stringify(r));
r = await read('clock-hours');
check('clock 1:02:03 ago → "1:02:03" / PT3723S', r.text === '1:02:03' && r.dateTime === 'PT3723S', JSON.stringify(r));
r = await read('future');
check('a start in the future holds at 0s', r.text === '0s', JSON.stringify(r));

await page.clock.runFor(5000);
r = await read('elapsed-mount');
check('ticks: 5s later → "5s" / PT5S', r.text === '5s' && r.dateTime === 'PT5S', JSON.stringify(r));
r = await read('clock-mount');
check('clock ticks: "0:05"', r.text === '0:05', JSON.stringify(r));
r = await read('elapsed-hours');
check('elapsed past an hour does not change within the minute', r.text === '1h 05m' && r.dateTime === 'PT3900S', JSON.stringify(r));

await page.clock.runFor(60_000);
r = await read('elapsed-mount');
check('65s → "1m 05s"', r.text === '1m 05s' && r.dateTime === 'PT65S', JSON.stringify(r));
r = await read('elapsed-hours');
check('past an hour it updates by the minute → "1h 06m" / PT3960S', r.text === '1h 06m' && r.dateTime === 'PT3960S', JSON.stringify(r));
r = await read('future');
check('future start begins counting once reached (60s after it)', r.text === '1m 00s', JSON.stringify(r));

// 3. Locale digits through Intl (data-locale from the server).
const expectAr = (() => {
  const n = new Intl.NumberFormat('ar-EG', {useGrouping: false});
  const p = new Intl.NumberFormat('ar-EG', {useGrouping: false, minimumIntegerDigits: 2});
  return `${n.format(4)}m ${p.format(10)}s`; // 185s + 65s = 250s
})();
r = await read('locale-ar');
check(`ar-EG digits ("${expectAr}")`, r.text === expectAr && r.dateTime === 'PT250S', JSON.stringify(r));
const expectDeva = (() => {
  const n = new Intl.NumberFormat('hi-IN-u-nu-deva', {useGrouping: false});
  const p = new Intl.NumberFormat('hi-IN-u-nu-deva', {useGrouping: false, minimumIntegerDigits: 2});
  return `${n.format(1)}:${p.format(3)}:${p.format(8)}`; // 3723s + 65s = 3788s
})();
r = await read('locale-deva');
check(`hi-IN-u-nu-deva clock digits ("${expectDeva}")`, r.text === expectDeva, JSON.stringify(r));
r = await read('locale-es');
check('es-ES keeps Latin digits: "2:06"', r.text === '2:06', JSON.stringify(r));

// 4. Disconnect stops ticking; reconnect resumes from the same start.
await page.evaluate(() => {
  const el = document.querySelector('[data-case="elapsed-minutes"]').closest('ax-timer');
  window.__parked = {el, parent: el.parentNode, next: el.nextSibling};
  el.remove();
});
await page.clock.runFor(3000);
const parkedText = await page.evaluate(() => window.__parked.el.querySelector('time').textContent);
check('disconnected timer stops writing', parkedText === '3m 10s', parkedText);
await page.evaluate(() => { const {el, parent, next} = window.__parked; parent.insertBefore(el, next); });
r = await read('elapsed-minutes');
check('reconnect resumes from the original start (2m05s + 68s = 3m 13s)', r.text === '3m 13s', JSON.stringify(r));

// 5. Changing data-format restarts with the new format.
await page.evaluate(() => document.querySelector('[data-case="elapsed-minutes"]').closest('ax-timer').setAttribute('data-format', 'clock'));
r = await read('elapsed-minutes');
check('data-format change re-renders as clock "3:13"', r.text === '3:13', JSON.stringify(r));

check('no page errors', errors.length === 0, errors.join('\n    '));
await browser.close();
server.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
