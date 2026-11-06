/**
 * The Markdown render kit: what the pure renderer (markdownRender.ts) needs from the server
 * besides the AST — translated strings and *atoms*, the theme-dependent leaves that only the
 * real Astro components can render (Icon artwork from the active icon theme, the CheckboxInput
 * and its Indicator replacement, CodeBlock's copy IconButton + Tooltip, the heading-link
 * Button, a LinkProvider component).
 *
 * The server renders each atom once, with placeholder tokens where per-instance values go
 * (`__AXMD_LABEL__`, `__AXMD_SRC__` …). `instantiateAtom()` stamps a copy for one use: every id
 * the atom defines (`id="…"`) is replaced, with its references (`for`, `aria-*`, `#id` …), by a
 * fresh document-local id, and the placeholders by escaped values. The same kit serializes into
 * a `<template data-ax-markdown-kit>` so `<ax-markdown-stream>` renders identically on the
 * client (`serializeKit` / `readKit`).
 *
 * Ids: `createIdSource(docId)` numbers ids in render order (`${docId}-${n}`), so a render of the
 * same text yields the same ids on the server and in the browser.
 */
import {escapeAttr, escapeHtml} from './markdownMarkup';

export type MarkdownAtomName =
  | 'copy'
  | 'chevron'
  | 'task-checked'
  | 'task-unchecked'
  | 'checkbox-checked'
  | 'checkbox-unchecked'
  | 'heading-copy'
  | 'link'
  | `citation-icon:${string}`;

export interface MarkdownKitStrings {
  /** `@astryx.markdown.taskList` */
  taskList: string;
  /** `@astryx.table.label` */
  tableLabel: string;
  /** `@astryx.codeBlock.code` */
  code: string;
  /** `@astryx.citation.label` with `{number}` and `{title}` left in. */
  citation: string;
  /** `@astryx.markdownHeadingLinks.copy` with `{heading}` left in. */
  headingCopy: string;
  /** `@astryx.markdownHeadingLinks.copied` */
  headingCopied: string;
}

export interface MarkdownKit {
  strings: MarkdownKitStrings;
  atoms: Partial<Record<MarkdownAtomName, string>>;
}

/** Placeholder tokens the server renders into atoms. Plain word characters: never escaped. */
export const PH = {
  label: '__AXMD_LABEL__',
  source: '__AXMD_SRC__',
  value: '__AXMD_VALUE__',
  labelledBy: '__AXMD_LABELLEDBY__',
  checkboxId: '__AXMD_CBID__',
  href: '__AXMD_HREF__',
  children: '__AXMD_CHILDREN__',
  url: '__AXMD_URL__',
} as const;

/** English fallbacks (the kit normally carries the translated strings). */
export const ENGLISH_STRINGS: MarkdownKitStrings = {
  taskList: 'Task list',
  tableLabel: 'Table',
  code: 'Code',
  citation: 'Citation {number}: {title}',
  headingCopy: 'Copy link to {heading}',
  headingCopied: 'Link copied',
};

export interface IdSource {
  (hint: string): string;
  readonly docId: string;
}

/** Document-local ids in render order. */
export function createIdSource(docId: string): IdSource {
  let n = 0;
  const next = ((hint: string) => `${docId}-${hint}${++n}`) as IdSource;
  Object.defineProperty(next, 'docId', {value: docId});
  return next;
}

const ID_ATTR = /\sid="([^"]+)"/g;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * One use of an atom: fresh ids for every id it defines (and their references), then the
 * placeholder values (already-escaped HTML / attribute text).
 */
export function instantiateAtom(atom: string, ids: IdSource, values: Record<string, string> = {}): string {
  let out = atom;
  const defined = new Set<string>();
  for (const m of atom.matchAll(ID_ATTR)) if (!m[1].startsWith('__AXMD_')) defined.add(m[1]);
  // Longest first, so an id that prefixes another (`x` / `x-label`) never splits it.
  for (const id of [...defined].sort((a, b) => b.length - a.length)) {
    const fresh = ids('a');
    out = out.replace(new RegExp(`(?<![\\w-])${escapeRe(id)}(?![\\w])`, 'g'), (match, offset: number, whole: string) => {
      // Only inside attribute values: never rewrite text content.
      const before = whole.lastIndexOf('<', offset);
      const close = whole.lastIndexOf('>', offset);
      return before > close ? fresh : match;
    });
  }
  for (const [token, value] of Object.entries(values)) out = out.split(token).join(value);
  return out;
}

/** Escape a plain-text value for a placeholder that sits in text or an attribute. */
export const placeholderText = (value: string): string => escapeAttr(value);
export const placeholderHtml = (value: string): string => escapeHtml(value);

const SCRIPT_RE = /<script\b[^>]*>[\s\S]*?<\/script>/gi;

/** Split an atom's rendered HTML into the markup and the `<script>` tags Astro emitted with it. */
export function extractScripts(html: string): {html: string; scripts: string[]} {
  const scripts: string[] = [];
  const out = html.replace(SCRIPT_RE, (s) => {
    scripts.push(s);
    return '';
  });
  return {html: out.trim(), scripts};
}

// ── Serialization (server → <template data-ax-markdown-kit> → element) ─────

/** The kit as template content: a JSON block with the strings, one `<template>` per atom. */
export function serializeKit(kit: MarkdownKit): string {
  const json = JSON.stringify({strings: kit.strings}).replace(/</g, '\\u003c');
  let out = `<script type="application/json" data-ax-kit-strings>${json}</script>`;
  for (const [name, html] of Object.entries(kit.atoms)) {
    if (html == null) continue;
    out += `<template data-ax-atom="${escapeAttr(name)}">${html}</template>`;
  }
  return out;
}

/** Read a kit back from its `<template data-ax-markdown-kit>` (browser only). */
export function readKit(template: HTMLTemplateElement): MarkdownKit {
  const content = template.content;
  const json = content.querySelector('script[data-ax-kit-strings]')?.textContent;
  let strings = ENGLISH_STRINGS;
  try {
    if (json) strings = {...ENGLISH_STRINGS, ...(JSON.parse(json) as {strings: MarkdownKitStrings}).strings};
  } catch {
    // keep the English fallbacks
  }
  const atoms: Partial<Record<MarkdownAtomName, string>> = {};
  content.querySelectorAll<HTMLTemplateElement>('template[data-ax-atom]').forEach((t) => {
    atoms[t.getAttribute('data-ax-atom') as MarkdownAtomName] = t.innerHTML;
  });
  return {strings, atoms};
}
