#!/usr/bin/env node
/**
 * Summarizes the axe results addon-a11y attached to each story test in the last
 * `pnpm -F storybook test` run (test-results/vitest.json, written by vitest.config.ts).
 *
 *   node scripts/a11y-report.mjs [results.json] [--rule=<id>] [--story=<id-substring>]
 *
 * Prints violations by rule (impact, stories, nodes) and the stories each rule hits. A summary,
 * not a gate: `parameters.a11y.test` is 'todo' (see STORIES.md, Accessibility).
 */
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const app = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--')) ?? join(app, 'test-results/vitest.json');
const only = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const results = JSON.parse(readFileSync(file, 'utf8'));

const tests = results.testResults.flatMap((f) => f.assertionResults).filter((t) => t.meta?.storyId);
const rules = new Map();
let withViolations = 0;
let checked = 0;
for (const test of tests) {
  const report = test.meta.reports?.find((r) => r.type === 'a11y');
  if (!report?.result) continue;
  checked++;
  const violations = report.result.violations ?? [];
  if (violations.length) withViolations++;
  for (const v of violations) {
    const rule = rules.get(v.id) ?? {id: v.id, impact: v.impact, help: v.help, stories: new Set(), nodes: 0};
    rule.stories.add(test.meta.storyId);
    rule.nodes += v.nodes.length;
    rules.set(v.id, rule);
  }
}

const order = {critical: 0, serious: 1, moderate: 2, minor: 3};
const sorted = [...rules.values()]
  .filter((r) => !only('rule') || r.id === only('rule'))
  .sort((a, b) => order[a.impact] - order[b.impact] || b.stories.size - a.stories.size);
console.log(`a11y: ${checked} stories checked, ${withViolations} with violations, ${rules.size} rules, ${[...rules.values()].reduce((n, r) => n + r.nodes, 0)} nodes`);
for (const r of sorted) {
  const stories = [...r.stories].filter((s) => !only('story') || s.includes(only('story')));
  console.log(`\n${r.impact.padEnd(8)} ${r.id}: ${r.stories.size} stories, ${r.nodes} nodes. ${r.help}`);
  console.log(`  ${stories.slice(0, 12).join(', ')}${stories.length > 12 ? `, … (${stories.length - 12} more)` : ''}`);
}
