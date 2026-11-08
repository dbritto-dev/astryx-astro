// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Ports @astryxdesign/core 0.7.9 src/hooks/useStreamingText.ts (reveal clock,
// grapheme snapping, reduced motion) and the streaming half of src/Markdown/Markdown.tsx
// (incremental parse, trimStreamingArtifacts, boundaries ring, fade-span budget).

/**
 * `<ax-markdown-stream>` — a Markdown document that keeps rendering as text arrives. It renders
 * with the same functions as the server (components/Markdown/markdownPipeline.ts +
 * markdownRender.ts) and the same kit, so its output for a text equals `<Markdown>`'s.
 *
 * Contract (for Chat and other streaming hosts):
 *
 *   Server:  <Markdown isStreaming children={soFar} />   → <template data-ax-markdown-kit> +
 *            <ax-markdown-stream class="astryx-markdown" role="document" …> with the current
 *            text already rendered. Or <MarkdownKit id="chat-md" /> (_MarkdownKit.astro) once,
 *            and create elements on the client with `data-ax-kit="chat-md"`.
 *   Client:  el.append(chunk)        append text (strings only; nodes go to Element.append)
 *            el.text = full          replace the target text ('' starts a new message)
 *            el.isStreaming = false  or el.finish(): show everything, final parse
 *            el.config = {…}         density, headingLevelStart, contentWidth, contentAlign,
 *                                    sources, citationStyle, autolink, display
 *            el.components / el.plugins / el.inlinePlugins / el.codeLanguages
 *                                    function-valued options (Astro components cannot run here:
 *                                    use `(props) => html` overrides)
 *            el.kit = '<template id>' | HTMLTemplateElement (or the `data-ax-kit` attribute)
 *            el.flush()              render the current target now (no smoothing)
 *
 *   While streaming, the shown text grows toward the target at useStreamingText's natural pace
 *   (10 UTF-16 units per tick of `--duration-fast-min` / 10, snapped to grapheme boundaries);
 *   under prefers-reduced-motion it shows the target at once. The text is trimmed of dangling
 *   syntax (`trimStreamingArtifacts`), parsed incrementally, transformed with `isFinal: false`,
 *   and the newest text fades in (`.ax-markdown-fade`, the last `maxSpans` reveals, from
 *   `--duration-fast-max` / tick). Each render morphs the DOM in place (markdownMorph.ts).
 *   After `isStreaming = false` the element renders the full text exactly as a non-streaming
 *   Markdown does (no fade spans, final transforms) — the tests compare the two.
 *
 * Events: `astryx-markdown-render` {text, isStreaming} after each render (bubbles), e.g. to keep
 * a chat log scrolled. Links dispatch `astryx-link-click` when the root has
 * `data-ax-link-click` (behaviors/markdownLinkClick.ts).
 */
import {MarkdownMorph} from '../components/Markdown/markdownMorph';
import {
  countBlockTextLength,
  countInlineTextLength,
  renderMarkdownBlocks,
  renderMarkdownInline,
  type MarkdownComponentNode,
  type MarkdownComponents,
  type MarkdownInlinePlugin,
  type MarkdownRenderOptions,
  type MarkdownSource,
} from '../components/Markdown/markdownRender';
import {
  createIncrementalState,
  maxFadeSpans,
  parseDocument,
  parseInlineDocument,
  preparePlugins,
  STREAMING_CHARS_PER_TICK,
  streamingTickMs,
  type IncrementalState,
  type MarkdownBlocks,
  type MarkdownInlineNodes,
} from '../components/Markdown/markdownPipeline';
import {createIdSource, ENGLISH_STRINGS, readKit, type MarkdownKit} from '../components/Markdown/markdownKit';
import {globalSingleton} from './runtime/global';
import {computeBoundaries} from '../lib/markdown/streaming';
import type {MarkdownPluginEntry} from '../lib/markdown/plugins/protocol';
import type {CodeLanguage} from '../lib/codeblock';
import {warnOnce} from '../lib/devWarning';
// Behaviours of the markup the renderer writes (loaded with the element: any chunk may need them).
import './scrollable-area';
import './table';
import './checkbox-list';
import './checkbox-input';
import '../behaviors/codeBlock';
import '../behaviors/clipboardCopy';
import '../behaviors/markdownHeadingLink';
import '../behaviors/markdownLinkClick';

