/**
 * Lets plain Node (22.18+, built-in type stripping) import the framework-free TS lib
 * ports directly: resolves the extensionless relative specifiers the Astryx sources use
 * (`./plainDate` → `./plainDate.ts`, `./parser` → `./parser.ts` or `./parser/index.ts`).
 *   import {lib} from './lib-loader.mjs';
 *   const date = await lib('date/index.ts');
 */
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.endsWith('.ts') && !/\.[cm]?[jt]s$/.test(specifier)) {
      const base = new URL(specifier, context.parentURL);
      for (const candidate of [`${fileURLToPath(base)}.ts`, `${fileURLToPath(base)}/index.ts`]) {
        if (existsSync(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

const libRoot = new URL('../../packages/astryx-astro/src/lib/', import.meta.url);

/** Import a module under packages/astryx-astro/src/lib. */
export const lib = (path) => import(new URL(path, libRoot).href);

/** Tiny assertion helpers shared by the lib tests. */
export function createChecker() {
  let failures = 0;
  let passed = 0;
  const check = (name, cond, detail = '') => {
    if (cond) passed++;
    else {
      failures++;
      console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
    }
  };
  const eq = (name, actual, expected) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    check(name, a === e, `expected ${e}, got ${a}`);
  };
  const done = (label) => {
    console.log(`${failures ? '✗' : '✓'} ${label}: ${passed} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
  };
  return {check, eq, done};
}
