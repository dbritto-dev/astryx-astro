// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Ported from @astryxdesign/core 0.7.9 src/Markdown/Markdown.tsx (renderInline,
// renderBlock, the streaming cursor, citation numbering, table column floors, inline plugins),
// plugin-renderer/MarkdownPluginNodeRenderer.tsx (renderMarkdownPluginNode) and
// plugins/HeadingLinksRenderer.tsx (the permalink row).

/**
 * The one Markdown render function, shared by the server (Markdown.astro) and the streaming
 * element (elements/markdown-stream.ts): canonical AST blocks → an HTML string. Pure and
 * framework-free; everything request- or theme-dependent comes in through `MarkdownRenderHost`
 * (document-local ids, the kit's strings and atoms, the hole callback for Astro components).
 *
 * Output follows Markdown.tsx node for node: Astryx components where Astryx composes them
 * (List/ListItem, CheckboxList, Table, CodeBlock, Blockquote, Code, Citation — markup from
 * markdownMarkup.ts), Markdown's own elements elsewhere (`<hN>`, `<div role="paragraph">`,
 * `<strong>`, `<em>`, `<del>`, `<a>`, `<img>`, `<hr>`), every theme target with
 * `themeProps()`'s class and data attributes. Raw HTML in the source is never markup: the parser
 * keeps it as text and every text value is escaped here.
 *
 * Port notes:
 *  - StyleX block spacing / first-last margins / the heading scale are CSS (Markdown.css) keyed
 *    on private `data-ax-*` attributes; `contentWidth` / `contentAlign` are the same per-block
 *    inline values Astryx's dynamic styles produce.
 *  - `components` overrides and plugin renderers return an HTML string, `null` / a boolean (the
 *    readable fallback), or `{component, props, children}` — an Astro component the server
 *    renders in place (a "hole"); an override may also be a tag name (`paragraph: 'p'`) or an
 *    Astro component directly.
 *  - Streaming fade spans carry `data-ax-segment="<React key>"` so the element can keep each
 *    span's identity across re-renders (React reconciles them by key).
 */
import type {
  MarkdownAstBlockContent,
  MarkdownAstPhrasingContent,
  MarkdownAstPosition,
  MarkdownAstTable,
} from '../../lib/markdown/ast';
import {getMarkdownAstLegacyCodeLanguage, markdownAstText} from '../../lib/markdown/ast';
import {computeSegments} from '../../lib/markdown/streaming';
import {sanitizeMarkdownLinkUrl, sanitizeMarkdownUrl} from '../../lib/markdown/url';
import type {MarkdownHeadingProjection} from '../../lib/markdown/headingProjection';
import {getMarkdownFenceProposal} from '../../lib/markdown/plugins/semanticFence';
import {
  getMarkdownExtensionRenderer,
  markdownExtensionText,
  reportMarkdownPluginFailure,
  type MarkdownExtensionNode,
  type PreparedMarkdownPlugins,
} from '../../lib/markdown/plugins/protocol';
import {listedLanguage, parseFenceLanguage, type CodeLanguage} from '../../lib/codeblock';
import {
  attrs,
  blockquoteOpen,
  checkboxListHtml,
  checkboxListItemHtml,
  citationHtml,
  codeBlockHtml,
  codeHtml,
  escapeHtml,
  listHtml,
  listItemHtml,
  mergeStyles,
  tableHtml,
  type AttrValue,
  type CitationSourceLike,
  type MarkdownListMarker,
  type TableCellHtml,
} from './markdownMarkup';
import {instantiateAtom, PH, placeholderHtml, placeholderText, type IdSource, type MarkdownKit} from './markdownKit';

type RenderInlineNode = MarkdownAstPhrasingContent<MarkdownExtensionNode>;
type RenderBlockNode = MarkdownAstBlockContent<MarkdownExtensionNode>;
type RenderTable = MarkdownAstTable<MarkdownExtensionNode>;

// ── Public types ─────────────────────────────────────────────────────────────

/** An Astro component (or any value the server host renders) with props and child HTML. */
export interface MarkdownComponentNode {
  component: unknown;
  props?: Record<string, unknown>;
  /** HTML for the component's default slot. */
  children?: string;
}

/** What an override or plugin renderer may return. */
export type MarkdownRenderable = string | number | boolean | null | undefined | MarkdownComponentNode;

