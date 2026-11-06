/**
 * The shared Markdown render function (components/Markdown/markdownRender.ts) in plain Node:
 * renderer-level URL policy (links a plugin could forge past the parser), escaping, overrides
 * (functions, tag names, Astro components as holes), plugin renderers and their fallbacks,
 * streaming fade segments, deterministic ids and atom instantiation.
 */
import './lib-loader.mjs';
import {createChecker} from './lib-loader.mjs';

const base = new URL('../../packages/astryx-astro/src/components/Markdown/', import.meta.url);
const {renderMarkdownBlocks, renderMarkdownInline} = await import(new URL('markdownRender.ts', base).href);
const {createIdSource, instantiateAtom, ENGLISH_STRINGS} = await import(new URL('markdownKit.ts', base).href);
const {parseDocument, preparePlugins} = await import(new URL('markdownPipeline.ts', base).href);
const {createMarkdownPlugin, createMarkdownTextTransform, createMarkdownFenceTransform} = await import(new URL('../../lib/markdown/plugins/index.ts', base).href);

const {check, eq, done} = createChecker();

const options = {density: 'default', headingLevelStart: 1, contentWidth: '680px', contentAlign: 'start', citationStyle: 'label'};
const host = (holes = []) => ({ids: createIdSource('t'), kit: {strings: ENGLISH_STRINGS, atoms: {}}, hole: (n) => (holes.push(n), `<!--hole:${holes.length - 1}-->`)});
const inline = (children, extra = {}) => renderMarkdownInline(children, {options: {...options, ...extra}, host: host()});
const render = (source, extra = {}, h = host()) => {
  const prepared = preparePlugins(extra.plugins);
  const doc = parseDocument(source, {math: extra.components?.math != null, prepared});
  return renderMarkdownBlocks(doc.blocks, {options: {...options, ...extra}, host: h, prepared, headings: doc.headings}).join('');
};

// ── URL policy at render time ────────────────────────────────────────────────
const link = (url) => [{type: 'link', url, children: [{type: 'text', value: 'x'}]}];
for (const url of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' java\nscript:alert(1)', 'vbscript:msgbox', 'data:text/html,<b>x</b>']) {
  eq(`blocked link renders inert text: ${JSON.stringify(url)}`, inline(link(url)), '<span>x</span>');
}
eq('safe internal link', inline(link('/docs')), '<a href="/docs" class="ax-markdown-link">x</a>');
eq('safe external link opens a new tab', inline(link('https://a.example')), '<a href="https://a.example" target="_blank" rel="noopener noreferrer" class="ax-markdown-link">x</a>');
eq('mailto stays a link', inline(link('mailto:a@b.c')), '<a href="mailto:a@b.c" class="ax-markdown-link">x</a>');
eq('data: image is blocked', inline([{type: 'image', url: 'data:image/png;base64,AA', alt: 'pixel'}]), '<span>[pixel]</span>');
eq('image', inline([{type: 'image', url: '/a.png', alt: 'A "quoted" alt'}]), '<img src="/a.png" alt="A &quot;quoted&quot; alt" class="ax-markdown-img">');
check('a link override never sees a blocked URL', !inline(link('javascript:x'), {components: {link: () => 'OVERRIDE'}}).includes('OVERRIDE'));

// ── Escaping: source HTML is text ────────────────────────────────────────────
eq('raw HTML is escaped', render('<script>alert(1)</script> & <b>x</b>'), '<div role="paragraph" class="astryx-markdown-paragraph" data-density="default" data-ax-spacing="paragraph" data-ax-first data-ax-last style="max-width:680px">&lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;b&gt;x&lt;/b&gt;</div>');
check('code text is escaped', render('```\n</pre><script>x</script>\n```').includes('&lt;/pre&gt;&lt;script&gt;'));
check('heading ids are attribute-safe', render('# A "quote" <tag>').includes('id="a-quote-tag"'));

// ── Overrides ────────────────────────────────────────────────────────────────
eq('function override gets Astryx props, children as HTML', render('## Hi *there*', {components: {heading: ({level, id, children}) => `<x-h l="${level}" id="${id}">${children}</x-h>`}}), '<x-h l="2" id="hi-there">Hi <em>there</em></x-h>');
eq('tag-name override', render('Para', {components: {paragraph: 'p'}}), '<p>Para</p>');
eq('inlineCode override gets the code text', render('`a<b`', {components: {inlineCode: ({children}) => `[${children}]`}}), '<div role="paragraph" class="astryx-markdown-paragraph" data-density="default" data-ax-spacing="paragraph" data-ax-first data-ax-last style="max-width:680px">[a<b]</div>');
const fakeAstro = Object.assign(() => {}, {isAstroComponentFactory: true});
const holes = [];
eq('Astro component override becomes a hole', render('> quote', {components: {blockquote: fakeAstro}}, host(holes)), '<!--hole:0-->');
check('hole carries props and child HTML', holes[0]?.component === fakeAstro && holes[0].children.includes('quote') && !('children' in holes[0].props));
check('math renderer enables $…$ parsing', render('$x$', {components: {math: ({value, display}) => `<m d="${display}">${value}</m>`}}).includes('<m d="inline">x</m>'));
check('without a math renderer dollars stay text', render('$x$').includes('$x$'));

