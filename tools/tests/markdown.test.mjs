/**
 * Markdown: every construct renders with the right Astryx components / roles, the HTML and URL
 * safety policy, heading ids vs Outline, copy buttons, heading permalinks, overrides, plugins,
 * LinkProvider, link-click events, and parity of the shared renderer's composed-component
 * markup with the real components (the demo's hidden [data-md-parity] fixtures).
 * Run after `cd apps/docs && npx astro build`.
 */
import {setup, sleep} from './_harness.mjs';
import {firstDiff, installNormalize} from './_markdownNormalize.mjs';

const {page, context, check, open, done} = await setup();
await context.grantPermissions(['clipboard-read', 'clipboard-write']);
await context.addInitScript(installNormalize);
await open('markdown');

// ── Document structure ───────────────────────────────────────────────────────
const s = await page.evaluate(() => {
  const root = document.getElementById('md-full');
  const q = (sel) => root.querySelectorAll(sel);
  const text = (el) => el?.textContent ?? null;
  return {
    role: root.getAttribute('role'),
    cls: root.className,
    density: root.getAttribute('data-density'),
    headings: [...q('h1,h2,h3,h4,h5,h6')].map((h) => ({tag: h.tagName, id: h.id, level: h.getAttribute('data-level'), cls: h.classList.contains('astryx-markdown-heading')})),
    paragraphs: q('[role="paragraph"].astryx-markdown-paragraph').length,
    strong: text(root.querySelector('strong.ax-markdown-strong')),
    em: text(root.querySelector('em')),
    del: text(root.querySelector('del.ax-markdown-del')),
    br: q('br').length,
    inlineCode: text(root.querySelector('.astryx-markdown-paragraph code.astryx-code[data-color="primary"]')),
    internal: (() => { const a = root.querySelector('a[href="/docs/migrate"]'); return a && {target: a.getAttribute('target'), cls: a.className}; })(),
    external: (() => { const a = root.querySelector('a[href="https://example.com/atlas/4-2"]'); return a && {target: a.target, rel: a.rel}; })(),
    citations: [...q('.astryx-citation')].map((c) => ({role: c.getAttribute('role'), label: c.getAttribute('aria-label'), variant: c.getAttribute('data-variant')})),
    bulletMarkers: [...q('.ax-list-marker > span')].map((m) => m.className),
    orderedStarts: [...q('ol.astryx-list')].map((ol) => ol.getAttribute('start')),
    numberMarkers: [...q('.ax-list-number')].map((n) => n.getAttribute('data-marker')),
    listDensity: [...q('.astryx-markdown-list > .astryx-list')].every((l) => l.getAttribute('data-density') === 'compact'),
    taskGroup: (() => {
      const g = root.querySelector('.astryx-markdown-list ax-checkbox-list[role="group"]');
      if (!g) return null;
      const label = document.getElementById(g.getAttribute('aria-labelledby'))?.textContent;
      const boxes = [...g.querySelectorAll('input[type="checkbox"]')].map((i) => ({checked: i.checked, ro: i.getAttribute('aria-readonly'), name: document.getElementById(i.getAttribute('aria-labelledby'))?.textContent}));
      return {label, boxes};
    })(),
    flowTasks: [...q('.ax-list-task input[type="checkbox"]')].map((i) => ({checked: i.checked, ro: i.getAttribute('aria-readonly'), name: i.labels?.[0]?.textContent})),
    table: (() => {
      const w = root.querySelector('.astryx-markdown-table > ax-table');
      const t = w?.querySelector('table.astryx-table');
      return w && {role: w.getAttribute('role'), label: w.getAttribute('aria-label'), dividers: t.getAttribute('data-dividers'), overflow: t.getAttribute('data-text-overflow'), th: t.querySelectorAll('th.astryx-table-header-cell').length, rows: t.querySelectorAll('tbody tr').length, align: [...t.querySelectorAll('thead th')].map((th) => getComputedStyle(th).textAlign), minWidth: t.querySelector('thead th').style.minWidth, cellCode: !!t.querySelector('td code.astryx-code')};
    })(),
    codeBlocks: [...q('.astryx-markdown-codeblock > pre.astryx-code-block')].map((p) => ({lang: p.getAttribute('data-language'), wrapped: !!p.querySelector('code[data-ax-wrapped]'), copy: !!p.querySelector('.astryx-code-block-copy-button'), toggle: p.querySelector('[data-ax-codeblock-toggle]')?.getAttribute('aria-expanded') ?? null, tokens: p.querySelectorAll('[class^="astryx-token-"]').length, diff: [...p.querySelectorAll('[data-diff]')].map((l) => l.getAttribute('data-diff'))})),
    blockquote: (() => { const b = root.querySelector('blockquote.astryx-blockquote.astryx-markdown-blockquote'); return b && {density: b.getAttribute('data-density'), list: !!b.querySelector('.astryx-list')}; })(),
    hr: root.querySelectorAll('hr.astryx-markdown-hr[data-density]').length,
    image: (() => { const i = root.querySelector('.astryx-markdown-image > img.ax-markdown-img'); return i && {alt: i.alt, loaded: i.complete && i.naturalWidth > 0}; })(),
  };
});
check('root is a document with the theme hooks', s.role === 'document' && s.cls.split(' ').includes('astryx-markdown') && s.density === 'default');
check('h1–h6 with ids and data-level', s.headings.length === 10 && s.headings.every((h) => h.cls && h.id && h.level === h.tag.slice(1)), JSON.stringify(s.headings));
check('paragraphs are div[role=paragraph]', s.paragraphs >= 8, String(s.paragraphs));
check('strong / em / del / br', s.strong === 'faster sync' && s.em === 'redesigned' && s.del === 'the legacy exporter' && s.br === 1);
check('inline code is Code', s.inlineCode === 'atlas sync --all');
check('internal link: same tab, Markdown link style', s.internal?.target === null && s.internal.cls === 'ax-markdown-link');
check('external link: new tab with noopener noreferrer', s.external?.target === '_blank' && s.external.rel === 'noopener noreferrer');
check('citations are Citation chips numbered in order', s.citations.length === 2 && s.citations[0].role === 'doc-noteref' && s.citations[0].label === 'Citation 1: Sync design doc' && s.citations[1].label === 'Citation 2: Conflict resolution RFC' && s.citations[0].variant === 'label', JSON.stringify(s.citations));
check('nested bullets cycle disc → circle → square', ['ax-list-marker-dot', 'ax-list-marker-circle', 'ax-list-marker-square'].every((m) => s.bulletMarkers.includes(m)), s.bulletMarkers.join());
check('ordered list keeps its start', s.orderedStarts.includes('5') && s.numberMarkers.every((m) => m === 'decimal'), JSON.stringify(s.orderedStarts));
check('Markdown lists are compact Lists', s.listDensity);
check('paragraph-only task list → read-only CheckboxList "Task list"', s.taskGroup?.label === 'Task list' && s.taskGroup.boxes.length === 4 && s.taskGroup.boxes.map((b) => b.checked).join() === 'true,true,false,false' && s.taskGroup.boxes.every((b) => b.ro === 'true') && s.taskGroup.boxes[0].name === 'Ship the migration script', JSON.stringify(s.taskGroup));
check('mixed task list → per-item read-only checkboxes named by their text', s.flowTasks.length === 2 && s.flowTasks[0].checked && !s.flowTasks[1].checked && s.flowTasks.every((t) => t.ro === 'true') && s.flowTasks[0].name === 'Fixed: sync stalls after sleep', JSON.stringify(s.flowTasks));
check('table → Table (grid, wrap) in its scroll region, aligned columns', s.table?.role === 'group' && s.table.label === 'Table' && s.table.dividers === 'grid' && s.table.overflow === 'wrap' && s.table.th === 4 && s.table.rows === 3 && s.table.align.join() === 'start,end,end,center' && /ch$/.test(s.table.minWidth) && s.table.cellCode, JSON.stringify(s.table));
check('fenced code → wrapped CodeBlocks with copy buttons and tokens', s.codeBlocks.length === 3 && s.codeBlocks.every((c) => c.wrapped && c.copy && c.tokens > 0), JSON.stringify(s.codeBlocks));
check('long code block is collapsible; diff fence uses the diff layer', s.codeBlocks[1].toggle === 'true' && s.codeBlocks[0].toggle === null && s.codeBlocks[2].lang === 'ts' && s.codeBlocks[2].diff.join() === 'removed,added', JSON.stringify(s.codeBlocks.map((c) => [c.lang, c.toggle, c.diff])));
check('blockquote → Blockquote with nested blocks', s.blockquote?.density === 'default' && s.blockquote.list);
check('thematic break → hr', s.hr === 1);
check('block image renders <img> (loaded)', s.image?.alt === 'Weekly active projects' && s.image.loaded, JSON.stringify(s.image));