/** A block's 1-based, inclusive source lines (markdownSourceLinesPlugin). */
export interface MarkdownSourceLines {
  readonly start: number;
  readonly end: number;
}

/** Override: a tag name, a function returning a renderable, or an Astro component (server). */
export type MarkdownOverride<P> = string | ((props: P) => MarkdownRenderable);

export interface MarkdownComponents {
  code?: MarkdownOverride<{code: string; language?: string; sourceLines?: MarkdownSourceLines}>;
  /** `children` is the code text (not HTML). */
  inlineCode?: MarkdownOverride<{children: string}>;
  /** Supplying it enables `$…$` / `$$…$$` parsing. */
  math?: MarkdownOverride<{value: string; display: 'inline' | 'block'; sourceLines?: MarkdownSourceLines}>;
  citation?: MarkdownOverride<{source: CitationSourceLike; number: number; variant: 'label' | 'number'}>;
  /** `children` is HTML. */
  link?: MarkdownOverride<{href: string; children: string}>;
  heading?: MarkdownOverride<{level: 1 | 2 | 3 | 4 | 5 | 6; children: string; id?: string; sourceLines?: MarkdownSourceLines}>;
  paragraph?: MarkdownOverride<{children: string; sourceLines?: MarkdownSourceLines}>;
  image?: MarkdownOverride<{src: string; alt: string; sourceLines?: MarkdownSourceLines}>;
  blockquote?: MarkdownOverride<{children: string; sourceLines?: MarkdownSourceLines}>;
  hr?: MarkdownOverride<{sourceLines?: MarkdownSourceLines}>;
}

/** Astryx MarkdownInlinePlugin: regex matches in text nodes → a renderable. */
export interface MarkdownInlinePlugin {
  pattern: RegExp;
  getEndIndex?: (text: string, match: RegExpMatchArray) => number | false;
  render: (match: RegExpMatchArray, key: string) => MarkdownRenderable;
}

export type MarkdownSource = CitationSourceLike;

export interface MarkdownRenderOptions {
  density: 'default' | 'compact';
  headingLevelStart: 1 | 2 | 3 | 4 | 5 | 6;
  /** CSS length (`680px`) or null. */
  contentWidth: string | null;
  contentAlign: 'start' | 'center';
  sources?: Record<string, MarkdownSource>;
  citationStyle: 'label' | 'number';
  components?: MarkdownComponents;
  inlinePlugins?: MarkdownInlinePlugin[];
  codeLanguages?: ReadonlyArray<CodeLanguage>;
  /** Internal links render with the kit's `link` atom (a LinkProvider component). */
  hasLinkComponent?: boolean;
}

export interface MarkdownRenderHost {
  ids: IdSource;
  kit: MarkdownKit;
  /** Place a component node (server: an Astro component rendered in place). Returns HTML. */
  hole: (node: MarkdownComponentNode) => string;
}

