#!/usr/bin/env node
/**
 * ProgressBar ARIA and geometry in system Chrome against the built docs
 * (`cd apps/docs && npx astro build` first): role=progressbar named by its (possibly
 * hidden) label, aria-valuenow/min/max/valuetext (clamped, NaN-safe, custom formatter),
 * none of the values when indeterminate, marks as named focusable images outside the
 * progressbar, and the fill drawn at the value (LTR and RTL).
 * Exit code 1 on any failure.
 *   node tools/tests/progress-bar-aria.test.mjs
 */
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync, existsSync, statSync} from 'node:fs';
import {join, extname} from 'node:path';

const root = new URL('../../apps/docs/dist/', import.meta.url).pathname;
if (!existsSync(join(root, 'components/progress-bar/index.html'))) {
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
const page = await browser.newPage({reducedMotion: 'reduce'});
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto(`${base}/components/progress-bar/`);
await page.waitForTimeout(150);

const aria = async (name) => {
  const bar = page.getByRole('progressbar', {name, exact: true});
  const count = await bar.count();
  if (count !== 1) return {count};
  return bar.evaluate((el) => ({
    count: 1,
    now: el.getAttribute('aria-valuenow'),
    min: el.getAttribute('aria-valuemin'),
    max: el.getAttribute('aria-valuemax'),
    text: el.getAttribute('aria-valuetext'),
    cls: el.className,
  }));
};

let a = await aria('Accent progress');
check('determinate: valuenow/min/max/valuetext', a.now === '20' && a.min === '0' && a.max === '100' && a.text === '20%' && a.cls === 'astryx-progress-bar-track', JSON.stringify(a));
a = await aria('Disk usage');
check('custom max + formatter → valuetext "3.2 GB / 5 GB"', a.now === '3.2' && a.max === '5' && a.text === '3.2 GB / 5 GB', JSON.stringify(a));
a = await aria('Upload progress');
check('visually hidden label still names the bar', a.count === 1 && a.now === '40', JSON.stringify(a));
const hiddenLabel = await page.$eval('[data-case="hidden-label"]', (el) => {
  const id = el.querySelector('[role="progressbar"]').getAttribute('aria-labelledby');
  const label = document.getElementById(id);
  return {rect: label.getBoundingClientRect().width, cls: label.className};
});
check('hidden label is clipped to 1px', hiddenLabel.rect <= 1, JSON.stringify(hiddenLabel));
a = await aria('Over the max (clamped)');
check('value above max is clamped (100, "100%")', a.now === '100' && a.text === '100%', JSON.stringify(a));
a = await aria('Unknown total (NaN → 0)');
check('NaN value / zero max → 0 / 0 / "0%"', a.now === '0' && a.max === '0' && a.text === '0%', JSON.stringify(a));
a = await aria('Canceled');
check('disabled bar keeps its values', a.now === '30', JSON.stringify(a));
const disabledFill = await page.$eval('[data-case="disabled"] .astryx-progress-bar-fill', (el) => el.getAttribute('data-variant'));
check('disabled fill variant is "disabled"', disabledFill === 'disabled', disabledFill);

a = await aria('Loading (accent)');
check('indeterminate: no valuenow/min/max/valuetext', a.count === 1 && a.now === null && a.min === null && a.max === null && a.text === null, JSON.stringify(a));
const valueLabels = await page.$$eval('[data-case="indeterminate"] .ax-progress-bar-value', (els) => els.length);
check('indeterminate ignores hasValueLabel', valueLabels === 0, String(valueLabels));
const pulse = await page.$eval('[data-case="indeterminate"] .astryx-progress-bar-fill', (el) => {
  const cs = getComputedStyle(el);
  return {name: cs.animationName, width: el.getBoundingClientRect().width, track: el.parentElement.getBoundingClientRect().width, dir: cs.animationDirection};
});
check('reduced motion: indeterminate pulses in place at full width', pulse.name === 'ax-progress-bar-pulse' && Math.abs(pulse.width - pulse.track) < 1 && pulse.dir === 'alternate', JSON.stringify(pulse));

// Marks: outside the progressbar, focusable named images, placement by value.
const marks = await page.$$eval('[data-case="marks"] .astryx-progress-bar-mark', (els) => els.map((el) => ({
  role: el.getAttribute('role'), name: el.getAttribute('aria-label'), tab: el.getAttribute('tabindex'),
  placement: el.getAttribute('data-placement'), variant: el.getAttribute('data-variant'),
  inBar: el.closest('[role="progressbar"]') != null,
})));
check('marks: role=img + name + tabindex=0, outside role=progressbar',
  marks.length === 2 && marks.every((m) => m.role === 'img' && m.tab === '0' && !m.inBar) && marks[0].name === 'Q1 target: 25%', JSON.stringify(marks));
check('mark placement: 25 on fill, 80 on track (value 45)', marks[0].placement === 'fill' && marks[1].placement === 'track', JSON.stringify(marks));
await page.keyboard.press('Tab');
const reachable = await page.evaluate(async () => {
  const mark = document.querySelector('[data-case="marks"] .astryx-progress-bar-mark');
  mark.focus();
  return document.activeElement === mark;
});
check('marks are focusable', reachable);

// Geometry: the fill's leading edge sits at the value, mirrored in RTL.
const geometry = await page.$$eval('.astryx-progress-bar-fill:not([data-ax-indeterminate])', (els) => els.map((el) => {
  const track = el.parentElement.getBoundingClientRect();
  const fill = el.getBoundingClientRect();
  const visible = Math.max(0, Math.min(fill.right, track.right) - Math.max(fill.left, track.left));
  return {pct: Math.round((visible / track.width) * 100), now: el.parentElement.getAttribute('aria-valuenow'), max: el.parentElement.getAttribute('aria-valuemax'), rtl: el.matches(':dir(rtl)'), startsRight: Math.abs(Math.min(fill.right, track.right) - track.right) < 1};
}));
const bad = geometry.filter((g) => {
  const expected = Number(g.max) > 0 ? Math.round((Number(g.now) / Number(g.max)) * 100) : 0;
  return Math.abs(g.pct - expected) > 1;
});
check('every determinate fill draws its share of the track', bad.length === 0, JSON.stringify(bad));
const rtl = geometry.find((g) => g.rtl);
check('RTL fill grows from the inline start (right)', rtl != null && rtl.startsRight && rtl.pct === 65, JSON.stringify(rtl));

await browser.close();
server.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
