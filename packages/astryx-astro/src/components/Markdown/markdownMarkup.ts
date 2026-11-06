/**
 * The markup of the Astryx components Markdown composes, as pure HTML-string functions, so the
 * server render (Markdown.astro) and the streaming element (elements/markdown-stream.ts) write
 * the same document from one function (markdownRender.ts). Framework-free: no Astro, no DOM.
 *
 * Each function reproduces what the Astro port of that component renders for the props
 * Astryx Markdown.tsx passes it — and nothing more (Markdown never uses their other props):
 *
 *   listHtml / listItemHtml        List.astro + ListItem.astro + Item.astro (+ _ListMarkerScope)
 *   checkboxListHtml / …ItemHtml   CheckboxList.astro (Field) + CheckboxListItem.astro
 *   tableHtml                      Table.astro children mode (pipeline.ts) + Table* parts
 *   codeBlockHtml                  CodeBlock.astro (spans mode)
 *   blockquoteOpen                 Blockquote.astro
 *   codeHtml                       Code.astro (inline code)
 *   citationHtml                   Citation.astro
 *
 * Theme-dependent leaves (icons, the CheckboxInput, the copy IconButton + Tooltip, a
 * LinkProvider component) are not mirrored: they arrive pre-rendered by the real components as
 * kit atoms (markdownKit.ts). `tools/tests/markdown.test.mjs` compares these mirrors against
 * the real components (the demo's parity fixtures) so they cannot drift silently.
 */
import {mergeStyles, type StyleValue} from '../../lib/style';
import {safeHref} from '../../lib/safeUrl';
import {
  languageKey,
  languageLabel as languageWord,
  splitDiffLines,
  tokenize,
  type CodeLanguage,
  type SyntaxToken,
  type TokenLine,
} from '../../lib/codeblock';

// ── Escaping and attributes ──────────────────────────────────────────────────

