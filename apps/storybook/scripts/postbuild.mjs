#!/usr/bin/env node
/**
 * Post-processes `storybook build` output (storybook-static/) for static hosting under any
 * path, e.g. https://dbritto-dev.github.io/astryx-astro/storybook/. Runs from `pnpm build`.
 *
 * 1. Story CSS out of the pre-rendered JSON. @storybook-astro/framework 1.15 inlines, in every
 *    pre-rendered story, a `<style data-storybook-astro-styles>` per stylesheet the story's
 *    components import (Button.css, Icon.css, Layer.css …), so shared CSS is repeated in each
 *    story (upstream issue #227) and the one JSON file every visitor downloads grows by ~55 KB
 *    of CSS per story. Each stylesheet is written once, minified, to
 *    `_astro/story-css/<hash>.css`, and the style element keeps only
 *    `@import url("./_astro/story-css/<hash>.css");`. The renderer still sees one element per
 *    stylesheet with the same text for the same CSS, so its de-duplication and ordering in the
 *    preview <head> behave exactly as with inline CSS.
 * 2. Assets referenced only from server-rendered markup that the framework leaves as dev URLs
 *    (`/@fs/<absolute path>`, e.g. an image inside a Markdown string) are copied into
 *    `_astro/assets/` and referenced relatively; absolute `/_astro/` URLs become relative, so
 *    the build works under a sub-path.
 * 3. Fails when the pre-rendered stories or their CSS would publish build-machine paths, and
 *    prints the payload sizes. (The framework's client stubs keep each component's absolute
 *    `moduleId` in the story bundles; that is upstream behaviour and left alone.)
 */
import {createHash} from 'node:crypto';
import {copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import {basename, dirname, extname, join, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {transform} from 'lightningcss';

const app = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(app, process.argv[2] ?? 'storybook-static');
const jsonFile = join(out, 'astro-prerendered-stories.json');
const repoRoot = join(app, '../..');

const hash = (data) => createHash('sha256').update(data).digest('hex').slice(0, 10);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

const stories = JSON.parse(readFileSync(jsonFile, 'utf8'));
const before = readFileSync(jsonFile).length;

// 1. Story CSS ----------------------------------------------------------------------------
const cssDir = join(out, '_astro/story-css');
mkdirSync(cssDir, {recursive: true});
const sheets = new Map(); // css text → relative URL
const STYLE = /<style data-storybook-astro-styles>([\s\S]*?)<\/style>/g;

function externalize(css) {
  let url = sheets.get(css);
  if (!url) {
    const {code} = transform({filename: 'story.css', code: Buffer.from(css), minify: true});
    const file = `${hash(code)}.css`;
    writeFileSync(join(cssDir, file), code);
    url = `./_astro/story-css/${file}`;
    sheets.set(css, url);
  }
  return `<style data-storybook-astro-styles>@import url("${url}");</style>`;
}

// 2. Assets ------------------------------------------------------------------------------
const assetDir = join(out, '_astro/assets');
const ASSET = /\/@fs(\/[^\s"'()<>?#]+?\.(?:svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|mp4|webm|mp3|pdf|txt))(\?[^\s"'()<>#]*)?/g;
const copied = new Map();

function copyAsset(_match, path) {
  const file = path.startsWith('//') ? path.slice(1) : path;
  if (!existsSync(file)) throw new Error(`postbuild: ${file} is referenced by a story but does not exist`);
  let url = copied.get(file);
  if (!url) {
    const name = `${basename(file, extname(file))}-${hash(readFileSync(file))}${extname(file)}`;
    mkdirSync(assetDir, {recursive: true});
    copyFileSync(file, join(assetDir, name));
    url = `./_astro/assets/${name}`;
    copied.set(file, url);
  }
  return url;
}

let styleCount = 0;
for (const [id, html] of Object.entries(stories)) {
  stories[id] = html
    .replace(STYLE, (_m, css) => {
      styleCount++;
      return externalize(css);
    })
    .replace(ASSET, copyAsset)
    .replace(/(["'(\s])\/_astro\//g, '$1./_astro/');
}

const json = JSON.stringify(stories);
writeFileSync(jsonFile, json);

// 3. Leak check and report ------------------------------------------------------------------
const leaks = [jsonFile, ...readdirSync(cssDir).map((f) => join(cssDir, f))]
  .filter((file) => readFileSync(file, 'utf8').includes(repoRoot + sep))
  .map((file) => file.slice(out.length + 1));
if (leaks.length) {
  console.error(`postbuild: build-machine paths (${repoRoot}) in:\n  ${leaks.join('\n  ')}`);
  process.exit(1);
}

const dirSize = (dir) => readdirSync(dir, {withFileTypes: true}).reduce((n, e) => n + (e.isDirectory() ? dirSize(join(dir, e.name)) : statSync(join(dir, e.name)).size), 0);
const count = Object.keys(stories).length;
console.log(
  [
    `postbuild: ${count} pre-rendered stories`,
    `  astro-prerendered-stories.json  ${kb(before)} → ${kb(json.length)} (gzip ${kb(gzipSync(json).length)}), ${kb(json.length / count)} per story`,
    `  story CSS: ${styleCount} style elements → ${sheets.size} files, ${kb(dirSize(cssDir))}`,
    `  assets copied: ${copied.size}`,
    `  storybook-static total: ${kb(dirSize(out))}`,
  ].join('\n'),
);
