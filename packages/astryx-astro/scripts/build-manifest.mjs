#!/usr/bin/env node
/**
 * Builds meta/astryx-docs.json from every `<Name>.doc.mjs` in @astryxdesign/core/src.
 * The manifest is the porting checklist (one entry per public component/sub-component),
 * the source of docs-site copy, and the theming contract the conformance test checks.
 * Hooks (entries with `params`) are skipped: they have no Astro equivalent.
 */
import {existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const coreSrc = join(pkgRoot, 'node_modules/@astryxdesign/core/src');
const version = JSON.parse(readFileSync(join(pkgRoot, 'node_modules/@astryxdesign/core/package.json'), 'utf8')).version;

const entries = [];
for (const dir of readdirSync(coreSrc, {withFileTypes: true})) {
  if (!dir.isDirectory()) continue;
  for (const file of readdirSync(join(coreSrc, dir.name)).filter((f) => f.endsWith('.doc.mjs'))) {
    const mod = await import(pathToFileURL(join(coreSrc, dir.name, file)).href);
    const doc = mod.docs ?? Object.values(mod).find((v) => v && typeof v === 'object' && 'name' in v);
    if (!doc || doc.params || doc.returns) continue;
    entries.push({
      name: doc.name,
      displayName: doc.displayName ?? doc.name,
      dir: dir.name,
      category: doc.category ?? null,
      group: doc.group ?? null,
      subComponentOf: doc.subComponentOf ?? null,
      hidden: Boolean(doc.hidden || doc.isHiddenFromOverview),
      deprecated: doc.deprecated ?? null,
      description: doc.description ?? doc.usage?.description ?? '',
      keywords: doc.keywords ?? [],
      theming: (doc.theming?.targets ?? []).map((t) => ({className: t.className, visualProps: t.visualProps ?? []})),
      props: (doc.props ?? []).map((p) => ({
        name: p.name,
        type: p.type ?? '',
        required: Boolean(p.required),
        default: p.default ?? null,
        description: p.description ?? '',
      })),
    });
  }
}
entries.sort((a, b) => a.name.localeCompare(b.name));
const out = join(pkgRoot, 'meta/astryx-docs.json');
mkdirSync(dirname(out), {recursive: true});
const json = JSON.stringify({astryx: version, components: entries}, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (!existsSync(out) || readFileSync(out, 'utf8') !== json) {
    console.error('stale: meta/astryx-docs.json');
    process.exit(1);
  }
} else {
  writeFileSync(out, json);
}
console.log(`${entries.length} components (${entries.filter((e) => !e.subComponentOf).length} top-level) from Astryx ${version}`);
