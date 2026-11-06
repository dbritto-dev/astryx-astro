#!/usr/bin/env node
/**
 * Behaviour test for OverflowList / <ax-overflow-list> against the built docs.
 *   node tools/tests/overflow-list.test.mjs        exit 1 on failure
 * Covers: items hide as the width shrinks and return as it grows, the "+N" count, collapsed
 * items out of flow and inert, visible items inside the list box, the change event,
 * collapseFrom="start", maxVisibleItems, maxRows, observeParent, no ResizeObserver errors.
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
const url = `http://localhost:${server.address().port}/components/overflow-list/`;
const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox']});
const page = await browser.newPage({viewport: {width: 1200, height: 900}});
const errors = [];
page.on('console', (m) => m.type() === 'error' && !m.text().includes('ERR_FAILED') && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`✓ ${name}`);
  else { failures++; console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, actual, expected) => check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
const frames = (n = 3) => page.evaluate((count) => new Promise((r) => {
  let i = 0;
  const tick = () => (++i >= count ? r() : requestAnimationFrame(tick));
  requestAnimationFrame(tick);
}), n);

/** Visible/hidden item labels, the shown count, and whether visible items stay inside the list. */
const snapshot = (sel) => page.$eval(sel, (list) => {
  const items = [...list.children].filter((c) => !c.hasAttribute('data-overflow-indicator'));
  const indicator = list.querySelector(':scope > [data-overflow-indicator]');
  const box = list.getBoundingClientRect();
  const visible = items.filter((i) => !i.hasAttribute('data-overflow-hidden'));
  const hidden = items.filter((i) => i.hasAttribute('data-overflow-hidden'));
  const shown = [...visible, ...(indicator && !indicator.hasAttribute('data-overflow-hidden') ? [indicator] : [])];
  return {
    visible: visible.map((i) => i.textContent.trim()),
    hidden: hidden.map((i) => i.textContent.trim()),
    hiddenInert: hidden.every((i) => i.inert && getComputedStyle(i).visibility === 'hidden' && getComputedStyle(i).position === 'absolute'),
    visibleInteractive: visible.every((i) => !i.inert && getComputedStyle(i).visibility === 'visible'),
    indicatorShown: indicator ? !indicator.hasAttribute('data-overflow-hidden') : null,
    count: indicator ? indicator.querySelector('[data-overflow-count]')?.textContent : null,
    dataCount: indicator?.getAttribute('data-count') ?? null,
    inside: shown.every((el) => {
      const r = el.getBoundingClientRect();
      return r.left >= box.left - 0.5 && r.right <= box.right + 0.5 && r.bottom <= box.bottom + 0.5;
    }),
    hasOverflowAttr: list.hasAttribute('data-has-overflow'),
    height: Math.round(box.height),
  };
});

