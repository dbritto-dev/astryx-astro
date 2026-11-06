// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Ported from @astryxdesign/core 0.7.9 src/Markdown/Markdown.tsx (the parse →
// transform → heading-projection memo chain of the Markdown component, and the streaming
// fade's span budget).

/**
 * Markdown's document pipeline, shared by the server render and `<ax-markdown-stream>`:
 * source → canonical AST (`parseMarkdownAst`, or `trimStreamingArtifacts` +
 * `parseMarkdownAstIncremental` while streaming) → plugin transforms (`isFinal` only when not
 * streaming) → heading projection (ids that `parseOutlineFromMarkdown` / Outline link to).
 * Parsing gets only the plugins' syntax entries, transforms run once afterwards, as Astryx does.
 */
import {
  createIncrementalState,
  parseInlineAst,
  parseMarkdownAst,
  parseMarkdownAstIncremental,
  trimStreamingArtifacts,
  type IncrementalState,
} from '../../lib/markdown/parser';
import {projectMarkdownHeadings, type MarkdownHeadingProjection} from '../../lib/markdown/headingProjection';
import {
  applyMarkdownTransforms,
  prepareMarkdownPlugins,
  reportMarkdownPluginFailure,
  type MarkdownExtensionNode,
  type MarkdownPluginEntry,
  type PreparedMarkdownPlugins,
} from '../../lib/markdown/plugins/protocol';
import type {MarkdownAstBlockContent, MarkdownAstPhrasingContent} from '../../lib/markdown/ast';

export type MarkdownBlocks = ReadonlyArray<MarkdownAstBlockContent<MarkdownExtensionNode>>;
export type MarkdownInlineNodes = ReadonlyArray<MarkdownAstPhrasingContent<MarkdownExtensionNode>>;

/** prepareMarkdownPlugins with Astryx's configuration-failure handling. */
export function preparePlugins(plugins: ReadonlyArray<MarkdownPluginEntry> | undefined): PreparedMarkdownPlugins | undefined {
  if (plugins == null) return undefined;
  try {
    return prepareMarkdownPlugins(plugins);
  } catch (error) {
    reportMarkdownPluginFailure('configuration', 'transform', error);
    return undefined;
  }
}

export interface ParseConfig {
  sourceIds?: ReadonlySet<string>;
  autolink?: 'gfm';
  /** A math renderer is installed (components.math): `$…$` / `$$…$$` parse. */
  math: boolean;
  prepared: PreparedMarkdownPlugins | undefined;
}

function parseOptions(c: ParseConfig): Record<string, unknown> {
  const identity = c.prepared?.syntaxIdentity ?? '';
  const plugins = c.prepared == null || identity === '' ? undefined : c.prepared.syntaxEntries;
  return {sourceIds: c.sourceIds, autolink: c.autolink, ...(c.math ? {math: true} : {}), plugins};
}

export interface ParsedDocument {
  blocks: MarkdownBlocks;
  headings: MarkdownHeadingProjection | undefined;
}

/**
 * Parse a block document. While streaming pass the element's incremental state (reset it
 * whenever `autolink` or the math renderer toggles, as Markdown.tsx does).
 */
export function parseDocument(source: string, c: ParseConfig, streaming?: {state: IncrementalState<boolean>}): ParsedDocument {
  const options = parseOptions(c);
  let parsed: MarkdownBlocks;
  let transformSource = source;
  if (streaming) {
    if (source === '') {
      parsed = [];
    } else {
      transformSource = trimStreamingArtifacts(source, options as {math?: boolean});
      parsed = parseMarkdownAstIncremental(transformSource, streaming.state, options as never).children;
    }
  } else {
    parsed = parseMarkdownAst(source, options as never).children;
  }
  const blocks = applyMarkdownTransforms(
    {type: 'root', children: parsed as MarkdownAstBlockContent<MarkdownExtensionNode>[]},
    c.prepared,
    transformSource,
    !streaming,
    'block',
  ).children;
  const headings = blocks.length === 0 ? undefined : projectMarkdownHeadings({type: 'root', children: blocks}, c.prepared);
  return {blocks, headings};
}

/** Parse `display="inline"` content (phrasing only). */
export function parseInlineDocument(source: string, c: ParseConfig, isStreaming: boolean): MarkdownInlineNodes {
  const options = parseOptions(c);
  const input = isStreaming ? trimStreamingArtifacts(source, options as {math?: boolean}) : source;
  const parsed = parseInlineAst(input, options as never);
  const transformed = applyMarkdownTransforms(
    {type: 'root', children: [{type: 'paragraph', children: parsed as MarkdownAstPhrasingContent<MarkdownExtensionNode>[]}]},
    c.prepared,
    input,
    !isStreaming,
    'inline',
  );
  const paragraph = transformed.children[0];
  return paragraph?.type === 'paragraph' ? [...paragraph.children] : parsed;
}

export {createIncrementalState};
export type {IncrementalState};

/** Parse a CSS duration (`175ms`, `0.15s`) to milliseconds. */
export function parseDuration(value: string): number | null {
  const ms = value.match(/^([\d.]+)ms$/);
  if (ms) return parseFloat(ms[1]);
  const s = value.match(/^([\d.]+)s$/);
  if (s) return parseFloat(s[1]) * 1000;
  return null;
}

/** How many fade spans overlap: the fade (`--duration-fast-max`) over the reveal tick. */
export function maxFadeSpans(fastMax: string, fastMin: string): number {
  const duration = parseDuration(fastMax.trim()) ?? 230;
  const tick = parseDuration(fastMin.trim());
  const tickMs = tick != null ? Math.max(4, Math.round(tick / 10)) : 50;
  return Math.min(Math.ceil(duration / tickMs), 12);
}

/** useStreamingText's tick: `--duration-fast-min` / 10 (natural), at least 4ms; 50ms without a theme. */
export function streamingTickMs(fastMin: string): number {
  const base = parseDuration(fastMin.trim());
  if (base == null) return 50;
  return Math.max(4, Math.round(base / 10));
}

/** useStreamingText natural speed. */
export const STREAMING_CHARS_PER_TICK = 10;
