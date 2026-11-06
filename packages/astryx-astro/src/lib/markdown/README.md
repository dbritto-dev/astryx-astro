# lib/markdown

Astryx's in-house Markdown parser, canonical AST, URL policy, heading projection, streaming
helpers and plugin protocol, ported verbatim from `@astryxdesign/core` 0.7.9 (MIT). No
React, no DOM: run it in Astro frontmatter or in a custom element. Entry: `index.ts`
(narrower entries mirror Astryx's subpaths: `parser/index.ts`, `utils.ts`, `plugins/index.ts`,
`remark.ts`). Tests: `node tools/tests/lib-markdown.test.mjs`.

## Exported API

Parsing
- `parseMarkdownAst(src, options?)` → `MarkdownAstRoot` — the canonical MDAST-aligned tree a renderer walks.
- `parseMarkdownAstIncremental(src, state, options?)` → `MarkdownAstRoot` — streaming re-parse that reuses settled blocks (`createIncrementalState()`).
- `parseInlineAst(src, options?)` → phrasing nodes only (for a label/title string).
- `parseMarkdown`, `parseInline`, `parseMarkdownIncremental` — the released legacy node projection (`BlockNode`/`InlineNode`: `bold`, `italic` …).
- `createIncrementalState()`, `getIncrementalParseWork()` (internal diagnostics), `trimStreamingArtifacts(src)` — closes dangling `**`, fences, math while streaming.
- Options: `sourceIds` (Set of citation ids: `[id]`/`【id】` become `citation` nodes), `math: true` (`$…$`, `$$…$$`), `autolink: 'gfm'`, `sourceRanges`, `plugins`, `isFinal` (incremental).
- `decodeMarkdownCharacterReferences(text)`; `slugify(text)`, `uniqueSlug(slug, used)`.

AST
- Node types (`ast.ts`): root, heading(depth), paragraph, code(lang, meta, value), math, blockquote, list(ordered, start, spread, delimiter) → listItem(checked), table(align) → tableRow → tableCell, thematicBreak, block image; phrasing: text, strong, emphasis, delete, inlineCode, inlineMath, link(url), image(url, alt), citation(sourceId), break, plugin `extension` nodes (plugin, name, data, display).
- `visitMarkdownNodes(root, type, visit)`, `markdownAstText(nodes)` (plain text of phrasing nodes), `getMarkdownAstLegacyCodeLanguage(code)` (the fence language CodeBlock uses).

Rendering helpers
- `sanitizeMarkdownLinkUrl(url)` (link `href`, `null` = render text), `sanitizeMarkdownUrl(url)` (image `src`, also blocks `data:`), `isSafeMarkdownParserUrl(url)`.
- `projectMarkdownHeadings(root, preparedPlugins?)` → `{ids, labels, permalinkUrls, outline}` — heading ids, run once after transforms.
- `computeBoundaries(prev, prevLen, maxSpans)`, `computeSegments(text, startOffset, boundaries, key)` — the streaming fade-in text segments.
- `parseOutlineFromMarkdown(src, {plugins?, isFinal?})` → `OutlineItem[]` (`{id, label, level}`; root headings only, ids match `projectMarkdownHeadings`).

Plugins (`plugins/`)
- `createMarkdownPlugin(definition)`, `getMarkdownPluginCapabilities(entry)`, `isMarkdownExtensionNode(node)`.
- `createMarkdownTextTransform`, `createMarkdownFenceTransform` (+ `getMarkdownFenceProposal`), `createMarkdownSourceDecoration` / `getMarkdownSourceDecorations`, `createMarkdownFrontmatter`, `createMarkdownHeadingLinks`, `markdownSoftBreaksPlugin`, `markdownSourceLinesPlugin`.
- Renderer internals: `prepareMarkdownPlugins`, `applyMarkdownTransforms`, `getMarkdownExtensionRenderer`, `markdownExtensionText`, `reportMarkdownPluginFailure`.
- `remark.ts`: `createMarkdownRemarkTransform(remarkPlugin, ...settings)` — run a remark (unified) transformer over the canonical tree.

## What the Markdown renderer port needs

Mirror `Markdown/Markdown.tsx`: `parseMarkdownAst(children, {sourceIds, math, autolink, plugins})`
(or the incremental variant with `trimStreamingArtifacts` while streaming), then
`projectMarkdownHeadings(root, prepared)` for heading ids, then render each node:
heading → Heading, paragraph → Text, code → CodeBlock (language from
`getMarkdownAstLegacyCodeLanguage`, fence info via `lib/codeblock` `parseFenceLanguage`),
list with `checked` items → CheckboxList, other lists → List, blockquote → Blockquote,
table → Table, link → Link with `sanitizeMarkdownLinkUrl` (null → plain text), image with
`sanitizeMarkdownUrl`, citation → Citation (`sourceId` looked up in the `sources` prop),
`extension` → `getMarkdownExtensionRenderer(prepared, node)?.render({node})` (in Astro the
render callback returns whatever the host renders: an Astro component, an HTML string) or
`markdownExtensionText` as fallback, `delete` → `<del>`, `inlineCode` → Code.

## Source files ported

`Markdown/ast.ts`, `characterReferences.ts`, `headingProjection.ts`, `parser.ts`,
`parser/index.ts`, `url.ts` (imports `../safeUrl`), `utils.ts`, `remark.ts`, `streaming.ts`,
`plugins/{protocol,frontmatter,headingLinks,semanticFence,softBreaks,sourceDecoration,sourceLines,textTransform,index}.ts`,
`Outline/types.ts` → `outlineTypes.ts`, `Outline/parseOutlineFromMarkdown.ts`.
Changes: import paths; `plugins/protocol.ts` drops `import type React` (an extension
renderer's `render` returns `unknown`) and reads `isDevelopment` from `../devWarning` instead
of `process.env.NODE_ENV`.

## Not ported

`Markdown.tsx` (renderer), `plugin-renderer/**` and `plugins/HeadingLinksRenderer.tsx` (React),
`Markdown.fr23.sampling.ts` (test fixture), Outline's React hooks (`useOutlineFromMarkdown`,
`useOutlineFromDOM`, `useScrollSpy`).