export interface MarkdownStreamingCursor {
  offset: number;
  boundaries: number[];
  active: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const BULLET_MARKERS: readonly [MarkdownListMarker, MarkdownListMarker, MarkdownListMarker] = ['disc', 'circle', 'square'];
const NUMBER_MARKERS: readonly [MarkdownListMarker, MarkdownListMarker, MarkdownListMarker] = ['decimal', 'lower-alpha', 'lower-roman'];

const TAG_NAME = /^[a-z][a-z0-9-]*$/;

/** Astro component factories carry this flag. */
export function isAstroComponent(value: unknown): boolean {
  return typeof value === 'function' && (value as {isAstroComponentFactory?: boolean}).isAstroComponentFactory === true;
}

function isComponentNode(value: unknown): value is MarkdownComponentNode {
  return typeof value === 'object' && value != null && 'component' in value;
}

interface CitationContext {
  sources: Record<string, MarkdownSource>;
  numberMap: Map<string, number>;
  nextNumber: number;
  style: 'label' | 'number';
}

interface Ctx {
  o: MarkdownRenderOptions;
  host: MarkdownRenderHost;
  cursor: MarkdownStreamingCursor;
  citations: CitationContext | null;
  prepared: PreparedMarkdownPlugins | undefined;
  headings: MarkdownHeadingProjection | undefined;
  recordsSourceLines: boolean;
}

/** HTML for a renderable; `null` when it asks for the fallback. */
function renderable(ctx: Ctx, value: MarkdownRenderable): string | null {
  if (value == null || typeof value === 'boolean') return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return escapeHtml(String(value));
  if (isComponentNode(value)) return ctx.host.hole(value);
  return null;
}

/** Run an override with Astryx's props; markup children travel as HTML (`children`). */
function callOverride<P extends object>(ctx: Ctx, override: MarkdownOverride<P> | unknown, props: P, childrenHtml?: string): string {
  if (typeof override === 'string') {
    if (!TAG_NAME.test(override)) return childrenHtml ?? '';
    return `<${override}>${childrenHtml ?? ''}</${override}>`;
  }
  if (isAstroComponent(override)) {
    const {children: _children, ...rest} = props as P & {children?: unknown};
    return ctx.host.hole({component: override, props: rest, children: childrenHtml});
  }
  if (typeof override === 'function') {
    return renderable(ctx, (override as (p: P) => MarkdownRenderable)(props)) ?? '';
  }
  return childrenHtml ?? '';
}

function blockSourceLines(node: {readonly position?: MarkdownAstPosition}): MarkdownSourceLines | undefined {
  const start = node.position?.start.line;
  const end = node.position?.end.line;
  return start == null || end == null ? undefined : {start, end};
}

function sourceLineAttrs(lines: MarkdownSourceLines | undefined): Record<string, AttrValue> {
  return lines == null ? {} : {'data-source-line': String(lines.start), 'data-source-line-end': String(lines.end)};
}

// ── Text length counting (streaming) ─────────────────────────────────────────

export function countInlineTextLength(nodes: ReadonlyArray<RenderInlineNode>): number {
  let len = 0;
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
      case 'inlineCode':
      case 'inlineMath':
        len += node.value.length;
        break;
      case 'image':
        len += node.alt.length;
        break;
      case 'strong':
      case 'emphasis':
      case 'delete':
      case 'link':
        len += countInlineTextLength(node.children);
        break;
      case 'break':
      case 'citation':
        len += 1;
        break;
      case 'extension':
        len += node.source?.length ?? 0;
        break;
    }
  }
  return len;
}

export function countBlockTextLength(nodes: ReadonlyArray<RenderBlockNode>): number {
  let len = 0;
  for (const node of nodes) {
    switch (node.type) {
      case 'heading':
      case 'paragraph':
        len += countInlineTextLength(node.children);
        break;
      case 'code':
      case 'math':
        len += node.value.length;
        break;
      case 'blockquote':
        len += countBlockTextLength(node.children);
        break;
      case 'list':
        for (const item of node.children) len += countBlockTextLength(item.children);
        break;
      case 'table':
        for (const row of node.children) for (const cell of row.children) len += countInlineTextLength(cell.children);
        break;
      case 'extension':
        len += node.source?.length ?? 0;
        break;
      case 'image':
        len += node.alt.length;
        break;
      case 'thematicBreak':
        break;
    }
  }
  return len;
}

// ── Inline ───────────────────────────────────────────────────────────────────

function wrapTextWithFade(ctx: Ctx, content: string, key: string | number): string {
  const {cursor} = ctx;
  const startOffset = cursor.offset;
  cursor.offset += content.length;
  if (!cursor.active) return escapeHtml(content);
  const segments = computeSegments(content, startOffset, cursor.boundaries, key);
  if (segments == null) return escapeHtml(content);
  const spans = segments
    .map((seg) => `<span${attrs({class: seg.fading ? 'ax-markdown-fade' : undefined, 'data-ax-segment': seg.key})}>${escapeHtml(seg.text)}</span>`)
    .join('');
  return `<span data-ax-segment="wrap-${escapeHtml(String(key))}">${spans}</span>`;
}

interface InlinePluginSegment {
  type: 'text' | 'plugin';
  content?: string;
  element?: MarkdownRenderable;
  matchLength?: number;
}

