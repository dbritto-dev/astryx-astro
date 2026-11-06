// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Ported from @astryxdesign/core 0.7.9 src/CodeBlock/highlightStyles.ts and
// src/theme/syntax/tokens.ts (syntaxTokenDefaults) — the pure parts only.

/**
 * @file highlightStyles.ts
 * @input None (pure token definitions)
 * @output TOKEN_TYPES, the token → highlight-name / class / color-var mapping, the
 *   syntax token defaults, and `ensureHighlightStyles` (a no-op here, see below)
 * @position Shared utility; consumed by highlightRanges.ts and the CodeBlock port
 *
 * Astryx injects one unlayered `<style>` at runtime with `:root` fallbacks for the
 * `--color-syntax-*` tokens and the coloring rules. In astryx-astro that CSS is
 * static and lives in the CodeBlock stylesheet inside `@layer astryx-base` (an
 * unlayered `:root` block would beat theme-set tokens in `@layer astryx-theme`).
 * The CodeBlock port must emit, for every `type` in TOKEN_TYPES:
 *
 *   .astryx-code-block code::highlight(astryx-<type>),
 *   .astryx-codeeditor code::highlight(astryx-<type>) { color: var(--color-syntax-<type>); }
 *   .astryx-token-<type> { color: var(--color-syntax-<type>); }
 *
 * plus SYNTAX_TOKEN_DEFAULTS as fallbacks (e.g. `var(--color-syntax-keyword,
 * var(--color-text-accent))`, or declared on `.astryx-code-block`).
 * `highlightRuleCss()` returns exactly those rules as text.
 */

/**
 * Token types that map to highlight names.
 * Used to create CSS.highlights entries with the `astryx-` prefix.
 */
export const TOKEN_TYPES = [
  'keyword',
  'string',
  'comment',
  'number',
  'function',
  'type',
  'tag',
  'attribute',
  'property',
  'operator',
  'constant',
  'punctuation',
  'variable',
] as const;

export type TokenType = (typeof TOKEN_TYPES)[number];

/**
 * Default values for the syntax tokens (src/theme/syntax/tokens.ts). They
 * reference the theme's named palette via var() so syntax colors adapt to any
 * theme's color system.
 */
export const SYNTAX_TOKEN_DEFAULTS = {
  // keyword -> accent text (control flow: if, return, const)
  '--color-syntax-keyword': 'var(--color-text-accent)',
  // string -> green text (string literals)
  '--color-syntax-string': 'var(--color-text-green)',
  // comment -> secondary text (passive annotations)
  '--color-syntax-comment': 'var(--color-text-secondary)',
  // number -> orange text (numeric literals)
  '--color-syntax-number': 'var(--color-text-orange)',
  // function -> blue text (function/method names)
  '--color-syntax-function': 'var(--color-text-blue)',
  // type -> purple text (types, interfaces, classes)
  '--color-syntax-type': 'var(--color-text-purple)',
  // variable -> primary text (neutral identifiers)
  '--color-syntax-variable': 'var(--color-text-primary)',
  // operator -> cyan text (=, +, =>, &&)
  '--color-syntax-operator': 'var(--color-text-cyan)',
  // constant -> orange text (true, false, null)
  '--color-syntax-constant': 'var(--color-text-orange)',
  // tag -> red text (HTML/JSX tags)
  '--color-syntax-tag': 'var(--color-text-red)',
  // attribute -> teal text (HTML/JSX attributes)
  '--color-syntax-attribute': 'var(--color-text-teal)',
  // property -> cyan text (object properties)
  '--color-syntax-property': 'var(--color-text-cyan)',
  // punctuation -> secondary text (brackets, semicolons). Not disabled text:
  // disabled grey is calibrated to fail AA on purpose (WCAG exempts inactive
  // controls), and punctuation in a code sample is normal, always-active text.
  '--color-syntax-punctuation': 'var(--color-text-secondary)',
  // background -> muted surface
  '--color-syntax-background': 'var(--color-background-muted)',
  // Diff rows (CodeBlock isDiff): whole-row tints behind unchanged syntax
  // colours, at 25% strength so every default token clears 4.5:1 on them.
  '--color-syntax-added':
    'color-mix(in srgb, var(--color-success-muted) 25%, transparent)',
  '--color-syntax-removed':
    'color-mix(in srgb, var(--color-error-muted) 25%, transparent)',
  '--color-syntax-diff-header': 'var(--color-background-muted)',
  // The margin of a changed row — its line number and +/- glyph.
  '--color-syntax-added-marker': 'var(--color-text-green)',
  '--color-syntax-removed-marker': 'var(--color-text-red)',
} as const;

export type SyntaxTokenName = keyof typeof SYNTAX_TOKEN_DEFAULTS;

/** CSS Custom Highlight name for a token type: `keyword` → `astryx-keyword`. */
export function highlightName(tokenType: string): string {
  return `astryx-${tokenType}`;
}

/** Span-fallback class for a token type (highlightMode='spans' or no Highlight API). */
export function tokenClassName(tokenType: string): string {
  return `astryx-token-${tokenType}`;
}

/** The color custom property a token type paints with. */
export function tokenColorVar(tokenType: string): string {
  return `--color-syntax-${tokenType}`;
}

/**
 * The static coloring rules, as text (no `@layer` wrapper and no `:root`
 * block): what Astryx's injected stylesheet contains apart from the token
 * fallbacks. For the CodeBlock port's stylesheet or a test to compare against.
 */
export function highlightRuleCss(): string {
  const highlight = TOKEN_TYPES.map(
    type =>
      `.astryx-code-block code::highlight(${highlightName(type)}),\n.astryx-codeeditor code::highlight(${highlightName(type)}) { color: var(${tokenColorVar(type)}); }`,
  );
  const spans = TOKEN_TYPES.map(
    type => `.astryx-token-${type} { color: var(${tokenColorVar(type)}); }`,
  );
  return [...highlight, ...spans].join('\n');
}

/**
 * Astryx injects its highlight stylesheet here. In astryx-astro the rules are
 * static CSS shipped by the CodeBlock component, so this is a no-op kept for
 * API parity (highlightRanges.ts calls it before applying ranges).
 */
export function ensureHighlightStyles(): void {}
