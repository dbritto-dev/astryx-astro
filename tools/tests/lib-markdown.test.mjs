#!/usr/bin/env node
/**
 * Behaviour tests for src/lib/markdown (parser, canonical AST, URL policy, headings and
 * Outline, incremental/streaming parsing, plugins, remark adapter). Astryx 0.7.9 ships no
 * unit tests in its npm source.
 *   node tools/tests/lib-markdown.test.mjs
 */
import {lib, createChecker} from './lib-loader.mjs';

const {check, eq, done} = createChecker();
const md = await lib('markdown/index.ts');

const strip = (node) => JSON.parse(JSON.stringify(node, (k, v) => (k === 'position' ? undefined : v)));
const blocks = (src, opts) => strip(md.parseMarkdownAst(src, opts)).children;

// ── Block structure ─────────────────────────────────────────────────────
const doc = '# Title\n\n## Sub &amp; more\n\n- [x] done\n- [ ] todo\n\n1. one\n2. two\n\n| a | b |\n|:-|-:|\n| 1 | 2 |\n\n```ts\nconst a = 1;\n```\n\n> quote\n\n---\n\nend';
eq('block types', blocks(doc).map((b) => b.type), ['heading', 'heading', 'list', 'list', 'table', 'code', 'blockquote', 'thematicBreak', 'paragraph']);
const [h1, h2, tasks, ordered, table, code, quote] = blocks(doc);
eq('heading depth', [h1.depth, h2.depth], [1, 2]);
eq('character reference decoded', h2.children, [{type: 'text', value: 'Sub & more'}]);
eq('task list checked', tasks.children.map((i) => i.checked), [true, false]);
eq('ordered list', ordered.ordered, true);
eq('table align', table.align, ['left', 'right']);
eq('table cells', table.children[1].children.map((c) => c.children[0].value), ['1', '2']);
eq('code fence', {lang: code.lang, value: code.value}, {lang: 'ts', value: 'const a = 1;'});
eq('blockquote', quote.children[0].children[0].value, 'quote');

// ── Inline structure ────────────────────────────────────────────────────
const inline = blocks('**b** *i* ~~d~~ `c` [l](https://example.com "t") ![a](x.png)')[0].children;
eq('inline types', inline.filter((n) => n.type !== 'text').map((n) => n.type), ['strong', 'emphasis', 'delete', 'inlineCode', 'link', 'image']);
eq('link url', inline.find((n) => n.type === 'link').url, 'https://example.com');
eq('image', inline.find((n) => n.type === 'image'), {type: 'image', url: 'x.png', alt: 'a'});
eq('hard break', blocks('a  \nb')[0].children.map((n) => n.type), ['text', 'break', 'text']);
eq('parseInlineAst', strip(md.parseInlineAst('**x**')).map((n) => n.type), ['strong']);

// ── Navigation safety ───────────────────────────────────────────────────
check('javascript: link stays text', blocks('[x](javascript:alert(1))')[0].children.every((n) => n.type === 'text'));
eq('sanitize link', md.sanitizeMarkdownLinkUrl(' https://a.b '), 'https://a.b');
eq('blocked link', md.sanitizeMarkdownLinkUrl('JavaScript:alert(1)'), null);
eq('blocked image data:', md.sanitizeMarkdownUrl('data:image/png;base64,AAA'), null);
eq('image url ok', md.sanitizeMarkdownUrl('/a.png'), '/a.png');
eq('decode references', md.decodeMarkdownCharacterReferences('&lt;b&gt; &#65; &copy;'), '<b> A ©');

// ── Citations ───────────────────────────────────────────────────────────
const cited = blocks('Claim [1] and 【2】 but [3].', {sourceIds: new Set(['1', '2'])})[0].children;
eq('citation nodes', cited.filter((n) => n.type === 'citation').map((n) => n.sourceId), ['1', '2']);
check('unknown source stays text', cited.some((n) => n.type === 'text' && n.value.includes('[3]')));

// ── Math (opt-in) ───────────────────────────────────────────────────────
eq('math off by default', blocks('$x$')[0].children[0].type, 'text');
eq('inline math', blocks('$x^2$', {math: true})[0].children[0], {type: 'inlineMath', value: 'x^2'});
eq('block math', blocks('$$\na+b\n$$', {math: true})[0], {type: 'math', value: 'a+b'});

// ── Autolinks (opt-in) ──────────────────────────────────────────────────
eq('gfm autolink', blocks('see https://example.com now', {autolink: 'gfm'})[0].children.map((n) => n.type), ['text', 'link', 'text']);

