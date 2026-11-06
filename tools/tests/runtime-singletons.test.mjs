#!/usr/bin/env node
/**
 * Client runtime singletons survive a duplicated module (review B2): under `astro dev` Vite
 * pre-bundles a consumer's `import {toast} from 'astryx-astro/elements/toast'` (with its own
 * copies of the runtime) beside the components' own scripts. This test bundles the runtime
 * the same way (one self-contained file, as `.vite/deps` holds) and imports it twice with
 * different query strings, so the page holds three copies: the built page's and two more.
 * Covers: `toast()` from a copy reaches the page's ToastViewport (no fallback viewport, one
 * shared id counter, one pair of live regions); one document Escape listener and one stack
 * (the later-opened layer of any copy closes first); a hotkey registered by a second copy
 * fires through the first copy's window listener; a behaviour defined twice sets up once.
 *   node tools/tests/runtime-singletons.test.mjs
 */
import {createRequire} from 'node:module';
import {mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {setup} from './_harness.mjs';

// ── The second runtime copy: one self-contained ES module, built with the docs app's Vite ──
const src = fileURLToPath(new URL('../../packages/astryx-astro/src/elements/', import.meta.url));
// From astro's real location (pnpm keeps vite next to it, not in the docs app).
const requireFromAstro = createRequire(realpathSync(fileURLToPath(new URL('../../apps/docs/node_modules/astro/package.json', import.meta.url))));
const {build} = await import(pathToFileURL(requireFromAstro.resolve('vite')).href);
const dir = mkdtempSync(join(tmpdir(), 'astryx-runtime-copy-'));
const entry = join(dir, 'entry.ts');
writeFileSync(entry, [
  `export {toast} from ${JSON.stringify(join(src, 'toast.ts'))};`,
  `export {registerLayer} from ${JSON.stringify(join(src, 'runtime/layerStack.ts'))};`,
  `export {announce} from ${JSON.stringify(join(src, 'runtime/announce.ts'))};`,
  `export {registerHotkey} from ${JSON.stringify(join(src, 'hotkeys.ts'))};`,
  `export {defineBehavior} from ${JSON.stringify(join(src, 'behavior.ts'))};`,
].join('\n'));
let bundle;
try {
  const out = await build({
    configFile: false,
    logLevel: 'silent',
    root: dir,
    build: {write: false, minify: false, lib: {entry, formats: ['es'], fileName: 'runtime'}},
  });
  const chunks = (Array.isArray(out) ? out : [out]).flatMap((o) => o.output).filter((o) => o.type === 'chunk');
  if (chunks.length !== 1) throw new Error(`expected one self-contained chunk, got ${chunks.length}`);
  bundle = chunks[0].code;
} finally {
  rmSync(dir, {recursive: true, force: true});
}

const {page, context, check, open, done} = await setup();
await page.route('**/__copy/runtime.js*', (route) => route.fulfill({status: 200, contentType: 'text/javascript', body: bundle}));
const warnings = [];
page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
const cdp = await context.newCDPSession(page);
/** The document's (or window's) `keydown` listeners; `escape` counts those whose code handles Escape. */
const keydownListeners = async (target = 'document') => {
  // An object group, so the listeners come back with their handler functions.
  const {result} = await cdp.send('Runtime.evaluate', {expression: target, objectGroup: 'listeners'});
  const {listeners} = await cdp.send('DOMDebugger.getEventListeners', {objectId: result.objectId});
  await cdp.send('Runtime.releaseObjectGroup', {objectGroup: 'listeners'});
  const keydown = listeners.filter((l) => l.type === 'keydown');
  // The handler's source names the key it handles (quoted, or a template literal in the bundle).
  const escape = keydown.filter((l) => /[`'"]Escape[`'"]/.test(l.handler?.description ?? '')).length;
  return {count: keydown.length, escape};
};
const loadCopy = (n) => page.evaluate(async (i) => { window[`__copy${i}`] = await import(`/__copy/runtime.js?copy=${i}`); }, n);

// ── toast() from another copy ────────────────────────────────────────────────────
console.log('toast() from a duplicated module');
await open('toast');
await loadCopy(1);
await loadCopy(2);
check('the copies are separate module instances', await page.evaluate(() => window.__copy1 !== window.__copy2 && window.__copy1.toast !== window.__copy2.toast));
await page.evaluate(() => {
  window.__copy2.toast({body: 'From the second copy', isAutoHide: false});
  window.__copy1.toast({body: 'From the first copy', isAutoHide: false});
});
await page.waitForFunction(() => document.querySelectorAll('#toast-viewport .ax-toast-row').length >= 2, null, {timeout: 5000}).catch(() => {});
await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));
const toasts = await page.evaluate(() => ({
  rows: [...document.querySelectorAll('#toast-viewport .ax-toast-row')].map((r) => ({id: r.getAttribute('data-toast-id'), text: r.querySelector('.ax-toast-content')?.textContent})),
  fallback: document.querySelectorAll('[data-astryx-toast-fallback]').length,
  viewports: document.querySelectorAll('ax-toast-viewport').length,
}));
check("a second copy's toast() lands in the page's ToastViewport", toasts.rows.some((r) => r.text === 'From the second copy') && toasts.rows.some((r) => r.text === 'From the first copy'), JSON.stringify(toasts));
check('no fallback viewport, no "no <ToastViewport>" warning', toasts.fallback === 0 && toasts.viewports === 1 && !warnings.some((w) => w.includes('ToastViewport')), JSON.stringify({toasts, warnings}));
check('one id counter: the copies never reuse a toast id', new Set(toasts.rows.map((r) => r.id)).size === toasts.rows.length, JSON.stringify(toasts.rows));
await page.evaluate(() => { window.__copy2.announce('Copy two'); window.__copy1.announce('Copy one', {politeness: 'assertive'}); });
check('one pair of page live regions across copies', await page.evaluate(() => document.querySelectorAll('body > [data-astryx-live-region]').length) === 2);

// ── One Escape stack ─────────────────────────────────────────────────────────────
console.log('One Escape stack across copies');
await open('popover');
const before = await keydownListeners();
await loadCopy(1);
const afterFirst = await keydownListeners();
await loadCopy(2);
const afterSecond = await keydownListeners();
check('importing a second copy adds no document keydown listener', afterSecond.count === afterFirst.count, JSON.stringify({before, afterFirst, afterSecond}));
// A layer of the page's own copy: the first demo popover.
const trigger = await page.evaluate(() => {
  const layer = document.querySelector('ax-popover');
  const t = document.querySelector(`[popovertarget="${layer.id}"], [data-ax-popover-trigger="${layer.id}"]`) ?? layer.trigger;
  if (!t.id) t.id = 'singleton-trigger';
  return {layer: layer.id, trigger: t.id};
});
await page.click(`#${trigger.trigger}`);
await page.waitForFunction((id) => document.getElementById(id).matches(':popover-open'), trigger.layer, {timeout: 5000}).catch(() => {});
const withPage = await keydownListeners();
check('a layer is open: exactly one document Escape listener', withPage.escape === 1, JSON.stringify(withPage));
// Layers registered through the two copies (opened after the popover: above it).
await page.evaluate(() => {
  window.__dismissed = [];
  for (const i of [1, 2]) {
    const el = document.createElement('div');
    el.id = `copy-layer-${i}`;
    el.textContent = `Layer of copy ${i}`;
    document.body.append(el);
    window[`__unregister${i}`] = window[`__copy${i}`].registerLayer({element: el, dismiss: (reason) => window.__dismissed.push([el.id, reason])});
  }
});
const withCopies = await keydownListeners();
check('layers from both copies add no Escape listener', withCopies.escape === 1 && withCopies.count === withPage.count, JSON.stringify({withPage, withCopies}));
const isPopoverOpen = () => page.evaluate((id) => document.getElementById(id).matches(':popover-open'), trigger.layer);
await page.keyboard.press('Escape');
check('Escape dismisses only the topmost layer (copy 2, opened last)', JSON.stringify(await page.evaluate(() => window.__dismissed)) === JSON.stringify([['copy-layer-2', 'escape']]) && (await isPopoverOpen()));
await page.evaluate(() => window.__unregister2());
await page.keyboard.press('Escape');
check('the next Escape dismisses copy 1\'s layer, the page\'s popover stays', JSON.stringify(await page.evaluate(() => window.__dismissed.map(([id]) => id))) === JSON.stringify(['copy-layer-2', 'copy-layer-1']) && (await isPopoverOpen()));
await page.evaluate(() => window.__unregister1());
await page.keyboard.press('Escape');
await page.waitForFunction((id) => !document.getElementById(id).matches(':popover-open'), trigger.layer, {timeout: 5000}).catch(() => {});
check('…and then the page\'s own popover closes', !(await isPopoverOpen()));
const afterClose = await keydownListeners();
check('the Escape listener leaves with the last layer', afterClose.escape === 0 && afterClose.count === withPage.count - 1, JSON.stringify({withPage, afterClose}));

// ── Hotkeys and behaviours ───────────────────────────────────────────────────────
console.log('Hotkeys and behaviours across copies');
await page.evaluate(() => {
  window.__hotkeys = [];
  window.__copy1.registerHotkey({keys: 'shift+f8', onPress: () => window.__hotkeys.push(1)});
});
const windowAfterFirst = await keydownListeners('window');
await page.evaluate(() => window.__copy2.registerHotkey({keys: 'shift+f9', onPress: () => window.__hotkeys.push(2)}));
const windowAfterSecond = await keydownListeners('window');
check('a second copy adds no window keydown listener', windowAfterSecond.count === windowAfterFirst.count, JSON.stringify({windowAfterFirst, windowAfterSecond}));
await page.keyboard.press('Shift+F9');
await page.keyboard.press('Shift+F8');
check("a hotkey registered by the second copy fires (the first copy's listener reads the shared registry)", JSON.stringify(await page.evaluate(() => window.__hotkeys)) === '[2,1]', JSON.stringify(await page.evaluate(() => window.__hotkeys)));
const setups = await page.evaluate(async () => {
  window.__setups = 0;
  for (const i of [1, 2]) window[`__copy${i}`].defineBehavior('singleton-probe', () => { window.__setups++; });
  const el = document.createElement('div');
  el.setAttribute('data-ax-singleton-probe', '');
  document.body.append(el);
  await new Promise((r) => setTimeout(r, 50));
  return window.__setups;
});
check('a behaviour defined by two copies sets an element up once', setups === 1, String(setups));

await done();
