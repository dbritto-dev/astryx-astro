#!/usr/bin/env node
/**
 * Serves storybook-static/ under the GitHub Pages path, so the build is tested where it ships:
 *
 *   node scripts/serve.mjs [--port=6007] [--base=/astryx-astro/storybook/] [--dir=storybook-static]
 *
 * Anything outside the base path is a 404 (as on Pages, where it belongs to another site), so a
 * root-absolute URL in the build shows up as a failed request instead of silently working.
 * Also exported as `serve()` for scripts/verify-static.mjs.
 */
import {createReadStream, existsSync, statSync} from 'node:fs';
import {createServer} from 'node:http';
import {extname, join, normalize, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const app = resolve(fileURLToPath(import.meta.url), '../..');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

export function serve({port = 6007, base = '/astryx-astro/storybook/', dir = join(app, 'storybook-static')} = {}) {
  const root = resolve(dir);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path === base.slice(0, -1)) {
      res.writeHead(301, {location: base}).end();
      return;
    }
    if (!path.startsWith(base)) {
      res.writeHead(404).end(`outside ${base}`);
      return;
    }
    let file = normalize(join(root, path.slice(base.length)));
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, {'content-type': types[extname(file)] ?? 'application/octet-stream'});
    createReadStream(file).pipe(res);
  });
  return new Promise((done) => server.listen(port, () => done({server, url: `http://localhost:${port}${base}`})));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
  const {url} = await serve({port: Number(arg('port', 6007)), base: arg('base', '/astryx-astro/storybook/'), dir: arg('dir', join(app, 'storybook-static'))});
  console.log(`Storybook (static) at ${url}`);
}
