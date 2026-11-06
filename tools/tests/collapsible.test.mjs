#!/usr/bin/env node
/**
 * Behaviour test for Collapsible / CollapsibleGroup (<ax-collapsible>, <ax-collapsible-group>)
 * against the built docs (apps/docs/dist).
 *   node tools/tests/collapsible.test.mjs        exit 1 on failure
 * Covers: disclosure ARIA (aria-expanded / aria-controls / hidden=until-found), click and
 * keyboard (Enter, Space) toggling, disabled guard, astryx-open-change, group single and
 * multiple modes + astryx-change, programmatic API, focus kept when a region holding focus
 * collapses (ring follows the last input), find-in-page reveal (beforematch + a reveal that
 * happened before upgrade), animatedLayout transition bookkeeping, chevron turns, reduced motion.
 */
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync, existsSync, statSync} from 'node:fs';
import {join, extname} from 'node:path';

const root = new URL('../../apps/docs/dist/', import.meta.url).pathname;
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json'};
const server = createServer((req, res) => {
  let p = join(root, decodeURIComponent(req.url.split('?')[0]));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'content-type': types[extname(p)] ?? 'application/octet-stream'});
  res.end(readFileSync(p));
}).listen(0);
const url = `http://localhost:${server.address().port}/components/collapsible/`;
const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox']});
const context = await browser.newContext({viewport: {width: 1200, height: 900}});
const page = await context.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && !m.text().includes('ERR_FAILED') && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`✓ ${name}`);
  else { failures++; console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, actual, expected) => check(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

const trig = (sel) => `${sel} > .astryx-collapsible-trigger`;
const cont = (sel) => `${sel} > .astryx-collapsible-content`;
const state = (sel) => page.$eval(sel, (el) => {
  const t = el.querySelector(':scope > .astryx-collapsible-trigger');
  const c = el.querySelector(':scope > .astryx-collapsible-content');
  return {
    expanded: t.getAttribute('aria-expanded'),
    triggerOpen: t.getAttribute('data-open'),
    contentOpen: c.getAttribute('data-open'),
    hidden: c.getAttribute('hidden'),
    height: Math.round(c.getBoundingClientRect().height),
  };
});
const events = () => page.evaluate(() => window.__events.splice(0));
const item = (group, value) => `${group} ax-collapsible[data-value="${value}"]`;
const groupOpen = (group) => page.$$eval(`${group} ax-collapsible[data-value]`, (els) => els.filter((el) => el.querySelector(':scope > .astryx-collapsible-trigger').getAttribute('aria-expanded') === 'true').map((el) => el.dataset.value));

try {
  await page.goto(url);
  await page.waitForFunction(() => customElements.get('ax-collapsible') && customElements.get('ax-collapsible-group'));
  await page.evaluate(() => {
    window.__events = [];
    for (const type of ['astryx-open-change', 'astryx-change']) {
      document.addEventListener(type, (e) => window.__events.push({type, target: e.target.id || e.target.dataset.value || e.target.tagName, detail: e.detail}));
    }
  });

  // ── ARIA wiring at rest ───────────────────────────────────────────────
  const wiring = await page.$$eval('ax-collapsible', (els) => els.map((el) => {
    const t = el.querySelector(':scope > .astryx-collapsible-trigger');
    const c = el.querySelector(':scope > .astryx-collapsible-content');
    return {tag: t.tagName, type: t.type, controls: t.getAttribute('aria-controls') === c.id, uniqueId: document.querySelectorAll(`#${CSS.escape(c.id)}`).length === 1};
  }));
  check('every trigger is <button type=button>', wiring.every((w) => w.tag === 'BUTTON' && w.type === 'button'));
  check('aria-controls points at its own region', wiring.every((w) => w.controls));
  check('region ids are unique', wiring.every((w) => w.uniqueId));
  eq('open by default', await state('#cl-basic'), {expanded: 'true', triggerOpen: 'open', contentOpen: 'open', hidden: null, height: (await state('#cl-basic')).height});
  const closed = await state('#cl-closed');
  eq('closed: aria-expanded false, hidden until-found', [closed.expanded, closed.triggerOpen, closed.hidden], ['false', null, 'until-found']);
  eq('closed content takes no space', closed.height, 0);

  // ── Click toggling + astryx-open-change ───────────────────────────────
  await page.click(trig('#cl-closed'));
  let s = await state('#cl-closed');
  eq('click opens', [s.expanded, s.triggerOpen, s.contentOpen, s.hidden], ['true', 'open', 'open', null]);
  check('opened content has height', s.height > 20, `height ${s.height}`);
  eq('astryx-open-change {isOpen: true}', await events(), [{type: 'astryx-open-change', target: 'cl-closed', detail: {isOpen: true}}]);
  await page.click(trig('#cl-closed'));
  s = await state('#cl-closed');
  eq('click closes', [s.expanded, s.hidden], ['false', 'until-found']);
  eq('astryx-open-change {isOpen: false}', await events(), [{type: 'astryx-open-change', target: 'cl-closed', detail: {isOpen: false}}]);

  // ── Keyboard ──────────────────────────────────────────────────────────
  await page.focus(trig('#cl-basic'));
  await page.keyboard.press('Enter');
  eq('Enter toggles closed', (await state('#cl-basic')).expanded, 'false');
  await page.keyboard.press('Space');
  eq('Space toggles open', (await state('#cl-basic')).expanded, 'true');
  await page.keyboard.press('Tab');
  eq('Tab moves to the next trigger', await page.evaluate(() => document.activeElement.closest('ax-collapsible')?.id), 'cl-closed');
  await page.keyboard.press('Tab');
  check('disabled triggers are skipped by Tab', !['cl-disabled-open', 'cl-disabled-closed'].includes(await page.evaluate(() => document.activeElement.closest('ax-collapsible')?.id)));
  await events();

  // ── Disabled ──────────────────────────────────────────────────────────
  eq('disabled trigger attributes', await page.$eval(trig('#cl-disabled-closed'), (t) => [t.getAttribute('aria-disabled'), t.getAttribute('tabindex'), t.hasAttribute('disabled'), t.dataset.disabled]), ['true', '-1', false, 'disabled']);
  await page.click(trig('#cl-disabled-closed'), {force: true});
  await page.click(trig('#cl-disabled-open'), {force: true});
  eq('disabled items do not toggle', [(await state('#cl-disabled-closed')).expanded, (await state('#cl-disabled-open')).expanded], ['false', 'true']);
  eq('disabled closed content uses plain hidden', (await state('#cl-disabled-closed')).hidden, '');
  eq('no events from disabled items', await events(), []);

  // ── Group: single ─────────────────────────────────────────────────────
  const single = '#cg-single';
  eq('single: SSR open set', await groupOpen(single), ['what']);
  await page.click(trig(item(single, 'start')));
  eq('single: opening one closes the others', await groupOpen(single), ['start']);
  eq('single: astryx-change value', await events(), [{type: 'astryx-change', target: 'cg-single', detail: {value: 'start'}}]);
  eq('single: group.value', await page.$eval(single, (g) => g.value), 'start');
  await page.click(trig(item(single, 'start')));
  eq('single: toggling the open item closes it', await groupOpen(single), []);
  eq('single: only the group reports (no astryx-open-change)', await events(), [{type: 'astryx-change', target: 'cg-single', detail: {value: ''}}]);
  await page.$eval(single, (g) => { g.value = 'themes'; });
  eq('single: value setter', await groupOpen(single), ['themes']);
  await page.$eval(item(single, 'what'), (el) => el.open());
  eq('single: item.open() routes through the group', await groupOpen(single), ['what']);
  eq('programmatic changes dispatch nothing', await events(), []);

  // ── Group: multiple ───────────────────────────────────────────────────
  const multiple = '#cg-multiple';
  eq('multiple: SSR open set', await groupOpen(multiple), ['a', 'b']);
  await page.click(trig(item(multiple, 'c')));
  eq('multiple: items open independently', await groupOpen(multiple), ['a', 'b', 'c']);
  eq('multiple: astryx-change array', (await events())[0]?.detail, {value: ['a', 'b', 'c']});
  await page.click(trig(item(multiple, 'a')));
  eq('multiple: close one', await groupOpen(multiple), ['b', 'c']);
  eq('multiple: astryx-change after close', (await events())[0]?.detail, {value: ['b', 'c']});

  // ── Group presentation ────────────────────────────────────────────────
  eq('divided items: first has no top border', await page.$$eval(`${single} > ax-collapsible`, (els) => els.map((el) => getComputedStyle(el).borderTopWidth)), ['0px', '1px', '1px']);
  eq('balanced density pads the trigger', await page.$eval(trig(item(single, 'what')), (t) => getComputedStyle(t).paddingTop), '8px');
  eq('group without dividers renders no box', await page.$eval('#cg-cards', (g) => getComputedStyle(g).display), 'contents');

  // ── Chevron ───────────────────────────────────────────────────────────
  const angle = (sel) => page.$eval(`${trig(sel)} > .ax-collapsible-chevron`, (el) => {
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return Math.round((Math.atan2(m.b, m.a) * 180) / Math.PI);
  });
  await page.waitForTimeout(300);
  eq('end chevron: open turns 180°', await angle(item(single, 'what')), 180);
  eq('end chevron: closed 0°', await angle(item(single, 'start')), 0);
  eq('start chevron (own): open 90°', await angle('#cl-start'), 90);
  eq('start chevron (from group): closed points inward (-90° on chevronDown)', await angle(item('#cg-start', 'x')), -90);
  eq('start chevron (from group): placed before the label', await page.$eval(`${trig(item('#cg-start', 'x'))} > .ax-collapsible-chevron`, (el) => el.getBoundingClientRect().left < el.parentElement.querySelector('.ax-collapsible-label').getBoundingClientRect().left), true);

  // ── Focus kept across collapse ────────────────────────────────────────
  // Keyboard: Tab into the content, close programmatically → trigger focused with a ring.
  await page.click(trig('#cl-closed'));
  await events();
  await page.focus(trig('#cl-closed'));
  await page.keyboard.press('Tab');
  eq('keyboard focus inside the region', await page.evaluate(() => document.activeElement.id), 'cl-inner-link');
  await page.$eval('#cl-closed', (el) => el.close());
  eq('closing moves focus to the trigger', await page.evaluate(() => document.activeElement === document.querySelector('#cl-closed > .astryx-collapsible-trigger')), true);
  eq('…with a ring after keyboard input', await page.$eval(trig('#cl-closed'), (t) => t.matches(':focus-visible')), true);
  // Pointer: click into the content, close → trigger focused without a ring.
  await page.$eval('#cl-closed', (el) => el.open());
  await page.$eval('#cl-inner-link', (a) => a.addEventListener('click', (e) => e.preventDefault()));
  await page.click('#cl-inner-link');
  await page.$eval('#cl-closed', (el) => el.close());
  eq('pointer: focus moves to the trigger', await page.evaluate(() => document.activeElement === document.querySelector('#cl-closed > .astryx-collapsible-trigger')), true);
  eq('…without a ring after pointer input', await page.$eval(trig('#cl-closed'), (t) => t.matches(':focus-visible')), false);
  // Focus outside the region is never moved.
  await page.$eval('#cl-closed', (el) => el.open());
  await page.focus(trig('#cl-basic'));
  await page.$eval('#cl-closed', (el) => el.close());
  eq('focus elsewhere stays put', await page.evaluate(() => document.activeElement.closest('ax-collapsible')?.id), 'cl-basic');

  // ── animatedLayout ────────────────────────────────────────────────────
  const anim = '#cg-animated';
  await page.focus('#cg-animated-focus');
  await page.$eval(item(anim, 'two'), (el) => el.open());
  const mid = await page.$eval(cont(item(anim, 'one')), (c) => ({transition: c.hasAttribute('data-ax-transition'), inert: c.inert, hidden: c.getAttribute('hidden'), height: c.getBoundingClientRect().height}));
  check('closing animated content keeps painting while it exits', mid.transition && mid.inert && mid.hidden === 'until-found' && mid.height > 0, JSON.stringify(mid));
  eq('focus leaves the exiting region for its trigger', await page.evaluate(() => document.activeElement.closest('ax-collapsible')?.dataset.value), 'one');
  await page.waitForTimeout(1000);
  const after = await page.$eval(cont(item(anim, 'one')), (c) => ({transition: c.hasAttribute('data-ax-transition'), inert: c.inert, height: Math.round(c.getBoundingClientRect().height)}));
  eq('exit ends: no marker, not inert, no height', after, {transition: false, inert: false, height: 0});
  check('opened animated content reaches its height', (await state(item(anim, 'two'))).height > 20);
  const glide = await page.evaluate(async () => {
    const el = document.querySelector('#cg-animated ax-collapsible[data-value="one"]');
    const c = el.querySelector(':scope > .astryx-collapsible-content');
    el.open();
    await new Promise((r) => setTimeout(r, 120));
    const midway = c.getBoundingClientRect().height;
    await new Promise((r) => setTimeout(r, 900));
    return {midway, final: c.getBoundingClientRect().height};
  });
  check('the height glides (interpolate-size)', glide.midway > 0 && glide.midway < glide.final, JSON.stringify(glide));
  await page.waitForTimeout(100);
  eq('animated content uses the settle curve', await page.$eval(cont(item(anim, 'two')), (c) => getComputedStyle(c).transitionDuration.split(',')[0].trim()), '0.735s');

  // ── find-in-page reveal ───────────────────────────────────────────────
  await page.$eval(single, (g) => { g.value = 'what'; });
  await page.$eval(cont(item(single, 'themes')), (c) => c.dispatchEvent(new Event('beforematch')));
  eq('beforematch opens the item through its group', await groupOpen(single), ['themes']);
  eq('…and reports astryx-change', (await events()).at(-1)?.detail, {value: 'themes'});
  const revealed = await page.evaluate(() => {
    const src = document.querySelector('#cl-closed');
    const copy = src.cloneNode(true);
    copy.id = 'cl-copy';
    copy.querySelector(':scope > .astryx-collapsible-content').removeAttribute('hidden'); // the browser's own reveal
    src.after(copy);
    return copy.querySelector(':scope > .astryx-collapsible-trigger').getAttribute('aria-expanded');
  });
  eq('a reveal before upgrade is adopted on connect', revealed, 'true');
  await page.evaluate(() => document.querySelector('#cl-copy').remove());

  // ── Reduced motion ────────────────────────────────────────────────────
  await page.emulateMedia({reducedMotion: 'reduce'});
  eq('Reduce Motion: no height travel', await page.$eval(cont(item(anim, 'two')), (c) => getComputedStyle(c).transitionProperty), 'none');
  const instant = await page.evaluate(() => {
    const two = document.querySelector('#cg-animated ax-collapsible[data-value="two"]');
    const one = document.querySelector('#cg-animated ax-collapsible[data-value="one"]');
    two.open();
    const h = (el) => Math.round(el.querySelector(':scope > .astryx-collapsible-content').getBoundingClientRect().height);
    return {one: h(one), two: h(two)};
  });
  check('Reduce Motion: the change lands at once', instant.one === 0 && instant.two > 20, JSON.stringify(instant));
  await page.emulateMedia({reducedMotion: 'no-preference'});

  eq('no console errors', errors, []);

  // ── Real find-in-page path: a text fragment reveals and opens a closed item ──
  await page.goto(`${url}#:~:text=Unused%20items%20can%20be%20returned`);
  await page.waitForFunction(() => customElements.get('ax-collapsible'));
  await page.waitForTimeout(500);
  eq('text fragment opens the closed item', (await state('#cl-closed')).expanded, 'true');

  // ── Reduce Motion on a coarse pointer: a 200 ms cross-fade, exit held in place ──
  const touch = await browser.newContext({viewport: {width: 1200, height: 900}, hasTouch: true, isMobile: true, reducedMotion: 'reduce'});
  const tp = await touch.newPage();
  await tp.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await tp.goto(url);
  await tp.waitForFunction(() => customElements.get('ax-collapsible'));
  const fade = await tp.evaluate(async () => {
    const one = document.querySelector('#cg-animated ax-collapsible[data-value="one"] > .astryx-collapsible-content');
    const two = document.querySelector('#cg-animated ax-collapsible[data-value="two"]');
    const twoContent = two.querySelector(':scope > .astryx-collapsible-content');
    two.open();
    await new Promise((r) => setTimeout(r, 100));
    const mid = {oneHeight: one.getBoundingClientRect().height, oneOpacity: +getComputedStyle(one).opacity, twoHeight: twoContent.getBoundingClientRect().height, twoOpacity: +getComputedStyle(twoContent).opacity};
    await new Promise((r) => setTimeout(r, 300));
    return {mid, oneEnd: one.getBoundingClientRect().height};
  });
  check('cross-fade: exiting content holds its space while fading', fade.mid.oneHeight > 0 && fade.mid.oneOpacity > 0 && fade.mid.oneOpacity < 1, JSON.stringify(fade));
  check('cross-fade: entering content is at full height while fading in', fade.mid.twoHeight > 20 && fade.mid.twoOpacity > 0 && fade.mid.twoOpacity < 1, JSON.stringify(fade));
  eq('cross-fade: exit gives up its space at the end', fade.oneEnd, 0);
  await touch.close();
} catch (error) {
  failures++;
  console.log(`✗ threw: ${error.stack ?? error}`);
} finally {
  await browser.close();
  server.close();
}
console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
process.exit(failures ? 1 : 0);
