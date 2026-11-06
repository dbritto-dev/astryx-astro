#!/usr/bin/env node
/**
 * Icon default size from an owner (Astryx IconDefaultSizeContext → cascade key `icon-size`).
 *
 * Reads the built Icon docs page (run `cd apps/docs && npx astro build` first) and checks:
 *   1. stamp(html, 'icon-size', …) from lib/cascade upgrades a default-sized Icon (name and
 *      component modes) and consumes its marker, and leaves an explicit `size` alone;
 *   2. nearest provider wins and a null provider resets to the default;
 *   3. the demo's owner fixture (_IconSizeOwner.astro) rendered those results in the build.
 * Exit code 1 on any failure.
 *   node tools/tests/icon-cascade.test.mjs
 */
import {existsSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parse} from 'node-html-parser';
import {stamp, stampAttr} from '../../packages/astryx-astro/src/lib/cascade.ts';

const page = fileURLToPath(new URL('../../apps/docs/dist/components/icon/index.html', import.meta.url));
if (!existsSync(page)) {
  console.error(`✗ ${page} not found — build the docs first (cd apps/docs && npx astro build)`);
  process.exit(1);
}
const doc = parse(readFileSync(page, 'utf8'));
const fixture = doc.querySelector('[data-test="icon-cascade"]');
let failures = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log(`✓ ${name}`);
  else { failures++; console.log(`✗ ${name}${detail ? `\n    ${detail}` : ''}`); }
};
const iconIn = (root, sel) => root.querySelector(`${sel} .astryx-icon`);
const icons = (html) => parse(html).querySelectorAll('.astryx-icon');

check('fixture present in the built Icon page', fixture != null);
if (!fixture) process.exit(1);

// Unstamped markup straight from the build.
const defaultName = iconIn(fixture, '[data-case="no-owner"]');
const defaultSvg = iconIn(fixture, '[data-case="no-owner-svg"]');
const explicit = doc.querySelectorAll('.demo .astryx-icon[data-size="lg"]').find((el) => !el.hasAttribute('data-ax-inherit'));
check('default Icon renders data-size="md" + data-ax-inherit="icon-size"',
  defaultName?.getAttribute('data-size') === 'md' && defaultName?.getAttribute('data-ax-inherit') === 'icon-size',
  defaultName?.outerHTML.slice(0, 160));
check('default component-mode Icon (<svg> root) carries the marker too',
  defaultSvg?.tagName === 'SVG' && defaultSvg.getAttribute('data-ax-inherit') === 'icon-size', defaultSvg?.outerHTML.slice(0, 160));
check('explicit size renders no marker', explicit != null && !explicit.hasAttribute('data-ax-inherit'));

// 1. stamp() upgrades defaults, leaves explicit alone.
const html = `<div>${defaultName.outerHTML}${defaultSvg.outerHTML}${explicit.outerHTML}</div>`;
const [a, b, c] = icons(await stamp(html, 'icon-size', (attrs) => { attrs['data-size'] = 'sm'; }));
check('stamp upgrades a default-sized name Icon to sm and consumes the marker',
  a.getAttribute('data-size') === 'sm' && !a.hasAttribute('data-ax-inherit'), a.outerHTML.slice(0, 160));
check('stamp upgrades a default-sized component Icon to sm',
  b.getAttribute('data-size') === 'sm' && !b.hasAttribute('data-ax-inherit'), b.outerHTML.slice(0, 160));
check('stamp leaves an explicit size alone', c.getAttribute('data-size') === 'lg' && !c.hasAttribute('data-ax-inherit'), c.outerHTML.slice(0, 160));

// 2. nearest provider wins; a null provider resets.
const inner = await stampAttr(`<span>${defaultName.outerHTML}</span>`, 'icon-size', 'sm', 'data-size');
const [n1, n2] = icons(await stampAttr(`<div>${inner}${defaultName.outerHTML}</div>`, 'icon-size', 'lg', 'data-size'));
check('nearest (inner) provider wins over an outer one', n1.getAttribute('data-size') === 'sm' && n2.getAttribute('data-size') === 'lg');
const reset = await stampAttr(`<span>${defaultName.outerHTML}</span>`, 'icon-size', null, 'data-size');
const [r1] = icons(await stampAttr(`<div>${reset}</div>`, 'icon-size', 'lg', 'data-size'));
check('null provider consumes the marker and keeps the default md', r1.getAttribute('data-size') === 'md' && !r1.hasAttribute('data-ax-inherit'));

// 3. the build's owner fixture.
const expect = {
  'owner-sm-default': ['sm', false],
  'owner-sm-explicit': ['lg', false],
  'owner-lg-default': ['lg', false],
  'null-owner': ['md', false],
  'no-owner': ['md', true],
  'no-owner-svg': ['md', true],
};
for (const [kase, [size, marker]] of Object.entries(expect)) {
  const el = iconIn(fixture, `[data-case="${kase}"]`);
  check(`built fixture ${kase}: data-size=${size}${marker ? ' + marker' : ''}`,
    el?.getAttribute('data-size') === size && el.hasAttribute('data-ax-inherit') === marker, el?.outerHTML.slice(0, 160));
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
