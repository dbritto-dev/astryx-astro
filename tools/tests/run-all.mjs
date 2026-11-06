#!/usr/bin/env node
/**
 * Run every tools/tests/*.test.mjs (after `cd apps/docs && npx astro build`).
 *   node tools/tests/run-all.mjs [--quiet] [--no-retry] [name-filter …]
 * A file that fails is re-run once; if it then passes it is reported as FLAKY (timing under
 * load) rather than failed, so real failures stay visible. Exits 1 when any file fails twice.
 */
import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const retry = !args.includes('--no-retry');
const filters = args.filter((a) => !a.startsWith('--'));
const run = (file) => spawnSync(process.execPath, [join(dir, file)], {encoding: 'utf8'});
const show = (r) => {
  const lines = (r.stdout + r.stderr).trim().split('\n');
  console.log((quiet ? lines.filter((l) => l.includes('✗') || /passed|Error/.test(l)) : lines).join('\n'));
};

const failed = [];
const flaky = [];
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.test.mjs'))
  .filter((f) => filters.length === 0 || filters.some((x) => f.includes(x)))
  .sort();
for (const file of files) {
  console.log(`\n▶ ${file}`);
  let r = run(file);
  show(r);
  if (r.status !== 0 && retry) {
    console.log(`↻ retrying ${file}`);
    r = run(file);
    show(r);
    if (r.status === 0) flaky.push(file);
  }
  if (r.status !== 0) failed.push(file);
}
if (flaky.length) console.log(`\nFLAKY (failed once, passed on retry): ${flaky.join(', ')}`);
console.log(failed.length ? `\n${failed.length} test file(s) failed: ${failed.join(', ')}` : `\nall test files passed (${files.length} files)`);
process.exit(failed.length ? 1 : 0);
