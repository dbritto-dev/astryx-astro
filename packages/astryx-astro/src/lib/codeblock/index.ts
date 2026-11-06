/**
 * CodeBlock syntax highlighting core, ported from @astryxdesign/core 0.7.9 CodeBlock/
 * (MIT, Copyright (c) Meta Platforms, Inc. and affiliates). Framework-free; the
 * tokenizer runs in Astro frontmatter (SSR spans) and in the browser (ranges).
 * Opt-in languages are separate modules: `import {lua} from './languages/lua'`.
 * See README.md.
 */
export {
  createCodeLanguage,
  defineCodeLanguage,
  isCodeLanguage,
  codeLanguagePainter,
  isCustomCodeLanguage,
  sameCodeLanguage,
  sameCodeLanguageList,
  languageLabel,
  languageKey,
  listedLanguage,
  listedLanguageForFile,
} from './grammar';
export type {
  CodeLanguage,
  CodeLanguageToken,
  CodeLanguageTokenize,
  CodeLanguagePainter,
  CreateCodeLanguageOptions,
  Grammar,
  GrammarPattern,
} from './grammar';
export {
  tokenize,
  tokenizeAsync,
  tokenizeStreaming,
  flatTokensToLines,
  parseFenceLanguage,
  splitDiffLines,
  diffLineKind,
  fileHeaderLines,
  SYNC_TOKENIZE_THRESHOLD,
} from './tokenizer';
export type {CodeLanguageInput, SyntaxToken, TokenLine, DiffLineKind} from './tokenizer';
export {
  applyHighlightRangesChunked,
  applyHighlightRangesBatch,
  applyHighlightRangesFlat,
  cleanupRanges,
} from './highlightRanges';
export {
  TOKEN_TYPES,
  SYNTAX_TOKEN_DEFAULTS,
  highlightName,
  tokenClassName,
  tokenColorVar,
  highlightRuleCss,
  ensureHighlightStyles,
} from './highlightStyles';
export type {TokenType, SyntaxTokenName} from './highlightStyles';