// ── Safety: raw HTML and URL policy ──────────────────────────────────────────
const safety = await page.evaluate(() => {
  const root = document.getElementById('md-full');
  return {
    jsLinks: document.querySelectorAll('a[href^="javascript" i], [href*="alert(1)"]').length,
    rawB: root.querySelectorAll('b, [onclick]').length,
    rawText: root.textContent.includes('<b onclick="alert(1)">not bold</b>'),
    inertText: root.textContent.includes('[stays inert](javascript:alert(1))'),
    dataImg: root.querySelectorAll('img[src^="data:"]').length,
    dataAlt: root.textContent.includes('[tracking pixel]'),
  };
});
check('no javascript: link anywhere', safety.jsLinks === 0);
check('raw HTML renders as text, never markup', safety.rawB === 0 && safety.rawText);
check('blocked link destination stays inert text', safety.inertText);
check('data: image is blocked and shows [alt]', safety.dataImg === 0 && safety.dataAlt);

// ── Outline ids ──────────────────────────────────────────────────────────────
const outline = await page.evaluate(() => {
  const links = [...document.querySelectorAll('[data-test="outline"] a[href^="#"]')].map((a) => a.getAttribute('href').slice(1));
  const root = document.getElementById('md-full');
  const rootHeadings = [...root.children].filter((e) => /^H[1-6]$/.test(e.tagName)).map((h) => h.id);
  const guideLinks = [...document.querySelectorAll('[data-test="guide-outline"] a[href^="#"]')].map((a) => a.getAttribute('href').slice(1));
  const guideIds = [...document.querySelectorAll('[data-test="heading-links"] .astryx-markdown-heading')].map((h) => h.id);
  return {links, rootHeadings, guideLinks, guideIds};
});
check('Outline links = the document heading ids, in order', outline.links.length > 0 && JSON.stringify(outline.links) === JSON.stringify(outline.rootHeadings), `${outline.links} vs ${outline.rootHeadings}`);
check('heading-links plugin: prefixed, unique ids shared with Outline', JSON.stringify(outline.guideLinks) === JSON.stringify(outline.guideIds) && new Set(outline.guideIds).size === 4 && outline.guideIds.every((id) => id.startsWith('guide')), JSON.stringify(outline));

