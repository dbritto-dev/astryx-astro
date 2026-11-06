#!/usr/bin/env node
/**
 * Screenshot docs pages from the built site (apps/docs/dist) with system Chrome.
 *   node tools/shot.mjs <slug> [--theme=butter] [--mode=dark] [--width=1100] [--out=path.png]
 * Prints console errors and page errors so behaviour bugs surface in CI-style runs.
 */
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync, existsSync, statSync} from 'node:fs';
import {join, extname} from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const slugs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const root = new URL('../apps/docs/dist/', import.meta.url).pathname;
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json'};
const server = createServer((req, res) => {
  let p = join(root, decodeURIComponent(req.url.split('?')[0]));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'content-type': types[extname(p)] ?? 'application/octet-stream'});
  res.end(readFileSync(p));
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox']});
const page = await browser.newPage({viewport: {width: Number(args.width ?? 1100), height: 900}, colorScheme: args.mode === 'dark' ? 'dark' : 'light'});
page.on('console', (m) => m.type() === 'error' && !m.text().includes("ERR_FAILED") && console.log(`[console] ${m.text()}`));
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
for (const slug of slugs.length ? slugs : ['']) {
  await page.goto(`http://localhost:${port}/${slug ? `components/${slug}/` : ''}`);
  await page.evaluate(([t, m]) => { if (t) document.documentElement.dataset.astryxTheme = t; if (m) document.documentElement.dataset.theme = m; }, [args.theme, args.mode]);
  await page.waitForTimeout(150);
  const out = args.out ?? `/tmp/claude-0/-home-claude/ee1f3f99-817b-58c5-b3bc-11c1dc9bbad8/scratchpad/shots/${slug || 'index'}${args.theme ? '-' + args.theme : ''}${args.mode ? '-' + args.mode : ''}.png`;
  const demo = await page.$('.demo');
  await (demo ?? page).screenshot({path: out, ...(demo ? {} : {fullPage: true})});
  console.log(out);
}
await browser.close();
server.close();