// ── Plugins ──────────────────────────────────────────────────────────────────
const mentions = (render) =>
  createMarkdownPlugin({
    name: 'mentions',
    apiVersion: 1,
    transform: createMarkdownTextTransform({
      pattern: /@(\w+)/g,
      replace: (m) => ({type: 'extension', plugin: 'mentions', name: 'mention', display: 'inline', data: {user: m[1]}}),
    }),
    renderers: {mention: {render, toText: (n) => `@${n.data.user}`}},
  });
check('inline plugin renderer output', render('Hi @ada', {plugins: [mentions(({node}) => `<b-user>${node.data.user}</b-user>`)]}).includes('Hi <b-user>ada</b-user>'));
check('inline renderer returning null shows the readable text', render('Hi @ada', {plugins: [mentions(() => null)]}).includes('Hi @ada'));
const forged = createMarkdownPlugin({
  name: 'forger',
  apiVersion: 1,
  transform: createMarkdownTextTransform({pattern: /EVIL/g, replace: () => ({type: 'link', url: 'javascript:alert(1)', children: [{type: 'text', value: 'evil'}]})}),
});
const quiet = [console.error, console.warn];
const mute = () => { console.error = () => {}; console.warn = () => {}; };
const unmute = () => { [console.error, console.warn] = quiet; };
mute();
const forgedOut = render('an EVIL link', {plugins: [forged]});
unmute();
check('a transform-forged javascript: link never renders an <a>', !forgedOut.includes('<a') && !forgedOut.includes('javascript:alert(1)"'), forgedOut);
const fence = (render) =>
  createMarkdownPlugin({
    name: 'charts',
    apiVersion: 1,
    transform: createMarkdownFenceTransform({
      languages: ['chart'],
      createNode: ({code}) => ({type: 'extension', plugin: 'charts', name: 'chart', display: 'block', data: {v: code}}),
    }),
    renderers: {chart: {render, toText: (n) => n.data.v}},
  });
check('semantic fence renderer output', render('```chart\n1,2\n```', {plugins: [fence(({node}) => `<x-chart>${node.data.v}</x-chart>`)]}).includes('<x-chart>1,2</x-chart>'));
check('fence renderer returning null falls back to the CodeBlock', render('```chart\n1,2\n```', {plugins: [fence(() => null)]}).includes('astryx-code-block'));
mute();
check('fence renderer that throws falls back to the CodeBlock', render('```chart\n1,2\n```', {plugins: [fence(() => { throw new Error('boom'); })]}).includes('astryx-code-block'));
unmute();

// ── Streaming fade segments ──────────────────────────────────────────────────
const fade = renderMarkdownInline([{type: 'text', value: 'Hello world'}], {options, host: host(), cursor: {offset: 0, boundaries: [6], active: true}});
eq('fade spans split at boundaries and carry their React keys', fade, '<span data-ax-segment="wrap-0"><span data-ax-segment="settled-0">Hello </span><span class="ax-markdown-fade" data-ax-segment="fade-0-b6">world</span></span>');
eq('inactive cursor renders plain text', renderMarkdownInline([{type: 'text', value: 'a<b'}], {options, host: host(), cursor: {offset: 0, boundaries: [0], active: false}}), 'a&lt;b');

// ── Determinism and atoms ────────────────────────────────────────────────────
const doc = '# T\n\n```ts\nconst a = 1;\n```\n\n- [x] a\n- b';
const kitHost = () => ({ids: createIdSource('d'), kit: {strings: ENGLISH_STRINGS, atoms: {copy: '<button id="ax-copy-9" aria-describedby="ax-tip-9" data-ax-copy-from="__AXMD_SRC__"></button><div id="ax-tip-9" role="tooltip"></div>', 'task-checked': '<input id="cb-1" checked><label for="cb-1">__AXMD_LABEL__</label>'}}, hole: () => ''});
eq('same text, same output (ids included)', render(doc, {}, kitHost()), render(doc, {}, kitHost()));
const withAtoms = render(doc, {}, kitHost());
check('atom ids are re-issued per use with their references', /<button id="d-a\d+" aria-describedby="d-a\d+" data-ax-copy-from="d-source\d+">/.test(withAtoms) && !withAtoms.includes('ax-copy-9'), withAtoms.slice(0, 400));
check('atom placeholders are filled and escaped', withAtoms.includes('<label for="d-a') && withAtoms.includes('>a</label>'));
eq('instantiateAtom leaves text content alone', instantiateAtom('<i id="x"></i>x', createIdSource('z')), '<i id="z-a1"></i>x');
check('missing atoms do not throw (no kit)', render(doc).includes('astryx-code-block'));

done('markdown-render');
