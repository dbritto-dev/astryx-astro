/**
 * <ax-markdown-stream>: the streaming Markdown renders with the server's rules. Streams the
 * demo's documents in uneven chunks (smoothing on: no reduced motion), checks the fade-in,
 * node identity across re-renders, the adopted server markup, and that the settled output
 * equals the one-shot server render of the same text — for the demo stream, for the long
 * every-construct document, and for an element created on the client from a shared kit.
 * Run after `cd apps/docs && npx astro build`.
 */
import {setup, sleep} from './_harness.mjs';
import {firstDiff, installNormalize} from './_markdownNormalize.mjs';

const {page, context, check, open, done} = await setup({reducedMotion: 'no-preference'});
await context.addInitScript(installNormalize);
await open('markdown');

const ROOT_ATTRS = ['data-ax-kit', 'data-ax-doc', 'data-ax-config', 'data-ax-done', 'id', 'data-test'];
const compare = (a, b) =>
  page.evaluate(([x, y, skip]) => {
    const ea = typeof x === 'string' ? document.querySelector(x) : null;
    const eb = document.querySelector(y);
    // Same root attributes (the element tag aside), then the same children.
    const attrs = (el) => [...el.attributes].filter((at) => !skip.includes(at.name)).map((at) => `${at.name}=${at.name === 'class' ? at.value.split(/\s+/).sort().join(' ') : at.value}`).sort().join(' ');
    const wrap = (el) => { const d = document.createElement('div'); d.append(...[...el.childNodes].map((n) => n.cloneNode(true))); return d; };
    return {attrs: [attrs(ea), attrs(eb)], a: window.__axNormalize(wrap(ea)), b: window.__axNormalize(wrap(eb))};
  }, [a, b, ROOT_ATTRS]);

// ── Server render is adopted, not replaced ──────────────────────────────────
const initial = await page.evaluate(() => {
  const el = document.getElementById('md-stream');
  return {
    tag: el.tagName,
    upgraded: el instanceof customElements.get('ax-markdown-stream'),
    role: el.getAttribute('role'),
    cls: el.className,
    text: el.text,
    source: el.hasAttribute('data-ax-source'),
    kit: !!document.getElementById(el.getAttribute('data-ax-kit'))?.content.querySelector('template[data-ax-atom="copy"]'),
  };
});
check('streaming root is <ax-markdown-stream role=document class=astryx-markdown>', initial.tag === 'AX-MARKDOWN-STREAM' && initial.upgraded && initial.role === 'document' && initial.cls.includes('astryx-markdown'));
check('element took the server text and kit', initial.text.length === 64 && !initial.source && initial.kit, JSON.stringify(initial));
// ── Stream the demo answer through the page's own button ────────────────────
await page.click('[data-md-stream-start]');
let sawFade = false;
let fadeOpacityRises = false;
let captured = false;
let kept = true;
for (let i = 0; i < 120; i++) {
  await sleep(60);
  const st = await page.evaluate(() => {
    const el = document.getElementById('md-stream');
    const fade = el.querySelector('.ax-markdown-fade');
    const h2 = el.querySelector('h2');
    if (!window.__h2 && h2 && el.querySelector('table')) window.__h2 = h2;
    return {fades: el.querySelectorAll('.ax-markdown-fade').length, opacity: fade ? Number(getComputedStyle(fade).opacity) : null, streaming: el.isStreaming, captured: !!window.__h2, sameH2: !window.__h2 || h2 === window.__h2};
  });
  if (st.fades) sawFade = true;
  if (st.opacity != null && st.opacity < 1) fadeOpacityRises = true;
  captured ||= st.captured;
  if (!st.sameH2) kept = false;
  if (!st.streaming) break;
}
check('new text fades in (.ax-markdown-fade spans, opacity animating)', sawFade && fadeOpacityRises);
check('re-renders keep existing nodes (the heading survives later chunks and finish)', captured && kept);
await sleep(400);
const fin = await page.evaluate(() => {
  const el = document.getElementById('md-stream');
  return {done: !el.isStreaming, fades: el.querySelectorAll('.ax-markdown-fade, [data-ax-segment]').length, len: el.text.length};
});
check('finish() leaves no fade spans', fin.done && fin.fades === 0, JSON.stringify(fin));
const demo = await compare('#md-stream', '#md-stream-reference');
check('settled stream equals the one-shot render: root attributes', demo.attrs[0] === demo.attrs[1], demo.attrs.join(' | '));
check('settled stream equals the one-shot render: content', demo.a === demo.b, firstDiff(demo.a, demo.b));

