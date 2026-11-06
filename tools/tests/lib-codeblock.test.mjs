#!/usr/bin/env node
/**
 * Behaviour tests for src/lib/codeblock (tokenizer, grammars, opt-in languages, diff
 * helpers, token → highlight mapping). Astryx 0.7.9 ships no unit tests in its npm source.
 *   node tools/tests/lib-codeblock.test.mjs
 */
import {lib, createChecker} from './lib-loader.mjs';

const {check, eq, done} = createChecker();
const cb = await lib('codeblock/index.ts');

/** Tokens of one line as [type, text] pairs (whitespace has no token). */
const typed = (code, language, line = 0) => cb.tokenize(code, language)[line].map((t) => [t.type, code.split('\n')[line].slice(t.start, t.end)]);
const typeOf = (code, language, text) => typed(code, language).find(([, s]) => s === text)?.[0];

// ── Built-in languages ──────────────────────────────────────────────────
eq('typescript line', typed('const x = 1;', 'typescript'), [['keyword', 'const'], ['operator', '='], ['number', '1'], ['punctuation', ';']]);
eq('ts alias', typed('const x = 1;', 'ts'), typed('const x = 1;', 'typescript'));
eq('string token', typeOf('let s = "hi";', 'javascript', '"hi"'), 'string');
eq('function call', typeOf('foo(1)', 'javascript', 'foo'), 'function');
eq('line comment', typeOf('x // note', 'javascript', '// note'), 'comment');
eq('python keyword', typeOf('def f(): pass', 'python', 'def'), 'keyword');
eq('python comment', typeOf('x = 1  # c', 'py', '# c'), 'comment');
eq('css property', typeOf('a { color: red; }', 'css', 'color'), 'property');
eq('json string', typeOf('{"a": 1}', 'json', '"a"'), 'property');
check('html tag', typed('<div class="a"></div>', 'html').some(([t]) => t === 'tag'));
check('bash keyword', typed('if true; then echo hi; fi', 'bash').some(([t, s]) => t === 'keyword' && s === 'if'));
check('rust keyword', typed('fn main() {}', 'rust').some(([t, s]) => t === 'keyword' && s === 'fn'));
check('go keyword', typed('func main() {}', 'go').some(([t, s]) => t === 'keyword' && s === 'func'));
check('sql keyword', typed('SELECT * FROM t', 'sql').some(([t, s]) => t === 'keyword' && /select/i.test(s)));

// One token array per line, offsets line-relative (the tokenizer is line-based).
const multi = cb.tokenize('let a;\n/* c */ b', 'javascript');
eq('line count', multi.length, 2);
eq('second line offsets are line-relative', multi[1][0], {type: 'comment', start: 0, end: 7});

eq('unknown language → no tokens', cb.tokenize('anything', 'klingon'), []);
eq('plaintext → no tokens', cb.tokenize('anything', 'plaintext').flat(), []);

// ── Opt-in languages and custom languages ───────────────────────────────
const {lua} = await lib('codeblock/languages/lua.ts');
const {toml} = await lib('codeblock/languages/toml.ts');
check('lua is a language value', cb.isCodeLanguage(lua));
eq('lua label', cb.languageLabel(lua), 'lua');
eq('lua keyword', typed('local x = nil', lua)[0], ['keyword', 'local']);
eq('toml comment', typed('# c', toml)[0], ['comment', '# c']);
for (const name of ['dockerfile', 'graphql', 'java', 'objective-c', 'powershell', 'ruby', 'thrift']) {
  const mod = await lib(`codeblock/languages/${name}.ts`);
  const value = Object.values(mod).find(cb.isCodeLanguage);
  check(`${name} module exports a language`, value != null);
  check(`${name} tokenizes`, Array.isArray(cb.tokenize('x', value)));
}
const custom = cb.createCodeLanguage({
  name: 'Ini',
  identifiers: ['ini'],
  tokenize: (code) => (code.startsWith(';') ? [{type: 'comment', start: 0, end: code.length}] : []),
});
eq('custom language tokens', cb.tokenize('; hi', custom), [[{type: 'comment', start: 0, end: 4}]]);
check('custom language detection', cb.isCustomCodeLanguage(custom) && !cb.isCustomCodeLanguage('typescript'));
eq('listed language by key', cb.languageKey(cb.listedLanguage([lua, toml], 'toml') ?? 'none'), cb.languageKey(toml));

// ── Async + legacy flat tokens ──────────────────────────────────────────
eq('tokenizeAsync matches tokenize', await cb.tokenizeAsync('let a = 2;\nlet b = 3;', 'js'), cb.tokenize('let a = 2;\nlet b = 3;', 'js'));
eq('flatTokensToLines', cb.flatTokensToLines([{type: 'keyword', start: 0, end: 3}, {type: 'number', start: 6, end: 7}], 'let\nx= 1'), [[{type: 'keyword', start: 0, end: 3}], [{type: 'number', start: 2, end: 3}]]);

// ── Fence info and diffs ────────────────────────────────────────────────
eq('fence diff', cb.parseFenceLanguage('diff'), {language: 'plaintext', isDiff: true});
eq('fence diff-ts', cb.parseFenceLanguage('diff-ts'), {language: 'ts', isDiff: true});
eq('fence empty', cb.parseFenceLanguage(''), {language: 'plaintext', isDiff: false});
const diff = cb.splitDiffLines(['@@ -1 +1 @@', '-old', '+new', ' same']);
eq('diff kinds', diff.kinds, ['header', 'removed', 'added', 'context']);
eq('diff glyphs', diff.glyphs, ['', '-', '+', ' ']);
eq('diff content', diff.content, ['', 'old', 'new', 'same']);

// ── Token → highlight mapping ───────────────────────────────────────────
eq('token types', cb.TOKEN_TYPES.length, 13);
eq('highlight name', cb.highlightName('keyword'), 'astryx-keyword');
eq('span class', cb.tokenClassName('string'), 'astryx-token-string');
eq('color var', cb.tokenColorVar('type'), '--color-syntax-type');
eq('keyword default', cb.SYNTAX_TOKEN_DEFAULTS['--color-syntax-keyword'], 'var(--color-text-accent)');
check('rule css covers every type', cb.TOKEN_TYPES.every((t) => cb.highlightRuleCss().includes(`::highlight(astryx-${t})`) && cb.highlightRuleCss().includes(`.astryx-token-${t} {`)));

done('lib/codeblock');
