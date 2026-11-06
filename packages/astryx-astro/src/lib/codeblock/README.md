# lib/codeblock

CodeBlock's in-house tokenizer, grammar builders, opt-in language modules, CSS Custom
Highlight range painting and the token → highlight/class mapping, ported verbatim from
`@astryxdesign/core` 0.7.9 `CodeBlock/` (MIT). Framework-free: tokenize in Astro frontmatter
(SSR `<span class="astryx-token-*">`) or in the browser (`::highlight()` ranges). Entry:
`index.ts`. Tests: `node tools/tests/lib-codeblock.test.mjs`.

## Exported API

Tokenizing (`tokenizer.ts`)
- `tokenize(code, language)` → `TokenLine[]` — one `{type, start, end}[]` per line, line-relative offsets; `[]` for an unknown language.
- `tokenizeAsync(code, language, signal?)` — yields to the main thread every ~800 chars.
- `tokenizeStreaming(code, language, onBatch(lines, startLine), signal?)` — progressive per-batch delivery.
- `SYNC_TOKENIZE_THRESHOLD` (2000 chars) — above it CodeBlock tokenizes async.
- `flatTokensToLines(tokens, code)` — legacy absolute-offset tokens → per-line.
- `parseFenceLanguage(info)` → `{language, isDiff}` (`diff`, `diff-<lang>`).
- `splitDiffLines(lines)` → `{kinds, glyphs, content}`, `diffLineKind(line, {isFileHeader?})`, `fileHeaderLines(lines)`.
- Built-ins: typescript/javascript/tsx/jsx/ts/js, json, html/xml/svg, css/scss/less, python/py, bash/sh/zsh/shell, php, hack, yaml/yml, markdown/md, c/h, cpp family, sql, rust/rs, kotlin/kt/kts, swift, go/golang.

Languages (`grammar.ts`, `languages/*.ts`)
- `createCodeLanguage({name, identifiers, fileExtensions, fileNames, tokenize | grammar})` — a custom language value.
- `defineCodeLanguage(meta, build)`, `isCodeLanguage`, `isCustomCodeLanguage`, `codeLanguagePainter`, `sameCodeLanguage`, `sameCodeLanguageList`, `languageLabel`, `languageKey`, `listedLanguage(list, id)`, `listedLanguageForFile(list, fileName)`.
- Grammar building blocks: `cLike`, `keywords`, `NUMBER`, `DOUBLE_QUOTED`, `SINGLE_QUOTED`, `BLOCK_COMMENT`, `LINE_COMMENT`, `HASH_COMMENT`, `CALL`, `TYPE_NAME`, `OPERATOR`, `PUNCTUATION`, `DIRECTIVE`, `C_WORDS`, `CPP_WORDS`.
- Opt-in modules (import directly, tree-shakeable): `languages/{dockerfile,graphql,java,lua,objective-c,powershell,ruby,thrift,toml}.ts`.

Painting (`highlightRanges.ts`, browser only)
- `applyHighlightRangesChunked(codeEl, tokenLines)` → cleanup, `applyHighlightRangesBatch`, `applyHighlightRangesFlat`, `cleanupRanges` — register `Range`s in `CSS.highlights` under `astryx-<type>`; ranges for content-visibility-skipped lines are deferred.

Mapping (`highlightStyles.ts`)
- `TOKEN_TYPES` — keyword, string, comment, number, function, type, tag, attribute, property, operator, constant, punctuation, variable.
- `highlightName(type)` → `astryx-<type>`; `tokenClassName(type)` → `astryx-token-<type>`; `tokenColorVar(type)` → `--color-syntax-<type>`.
- `SYNTAX_TOKEN_DEFAULTS` — the `--color-syntax-*` fallbacks (incl. background and diff rows).
- `highlightRuleCss()` — the static rules as text; `ensureHighlightStyles()` — no-op (see below).

## Classes the CodeBlock stylesheet must define

Inside `@layer astryx-base`, for each type in `TOKEN_TYPES`:
`.astryx-code-block code::highlight(astryx-<type>), .astryx-codeeditor code::highlight(astryx-<type>)`
and `.astryx-token-<type>` → `color: var(--color-syntax-<type>, <SYNTAX_TOKEN_DEFAULTS value>)`.
Astryx injects these at runtime in an unlayered `<style>` with `:root` token fallbacks; here
that would beat theme tokens, so the rules are static CSS and `ensureHighlightStyles()` does
nothing. A token type outside `TOKEN_TYPES` still gets a rule at runtime, inserted inside
`@layer astryx-base` (the one change to `highlightRanges.ts`).

## Source files ported

`CodeBlock/tokenizer.ts`, `grammar.ts`, `highlightRanges.ts`, `languages/*.ts` (verbatim);
`highlightStyles.ts` + `theme/syntax/tokens.ts` (mapping and defaults only).

## Not ported

`CodeBlock.tsx`, `Code` (components), the runtime style injection, `theme/syntax`
`defineSyntaxTheme` / presets / `SyntaxTheme.tsx` (theme build concerns).