// ── The long document, in uneven chunks, without the page's helper ──────────
await page.evaluate(async () => {
  const el = document.getElementById('md-stream');
  const text = document.getElementById('md-full-text').content.textContent;
  el.config = {sources: {s1: {title: 'Sync design doc', url: 'https://example.com/design/sync'}, s2: {title: 'Conflict resolution RFC', url: 'https://example.com/rfc/42'}}};
  el.isStreaming = true;
  el.text = '';
  let i = 0;
  let n = 0;
  while (i < text.length) {
    const size = 1 + ((n++ * 37) % 61);
    el.append(text.slice(i, i + size));
    i += size;
    await new Promise((r) => setTimeout(r, 8));
  }
  // Let the smoothed reveal catch up, then settle.
  await new Promise((resolve) => {
    const poll = () => (el.textContent.length > 0 && el.text.length === text.length ? setTimeout(resolve, 600) : setTimeout(poll, 50));
    poll();
  });
  el.finish();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
});
await sleep(200);
const full = await compare('#md-stream', '#md-full');
check('streamed long document equals the one-shot render (every construct)', full.a === full.b, firstDiff(full.a, full.b));

// Intermediate state: while streaming, the visible text is a prefix and the DOM is valid.
await page.evaluate(() => {
  const el = document.getElementById('md-stream');
  el.isStreaming = true;
  el.text = '';
  el.append('# Title\n\nSome **bold');
});
await sleep(300);
const mid = await page.evaluate(() => {
  const el = document.getElementById('md-stream');
  return {h1: el.querySelector('h1')?.textContent, strong: el.querySelector('strong')?.textContent, raw: el.textContent.includes('**')};
});
check('dangling syntax is trimmed while streaming (no raw **)', mid.h1 === 'Title' && mid.strong === 'bold' && !mid.raw, JSON.stringify(mid));
const unsafe = await page.evaluate(async () => {
  const el = document.getElementById('md-stream');
  el.text = '[click](javascript:alert(1)) and <img src=x onerror=alert(1)>';
  el.finish();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return {links: el.querySelectorAll('a').length, imgs: el.querySelectorAll('img').length, text: el.textContent};
});
check('streamed blocked links and raw HTML stay inert text', unsafe.links === 0 && unsafe.imgs === 0 && unsafe.text.includes('<img src=x'), JSON.stringify(unsafe));

// ── Client-created element from the shared kit ──────────────────────────────
await page.click('[data-md-add-message]');
await page.waitForFunction(() => {
  const el = document.querySelector('[data-md-log] ax-markdown-stream');
  return el && !el.isStreaming;
}, null, {timeout: 20000});
await sleep(200);
const kitInfo = await page.evaluate(() => {
  const el = document.querySelector('[data-md-log] ax-markdown-stream');
  return {density: el.getAttribute('data-density'), role: el.getAttribute('role'), copy: !!el.querySelector('.astryx-code-block-copy-button'), checkbox: !!el.querySelector('ax-checkbox-input')};
});
check('client-created stream gets root hooks and kit atoms', kitInfo.density === 'compact' && kitInfo.role === 'document' && kitInfo.copy && kitInfo.checkbox, JSON.stringify(kitInfo));
const kitCmp = await page.evaluate(() => {
  const el = document.querySelector('[data-md-log] ax-markdown-stream');
  const compact = document.querySelector('[data-test="compact"]');
  // The compact demo renders the same text on the server (other options don't touch the task list).
  const pick = (root, sel) => window.__axNormalize(root.querySelector(sel));
  return {tasks: [pick(el, '.astryx-markdown-list .astryx-field'), pick(compact, '.astryx-markdown-list .astryx-field')]};
});
check('client-created stream renders the kit atoms like the server (task list)', kitCmp.tasks[0] === kitCmp.tasks[1], firstDiff(kitCmp.tasks[0], kitCmp.tasks[1]));

// ── Copy works on streamed code ─────────────────────────────────────────────
await context.grantPermissions(['clipboard-read', 'clipboard-write']);
await page.locator('[data-md-log] .astryx-code-block-copy-button').first().click();
await sleep(100);
const clip = await page.evaluate(() => navigator.clipboard.readText());
check('copy button on streamed code copies the code', clip === "await client.sync({projects: 'all'});", clip);

await done();