// ── Copy button ──────────────────────────────────────────────────────────────
const copyButton = page.locator('#md-full .astryx-markdown-codeblock .astryx-code-block-copy-button').first();
await copyButton.click();
await sleep(100);
const copied = await page.evaluate(async () => ({
  clip: await navigator.clipboard.readText(),
  label: document.querySelector('#md-full .astryx-code-block-copy-button').getAttribute('aria-label'),
}));
check('code block copy button copies the code', copied.clip.startsWith("import {createClient} from '@atlas/sdk';") && copied.clip.includes('await client.sync'), JSON.stringify(copied.clip.slice(0, 60)));
check('copy button reads "Copied" after copying', copied.label === 'Copied', copied.label);

// ── Heading permalinks ───────────────────────────────────────────────────────
const row = page.locator('[data-test="heading-links"] .ax-markdown-heading-row').nth(1);
const btn = row.locator('.ax-markdown-heading-copy');
const restOpacity = await btn.evaluate((b) => getComputedStyle(b).opacity);
await row.hover();
await sleep(50);
const hoverOpacity = await btn.evaluate((b) => getComputedStyle(b).opacity);
check('permalink button hidden at rest, revealed on hover', restOpacity === '0' && hoverOpacity === '1', `${restOpacity} → ${hoverOpacity}`);
const beforeHash = await page.evaluate(() => location.hash);
await btn.click();
await sleep(100);
const perm = await page.evaluate(async () => {
  const b = document.querySelectorAll('[data-test="heading-links"] .ax-markdown-heading-copy')[1];
  return {clip: await navigator.clipboard.readText(), label: b.getAttribute('aria-label'), copied: b.hasAttribute('data-copied'), hash: location.hash, id: b.closest('.ax-markdown-heading-row').querySelector('h1,h2,h3,h4,h5,h6').id};
});
check('permalink copies the absolute URL without navigating', perm.clip === `${new URL(page.url()).origin}/components/markdown/#${perm.id}` && perm.hash === beforeHash, JSON.stringify(perm));
check('permalink button confirms with the copied label', perm.copied && perm.label === 'Link copied', perm.label);
await page.keyboard.press('Tab');
const focusName = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
check('permalink buttons are named after their heading', /^Copy link to /.test(focusName ?? '') || focusName === 'Link copied', focusName);