function applyInlinePlugins(text: string, plugins: MarkdownInlinePlugin[]): InlinePluginSegment[] {
  interface RawMatch {
    start: number;
    end: number;
    match: RegExpMatchArray;
    plugin: MarkdownInlinePlugin;
  }
  const all: RawMatch[] = [];
  for (const plugin of plugins) {
    plugin.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = plugin.pattern.exec(text)) !== null) {
      let end: number;
      if (plugin.getEndIndex) {
        const result = plugin.getEndIndex(text, m);
        if (result === false) {
          if (!plugin.pattern.global) break;
          continue;
        }
        end = result;
      } else end = m.index + m[0].length;
      all.push({start: m.index, end, match: m, plugin});
      if (!plugin.pattern.global) break;
      if (m[0].length === 0) plugin.pattern.lastIndex++;
    }
  }
  all.sort((a, b) => a.start - b.start);
  const resolved: RawMatch[] = [];
  let lastEnd = 0;
  for (const m of all) {
    if (m.start >= lastEnd) {
      resolved.push(m);
      lastEnd = m.end;
    }
  }
  if (resolved.length === 0) return [{type: 'text', content: text}];
  const segments: InlinePluginSegment[] = [];
  let cursor = 0;
  resolved.forEach((m, i) => {
    if (m.start > cursor) segments.push({type: 'text', content: text.slice(cursor, m.start)});
    segments.push({type: 'plugin', element: m.plugin.render(m.match, `plugin-${i}`), matchLength: m.end - m.start});
    cursor = m.end;
  });
  if (cursor < text.length) segments.push({type: 'text', content: text.slice(cursor)});
  return segments;
}

/** renderMarkdownPluginNode: the plugin's output, or `fallback` when it declines or throws. */
function renderPluginNode(ctx: Ctx, node: MarkdownExtensionNode, fallback: string): string {
  const renderer = getMarkdownExtensionRenderer(ctx.prepared, node);
  if (renderer == null) return fallback;
  try {
    return renderable(ctx, renderer.render({node}) as MarkdownRenderable) ?? fallback;
  } catch (error) {
    reportMarkdownPluginFailure(node.plugin, 'render', error);
    return fallback;
  }
}

function citationNumber(c: CitationContext, sourceId: string): number {
  let n = c.numberMap.get(sourceId);
  if (n == null) {
    n = c.nextNumber++;
    c.numberMap.set(sourceId, n);
  }
  return n;
}

function renderChildren(ctx: Ctx, nodes: ReadonlyArray<RenderInlineNode>, components: MarkdownComponents | undefined): string {
  let out = '';
  nodes.forEach((c, i) => (out += renderInline(ctx, c, i, components)));
  return out;
}

function renderInline(ctx: Ctx, node: RenderInlineNode, index: number, components: MarkdownComponents | undefined): string {
  const {o, cursor} = ctx;
  switch (node.type) {
    case 'text': {
      const plugins = o.inlinePlugins;
      if (plugins && plugins.length > 0) {
        const segments = applyInlinePlugins(node.value, plugins);
        if (!(segments.length === 1 && segments[0].type === 'text')) {
          let out = '';
          segments.forEach((seg, i) => {
            if (seg.type === 'text') out += wrapTextWithFade(ctx, seg.content!, `${index}-seg-${i}`);
            else {
              cursor.offset += seg.matchLength!;
              out += renderable(ctx, seg.element) ?? '';
            }
          });
          return out;
        }
      }
      return wrapTextWithFade(ctx, node.value, index);
    }
    case 'strong':
      return `<strong class="ax-markdown-strong">${renderChildren(ctx, node.children, components)}</strong>`;
    case 'emphasis':
      return `<em>${renderChildren(ctx, node.children, components)}</em>`;
    case 'delete':
      return `<del class="ax-markdown-del">${renderChildren(ctx, node.children, components)}</del>`;
    case 'inlineCode': {
      cursor.offset += node.value.length;
      if (components?.inlineCode != null) return callOverride(ctx, components.inlineCode, {children: node.value});
      return codeHtml(node.value);
    }
    case 'inlineMath': {
      if (components?.math == null) return wrapTextWithFade(ctx, `$${node.value}$`, index);
      cursor.offset += node.value.length;
      return callOverride(ctx, components.math, {value: node.value, display: 'inline' as const});
    }
    case 'link': {
      const safe = sanitizeMarkdownLinkUrl(node.url);
      const children = renderChildren(ctx, node.children, components);
      // Unsafe URL: plain text, never a link (navigation safety, contract 16).
      if (safe == null) return `<span>${children}</span>`;
      if (components?.link != null) return callOverride(ctx, components.link, {href: safe, children}, children);
      const isExternal = safe.startsWith('https://') || safe.startsWith('http://');
      const linkAtom = ctx.host.kit.atoms.link;
      if (!isExternal && o.hasLinkComponent && linkAtom) {
        return instantiateAtom(linkAtom, ctx.host.ids, {[PH.href]: placeholderText(safe), [PH.children]: children});
      }
      return `<a${attrs({href: safe, ...(isExternal ? {target: '_blank', rel: 'noopener noreferrer'} : {}), class: 'ax-markdown-link'})}>${children}</a>`;
    }
    case 'image': {
      const safe = sanitizeMarkdownUrl(node.url);
      if (safe == null) return `<span>[${escapeHtml(node.alt)}]</span>`;
      if (components?.image != null) return callOverride(ctx, components.image, {src: safe, alt: node.alt});
      return `<img${attrs({src: safe, alt: node.alt, class: 'ax-markdown-img'})}>`;
    }
    case 'extension':
      return renderPluginNode(ctx, node, wrapTextWithFade(ctx, node.source ?? markdownExtensionText(ctx.prepared, node), index));
    case 'break':
      cursor.offset += 1;
      return '<br>';
    case 'citation': {
      cursor.offset += 1;
      const c = ctx.citations;
      if (!c) return `<span>[${escapeHtml(node.sourceId)}]</span>`;
      const number = citationNumber(c, node.sourceId);
      const source = c.sources[node.sourceId] ?? {title: node.sourceId};
      const variant = c.style === 'number' ? 'number' : 'label';
      if (components?.citation != null) return callOverride(ctx, components.citation, {source, number, variant});
      const icon = ctx.host.kit.atoms[`citation-icon:${node.sourceId}`];
      return citationHtml(source, number, variant, ctx.host.kit.strings.citation, icon ? instantiateAtom(icon, ctx.host.ids) : null);
    }
  }
  return '';
}

