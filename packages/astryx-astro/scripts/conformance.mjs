#!/usr/bin/env node
/**
 * Theme-hook conformance: for every ported component (has a <Name>.demo.astro), the built
 * docs page must render each Astryx theming target (meta/astryx-docs.json → theming.targets)
 * as an element with the `astryx-*` class and, somewhere on such an element, every
 * declared visual prop as a data attribute. This is the contract that lets generated
 * Astryx theme CSS apply unchanged.
 *
 * Run after `pnpm build` (reads apps/docs/dist).
 *   node scripts/conformance.mjs            report + exit 1 on failures
 *   node scripts/conformance.mjs Button     only these components
 */
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from 'node-html-parser';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(pkgRoot, '../../apps/docs/dist/components');
const manifest = JSON.parse(readFileSync(join(pkgRoot, 'meta/astryx-docs.json'), 'utf8'));
const only = new Set(process.argv.slice(2));
const componentsDir = join(pkgRoot, 'src/components');

const ported = new Set();
for (const dir of readdirSync(componentsDir)) {
  for (const f of readdirSync(join(componentsDir, dir))) if (f.endsWith('.demo.astro')) ported.add(f.replace('.demo.astro', ''));
}

const slug = (n) => n.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const dataAttr = (p) => `data-${p.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;

const top = manifest.components.filter((c) => !c.subComponentOf);
let failures = 0;
let checked = 0;
for (const c of top) {
  if (!ported.has(c.name) || (only.size && !only.has(c.name))) continue;
  const file = join(dist, slug(c.name), 'index.html');
  if (!existsSync(file)) { console.log(`✗ ${c.name}: page not built`); failures++; continue; }
  const demo = parse(readFileSync(file, 'utf8')).querySelector('.demo');
  if (!demo) { console.log(`✗ ${c.name}: demo section missing`); failures++; continue; }
  const family = [c, ...manifest.components.filter((s) => s.subComponentOf === c.name)];
  const problems = [];
  for (const entry of family) {
    for (const target of entry.theming) {
      const els = demo.querySelectorAll(`.${target.className}`);
      if (els.length === 0) { problems.push(`${entry.name}: no .${target.className}`); continue; }
      for (const prop of target.visualProps) {
        const a = dataAttr(prop);
        if (!els.some((el) => el.hasAttribute(a))) problems.push(`${entry.name}: .${target.className} never has [${a}]`);
      }
    }
  }
  checked++;
  if (problems.length) { failures++; console.log(`✗ ${c.name}\n    ${problems.join('\n    ')}`); }
  else console.log(`✓ ${c.name}`);
}
console.log(`\n${checked} components checked, ${failures} with problems, ${top.length - ported.size} not ported`);
process.exit(failures ? 1 : 0);
