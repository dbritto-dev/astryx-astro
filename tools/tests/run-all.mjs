#!/usr/bin/env node
/**
 * Run every tools/tests/*.test.mjs (after `cd apps/docs && npx astro build`).
 *   node tools/tests/run-all.mjs [--quiet]
 * Exits 1 when any file fails.
 */
import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const quiet = process.argv.includes('--quiet');
let failed = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort()) {
  console.log(`\n▶ ${file}`);
  const r = spawnSync(process.execPath, [join(dir, file)], {encoding: 'utf8'});
  const lines = (r.stdout + r.stderr).trim().split('\n');
  console.log((quiet ? lines.filter((l) => l.includes('✗') || /passed|Error/.test(l)) : lines).join('\n'));
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} test file(s) failed` : '\nall test files passed');
process.exit(failed ? 1 : 0);
