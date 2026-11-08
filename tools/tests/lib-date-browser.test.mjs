#!/usr/bin/env node
/**
 * The lib/date cases (lib-date.cases.mjs) in Chrome: once with its native Temporal and once
 * with globalThis.Temporal deleted, so lib/temporal.ts loads temporal-polyfill/full (Safari's
 * path). The TypeScript sources are served as-is with their types stripped (no bundler); an
 * import map points the polyfill's bare specifiers at its files. Also checks that the polyfill
 * is requested only in the second run and never installed globally.
 *   node tools/tests/lib-date-browser.test.mjs
 */
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {existsSync, readFileSync, realpathSync, statSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {dirname, extname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

process.removeAllListeners('warning'); // stripTypeScriptTypes is experimental in Node 22
const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '../../packages/astryx-astro/src');
const polyfill = realpathSync(join(here, '../../packages/astryx-astro/node_modules/temporal-polyfill'));
const utils = realpathSync(join(polyfill, '../temporal-utils'));
const importMap = {
  imports: {
    'temporal-polyfill/full': '/pkg/temporal-polyfill/full/index.js',
    'temporal-utils/protected': '/pkg/temporal-utils/dist/protected.js',
    'temporal-utils/protected-error-messages': '/pkg/temporal-utils/dist/protected-error-messages.js',
  },
};
const page = `<!doctype html><meta charset="utf-8"><script type="importmap">${JSON.stringify(importMap)}</script>
<script type="module">
  import {runLibDateCases} from '/tests/lib-date.cases.mjs';
  const results = {passed: 0, failed: []};
  const check = (name, ok, detail = '') => { if (ok) results.passed++; else results.failed.push(name + (detail ? ' — ' + detail : '')); };
  const eq = (name, a, e) => check(name, JSON.stringify(a) === JSON.stringify(e), 'expected ' + JSON.stringify(e) + ', got ' + JSON.stringify(a));
  try {
    const [d, chars, groups, temporal, timer] = await Promise.all(['/src/lib/date/index', '/src/lib/characters', '/src/lib/groupItems', '/src/lib/temporal', '/src/components/Timer/timerFormat'].map((p) => import(p)));
    results.native = temporal.isNativeTemporal;
    runLibDateCases({d, chars, groups, temporal, timer}, {check, eq});
  } catch (e) {
    results.failed.push('threw: ' + (e && e.stack || e));
  }
  window.__results = results;
</script>`;

const send = (res, type, body) => { res.writeHead(200, {'content-type': type}); res.end(body); };
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/' ) return send(res, 'text/html', page);
  if (url.startsWith('/tests/')) return send(res, 'text/javascript', readFileSync(join(here, url.slice(7))));
  if (url.startsWith('/pkg/temporal-polyfill/')) return send(res, 'text/javascript', readFileSync(join(polyfill, url.slice(23))));
  if (url.startsWith('/pkg/temporal-utils/')) return send(res, 'text/javascript', readFileSync(join(utils, url.slice(20))));
  if (url.startsWith('/src/')) {
    // Extensionless relative specifiers, as the lib's sources write them (lib-loader.mjs).
    const base = join(src, url.slice(5));
    const file = [base, `${base}.ts`, join(base, 'index.ts')].find((f) => existsSync(f) && statSync(f).isFile());
    if (!file) { res.writeHead(404); return res.end(); }
    const code = readFileSync(file, 'utf8');
    return send(res, 'text/javascript', extname(file) === '.ts' ? stripTypeScriptTypes(code) : code);
  }
  res.writeHead(404);
  res.end();
}).listen(0);
const origin = `http://localhost:${server.address().port}`;

let failures = 0;
const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox']});
for (const mode of ['native', 'polyfill']) {
  const context = await browser.newContext({timezoneId: 'America/Bogota'});
  if (mode === 'polyfill') await context.addInitScript(() => { delete globalThis.Temporal; });
  const tab = await context.newPage();
  const requests = [];
  tab.on('request', (r) => requests.push(new URL(r.url()).pathname));
  const errors = [];
  tab.on('pageerror', (e) => errors.push(e.message));
  await tab.goto(`${origin}/`);
  await tab.waitForFunction(() => window.__results, null, {timeout: 60_000});
  const r = await tab.evaluate(() => window.__results);
  const loadedPolyfill = requests.some((p) => p.startsWith('/pkg/temporal-polyfill/'));
  const problems = [...r.failed, ...errors.map((e) => `page error: ${e}`)];
  if (r.native !== (mode === 'native')) problems.push(`isNativeTemporal is ${r.native} in ${mode} mode`);
  if (loadedPolyfill !== (mode === 'polyfill')) problems.push(`polyfill ${loadedPolyfill ? 'requested' : 'not requested'} in ${mode} mode`);
  for (const p of problems) console.log(`✗ [${mode}] ${p}`);
  console.log(`${problems.length ? '✗' : '✓'} lib/date in Chrome, ${mode} Temporal: ${r.passed} passed, ${problems.length} failed`);
  failures += problems.length;
  await context.close();
}
await browser.close();
server.close();
process.exit(failures ? 1 : 0);