// ── Legacy projection ───────────────────────────────────────────────────
eq('legacy parseMarkdown', md.parseMarkdown('# Hi\n\n**b**').map((n) => n.type), ['heading', 'paragraph']);
eq('legacy inline', md.parseInline('**b**')[0].type, 'bold');

// ── Headings, slugs, Outline ────────────────────────────────────────────
eq('slugify', md.slugify('Hello, World!'), 'hello-world');
const used = new Map();
eq('unique slugs', [md.uniqueSlug('a', used), md.uniqueSlug('a', used), md.uniqueSlug('a', used)], ['a', 'a-1', 'a-2']);
eq('outline', md.parseOutlineFromMarkdown('# A\n\n## B\n\n## B\n\n> # quoted'), [
  {id: 'a', label: 'A', level: 1},
  {id: 'b', label: 'B', level: 2},
  {id: 'b-1', label: 'B', level: 2},
]);
const projection = md.projectMarkdownHeadings(md.parseMarkdownAst('# One\n\n## Two'));
eq('heading projection ids', [...projection.ids.values()], ['one', 'two']);

// ── Incremental / streaming ─────────────────────────────────────────────
const full = '# Stream\n\nSome **bold** text.\n\n- a\n- b\n';
const state = md.createIncrementalState();
for (let i = 1; i <= full.length; i += 7) md.parseMarkdownIncremental(full.slice(0, i), state);
const out = md.parseMarkdownIncremental(full, state);
eq('incremental equals full parse', strip(out), strip(md.parseMarkdown(full)));
eq('trim streaming artifacts closes open emphasis', md.trimStreamingArtifacts('Some **bol'), 'Some **bol**');
const segs = md.computeSegments('Hello world', 0, [5], 'k');
eq('streaming segments', segs.map((s) => [s.text, s.fading]), [['Hello', false], [' world', true]]);

// ── Plugins ─────────────────────────────────────────────────────────────
const mention = md.createMarkdownPlugin({
  name: 'mentions',
  apiVersion: 1,
  transform: md.createMarkdownTextTransform({
    pattern: /@(\w+)/g,
    requiredSubstrings: ['@'],
    replace: (match) => ({type: 'strong', children: [{type: 'text', value: match[1]}]}),
  }),
});
eq('text transform plugin', blocks('hi @ana!', {plugins: [mention]})[0].children.map((n) => n.type), ['text', 'strong', 'text']);
check('transform skips code', blocks('`@ana`', {plugins: [mention]})[0].children[0].type === 'inlineCode');
eq('soft breaks plugin', blocks('a\nb', {plugins: [md.markdownSoftBreaksPlugin]})[0].children.map((n) => n.type), ['text', 'break', 'text']);
const fm = md.createMarkdownFrontmatter({name: 'meta', parse: (fields) => ({title: String(fields.title ?? '')})});
const fmParse = fm.parse('---\ntitle: Hello\n---\n# Body');
eq('frontmatter metadata', fmParse.status === 'match' ? fmParse.metadata : fmParse.status, {title: 'Hello'});
eq('frontmatter hidden from AST', blocks('---\ntitle: Hello\n---\n# Body', {plugins: [fm.plugin]}).map((b) => b.type), ['heading']);
const caps = md.getMarkdownPluginCapabilities(mention);
check('plugin capabilities', caps != null && typeof caps === 'object');

// ── Remark adapter ──────────────────────────────────────────────────────
const shout = () => (tree) => {
  const visit = (n) => {
    if (n.type === 'text') n.value = n.value.toUpperCase();
    n.children?.forEach(visit);
  };
  visit(tree);
};
const remarkPlugin = md.createMarkdownPlugin({name: 'shout', apiVersion: 1, transform: (await lib('markdown/remark.ts')).createMarkdownRemarkTransform(shout)});
eq('remark transform', blocks('hello *you*', {plugins: [remarkPlugin]})[0].children.map((n) => n.value ?? n.children[0].value), ['HELLO ', 'YOU']);

// ── AST helpers ─────────────────────────────────────────────────────────
const root = md.parseMarkdownAst('# A *b*\n\ntext');
eq('markdownAstText', md.markdownAstText(root.children[0].children), 'A b');
const seen = [];
md.visitMarkdownNodes(root, 'emphasis', (node) => { seen.push(node.children[0].value); });
eq('visitMarkdownNodes visits one type', seen, ['b']);

done('lib/markdown');