// ── Blocks ───────────────────────────────────────────────────────────────────

const TABLE_COLUMN_MIN_CH = 4;
const TABLE_COLUMN_MAX_CH = 24;
const TABLE_COLUMN_TARGET_LINES = 2;
const TABLE_HEADER_ONE_LINE_MAX_CH = 20;

function computeTableColumnMinWidths(node: RenderTable): number[] {
  const [header, ...rows] = node.children;
  if (header == null) return [];
  return header.children.map((cell, colIdx) => {
    const headerLen = countInlineTextLength(cell.children);
    let maxLen = headerLen;
    for (const row of rows) {
      const rowCell = row.children[colIdx];
      if (rowCell != null) maxLen = Math.max(maxLen, countInlineTextLength(rowCell.children));
    }
    const bodyFloor = Math.ceil(maxLen / TABLE_COLUMN_TARGET_LINES);
    const headerFloor = Math.min(headerLen, TABLE_HEADER_ONE_LINE_MAX_CH);
    return Math.min(TABLE_COLUMN_MAX_CH, Math.max(TABLE_COLUMN_MIN_CH, bodyFloor, headerFloor));
  });
}

const cellAlign = (a: string | null | undefined) => (a === 'center' ? 'text-align:center' : a === 'right' ? 'text-align:end' : undefined);

/** The prose width / alignment Astryx's dynamic styles put on prose blocks. */
function proseStyle(o: MarkdownRenderOptions): string | undefined {
  return mergeStyles({
    'max-width': o.contentWidth ?? undefined,
    'margin-inline': o.contentAlign !== 'start' ? 'auto' : undefined,
  });
}

/** Block-level (code, table) width floor and alignment. */
function blockStyle(o: MarkdownRenderOptions): string | undefined {
  return mergeStyles({
    'min-width': o.contentWidth != null ? `min(${o.contentWidth}, 100%)` : undefined,
    'margin-inline': o.contentAlign === 'center' ? 'auto' : undefined,
  });
}

/** Private spacing hooks (Markdown.css): which spacing group, first / last in its list. */
function spacingAttrs(kind: string, isFirst: boolean, isLast: boolean): Record<string, AttrValue> {
  return {'data-ax-spacing': kind, 'data-ax-first': isFirst, 'data-ax-last': isLast};
}

function renderBlocks(ctx: Ctx, nodes: ReadonlyArray<RenderBlockNode>, listDepth: number): string {
  let out = '';
  nodes.forEach((node, i) => (out += renderBlock(ctx, node, i, nodes.length, listDepth)));
  return out;
}

