#!/usr/bin/env node
/**
 * Where Temporal loads in the built docs (apps/docs/dist; `cd apps/docs && npx astro build`
 * first). src/lib/temporal.ts uses the native Temporal, else dynamically imports
 * temporal-polyfill/full (Safari, Node). Checks:
 *  - Build graph: the polyfill chunk is only ever a dynamic import of the lib/temporal chunk,
 *    and a page's scripts reach the lib/temporal chunk exactly when the page has a date
 *    element (ax-calendar, ax-date-input, …, ax-timer); scripts of other pages never import it.
 *  - Chrome (native Temporal), every page: the polyfill chunk is never requested.
 *  - Temporal removed (Safari's path), every page: the polyfill chunk is requested exactly on
 *    the date pages, other pages request neither chunk, date elements still upgrade, and the
 *    polyfill is not installed on globalThis.
 *   node tools/tests/temporal-loading.test.mjs
 */
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {extname, join} from 'node:path';

const dist = new URL('../../apps/docs/dist/', import.meta.url).pathname;
const astro = join(dist, '_astro');
if (!existsSync(astro)) {
  console.error('✗ apps/docs/dist not built — run `cd apps/docs && npx astro build` first');
  process.exit(1);
}
let failures = 0;
let passes = 0;
const check = (name, ok, detail = '') => {
  if (ok) { passes++; console.log(`  ✓ ${name}`); }
  else { failures++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

// ── Build graph ──────────────────────────────────────────────────────────
const DATE_TAGS = ['ax-calendar', 'ax-date-input', 'ax-date-range-input', 'ax-date-time-input', 'ax-time-input', 'ax-timestamp', 'ax-timer', 'ax-power-search'];
const chunks = readdirSync(astro).filter((f) => f.endsWith('.js'));
const graph = new Map(chunks.map((f) => {
  const code = readFileSync(join(astro, f), 'utf8');
  const dynamic = [...code.matchAll(/import\(\s*["'`]\.\/([^"'`]+)["'`]\s*\)/g)].map((m) => m[1]);
  const all = [...code.matchAll(/(?:import|from)\s*["'`]\.\/([^"'`]+)["'`]/g)].map((m) => m[1]);
  return [f, {code, dynamic, static: all.filter((x) => !dynamic.includes(x))}];
}));
const closure = (roots) => {
  const seen = new Set();
  const walk = (f) => { if (seen.has(f) || !graph.has(f)) return; seen.add(f); graph.get(f).static.forEach(walk); };
  roots.forEach(walk);
  return seen;
};
// The lib/temporal chunk reads globalThis.Temporal and dynamically imports the polyfill.
const temporalChunks = chunks.filter((f) => /globalThis\.Temporal\?\?/.test(graph.get(f).code) && graph.get(f).dynamic.length > 0);
const polyfillChunks = [...closure(temporalChunks.flatMap((f) => graph.get(f).dynamic))];
console.log('Build graph');
check('one lib/temporal chunk', temporalChunks.length === 1, temporalChunks.join());
check('the polyfill chunk carries every calendar (the /full build)', polyfillChunks.some((f) => ['hebrew', 'chinese', 'islamic-umalqura', 'ethioaa'].every((c) => graph.get(f).code.includes(c))), polyfillChunks.join());
const staticallyImported = chunks.filter((f) => graph.get(f).static.some((d) => polyfillChunks.includes(d)));
check('no chunk imports the polyfill statically', staticallyImported.length === 0, staticallyImported.join());
const polyfillBytes = polyfillChunks.reduce((n, f) => n + statSync(join(astro, f)).size, 0);
console.log(`    polyfill chunk(s): ${polyfillChunks.join(', ')} (${(polyfillBytes / 1024).toFixed(1)} KB minified)`);

const pages = [];
const walkPages = (dir) => {
  for (const e of readdirSync(dir, {withFileTypes: true})) {
    if (e.isDirectory() && e.name !== '_astro') walkPages(join(dir, e.name));
    else if (e.name === 'index.html') pages.push(join(dir, e.name));
  }
};
walkPages(dist);
const info = pages.sort().map((file) => {
  const html = readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script type="module" src="\/_astro\/([^"]+)"/g)].map((m) => m[1]);
  const tags = DATE_TAGS.filter((t) => html.includes(`<${t}`));
  const reach = closure(scripts);
  return {path: file.slice(dist.length - 1).replace(/index\.html$/, ''), tags, scripts, reachesTemporal: temporalChunks.some((c) => reach.has(c))};
});
const datePages = info.filter((p) => p.tags.length > 0);
const wrong = info.filter((p) => p.reachesTemporal !== p.tags.length > 0).map((p) => `${p.path}${p.reachesTemporal ? ' imports Temporal without a date element' : ' has a date element but no Temporal'}`);
check(`scripts import lib/temporal exactly on the ${datePages.length} pages with date elements (of ${info.length})`, wrong.length === 0, wrong.join('; '));
console.log(`    date pages: ${datePages.map((p) => p.path.replace('/components/', '').replace(/\/$/, '') || '/').join(', ')}`);
const leakyScripts = info.filter((p) => !p.tags.length).flatMap((p) => p.scripts.filter((s) => temporalChunks.some((c) => closure([s]).has(c))));
check('no script of a page without dates reaches the lib/temporal chunk', leakyScripts.length === 0, [...new Set(leakyScripts)].join());

// ── In Chrome ────────────────────────────────────────────────────────────
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json'};
const server = createServer((req, res) => {
  let p = join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'content-type': types[extname(p)] ?? 'application/octet-stream'});
  res.end(readFileSync(p));
}).listen(0);
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox']});
const name = (url) => new URL(url).pathname.split('/').pop();

for (const mode of ['native', 'polyfill']) {
  console.log(mode === 'native' ? 'Chrome, native Temporal' : 'Chrome, Temporal removed (polyfill)');
  const context = await browser.newContext({reducedMotion: 'reduce'});
  await context.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await context.route('https://fonts.gstatic.com/**', (r) => r.abort());
  if (mode === 'polyfill') await context.addInitScript(() => { delete globalThis.Temporal; });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));
  const requested = new Set();
  page.on('request', (r) => requested.add(name(r.url())));
  const bad = [];
  let upgraded = 0;
  for (const p of info) {
    requested.clear();
    await page.goto(`${origin}${p.path}`);
    await page.waitForLoadState('load');
    if (p.tags.length) {
      // The date elements register once Temporal is ready (top-level await in lib/temporal).
      const ok = await page.waitForFunction((tags) => tags.every((t) => customElements.get(t)), p.tags, {timeout: 15_000}).then(() => true, () => false);
      if (ok) upgraded++;
      else bad.push(`${p.path}: ${p.tags.filter(Boolean).join('/')} not defined`);
    } else {
      await page.waitForTimeout(50);
    }
    const gotPolyfill = polyfillChunks.some((c) => requested.has(c));
    const gotTemporal = temporalChunks.some((c) => requested.has(c));
    const wantPolyfill = mode === 'polyfill' && p.tags.length > 0;
    if (gotPolyfill !== wantPolyfill) bad.push(`${p.path}: polyfill ${gotPolyfill ? 'requested' : 'not requested'}`);
    if (gotTemporal !== p.tags.length > 0) bad.push(`${p.path}: lib/temporal chunk ${gotTemporal ? 'requested' : 'not requested'}`);
    if (mode === 'polyfill' && p.tags.length && (await page.evaluate(() => typeof globalThis.Temporal)) !== 'undefined') bad.push(`${p.path}: Temporal installed globally`);
  }
  check(`${info.length} pages: the polyfill chunk is requested ${mode === 'native' ? 'nowhere' : 'exactly on the date pages'}, lib/temporal only on date pages`, bad.length === 0, bad.slice(0, 8).join('; '));
  check(`date elements upgrade on all ${datePages.length} date pages`, upgraded === datePages.length, `${upgraded}/${datePages.length}`);
  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await context.close();
}

await browser.close();
server.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