try {
  await page.goto(url);
  await page.waitForFunction(() => customElements.get('ax-overflow-list') != null);
  await frames();
  await page.$eval('#ol-end', (el) => {
    window.__events = [];
    el.addEventListener('astryx-overflow-change', (e) => window.__events.push(e.detail.overflowItems.map((o) => o.index)));
  });

  // ── Collapse from the end as the frame narrows ────────────────────────
  const widths = [900, 600, 420, 300, 200, 120];
  let previousVisible = Infinity;
  for (const w of widths) {
    await page.$eval('#ol-frame', (el, width) => { el.style.width = `${width}px`; }, w);
    await frames();
    const s = await snapshot('#ol-end');
    const total = s.visible.length + s.hidden.length;
    check(`width ${w}: ${s.visible.length}/${total} visible, fewer or equal as it narrows`, s.visible.length <= previousVisible);
    previousVisible = s.visible.length;
    check(`width ${w}: visible items and indicator stay inside the list`, s.inside);
    check(`width ${w}: collapsed items are out of flow, invisible, inert`, s.hiddenInert);
    check(`width ${w}: visible items are interactive`, s.visibleInteractive);
    if (s.hidden.length) {
      eq(`width ${w}: "+N" equals the collapsed count`, s.count, String(s.hidden.length));
      eq(`width ${w}: indicator data-count`, s.dataCount, String(s.hidden.length));
      check(`width ${w}: indicator shown`, s.indicatorShown);
      check(`width ${w}: collapses from the end`, s.hidden.at(-1) === 'Audit log' && (s.visible.length === 0 || s.visible[0] === 'Overview'), JSON.stringify(s.visible));
    } else {
      check(`width ${w}: nothing collapsed, no indicator`, s.indicatorShown === false && !s.hasOverflowAttr);
    }
  }
  check('narrowest width still shows nothing outside', (await snapshot('#ol-end')).visible.length <= 1);
  // Grow back
  await page.$eval('#ol-frame', (el) => { el.style.width = '420px'; });
  await frames();
  const at420 = await snapshot('#ol-end');
  check('grows back when widened', at420.visible.length >= 3, JSON.stringify(at420.visible));
  await page.$eval('#ol-frame', (el) => { el.style.width = '1000px'; });
  await frames();
  const wide = await snapshot('#ol-end');
  eq('wide: every item visible', wide.hidden.length, 0);
  const events = await page.evaluate(() => window.__events);
  check('astryx-overflow-change reported each change, ending with the empty set', events.length >= 3 && events.at(-1).length === 0, JSON.stringify(events));
  check('events list collapsed indices from the end', events.some((e) => e.length > 0 && e.at(-1) === 7), JSON.stringify(events));
  const api = await page.$eval('#ol-end', (el) => ({visible: el.visibleCount, overflow: el.overflowItems.length}));
  check('element API visibleCount / overflowItems', api.visible === 8 && api.overflow === 0, JSON.stringify(api));

  // ── Dynamic content ───────────────────────────────────────────────────
  await page.$eval('#ol-frame', (el) => { el.style.width = '420px'; });
  await frames();
  const before = (await snapshot('#ol-end')).hidden.length;
  await page.$eval('#ol-end', (el) => {
    const b = document.createElement('button');
    b.textContent = 'Added later';
    el.insertBefore(b, el.querySelector('[data-overflow-indicator]'));
  });
  await frames();
  const after = await snapshot('#ol-end');
  eq('an appended item is measured and collapsed', after.hidden.length, before + 1);
  eq('count follows', after.count, String(before + 1));

  // ── collapseFrom start, minVisibleItems ───────────────────────────────
  const crumbs = await page.$eval('ax-overflow-list[data-collapse-from="start"]', (list) => {
    const items = [...list.children].filter((c) => !c.hasAttribute('data-overflow-indicator'));
    return {
      first: list.firstElementChild.hasAttribute('data-overflow-indicator'),
      hidden: items.filter((i) => i.hasAttribute('data-overflow-hidden')).length,
      lastVisible: !items.at(-1).hasAttribute('data-overflow-hidden'),
      firstHidden: items[0].hasAttribute('data-overflow-hidden'),
    };
  });
  check('collapseFrom start: indicator first, earliest items collapse, last stays', crumbs.first && crumbs.hidden > 0 && crumbs.firstHidden && crumbs.lastVisible, JSON.stringify(crumbs));

  // ── maxVisibleItems ───────────────────────────────────────────────────
  const capped = await snapshot('ax-overflow-list[data-max-visible-items="3"]');
  eq('maxVisibleItems 3: three visible even though all fit', capped.visible.length, 3);
  eq('maxVisibleItems 3: "+2"', capped.count, '2');

  // ── maxRows 2 ─────────────────────────────────────────────────────────
  const rows = await page.$eval('ax-overflow-list[data-max-rows="2"]', (list) => {
    const visible = [...list.children].filter((c) => !c.hasAttribute('data-overflow-hidden'));
    const tops = new Set(visible.map((c) => Math.round(c.getBoundingClientRect().top)));
    return {rows: tops.size, hidden: list.querySelectorAll(':scope > [data-overflow-hidden]').length, maxHeight: list.style.maxHeight};
  });
  check('maxRows 2: two rows, the rest collapsed, height capped', rows.rows === 2 && rows.hidden > 0 && rows.maxHeight.startsWith('calc('), JSON.stringify(rows));

  // ── observeParent ─────────────────────────────────────────────────────
  const parentMode = await page.$eval('ax-overflow-list[data-behavior="observeParent"]', (list) => ({
    hasOverflow: list.hasAttribute('data-has-overflow'),
    fills: Math.round(list.getBoundingClientRect().width) === Math.round(list.parentElement.getBoundingClientRect().width),
  }));
  check('observeParent: overflowing list fills its parent', parentMode.hasOverflow && parentMode.fills, JSON.stringify(parentMode));

  check('no console errors (no ResizeObserver loop)', errors.length === 0, errors.join(' | '));
} catch (e) {
  failures++;
  console.log(`✗ threw: ${e.stack ?? e}`);
} finally {
  await browser.close();
  server.close();
}
console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
process.exit(failures ? 1 : 0);