// ── Overrides, plugins, providers, events ────────────────────────────────────
const o = await page.evaluate(() => {
  const root = document.querySelector('[data-test="overrides"]');
  return {
    heading: (() => { const h = root.querySelector('h2.docs-md-heading'); return h && {id: h.id, text: h.textContent}; })(),
    builtInHeading: root.querySelectorAll('.astryx-markdown-heading').length,
    inline: root.querySelector('[data-test="inline-override"]')?.textContent,
    mathInline: root.querySelector('[data-test="math-inline"]')?.getAttribute('aria-label'),
    mathBlock: root.querySelector('[data-test="math-block"]')?.textContent,
    dollars: root.textContent.includes('$E'),
    diagram: root.querySelector('[data-test="diagram"] figcaption')?.textContent,
    transformed: root.textContent.includes('The word Final becomes Final'),
    routerLink: document.querySelector('[data-test="link-provider"] a[href="/settings"]')?.hasAttribute('data-router-link'),
    externalPlain: !document.querySelector('[data-test="link-provider"] a[href="https://example.com"]')?.hasAttribute('data-router-link'),
    sourceLines: [...document.querySelectorAll('[data-test="source-lines"] [data-source-line]')].map((e) => `${e.tagName}:${e.getAttribute('data-source-line')}-${e.getAttribute('data-source-line-end')}`),
  };
});
check('Astro component heading override gets level, id and children', o.heading?.id === 'custom-heading-renderer' && o.heading.text.includes('Custom heading renderer') && o.builtInHeading === 0, JSON.stringify(o.heading));
check('function overrides render inlineCode and math', o.inline === 'npm run build' && o.mathInline === 'E = mc^2' && o.mathBlock?.includes('\\sum') && !o.dollars);
check('semantic fence plugin renders its node', o.diagram === 'Checkout flow');
check('text transform plugin applies', o.transformed);
check('LinkProvider component renders internal links only', o.routerLink === true && o.externalPlain);
check('markdownSourceLinesPlugin stamps block lines', o.sourceLines.includes('H1:1-1') && o.sourceLines.includes('LI:5-5'), o.sourceLines.join());

const beforeUrl = page.url();
await page.click('[data-test="link-click"] a');
await sleep(50);
const clicked = await page.evaluate(() => document.querySelector('[data-test="link-click"] a').getAttribute('data-clicked'));
check('astryx-link-click fires with href and preventDefault stops navigation', clicked === '#md-full' && page.url() === beforeUrl, `${clicked} ${page.url()}`);

const inline = await page.evaluate(() => {
  const span = document.querySelector('[data-test="inline"]');
  return {tag: span.tagName, role: span.getAttribute('role'), display: getComputedStyle(span).display, code: !!span.querySelector('code.astryx-code'), blocks: span.querySelectorAll('div').length};
});
check('display="inline" is an inline span without block wrappers', inline.tag === 'SPAN' && inline.role === null && inline.display === 'inline' && inline.code && inline.blocks === 0, JSON.stringify(inline));
const auto = await page.evaluate(() => [...document.querySelectorAll('[data-test="autolink"] a')].map((a) => a.getAttribute('href')));
check('autolink="gfm" links bare URLs and emails', auto.includes('https://example.com') && auto.includes('mailto:contact@example.com') && auto.includes('https://docs.example.com'), auto.join());

