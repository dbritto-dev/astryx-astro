#!/usr/bin/env node
/**
 * The date-related browser tests again with Temporal removed from Chrome (AX_TEMPORAL=polyfill,
 * see _harness.mjs), so lib/temporal.ts runs on temporal-polyfill as in Safari. The default run
 * of each file covers native Temporal. Run after `cd apps/docs && npx astro build`.
 *   node tools/tests/temporal-polyfill-mode.test.mjs [name-filter …]
 * (A single file: `AX_TEMPORAL=polyfill node tools/tests/calendar.test.mjs`.)
 */
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const DATE_TESTS = [
  'calendar', 'date-input', 'date-range-input', 'date-time-input', 'time-input', 'timestamp', 'timer',
  'power-search', 'table-filtering', 'table', 'table-column-settings', 'table-context-menu',
  'table-pagination', 'table-selection', 'presentation-adopters',
];
const filters = process.argv.slice(2);
let failed = 0;
for (const name of DATE_TESTS.filter((n) => filters.length === 0 || filters.some((f) => n.includes(f)))) {
  const r = spawnSync(process.execPath, [join(dir, `${name}.test.mjs`)], {encoding: 'utf8', env: {...process.env, AX_TEMPORAL: 'polyfill'}});
  const out = (r.stdout + r.stderr).trim().split('\n');
  const summary = out.filter((l) => /passed|failed/.test(l)).at(-1) ?? '';
  if (r.status === 0) console.log(`  ✓ ${name} (polyfill): ${summary.trim()}`);
  else {
    failed++;
    console.log(`  ✗ ${name} (polyfill): ${summary.trim()}`);
    for (const l of out.filter((x) => x.includes('✗') || /Error/.test(x)).slice(0, 10)) console.log(`      ${l.trim()}`);
  }
}
console.log(`\n${failed ? `${failed} file(s) failed` : 'all passed'} with Temporal removed`);
process.exit(failed ? 1 : 0);