export interface MarkdownStreamConfig {
  display?: 'block' | 'inline';
  density?: 'default' | 'compact';
  headingLevelStart?: 1 | 2 | 3 | 4 | 5 | 6;
  /** CSS length or null (none). @default '680px' */
  contentWidth?: string | null;
  contentAlign?: 'start' | 'center';
  sources?: Record<string, MarkdownSource>;
  citationStyle?: 'label' | 'number';
  autolink?: 'gfm';
  /** Set by the server when `components.math` exists; client `components.math` also enables it. */
  math?: boolean;
  hasLinkComponent?: boolean;
}

const TAG = 'ax-markdown-stream';
/** Client document id counter, page-wide (shared by every copy of this module). */
const clientDocs = globalSingleton('markdown-stream-docs', () => ({count: 0}));

const segmenter = new Intl.Segmenter(undefined, {granularity: 'grapheme'});

/** useStreamingText snapToGraphemeBoundary. */
export function snapToGraphemeBoundary(text: string, offset: number): number {
  if (offset <= 0 || offset >= text.length) return offset;
  return segmenter.segment(text).containing(offset)?.index ?? offset;
}

export class MarkdownStreamElement extends HTMLElement {
  #target = '';
  #displayedLen = 0;
  #isStreaming = true;
  #config: MarkdownStreamConfig = {};
  #kit: MarkdownKit = {strings: ENGLISH_STRINGS, atoms: {}};
  #docId = '';
  #components: MarkdownComponents | undefined;
  #plugins: ReadonlyArray<MarkdownPluginEntry> | undefined;
  #inlinePlugins: MarkdownInlinePlugin[] | undefined;
  #codeLanguages: ReadonlyArray<CodeLanguage> | undefined;
  #incremental: IncrementalState<boolean> = createIncrementalState();
  #parseKey = '';
  #boundaries: number[] = [];
  #prevLen = 0;
  #renderedLen = -1;
  #morph: MarkdownMorph | null = null;
  #raf = 0;
  #lastTick = 0;
  #reducedMotion: MediaQueryList | null = null;
  #initialized = false;
  /** Motion tokens (`--duration-fast-min` / `-max`), read once per connection. */
  #tokens = {fastMin: '', fastMax: ''};