const icons = await page.evaluate(() => {
  const root = document.querySelector('[data-test="citation-icons"]');
  const chips = [...root.querySelectorAll('.astryx-citation')];
  return {
    count: chips.length,
    svg: !!chips[0]?.querySelector('.ax-citation-icon svg') && chips[0].hasAttribute('data-has-icon'),
    img: chips[1]?.querySelector('.ax-citation-icon img.ax-citation-image')?.getAttribute('alt'),
    plain: chips[2] && !chips[2].hasAttribute('data-has-icon') && chips[2].tagName === 'SPAN' && chips[2].getAttribute('role'),
    unknown: root.textContent.includes('[nope]'),
  };
});
check('citation icons: Astro icon component, image src, none (inert span without url); unknown ids stay text', icons.count === 3 && icons.svg && icons.img === '' && icons.plain === 'group' && icons.unknown, JSON.stringify(icons));

const compact = await page.evaluate(() => {
  const root = document.querySelector('[data-test="compact"]');
  const h = root.querySelector('.astryx-markdown-heading');
  const p = root.querySelector('.astryx-markdown-paragraph');
  return {tag: h.tagName, level: h.getAttribute('data-level'), density: root.getAttribute('data-density'), maxWidth: getComputedStyle(p).maxWidth, margin: getComputedStyle(p).marginInlineStart !== '0px', badge: root.querySelector('.astryx-citation')?.getAttribute('data-variant'), badgeText: root.querySelector('.astryx-citation')?.textContent};
});
check('headingLevelStart shifts levels; compact density; contentWidth/center', compact.tag === 'H4' && compact.level === '4' && compact.density === 'compact' && compact.maxWidth === '420px' && compact.margin, JSON.stringify(compact));
check('citationStyle="number" renders numbered badges', compact.badge === 'number' && compact.badgeText === '1');

// Task checkboxes are read-only: clicking does not toggle them.
const toggled = await page.evaluate(() => {
  const input = document.querySelector('#md-full ax-checkbox-list input[type="checkbox"]');
  const before = input.checked;
  input.click();
  return before === input.checked;
});
check('task checkboxes are read-only', toggled);

// ── Parity with the composed components ──────────────────────────────────────
const picks = {
  bullets: ['.astryx-markdown-list > ul', 'ul.astryx-list'],
  ordered: ['.astryx-markdown-list > ol', 'ol.astryx-list'],
  tasks: ['.astryx-markdown-list > .astryx-field', '.astryx-field'],
  'mixed-tasks': ['.astryx-markdown-list > ul', 'ul.astryx-list'],
  table: ['.astryx-markdown-table > ax-table', 'ax-table'],
  code: ['.astryx-markdown-codeblock > pre', 'pre'],
  'code-long': ['.astryx-markdown-codeblock > pre', 'pre'],
  'code-diff': ['.astryx-markdown-codeblock > pre', 'pre'],
  'code-plain': ['.astryx-markdown-codeblock > pre', 'pre'],
  'inline-code': ['.astryx-markdown-paragraph > code', 'code'],
  citation: ['.astryx-citation', '.astryx-citation'],
  'citation-icon': ['.astryx-citation', '.astryx-citation'],
};
for (const [name, [mdSel, refSel]] of Object.entries(picks)) {
  const r = await page.evaluate(([n, a, b]) => {
    const box = document.querySelector(`[data-md-parity="${n}"]`);
    const md = box?.querySelector(`[data-side="md"] ${a}`);
    const ref = box?.querySelector(`[data-side="ref"] ${b}`);
    if (!md || !ref) return {missing: true};
    return {md: window.__axNormalize(md), ref: window.__axNormalize(ref)};
  }, [name, mdSel, refSel]);
  check(`parity with the Astryx components: ${name}`, !r.missing && r.md === r.ref, r.missing ? 'fixture missing' : firstDiff(r.md, r.ref));
}

await done();
