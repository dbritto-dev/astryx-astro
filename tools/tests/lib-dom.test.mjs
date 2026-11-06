#!/usr/bin/env node
/**
 * DOM-only lib ports, run in system Chrome: src/lib/accessibleName.ts (readAccessibleName).
 * The module is type-stripped by Node (node:module stripTypeScriptTypes) and loaded into a
 * blank page. Astryx 0.7.9 ships no unit tests for it.
 *   node tools/tests/lib-dom.test.mjs
 */
import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';

const source = stripTypeScriptTypes(readFileSync(new URL('../../packages/astryx-astro/src/lib/accessibleName.ts', import.meta.url), 'utf8'));
const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox']});
const page = await browser.newPage();
let failures = 0;
const eq = (name, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) console.log(`✓ ${name}`);
  else { failures++; console.log(`✗ ${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
};
try {
  await page.setContent(`<!doctype html><body>
    <span id="l1">Save</span><span id="l2">draft</span>
    <button id="labelledby" aria-labelledby="l1 l2" aria-label="ignored">x</button>
    <button id="arialabel" aria-label="Close dialog">×</button>
    <label for="field">Email address</label><input id="field">
    <input id="submit" type="submit" value="Send">
    <button id="text">Open <span aria-hidden="true">▾</span> menu</button>
    <button id="img"><img alt="Settings" src="data:,"></button>
    <button id="svg"><svg><title>Search</title></svg></button>
    <button id="title" title="More actions"></button>
    <div id="empty"></div>
  </body>`);
  await page.addScriptTag({type: 'module', content: `${source}\nwindow.readAccessibleName = readAccessibleName;`});
  await page.waitForFunction(() => typeof window.readAccessibleName === 'function');
  const names = await page.evaluate(() => Object.fromEntries(
    ['labelledby', 'arialabel', 'field', 'submit', 'text', 'img', 'svg', 'title', 'empty'].map((id) => [id, window.readAccessibleName(document.getElementById(id)) ?? null]),
  ));
  eq('aria-labelledby wins', names.labelledby, 'Save draft');
  eq('aria-label', names.arialabel, 'Close dialog');
  eq('<label for>', names.field, 'Email address');
  eq('input button value', names.submit, 'Send');
  eq('text without aria-hidden parts', names.text, 'Open menu');
  eq('inner image alt', names.img, 'Settings');
  eq('svg title', names.svg, 'Search');
  eq('title fallback', names.title, 'More actions');
  eq('nothing → undefined', names.empty, null);
  eq('null element', await page.evaluate(() => window.readAccessibleName(null) ?? null), null);
} catch (error) {
  failures++;
  console.log(`✗ threw: ${error.stack ?? error}`);
} finally {
  await browser.close();
}
console.log(failures ? `✗ lib/accessibleName: ${failures} failed` : '✓ lib/accessibleName: all passed');
process.exit(failures ? 1 : 0);
