#!/usr/bin/env node
/**
 * Verifies the built static Storybook (run `pnpm -F storybook build` first) where it ships:
 * served under /astryx-astro/storybook/ (scripts/serve.mjs), in Chrome.
 *
 *   node scripts/verify-static.mjs [story-id-filter …] [--browser=/usr/bin/google-chrome]
 *
 * For every story in index.json: it renders, its play function passes (Storybook runs it on
 * load), every custom element in it is defined and upgraded, no page error, no failed request,
 * no request outside the base path. Date stories run again with Temporal deleted, so the
 * temporal-polyfill chunk must load from the sub-path (Safari's path). Then the manager: the
 * sidebar lists the categories, clicking a story navigates, the theme/mode globals reach the
 * preview's <html>, and a docs page renders with a read-only props table (no Controls).
 * Exits 1 on any failure.
 */
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';

const app = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const executablePath = args.find((a) => a.startsWith('--browser='))?.split('=')[1] ?? process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const filters = args.filter((a) => !a.startsWith('--'));
const BASE = '/astryx-astro/storybook/';

const index = JSON.parse(readFileSync(join(app, 'storybook-static/index.json'), 'utf8'));
const stories = Object.values(index.entries)
  .filter((e) => e.type === 'story' && e.tags?.includes('dev'))
  .filter((e) => filters.length === 0 || filters.some((f) => e.id.includes(f)));
/** Components whose scripts wait for Temporal (lib/temporal.ts): also tested on the polyfill. */
const DATE_COMPONENTS = /\/(Calendar|DateInput|DateRangeInput|DateTimeInput|TimeInput|Timestamp|Timer|PowerSearch|Table)\.astro$/;
const isDateStory = (entry) => DATE_COMPONENTS.test(entry.componentPath ?? '');

/**
 * `ax-*` tags that stay undefined on purpose, as on the docs site: a component only loads its
 * element's script when the instance needs behaviour. Story id → tags.
 */
const UNDEFINED_BY_DESIGN = {
  // InputGroup's `labelTooltip` layer: the docs page leaves ax-tooltip undefined too (tooltip.ts
  // is not loaded by InputGroup.astro). Pre-existing, reported upstream; not a Storybook issue.
  'form-controls-input-group--overview': ['ax-tooltip'],
};

/**
 * Elements whose script a component loads only when the instance has behaviour: an instance
 * without any of these parts is static markup, and its tag may stay undefined. Tag → selector.
 */
const STATIC_UNLESS = {
  // Banner.astro loads banner.ts only with a dismiss button or an expand toggle.
  'ax-banner': '[data-ax-banner-dismiss], [data-ax-banner-toggle]',
};

const {server, url} = await serve({port: 6170 + Math.floor(Math.random() * 100)});
const browser = await chromium.launch({executablePath, args: ['--no-sandbox']});
const failures = [];
const fail = (where, what) => failures.push(`${where}: ${what}`);