function renderBlock(ctx: Ctx, node: RenderBlockNode, index: number, count: number, listDepth: number): string {
  const {o, host, cursor} = ctx;
  const components = o.components;
  const density = o.density;
  const isFirst = index === 0;
  const isLast = index === count - 1;
  const sourceLines = ctx.recordsSourceLines ? blockSourceLines(node) : undefined;
  const lineStamps = sourceLineAttrs(sourceLines);
  const lineProp = sourceLines == null ? {} : {sourceLines};

  switch (node.type) {
    case 'heading': {
      const level = Math.min(node.depth + o.headingLevelStart - 1, 6) as 1 | 2 | 3 | 4 | 5 | 6;
      const children = renderChildren(ctx, node.children, components);
      const id = ctx.headings?.ids.get(node);
      const headingLabel = ctx.headings?.labels.get(node) ?? '';
      const permalink = ctx.headings?.permalinkUrls.get(node);
      if (components?.heading != null) return callOverride(ctx, components.heading, {level, children, id, ...lineProp}, children);
      const spacing = node.depth <= 3 ? 'heading-major' : 'heading-minor';
      const theme = {class: 'astryx-markdown-heading', 'data-density': density, 'data-level': String(level)};
      if (permalink == null || id == null) {
        return `<h${level}${attrs({id, ...theme, ...spacingAttrs(spacing, isFirst, isLast), style: proseStyle(o), ...lineStamps})}>${children}</h${level}>`;
      }
      // HeadingLinksRenderer: the row owns spacing and width; the heading sits in it.
      const heading = `<h${level}${attrs({id, ...theme, 'data-ax-in-row': true, ...lineStamps})}>${children}</h${level}>`;
      const button = host.kit.atoms['heading-copy'];
      const label = host.kit.strings.headingCopy.replace(/\{heading\}/g, headingLabel || id);
      const control = button
        ? `<span class="ax-markdown-heading-control"><span aria-hidden="true" class="ax-markdown-heading-probe">#</span>${instantiateAtom(button, host.ids, {
            [PH.label]: placeholderText(label),
            [PH.url]: placeholderText(permalink),
          })}</span>`
        : '';
      return `<div${attrs({class: 'ax-markdown-heading-row', 'data-ax-level': String(level), 'data-ax-density': density, ...spacingAttrs(spacing, isFirst, isLast), style: proseStyle(o)})}>${heading}${control}</div>`;
    }
    case 'paragraph': {
      const children = renderChildren(ctx, node.children, components);
      if (components?.paragraph != null) return callOverride(ctx, components.paragraph, {children, ...lineProp}, children);
      return `<div${attrs({role: 'paragraph', class: 'astryx-markdown-paragraph', 'data-density': density, ...spacingAttrs('paragraph', isFirst, isLast), style: proseStyle(o), ...lineStamps})}>${children}</div>`;
    }
    case 'code': {
      cursor.offset += node.value.length;
      const legacyLanguage = getMarkdownAstLegacyCodeLanguage(node) ?? 'plaintext';
      const fence = parseFenceLanguage(node.lang ?? legacyLanguage);
      const isDiff = fence.isDiff;
      const diffLanguage = isDiff ? fence.language.match(/^\w*/)?.[0] || 'plaintext' : undefined;
      const fenceWord = diffLanguage ?? legacyLanguage;
      const language: string | CodeLanguage = listedLanguage(o.codeLanguages, fenceWord) ?? fenceWord;
      const fallback = (): string => {
        if (components?.code != null) return callOverride(ctx, components.code, {code: node.value, language: legacyLanguage, ...lineProp});
        const copyAtom = host.kit.atoms.copy;
        const block = codeBlockHtml({
          code: node.value,
          language,
          isDiff,
          isCollapsible: true,
          isWrapped: true,
          style: blockStyle(o),
          codeLabel: host.kit.strings.code,
          id: host.ids,
          copyButton: copyAtom ? (sourceId) => instantiateAtom(copyAtom, host.ids, {[PH.source]: sourceId}) : null,
          chevronHtml: host.kit.atoms.chevron ? instantiateAtom(host.kit.atoms.chevron, host.ids) : '',
        });
        return `<div${attrs({class: 'astryx-markdown-codeblock', 'data-density': density, ...spacingAttrs('code', isFirst, isLast), ...lineStamps})}>${block}</div>`;
      };
      const proposal = getMarkdownFenceProposal(node);
      if (proposal == null) return fallback();
      const renderer = getMarkdownExtensionRenderer(ctx.prepared, proposal.node);
      if (renderer == null) return fallback();
      try {
        return renderable(ctx, renderer.render({node: proposal.node}) as MarkdownRenderable) ?? fallback();
      } catch (error) {
        reportMarkdownPluginFailure(proposal.node.plugin, 'render', error);
        return fallback();
      }
    }
    case 'math': {
      cursor.offset += node.value.length;
      if (components?.math == null) return `<div role="paragraph">${escapeHtml(`$$${node.value}$$`)}</div>`;
      return callOverride(ctx, components.math, {value: node.value, display: 'block' as const, ...lineProp});
    }
    case 'blockquote': {
      const children = renderBlocks(ctx, node.children, listDepth);
      if (components?.blockquote != null) return callOverride(ctx, components.blockquote, {children, ...lineProp}, children);
      return `${blockquoteOpen({
        class: 'astryx-markdown-blockquote',
        'data-density': density,
        ...lineStamps,
        ...spacingAttrs('blockquote', isFirst, isLast),
        style: proseStyle(o),
      })}${children}</blockquote>`;
    }
    case 'list': {
      const isTaskList =
        node.children.length > 0 &&
        node.children.every((item) => item.checked != null && item.children.every((block) => block.type === 'paragraph'));
      const itemLabel = (item: (typeof node.children)[number]): string => {
        const first = item.children[0];
        const isInline = item.children.length === 1 && first?.type === 'paragraph';
        return isInline && first.type === 'paragraph'
          ? renderChildren(ctx, first.children, components)
          : renderBlocks(ctx, item.children, listDepth + 1);
      };
      if (isTaskList) {
        const values = node.children.map((item, i) => ({item, key: `task-${i}`})).filter(({item}) => item.checked).map(({key}) => key);
        let items = '';
        node.children.forEach((item, i) => {
          const value = `task-${i}`;
          const id = host.ids('task');
          const atom = host.kit.atoms[item.checked ? 'checkbox-checked' : 'checkbox-unchecked'];
          const checkboxHtml = atom
            ? instantiateAtom(atom, host.ids, {[PH.checkboxId]: id, [PH.value]: value, [PH.labelledBy]: `${id}-label`})
            : `<input type="checkbox" id="${id}" value="${value}" aria-labelledby="${id}-label" aria-readonly="true"${item.checked ? ' checked' : ''}>`;
          items += checkboxListItemHtml({
            id,
            value,
            density: 'compact',
            checkboxHtml,
            labelHtml: itemLabel(item),
            extraAttrs: ctx.recordsSourceLines ? sourceLineAttrs(blockSourceLines(item)) : undefined,
          });
        });
        const group = checkboxListHtml({id: host.ids('tasks'), label: host.kit.strings.taskList, values, density: 'compact', itemsHtml: items});
        return `<div${attrs({class: 'astryx-markdown-list', 'data-density': density, ...spacingAttrs('list', isFirst, isLast)})}>${group}</div>`;
      }
      const listStyle = node.ordered ? 'decimal' : 'disc';
      const marker = (node.ordered ? NUMBER_MARKERS : BULLET_MARKERS)[listDepth % 3];
      let items = '';
      for (const item of node.children) {
        const labelHtml = itemLabel(item);
        let taskHtml: string | undefined;
        if (item.checked != null) {
          const firstParagraph = item.children.find((block) => block.type === 'paragraph');
          const label =
            firstParagraph?.type === 'paragraph'
              ? markdownAstText(firstParagraph.children, (extension) => markdownExtensionText(ctx.prepared, extension))
              : host.kit.strings.taskList;
          const atom = host.kit.atoms[item.checked ? 'task-checked' : 'task-unchecked'];
          taskHtml = atom
            ? instantiateAtom(atom, host.ids, {[PH.label]: placeholderHtml(label)})
            : `<input type="checkbox" aria-label="${placeholderText(label)}" aria-readonly="true"${item.checked ? ' checked' : ''}>`;
        }
        items += listItemHtml({
          listStyle,
          density: 'compact',
          marker,
          taskHtml,
          hasMarkerGutter: node.ordered,
          labelHtml,
          extraAttrs: ctx.recordsSourceLines ? sourceLineAttrs(blockSourceLines(item)) : undefined,
        });
      }
      const list = listHtml({ordered: node.ordered, start: node.ordered ? (node.start ?? undefined) : undefined, density: 'compact', itemsHtml: items});
      return `<div${attrs({class: 'astryx-markdown-list', 'data-density': density, ...spacingAttrs('list', isFirst, isLast), style: proseStyle(o)})}>${list}</div>`;
    }
    case 'table': {
      const widths = computeTableColumnMinWidths(node);
      const [header, ...rows] = node.children;
      const cellComponents = components;
      const headerCells: TableCellHtml[] = (header?.children ?? []).map((h, i) => ({
        html: renderChildren(ctx, h.children, cellComponents),
        style: mergeStyles({'min-width': `${widths[i]}ch`}, cellAlign(node.align[i])),
      }));
      const bodyRows: TableCellHtml[][] = rows.map((row) =>
        row.children.map((cell, j) => ({html: renderChildren(ctx, cell.children, cellComponents), style: cellAlign(node.align[j])})),
      );
      const table = tableHtml({label: host.kit.strings.tableLabel, density: 'balanced', dividers: 'grid', textOverflow: 'wrap', header: headerCells, rows: bodyRows});
      return `<div${attrs({class: 'astryx-markdown-table', 'data-density': density, ...spacingAttrs('table', isFirst, isLast), style: blockStyle(o), ...lineStamps})}>${table}</div>`;
    }
    case 'extension': {
      const content = renderPluginNode(ctx, node, wrapTextWithFade(ctx, node.source ?? markdownExtensionText(ctx.prepared, node), index));
      return `<div${attrs({class: 'ax-markdown-extension', 'data-ax-density': density, ...spacingAttrs('paragraph', isFirst, isLast), style: proseStyle(o)})}>${content}</div>`;
    }
    case 'thematicBreak': {
      if (components?.hr != null) return callOverride(ctx, components.hr, {...lineProp});
      return `<hr${attrs({class: 'astryx-markdown-hr', 'data-density': density, ...spacingAttrs('hr', isFirst, isLast), ...lineStamps})}>`;
    }
    case 'image': {
      const safe = sanitizeMarkdownUrl(node.url);
      const wrap = {class: 'astryx-markdown-image', 'data-density': density, ...spacingAttrs('image', isFirst, isLast), ...lineStamps};
      if (safe == null) return `<div${attrs(wrap)}>[${escapeHtml(node.alt)}]</div>`;
      if (components?.image != null) return callOverride(ctx, components.image, {src: safe, alt: node.alt, ...lineProp});
      return `<div${attrs(wrap)}><img${attrs({src: safe, alt: node.alt, class: 'ax-markdown-img'})}></div>`;
    }
  }
  return '';
}