  connectedCallback(): void {
    if (!this.#initialized) this.#init();
    this.#reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const style = getComputedStyle(this);
    this.#tokens = {fastMin: style.getPropertyValue('--duration-fast-min'), fastMax: style.getPropertyValue('--duration-fast-max')};
    this.#schedule();
  }

  disconnectedCallback(): void {
    if (this.#raf) cancelAnimationFrame(this.#raf);
    this.#raf = 0;
  }

  #init(): void {
    this.#initialized = true;
    const raw = this.getAttribute('data-ax-config');
    if (raw) {
      try {
        this.#config = JSON.parse(raw) as MarkdownStreamConfig;
      } catch {
        this.#config = {};
      }
    }
    this.#loadKit(this.getAttribute('data-ax-kit'));
    this.#docId = this.getAttribute('data-ax-doc') ?? `ax-md-c${++clientDocs.count}`;
    if (!this.hasAttribute('data-ax-doc')) this.setAttribute('data-ax-doc', this.#docId);
    const display = this.#config.display ?? 'block';
    this.classList.add('astryx-markdown');
    if (!this.hasAttribute('data-density')) this.setAttribute('data-density', this.#config.density ?? 'default');
    if (display === 'inline') this.toggleAttribute('data-ax-inline', true);
    else if (!this.hasAttribute('role')) this.setAttribute('role', 'document');
    if (this.hasAttribute('data-ax-done')) this.#isStreaming = false;
    const source = this.getAttribute('data-ax-source');
    this.removeAttribute('data-ax-source');
    this.#morph = new MarkdownMorph(this);
    if (source != null && source !== '') {
      // The server rendered `source` with streaming rules and no fades: adopt that markup.
      this.#target = source;
      this.#displayedLen = source.length;
      const view = this.#build(source, this.#isStreaming, false);
      this.#morph.adopt(view.blocks);
      this.#prevLen = view.length;
      this.#renderedLen = source.length;
    } else if (this.childNodes.length > 0) {
      this.replaceChildren();
    }
  }

  #loadKit(ref: string | HTMLTemplateElement | null): void {
    const template = typeof ref === 'string' ? this.ownerDocument.getElementById(ref) : ref;
    if (template instanceof HTMLTemplateElement) this.#kit = readKit(template);
    else if (ref != null) warnOnce(`markdown-kit:${String(ref)}`, 'Markdown', `No kit <template> "${String(ref)}": rendering without theme atoms (copy buttons, task checkboxes).`);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** The target text (everything received so far). */
  get text(): string {
    return this.#target;
  }
  set text(value: string) {
    const next = String(value ?? '');
    if (next.length === 0) {
      this.#displayedLen = 0;
      this.#incremental = createIncrementalState();
      this.#boundaries = [];
      this.#prevLen = 0;
    }
    this.#target = next;
    this.#schedule();
  }

  /** Strings append text to the stream; anything else is Element.append. */
  override append(...items: (Node | string)[]): void {
    if (items.length > 0 && items.every((i) => typeof i === 'string')) {
      this.#target += (items as string[]).join('');
      this.#schedule();
      return;
    }
    super.append(...items);
  }

  get isStreaming(): boolean {
    return this.#isStreaming;
  }
  set isStreaming(value: boolean) {
    const next = Boolean(value);
    if (next === this.#isStreaming) return;
    this.#isStreaming = next;
    this.toggleAttribute('data-ax-done', !next);
    if (!next) this.#displayedLen = this.#target.length;
    else this.#incremental = createIncrementalState();
    this.#renderedLen = -1;
    this.#schedule();
  }

  /** Stop streaming: show the full text with the final (non-incremental) parse. */
  finish(): void {
    this.isStreaming = false;
  }

  /** Render the full current target now. */
  flush(): void {
    this.#displayedLen = this.#target.length;
    this.#render();
  }

  get config(): MarkdownStreamConfig {
    return {...this.#config};
  }
  set config(value: MarkdownStreamConfig) {
    this.#config = {...this.#config, ...value};
    if (value.density) this.setAttribute('data-density', value.density);
    this.#invalidate();
  }

  set kit(ref: string | HTMLTemplateElement) {
    this.#loadKit(ref);
    this.#invalidate();
  }

  get components(): MarkdownComponents | undefined {
    return this.#components;
  }
  set components(value: MarkdownComponents | undefined) {
    this.#components = value;
    this.#invalidate();
  }
  get plugins(): ReadonlyArray<MarkdownPluginEntry> | undefined {
    return this.#plugins;
  }
  set plugins(value: ReadonlyArray<MarkdownPluginEntry> | undefined) {
    this.#plugins = value;
    this.#invalidate();
  }
  get inlinePlugins(): MarkdownInlinePlugin[] | undefined {
    return this.#inlinePlugins;
  }
  set inlinePlugins(value: MarkdownInlinePlugin[] | undefined) {
    this.#inlinePlugins = value;
    this.#invalidate();
  }
  get codeLanguages(): ReadonlyArray<CodeLanguage> | undefined {
    return this.#codeLanguages;
  }
  set codeLanguages(value: ReadonlyArray<CodeLanguage> | undefined) {
    this.#codeLanguages = value;
    this.#invalidate();
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  #invalidate(): void {
    this.#incremental = createIncrementalState();
    this.#renderedLen = -1;
    this.#schedule();
  }

  #schedule(): void {
    if (!this.isConnected || this.#raf) return;
    this.#raf = requestAnimationFrame(this.#tick);
  }

  #tick = (now: number): void => {
    this.#raf = 0;
    const smooth = this.#isStreaming && !this.#reducedMotion?.matches;
    if (!smooth) {
      this.#displayedLen = this.#target.length;
      this.#render();
      return;
    }
    const tickMs = streamingTickMs(this.#tokens.fastMin);
    if (now - this.#lastTick >= tickMs) {
      this.#lastTick = now;
      if (this.#displayedLen < this.#target.length) {
        this.#displayedLen = Math.min(this.#displayedLen + STREAMING_CHARS_PER_TICK, this.#target.length);
      }
      this.#render();
    }
    if (this.#displayedLen < this.#target.length || this.#renderedLen !== this.#shownText().length) this.#schedule();
  };

  #shownText(): string {
    if (!this.#isStreaming) return this.#target;
    return this.#target.slice(0, snapToGraphemeBoundary(this.#target, this.#displayedLen));
  }

  #options(): MarkdownRenderOptions {
    const c = this.#config;
    return {
      density: c.density ?? 'default',
      headingLevelStart: c.headingLevelStart ?? 1,
      contentWidth: c.contentWidth === undefined ? '680px' : c.contentWidth,
      contentAlign: c.contentAlign ?? 'start',
      sources: c.sources,
      citationStyle: c.citationStyle ?? 'label',
      components: this.#components,
      inlinePlugins: this.#inlinePlugins,
      codeLanguages: this.#codeLanguages,
      hasLinkComponent: c.hasLinkComponent === true,
    };
  }

  /** Parse + render `text`; `fade` turns the streaming cursor on. */
  #build(text: string, streaming: boolean, fade: boolean): {blocks: string[]; length: number} {
    const c = this.#config;
    const prepared = preparePlugins(this.#plugins);
    const math = c.math === true || this.#components?.math != null;
    const parseConfig = {sourceIds: c.sources ? new Set(Object.keys(c.sources)) : undefined, autolink: c.autolink, math, prepared};
    const key = `${c.autolink ?? ''}|${math}`;
    if (key !== this.#parseKey) {
      this.#parseKey = key;
      this.#incremental = createIncrementalState();
    }
    const host = {
      ids: createIdSource(this.#docId),
      kit: this.#kit,
      hole: (node: MarkdownComponentNode) => {
        warnOnce('markdown-stream-hole', 'Markdown', 'An Astro component override or plugin result cannot render in <ax-markdown-stream>; pass `(props) => html` functions on the element.');
        return node.children ?? '';
      },
    };
    const options = this.#options();
    if ((c.display ?? 'block') === 'inline') {
      const nodes: MarkdownInlineNodes = parseInlineDocument(text, parseConfig, streaming);
      const length = countInlineTextLength(nodes);
      const boundaries = fade ? this.#nextBoundaries(text.length) : [];
      return {blocks: [renderMarkdownInline(nodes, {options, host, prepared, cursor: {offset: 0, boundaries, active: fade}})], length};
    }
    if (streaming && text === '') this.#incremental = createIncrementalState();
    const doc = parseDocument(text, parseConfig, streaming ? {state: this.#incremental} : undefined);
    const blocks: MarkdownBlocks = doc.blocks;
    const length = countBlockTextLength(blocks);
    const boundaries = fade ? this.#nextBoundaries(text.length) : [];
    return {
      blocks: renderMarkdownBlocks(blocks, {options, host, prepared, headings: doc.headings, cursor: {offset: 0, boundaries, active: fade}}),
      length,
    };
  }

  /** Markdown.tsx boundaries memo: push the previous rendered length when the text grew. */
  #nextBoundaries(shownLen: number): number[] {
    if (shownLen !== this.#renderedLen) {
      const max = maxFadeSpans(this.#tokens.fastMax, this.#tokens.fastMin);
      this.#boundaries = computeBoundaries(this.#boundaries, this.#prevLen, max);
    }
    return this.#boundaries;
  }

  #render(): void {
    if (!this.#morph) return;
    const text = this.#shownText();
    const streaming = this.#isStreaming;
    const view = this.#build(text, streaming, streaming);
    this.#morph.update(view.blocks);
    this.#prevLen = view.length;
    this.#renderedLen = text.length;
    this.dispatchEvent(new CustomEvent('astryx-markdown-render', {detail: {text, isStreaming: streaming}, bubbles: true}));
  }
}

if (typeof customElements !== 'undefined' && !customElements.get(TAG)) customElements.define(TAG, MarkdownStreamElement);

declare global {
  interface HTMLElementTagNameMap {
    'ax-markdown-stream': MarkdownStreamElement;
  }
}