/** A page that records page errors, console errors, failed requests and off-base requests. */
async function openPage({temporal = 'native'} = {}) {
  const context = await browser.newContext({viewport: {width: 1200, height: 900}});
  // Only the build is under test: external hosts (Google Fonts for the themes) are cut off, as
  // they may be in CI, and their failures are not reported.
  await context.route((u) => u.hostname !== 'localhost', (route) => route.abort('blockedbyclient'));
  const external = (u) => u !== '' && new URL(u).hostname !== 'localhost';
  const page = await context.newPage();
  const problems = [];
  if (temporal === 'polyfill') await page.addInitScript(() => delete globalThis.Temporal);
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !external(m.location().url ?? '')) problems.push(`console error: ${m.text()} (${m.location().url})`);
  });
  // ERR_ABORTED: a navigation cancelled requests the previous page had in flight.
  page.on('requestfailed', (r) => !external(r.url()) && r.failure()?.errorText !== 'net::ERR_ABORTED' && problems.push(`request failed: ${r.url()} (${r.failure()?.errorText})`));
  page.on('response', (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()}: ${r.url()}`));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.hostname === 'localhost' && !u.pathname.startsWith(BASE)) problems.push(`request outside ${BASE}: ${u.pathname}`);
  });
  return {page, problems, close: () => context.close()};
}

const settled = () => {
  const phase = window.__STORYBOOK_PREVIEW__?.currentRender?.phase;
  return ['completed', 'finished', 'errored', 'aborted'].includes(phase) ? phase : false;
};

async function checkStory(entry, temporal) {
  const label = `${entry.id}${temporal === 'polyfill' ? ' [Temporal polyfill]' : ''}`;
  const {page, problems, close} = await openPage({temporal});
  try {
    await page.goto(`${url}iframe.html?id=${entry.id}&viewMode=story`);
    const phase = await (await page.waitForFunction(settled, null, {timeout: 30000})).jsonValue();
    if (phase !== 'completed' && phase !== 'finished') fail(label, `story ${phase}`);
    // Let component scripts (deferred module chunks, Temporal) settle.
    await page.waitForLoadState('networkidle');
    const state = await page.evaluate(async (staticUnless) => {
      const root = document.querySelector('#storybook-root');
      const custom = [...root.querySelectorAll('*')].filter((el) => el.localName.includes('-'));
      const isStatic = (el) => el.localName in staticUnless && !el.querySelector(staticUnless[el.localName]);
      const undefinedTags = [...new Set(custom.filter((el) => !customElements.get(el.localName) && !isStatic(el)).map((el) => el.localName))];
      const notUpgraded = [...new Set(custom.filter((el) => customElements.get(el.localName) && !(el instanceof customElements.get(el.localName))).map((el) => el.localName))];
      const temporal = typeof globalThis.Temporal;
      return {empty: root.children.length === 0, undefinedTags, notUpgraded, temporal};
    }, STATIC_UNLESS);
    if (state.empty) fail(label, 'rendered nothing');
    const unexpected = state.undefinedTags.filter((tag) => !UNDEFINED_BY_DESIGN[entry.id]?.includes(tag));
    if (unexpected.length) fail(label, `custom elements never defined: ${unexpected.join(', ')}`);
    if (state.notUpgraded.length) fail(label, `custom elements not upgraded: ${state.notUpgraded.join(', ')}`);
    if (temporal === 'polyfill' && state.temporal !== 'undefined') fail(label, 'Temporal was not removed');
    for (const p of problems) fail(label, p);
  } catch (error) {
    fail(label, error.message.split('\n')[0]);
  } finally {
    await close();
  }
}

for (const entry of stories) {
  await checkStory(entry, 'native');
  if (isDateStory(entry)) await checkStory(entry, 'polyfill');
}
console.log(`stories: ${stories.length} checked (${stories.filter(isDateStory).length} also with the Temporal polyfill)`);

// Manager: sidebar, navigation, globals, docs ----------------------------------------------
if (filters.length === 0) {
  const {page, problems, close} = await openPage();
  try {
    await page.goto(`${url}?path=/story/action-button--overview`);
    const frame = () => page.frameLocator('#storybook-preview-iframe');
    await frame().locator('#storybook-root .astryx-button').first().waitFor();
    const roots = await page.locator('#storybook-explorer-menu [data-nodetype="root"]').evaluateAll((els) => els.map((el) => el.textContent.trim()));
    const expected = ['Layout', 'Content', 'Action', 'Form Controls', 'Container', 'Feedback & Status', 'Navigation', 'Overlay', 'Table & List', 'Chat', 'Utility'];
    if (JSON.stringify(roots) !== JSON.stringify(expected)) fail('manager', `sidebar categories ${JSON.stringify(roots)}`);
    // Navigate by clicking the sidebar: expand the component, open its story.
    await page.locator('#storybook-explorer-menu [data-item-id="action-dropdown-menu"]').click();
    await page.locator('#storybook-explorer-menu [data-item-id="action-dropdown-menu--overview"]').click();
    await page.waitForURL(/action-dropdown-menu--overview/);
    await frame().locator('#storybook-root ax-dropdown-menu, #storybook-root .astryx-dropdown-menu').first().waitFor({state: 'attached'});
    // Toolbar globals reach the preview's <html> (as themeRootAttributes writes them).
    await page.goto(`${url}?path=/story/action-button--overview&globals=astryxTheme:butter;astryxMode:dark`);
    await frame().locator('#storybook-root .astryx-button').first().waitFor();
    const attrs = await frame().locator('html').evaluate((html) => [html.dataset.astryxTheme, html.dataset.theme]);
    if (attrs.join() !== 'butter,dark') fail('manager', `globals not applied: data-astryx-theme=${attrs[0]} data-theme=${attrs[1]}`);
    if ((await page.getByRole('tab', {name: /^Controls/}).count()) > 0) fail('manager', 'the Controls panel is shown in the static build');
    // Docs page: description, stories rendered, props table without control inputs.
    await page.goto(`${url}?path=/docs/action-button--docs`);
    await frame().locator('.sbdocs-content .docs-story .astryx-button').first().waitFor();
    const docs = await frame().locator('.sbdocs-content').evaluate((el) => ({
      text: el.textContent,
      controls: el.querySelectorAll('.docblock-argstable input, .docblock-argstable select, .docblock-argstable textarea').length,
      rows: el.querySelectorAll('.docblock-argstable tbody tr').length,
    }));
    if (!docs.text.includes('Button triggers an action')) fail('docs', 'manifest description missing');
    if (docs.rows === 0) fail('docs', 'props table missing');
    if (docs.controls > 0) fail('docs', `${docs.controls} control inputs in the static props table`);
    for (const p of problems) fail('manager', p);
  } catch (error) {
    fail('manager', error.message.split('\n')[0]);
  } finally {
    await close();
  }
  console.log('manager: sidebar, navigation, globals and docs checked');
}

await browser.close();
server.close();
if (failures.length) {
  console.error(`\n✗ ${failures.length} failure(s):\n${failures.map((f) => `  - ${f}`).join('\n')}`);
  process.exit(1);
}
console.log(`✓ static Storybook OK under ${BASE}`);