// ── Entry points ─────────────────────────────────────────────────────────────

export interface RenderInput {
  options: MarkdownRenderOptions;
  host: MarkdownRenderHost;
  prepared?: PreparedMarkdownPlugins;
  headings?: MarkdownHeadingProjection;
  cursor?: MarkdownStreamingCursor;
}

function makeCtx(input: RenderInput): Ctx {
  const {options: o} = input;
  return {
    o,
    host: input.host,
    cursor: input.cursor ?? {offset: 0, boundaries: [], active: false},
    citations: o.sources ? {sources: o.sources, numberMap: new Map(), nextNumber: 1, style: o.citationStyle} : null,
    prepared: input.prepared,
    headings: input.headings,
    recordsSourceLines: input.prepared?.sourceLines === true,
  };
}

/** Render the document's blocks; one HTML string per top-level block. */
export function renderMarkdownBlocks(blocks: ReadonlyArray<RenderBlockNode>, input: RenderInput): string[] {
  const ctx = makeCtx(input);
  return blocks.map((block, i) => renderBlock(ctx, block, i, blocks.length, 0));
}

/** Render inline (`display="inline"`) content. */
export function renderMarkdownInline(nodes: ReadonlyArray<RenderInlineNode>, input: RenderInput): string {
  const ctx = makeCtx(input);
  return renderChildren(ctx, nodes, input.options.components);
}
