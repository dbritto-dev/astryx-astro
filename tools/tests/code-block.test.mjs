#!/usr/bin/env node
/**
 * CodeBlock: server-side highlighting (token spans with syntax colors), ranges mode (CSS
 * Custom Highlight API registry), line numbers / startLineNumber / gutter var, highlighted
 * rows, diff rows, copy (writes the exact source to the clipboard, label + icon flip,
 * "Copied" announced, tooltip stays "Copy code", resets, astryx-copy), collapse (click,
 * Enter/Space, aria-expanded, inert, copy never toggles it), the viewport tab stop while it
 * overflows, corner controls without a header.
 *   node tools/tests/code-block.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, context, check, open, done, port} = await setup({reducedMotion: 'reduce'});
await context.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: `http://localhost:${port}`});
await open('code-block');
await page.waitForFunction(() => customElements.get('ax-scrollable-area'));

console.log('Highlighting');
const spans = await page.evaluate(() => {
  const pre = document.getElementById('cb-tsx');
  const kw = pre.querySelector('.astryx-token-keyword');
  const str = pre.querySelector('.astryx-token-string');
  const code = pre.querySelector('code');
  return {
    keyword: kw?.textContent,
    keywordColor: kw && getComputedStyle(kw).color,
    stringColor: str && getComputedStyle(str).color,
    codeColor: getComputedStyle(code).color,
    types: [...new Set([...pre.querySelectorAll('[class^="astryx-token-"]')].map((s) => s.className.split(' ')[0]))].sort(),
  };
});
check('server-rendered token spans', spans.keyword === 'import' && spans.types.includes('astryx-token-function') && spans.types.includes('astryx-token-string'), JSON.stringify(spans.types));
check('tokens painted with syntax colors (≠ plain text)', spans.keywordColor !== spans.codeColor && spans.stringColor !== spans.codeColor && spans.keywordColor !== spans.stringColor, JSON.stringify(spans));
const ranges = await page.evaluate(() => {
  const code = document.querySelector('#cb-ranges code');
  const names = [...CSS.highlights.keys()].filter((k) => k.startsWith('astryx-'));
  const kw = CSS.highlights.get('astryx-keyword');
  const words = kw ? [...kw].filter((r) => code.contains(r.startContainer)).map((r) => r.toString()) : [];
  return {painted: code.getAttribute('data-ax-painted'), names, words, spans: code.querySelectorAll('[class^="astryx-token"]').length};
});
check('ranges mode: CSS.highlights registered over bare text (no spans)', ranges.painted === 'ranges' && ranges.words.includes('fn') && ranges.words.includes('let') && ranges.spans === 0, JSON.stringify(ranges));
const highlightRule = await page.evaluate(() => [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => r.cssText.includes('::highlight(astryx-keyword)')); } catch { return false; } }));
check('::highlight(astryx-*) rules shipped', highlightRule);

console.log('Lines');
const lines = await page.evaluate(() => {
  const sm = document.getElementById('cb-sm');
  const code = sm.querySelector('code');
  const rows = [...sm.querySelectorAll('[data-line]')];
  const tsx = document.getElementById('cb-tsx');
  return {
    numbers: rows.map((r) => r.dataset.line),
    gutter: code.style.getPropertyValue('--_codeblock-gutter-width'),
    before: getComputedStyle(rows[0], '::before').content,
    highlighted: [...tsx.querySelectorAll('[data-ax-highlighted]')].map((r) => r.dataset.line),
    highlightBg: getComputedStyle(tsx.querySelector('[data-ax-highlighted]')).backgroundColor,
    diff: [...document.querySelectorAll('#cb-diff [data-line]')].map((r) => r.dataset.diff ?? 'context'),
    marker: [...document.querySelectorAll('#cb-diff [data-diff-marker]')].map((m) => m.textContent).join(''),
    chunks: document.querySelectorAll('#cb-long .ax-codeblock-chunk').length,
  };
});
check('startLineNumber 41 → rows 41…46', lines.numbers.join() === '41,42,43,44,45,46', lines.numbers.join());
check('gutter var = digits of the last number', lines.gutter === '2ch' && lines.before === '"41"', `${lines.gutter} ${lines.before}`);
check('highlightLines rows tinted', lines.highlighted.join() === '4,6' && lines.highlightBg !== 'rgba(0, 0, 0, 0)');
check('diff rows classified (file header, hunk, removed, added)', lines.diff.join() === 'header,header,header,context,removed,added,context', lines.diff.join());
check('diff glyph column', lines.marker === '    -+ ', JSON.stringify(lines.marker));
check('long code chunked by 20 lines', lines.chunks === 6);

console.log('Copy');
const btn = '#cb-tsx .astryx-code-block-copy-button';
check('copy button named "Copy code", ghost sm', (await page.getAttribute(btn, 'aria-label')) === 'Copy code' && (await page.getAttribute(btn, 'data-variant')) === 'ghost' && (await page.getAttribute(btn, 'data-size')) === 'sm');
await page.evaluate(() => {
  window.__copies = [];
  document.addEventListener('astryx-copy', (e) => window.__copies.push(e.detail.text));
  document.getElementById('cb-long').addEventListener('astryx-collapse-change', () => { window.__collapsed = (window.__collapsed ?? 0) + 1; });
});
await page.click(btn);
await sleep(80);
const clip = await page.evaluate(() => navigator.clipboard.readText());
const source = await page.evaluate(() => document.querySelector('#cb-tsx template').content.textContent);
check('clipboard holds the exact source', clip === source && clip.startsWith("import {useState} from 'react';\n\nexport function Counter") && clip.endsWith('</button>;\n}\n'), JSON.stringify(clip.slice(0, 60)));
const copied = await page.evaluate((sel) => {
  const b = document.querySelector(sel);
  const tip = document.getElementById(b.getAttribute('data-ax-copy-tooltip'));
  const vis = (s) => getComputedStyle(b.querySelector(`.ax-copy-icon-state[data-state="${s}"]`)).display !== 'none';
  return {label: b.getAttribute('aria-label'), copied: b.hasAttribute('data-copied'), idle: vis('idle'), check: vis('copied'), tip: tip.textContent, describedBy: b.getAttribute('aria-describedby'), tipId: tip.id};
}, btn);
check('copied: name "Copied", check icon shown', copied.label === 'Copied' && copied.copied && !copied.idle && copied.check, JSON.stringify(copied));
check('tooltip stays "Copy code" and now describes the button', copied.tip === 'Copy code' && copied.describedBy === copied.tipId);
check('"Copied" announced', (await page.evaluate(() => [...document.querySelectorAll('[data-astryx-live-region]')].map((r) => r.textContent).join('|'))).includes('Copied'));
check('astryx-copy {text}', (await page.evaluate(() => window.__copies.length)) === 1);
await sleep(2100);
const reset = await page.evaluate((sel) => ({label: document.querySelector(sel).getAttribute('aria-label'), copied: document.querySelector(sel).hasAttribute('data-copied'), describedBy: document.querySelector(sel).getAttribute('aria-describedby')}), btn);
check('reverts after 2s (tooltip = name → no description)', reset.label === 'Copy code' && !reset.copied && reset.describedBy === null, JSON.stringify(reset));
await page.mouse.move(5, 5);
await sleep(150);
await page.hover(btn);
await sleep(350);
check('hover shows the "Copy code" tooltip', await page.evaluate((sel) => document.getElementById(document.querySelector(sel).getAttribute('data-ax-copy-tooltip')).matches(':popover-open'), btn));
await page.mouse.move(5, 5);
await page.click('#cb-diff .astryx-code-block-copy-button');
await sleep(50);
check('diff copy returns the source with glyphs', (await page.evaluate(() => navigator.clipboard.readText())).includes("-  return 'Hello ' + name;\n+  return"));

console.log('Corner controls');
const corner = await page.evaluate(() => {
  const pre = document.getElementById('cb-corner');
  const c = pre.querySelector('.ax-codeblock-corner');
  const vp = pre.querySelector('.ax-codeblock-viewport').getBoundingClientRect();
  const b = c.getBoundingClientRect();
  return {grid: getComputedStyle(pre).display, header: !!pre.querySelector('.astryx-code-block-header'), beside: b.left >= vp.right - 1};
});
check('no header: controls in an inline-end column beside the code', corner.grid === 'grid' && !corner.header && corner.beside, JSON.stringify(corner));
const endContent = await page.$$eval('#cb-wrapped .ax-codeblock-controls > button', (bs) => bs.map((b) => b.getAttribute('aria-label')));
check('endContent renders before Copy', endContent.join() === 'Open in editor,Copy code', endContent.join());

console.log('Collapse + viewport');
const toggle = '#cb-long [data-ax-codeblock-toggle]';
const region = await page.getAttribute(toggle, 'aria-controls');
check('toggle is a role=button disclosure', (await page.getAttribute(toggle, 'role')) === 'button' && (await page.getAttribute(toggle, 'aria-expanded')) === 'true' && !!region);
const vp = '#cb-long .ax-codeblock-viewport';
check('overflowing viewport is a named tab stop', (await page.getAttribute(vp, 'tabindex')) === '0' && (await page.getAttribute(vp, 'role')) === 'group' && (await page.getAttribute(vp, 'aria-label')) === 'css');
check('fitting viewport is not a tab stop', (await page.getAttribute('#cb-corner .ax-codeblock-viewport', 'tabindex')) !== '0');
await page.click('#cb-long .astryx-code-block-copy-button');
check('copy does not toggle the collapse', (await page.getAttribute(toggle, 'aria-expanded')) === 'true' && (await page.evaluate(() => window.__collapsed ?? 0)) === 0);
await page.click(toggle);
await sleep(600); // the 1fr → 0fr row transition (--duration-medium)
const collapsed = await page.evaluate((id) => {
  const r = document.getElementById(id);
  return {inert: r.inert, height: Math.round(r.getBoundingClientRect().height)};
}, region);
check('click collapses: aria-expanded=false, region inert and 0 high', (await page.getAttribute(toggle, 'aria-expanded')) === 'false' && collapsed.inert && collapsed.height === 0, JSON.stringify(collapsed));
await page.focus(toggle);
await page.keyboard.press('Enter');
check('Enter expands', (await page.getAttribute(toggle, 'aria-expanded')) === 'true' && !(await page.evaluate((id) => document.getElementById(id).inert, region)));
await page.keyboard.press(' ');
check('Space collapses', (await page.getAttribute(toggle, 'aria-expanded')) === 'false');
check('astryx-collapse-change fired per toggle', (await page.evaluate(() => window.__collapsed)) === 3);
await page.keyboard.press(' ');

console.log('Theme hooks');
const hooks = await page.evaluate(() => {
  const pre = document.getElementById('cb-section');
  return {
    container: pre.dataset.container,
    lang: pre.dataset.language,
    bg: getComputedStyle(pre).backgroundColor,
    themeWrapper: document.getElementById('cb-theme').parentElement.getAttribute('data-astryx-syntax-theme'),
    themeBg: getComputedStyle(document.getElementById('cb-theme')).backgroundColor,
  };
});
check('section container is transparent; language value reflects its identifier', hooks.container === 'section' && hooks.lang === 'lua' && hooks.bg === 'rgba(0, 0, 0, 0)', JSON.stringify(hooks));
check('syntaxTheme wrapper sets --color-syntax-*', hooks.themeWrapper === 'night' && hooks.themeBg === 'rgb(30, 31, 41)');

await done();