export const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const escapeAttr = (s: string): string => escapeHtml(s).replace(/"/g, '&quot;');

export type AttrValue = string | number | boolean | null | undefined;

/** ` name="value"` pairs; `true` / `''` render a bare attribute, `false` / nullish nothing. */
export function attrs(map: Record<string, AttrValue>): string {
  let out = '';
  for (const [name, value] of Object.entries(map)) {
    if (value == null || value === false) continue;
    out += value === true || value === '' ? ` ${name}` : ` ${name}="${escapeAttr(String(value))}"`;
  }
  return out;
}

export {mergeStyles, type StyleValue};

// ── List / ListItem (List.astro, ListItem.astro, Item.astro) ─────────────────

/** Every marker a Markdown list draws (ListMarker in List/listContext.ts). */
export type MarkdownListMarker = 'disc' | 'circle' | 'square' | 'decimal' | 'lower-alpha' | 'lower-roman';

export interface ListHtmlOptions {
  ordered: boolean;
  start?: number;
  /** Markdown always renders compact lists. */
  density: 'compact' | 'balanced' | 'spacious';
  itemsHtml: string;
}

/** `<List listStyle={ordered ? 'decimal' : 'disc'} density start>`. */
export function listHtml({ordered, start, density, itemsHtml}: ListHtmlOptions): string {
  const tag = ordered ? 'ol' : 'ul';
  const listStyle = ordered ? 'decimal' : 'disc';
  const hasCustomStart = start != null && start !== 1;
  return `<${tag}${attrs({
    start: ordered && hasCustomStart ? start : undefined,
    role: 'list',
    'data-density': density,
    'data-list-style': listStyle,
    class: 'astryx-list',
    style: hasCustomStart ? mergeStyles({'--_ax-list-start': start! - 1}) : undefined,
  })}>${itemsHtml}</${tag}>`;
}

export interface ListItemHtmlOptions {
  /** The List's listStyle (`decimal` numbers the rows and shares one marker column). */
  listStyle: 'disc' | 'decimal';
  density: 'compact' | 'balanced' | 'spacious';
  /** ListMarkerScope marker. */
  marker: MarkdownListMarker;
  /** ListMarkerScope task: the pre-rendered read-only CheckboxInput (kit atom). */
  taskHtml?: string;
  hasMarkerGutter: boolean;
  /** The rich label (ListItem `label` ReactNode → the `label` slot). */
  labelHtml: string;
  extraAttrs?: Record<string, AttrValue>;
}

/** `<ListMarkerScope marker task hasMarkerGutter><ListItem label={…} /></ListMarkerScope>`. */
export function listItemHtml(o: ListItemHtmlOptions): string {
  const isNumbered = o.listStyle === 'decimal';
  const kind = o.marker;
  const isDot = kind === 'disc' || kind === 'circle' || kind === 'square';
  const markerHtml =
    o.taskHtml != null
      ? `<span class="ax-list-task">${o.taskHtml}</span>`
      : isDot
        ? `<span class="ax-list-marker"><span class="ax-list-marker-${kind === 'disc' ? 'dot' : kind}"></span></span>`
        : `<span class="ax-list-number"${attrs({'data-marker': kind, 'data-ax-gutter': o.hasMarkerGutter})}></span>`;
  const content = `<span class="ax-item-content"><span class="ax-item-label">${o.labelHtml}</span></span>`;
  return `<li${attrs({
    ...o.extraAttrs,
    'data-ax-in-list': true,
    'data-ax-numbered': isNumbered,
    'data-ax-counter': true,
    'data-density': o.density,
    'data-align': 'center',
    class: 'astryx-item ax-focus-within astryx-list-item',
    'data-ax-list-row': true,
  })}>${markerHtml}${isNumbered ? `<span class="ax-item-marker-content">${content}</span>` : content}</li>`;
}

// ── CheckboxList / CheckboxListItem (read-only, label hidden) ────────────────

export interface CheckboxListHtmlOptions {
  /** Field id base: the group label is `${id}-label`. */
  id: string;
  /** The hidden group label (`@astryx.markdown.taskList`). */
  label: string;
  /** Checked item values (collection mode). */
  values: string[];
  density: 'compact' | 'balanced' | 'spacious';
  itemsHtml: string;
}

/**
 * `<CheckboxList label isLabelHidden value isReadOnly density>`: the Field (label cell with the
 * visually hidden label, body) around `<ax-checkbox-list role="group">` and its List.
 */
export function checkboxListHtml(o: CheckboxListHtmlOptions): string {
  const labelId = `${o.id}-label`;
  return (
    `<div class="astryx-field astryx-checkbox-list" data-ax-label-hidden data-ax-inherit="form-direction field-layout">` +
    `<div class="ax-field-label-cell"><span${attrs({id: labelId, class: 'astryx-field-label ax-field-sr-only'})}>${escapeHtml(o.label)}</span></div>` +
    `<div class="ax-field-body"><ax-checkbox-list${attrs({
      role: 'group',
      'aria-labelledby': labelId,
      'data-ax-collection': true,
      'data-ax-value': JSON.stringify(o.values),
    })}><ul${attrs({role: 'list', 'data-density': o.density, 'data-list-style': 'none', class: 'astryx-list'})}>${o.itemsHtml}</ul></ax-checkbox-list></div></div>`
  );
}

export interface CheckboxListItemHtmlOptions {
  /** The checkbox id; the visible label is `${id}-label`. */
  id: string;
  value: string;
  density: 'compact' | 'balanced' | 'spacious';
  /** The pre-rendered CheckboxInput (kit atom, already instantiated for `id`). */
  checkboxHtml: string;
  labelHtml: string;
  extraAttrs?: Record<string, AttrValue>;
}

/** `<CheckboxListItem value label={rich}>` in a read-only list (no row delegation). */
export function checkboxListItemHtml(o: CheckboxListItemHtmlOptions): string {
  return `<li${attrs({
    ...o.extraAttrs,
    'data-ax-checkbox-list-item': true,
    'data-ax-checkbox-value': o.value,
    'data-ax-in-list': true,
    'data-density': o.density,
    'data-align': 'center',
    class: 'astryx-item ax-focus-within astryx-list-item ax-checkbox-list-row',
    'data-ax-list-row': true,
  })}><span class="ax-item-start">${o.checkboxHtml}</span><span class="ax-item-content"><span class="ax-item-label"><span${attrs({id: `${o.id}-label`})}>${o.labelHtml}</span></span></span></li>`;
}

// ── Table (children mode: TableHeader / TableBody / TableRow / cells) ────────

export interface TableCellHtml {
  html: string;
  style?: string;
}

export interface TableHtmlOptions {
  /** The scroll region's name (`@astryx.table.label`). */
  label: string;
  density: 'compact' | 'balanced' | 'spacious';
  dividers: 'rows' | 'grid' | 'none';
  textOverflow: 'wrap' | 'truncate';
  header: TableCellHtml[];
  rows: TableCellHtml[][];
}

/** `<Table dividers textOverflow><TableHeader><TableRow>…</TableRow></TableHeader><TableBody>…`. */
export function tableHtml(o: TableHtmlOptions): string {
  const cell = (tag: 'th' | 'td', c: TableCellHtml) =>
    `<${tag}${attrs({class: tag === 'th' ? 'astryx-table-header-cell' : 'astryx-table-cell', 'data-density': o.density, style: c.style})}>${c.html}</${tag}>`;
  const head = `<thead class="astryx-table-header"><tr class="astryx-table-row">${o.header.map((c) => cell('th', c)).join('')}</tr></thead>`;
  const body = `<tbody class="astryx-table-body">${o.rows.map((r) => `<tr class="astryx-table-row">${r.map((c) => cell('td', c)).join('')}</tr>`).join('')}</tbody>`;
  return (
    `<ax-table${attrs({
      role: 'group',
      'aria-label': o.label,
      'data-scroll-axis': 'inline',
      'data-overscroll': 'contain',
      'data-scroll-inline-start': 'true',
      'data-scroll-inline-end': 'true',
      'data-scroll-block-start': 'true',
      'data-scroll-block-end': 'true',
      class: 'astryx-table-scroll-wrapper',
    })}><div data-scroll-content><table${attrs({
      'data-density': o.density,
      'data-dividers': o.dividers,
      'data-vertical-align': 'middle',
      'data-text-overflow': o.textOverflow,
      'data-ax-layout': 'auto',
      class: 'astryx-table',
    })}>${head}${body}</table></div></ax-table>`
  );
}

// ── CodeBlock (spans mode) ───────────────────────────────────────────────────

export interface CodeBlockHtmlOptions {
  code: string;
  language: string | CodeLanguage;
  isDiff: boolean;
  isCollapsible: boolean;
  isWrapped: boolean;
  /** Extra inline style on the `<pre>` (Astryx Markdown's xstyle: min-width, margin-inline). */
  style?: StyleValue;
  /** `@astryx.codeBlock.code` — the viewport's name without a language label. */
  codeLabel: string;
  /** id generator (collapse region, copy source). */
  id: (hint: string) => string;
  /** The copy IconButton + Tooltip (kit atom) for a given copy-source id, or null for none. */
  copyButton: ((sourceId: string) => string) | null;
  /** The collapse chevron Icon (kit atom). */
  chevronHtml: string;
}

const COLLAPSIBLE_THRESHOLD = 10;
const LINE_CHUNK_SIZE = 20;
const LINE_CHUNK_THRESHOLD = 100;

// A streaming document re-renders every block on each tick; settled code blocks keep their
// text, so their tokens are memoized (bounded, most recent kept). Same result as tokenizing.
const TOKEN_CACHE_SIZE = 64;
const tokenCache = new Map<string, TokenLine[]>();
const languageIds = new WeakMap<object, number>();
let nextLanguageId = 0;
function cachedTokenize(source: string, language: string | CodeLanguage): TokenLine[] {
  let lang: string;
  if (typeof language === 'string') lang = `s:${language}`;
  else {
    let id = languageIds.get(language);
    if (id == null) languageIds.set(language, (id = ++nextLanguageId));
    lang = `o:${id}`;
  }
  const key = `${lang}\u0000${source}`;
  const hit = tokenCache.get(key);
  if (hit) {
    tokenCache.delete(key);
    tokenCache.set(key, hit);
    return hit;
  }
  const lines = tokenize(source, language);
  tokenCache.set(key, lines);
  if (tokenCache.size > TOKEN_CACHE_SIZE) tokenCache.delete(tokenCache.keys().next().value!);
  return lines;
}

/** `<CodeBlock code language isDiff isCollapsible isWrapped>` with the defaults Markdown keeps. */
export function codeBlockHtml(o: CodeBlockHtmlOptions): string {
  const size = 'md';
  const container = 'card';
  const {code, language, isDiff, isWrapped} = o;
  const lines = (() => {
    const l = code.split('\n');
    if (l.length > 1 && l[l.length - 1] === '') l.pop();
    return l;
  })();
  const diff = isDiff ? splitDiffLines(lines) : null;
  const tokenSource = diff ? diff.content.join('\n') : code;
  const tokenLines: TokenLine[] = cachedTokenize(tokenSource, language);
  const diffKinds = diff?.kinds ?? null;

  const languageName = languageWord(language);
  const languageAttr = languageKey(language);
  const label = isDiff ? (languageName === 'plaintext' ? 'diff' : `${languageName} diff`) : languageName !== 'plaintext' ? languageName : null;
  const showHeader = label != null;
  const canCollapse = showHeader && o.isCollapsible && lines.length >= COLLAPSIBLE_THRESHOLD;
  const regionId = canCollapse ? o.id('region') : undefined;
  const hasControls = o.copyButton != null;

  const spanLine = (text: string, tokens: SyntaxToken[]): string => {
    if (tokens.length === 0) return escapeHtml(text || '​');
    let out = '';
    let cursor = 0;
    for (const token of tokens) {
      if (token.start > cursor) out += escapeHtml(text.slice(cursor, token.start));
      const end = Math.min(token.end, text.length);
      out += `<span class="astryx-token-${escapeHtml(token.type)} xds-token-${escapeHtml(token.type)}">${escapeHtml(text.slice(token.start, end))}</span>`;
      cursor = end;
    }
    if (cursor < text.length) out += escapeHtml(text.slice(cursor));
    return out || '​';
  };
  const lineContent = (line: string, i: number): string => {
    const tokens = tokenLines[i] ?? [];
    if (diff) {
      const kind = diff.kinds[i];
      const content = kind === 'header' ? line : diff.content[i];
      const marker = `<span data-diff-marker="" class="ax-codeblock-diff-marker"${kind === 'added' || kind === 'removed' ? ` data-ax-kind="${kind}"` : ''}>${escapeHtml(diff.glyphs[i] || ' ')}</span>`;
      return `${marker}<span class="ax-codeblock-line-content">${kind === 'header' ? escapeHtml(content || '​') : spanLine(content, tokens)}</span>`;
    }
    return `<span class="ax-codeblock-line-content">${spanLine(line, tokens)}</span>`;
  };
  const lineHtml = (line: string, i: number): string => {
    const n = 1 + i;
    const kind = diffKinds?.[i];
    const parts = [`data-line="${n}"`, kind && kind !== 'context' ? `data-diff="${kind}"` : '', 'class="ax-codeblock-line"', diffKinds ? 'data-ax-diff-layout=""' : ''];
    return `<div ${parts.filter(Boolean).join(' ')}>${lineContent(line, i)}</div>`;
  };
  let linesHtml = '';
  if (lines.length < LINE_CHUNK_THRESHOLD) linesHtml = lines.map(lineHtml).join('');
  else {
    for (let start = 0; start < lines.length; start += LINE_CHUNK_SIZE) {
      const end = Math.min(start + LINE_CHUNK_SIZE, lines.length);
      let chunk = '';
      for (let i = start; i < end; i++) chunk += lineHtml(lines[i], i);
      linesHtml += `<div class="ax-codeblock-chunk" style="contain-intrinsic-block-size:auto ${end - start}lh">${chunk}</div>`;
    }
  }

  const sourceId = hasControls ? o.id('source') : undefined;
  const copy = hasControls && sourceId ? o.copyButton!(sourceId) : '';
  const viewportLabel = label ?? o.codeLabel;
  const bodyHtml =
    `<ax-scrollable-area class="ax-codeblock-viewport ax-focus-visible" role="group" aria-label="${escapeAttr(viewportLabel)}" data-scroll-axis="both">` +
    `<div data-scroll-content="" class="ax-codeblock-wrapper"${showHeader ? ' data-ax-compact=""' : ''}>` +
    `<code class="ax-codeblock-code" data-ax-size="${size}"${isWrapped ? ' data-ax-wrapped=""' : ''}>${linesHtml}</code></div></ax-scrollable-area>`;

  const headerHtml = showHeader
    ? `<div${attrs({class: 'astryx-code-block-header', 'data-size': size, 'data-language': languageAttr, 'data-container': container})}>` +
      `<div${attrs({
        class: 'ax-codeblock-heading ax-focus-visible',
        role: canCollapse ? 'button' : undefined,
        tabindex: canCollapse ? '0' : undefined,
        'aria-expanded': canCollapse ? 'true' : undefined,
        'aria-controls': regionId,
        'data-ax-codeblock-toggle': canCollapse,
      })}><span${attrs({class: 'astryx-code-block-title', 'data-size': size, 'data-language': languageAttr})}>` +
      `${canCollapse ? `<span class="ax-codeblock-chevron ax-mirror-rtl">${o.chevronHtml}</span>` : ''}${escapeHtml(label!)}</span></div>` +
      `${hasControls ? `<div class="ax-codeblock-controls">${copy}</div>` : ''}</div>`
    : '';
  const main = canCollapse
    ? `<div id="${escapeAttr(regionId!)}" class="ax-codeblock-collapse"><div class="ax-codeblock-collapse-inner">${bodyHtml}</div></div>`
    : bodyHtml;
  const corner = hasControls && !showHeader ? `<div class="ax-codeblock-corner" data-ax-size="${size}">${copy}</div>` : '';
  const source = hasControls ? `<template id="${escapeAttr(sourceId!)}">${escapeHtml(code)}</template>` : '';
  const rootStyle = mergeStyles({width: 'fit-content', 'min-width': 'min(100%, 400px)', 'max-width': '100%'}, o.style ?? null);
  return (
    `<pre${attrs({
      class: 'astryx-code-block',
      'data-size': size,
      'data-language': languageAttr,
      'data-container': container,
      'data-ax-corner': hasControls && !showHeader,
      'data-ax-code-block': canCollapse,
      style: rootStyle,
    })}>${headerHtml}${main}${corner}${source}</pre>`
  );
}

// ── Blockquote, Code, Citation ───────────────────────────────────────────────

/** `<Blockquote class style …attrs>` opening tag (Markdown passes no cite). */
export function blockquoteOpen(extra: Record<string, AttrValue>): string {
  const {class: className, ...rest} = extra;
  return `<blockquote${attrs({class: ['astryx-blockquote', className].filter(Boolean).join(' '), ...rest})}>`;
}

/** `<Code>{value}</Code>` — inline code. */
export function codeHtml(value: string): string {
  return `<code data-color="primary" class="astryx-code">${escapeHtml(value)}</code>`;
}

export interface CitationSourceLike {
  title?: string;
  url?: string;
  src?: string;
  icon?: unknown;
}

/**
 * `<Citation source number variant>`. `iconHtml` is a pre-rendered icon for an Astro component
 * `source.icon` (kit atom); string icons / `src` are image URLs. `labelTemplate` is the
 * translated `@astryx.citation.label` with `{number}` / `{title}` left in.
 */
export function citationHtml(
  source: CitationSourceLike,
  number: number,
  variant: 'label' | 'number',
  labelTemplate: string,
  iconHtml?: string | null,
): string {
  const title = source.title ?? String(number);
  const href = source.url != null ? safeHref(source.url) : undefined;
  const tag = href ? 'a' : 'span';
  const name = labelTemplate.replace(/\{number\}/g, String(number)).replace(/\{title\}/g, title);
  const common = {
    role: href ? 'doc-noteref' : 'group',
    'aria-label': name,
    ...(href ? {href, target: '_blank', rel: 'noopener noreferrer', title} : {title}),
    class: 'astryx-citation',
    'data-variant': variant,
  };
  if (variant === 'number') return `<${tag}${attrs(common)}>${number}</${tag}>`;
  const imageSrc = source.src ?? (typeof source.icon === 'string' ? source.icon : undefined);
  const icon = iconHtml != null && iconHtml !== '' ? iconHtml : imageSrc != null ? `<img${attrs({src: imageSrc, alt: '', class: 'ax-citation-image'})}>` : null;
  return `<${tag}${attrs({...common, 'data-has-icon': icon != null})}>${icon != null ? `<span aria-hidden="true" class="ax-citation-icon">${icon}</span>` : ''}<span class="ax-citation-label">${escapeHtml(title)}</span></${tag}>`;
}
