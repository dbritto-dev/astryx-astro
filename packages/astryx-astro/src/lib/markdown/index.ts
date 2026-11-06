/**
 * Markdown parser, AST and plugin protocol ported from @astryxdesign/core 0.7.9
 * Markdown/ and Outline/parseOutlineFromMarkdown.ts (MIT, Copyright (c) Meta Platforms,
 * Inc. and affiliates). Framework-free; the AST → component rendering lives with the
 * Markdown component port. See README.md for what a renderer needs.
 *
 * Narrower entry points mirror Astryx's subpaths: `./parser` (parser/index.ts),
 * `./utils`, `./plugins`, `./remark`.
 */

// Canonical AST (MDAST-aligned) and traversal
export {visitMarkdownNodes, markdownAstText, getMarkdownAstLegacyCodeLanguage} from './ast';
export type {
  MarkdownAstPoint,
  MarkdownAstDataValue,
  MarkdownAstPosition,
  MarkdownAstNodeBase,
  MarkdownAstExtensionNode,
  MarkdownAstParent,
  MarkdownAstText,
  MarkdownAstInlineCode,
  MarkdownAstInlineMath,
  MarkdownAstLink,
  MarkdownAstImage,
  MarkdownAstCitation,
  MarkdownAstBreak,
  MarkdownAstPhrasingContent,
  MarkdownAstHeading,
  MarkdownAstParagraph,
  MarkdownAstCode,
  MarkdownAstMath,
  MarkdownAstBlockquote,
  MarkdownAstList,
  MarkdownAstListItem,
  MarkdownAstTable,
  MarkdownAstTableAlignment,
  MarkdownAstTableRow,
  MarkdownAstTableCell,
  MarkdownAstThematicBreak,
  MarkdownAstBlockContent,
  MarkdownAstRoot,
  MarkdownAstNodeMap,
  MarkdownAstNode,
} from './ast';

// Parser (canonical AST and released legacy node projections)
export {
  parseMarkdown,
  parseMarkdownAst,
  parseMarkdownAstIncremental,
  parseMarkdownIncremental,
  createIncrementalState,
  getIncrementalParseWork,
  trimStreamingArtifacts,
  parseInline,
  parseInlineAst,
  slugify,
  uniqueSlug,
} from './parser';
export type {
  BlockNode,
  BlockNodeWithMath,
  MathBlockNode,
  InlineNode,
  InlineNodeWithMath,
  MathInlineNode,
  SourceRange,
  ListItemNode,
  TableCellNode,
  TableAlignment,
  ParseOptions,
  MathParseOptions,
  IncrementalParseOptions,
  IncrementalMathParseOptions,
  IncrementalState,
  IncrementalState as IncrementalParseState,
} from './parser';
export {decodeMarkdownCharacterReferences} from './characterReferences';

// Render-time URL policy, headings, streaming reveal
export {isSafeMarkdownParserUrl, sanitizeMarkdownLinkUrl, sanitizeMarkdownUrl} from './url';
export {projectMarkdownHeadings} from './headingProjection';
export type {MarkdownHeadingProjection} from './headingProjection';
export {computeBoundaries, computeSegments} from './streaming';
export type {TextSegment} from './streaming';

// Outline
export {parseOutlineFromMarkdown} from './parseOutlineFromMarkdown';
export type {ParseOutlineFromMarkdownOptions} from './parseOutlineFromMarkdown';
export type {OutlineItem} from './outlineTypes';

// Plugins (public protocol plus the internals a renderer needs)
export * from './plugins/index';
export {
  applyMarkdownTransforms,
  getMarkdownExtensionRenderer,
  markdownExtensionText,
  prepareMarkdownPlugins,
  reportMarkdownPluginFailure,
} from './plugins/protocol';
export type {PreparedMarkdownPlugins} from './plugins/protocol';
export {getMarkdownFenceProposal} from './plugins/semanticFence';
