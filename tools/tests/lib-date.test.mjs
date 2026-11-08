#!/usr/bin/env node
/**
 * Behaviour tests for src/lib/date (+ characters, groupItems, lib/temporal, Timer durations).
 * Astryx 0.7.9 ships no unit tests in its npm source, so these pin the documented behaviour of
 * the ports. The cases live in lib-date.cases.mjs (shared with the browser run).
 *   node tools/tests/lib-date.test.mjs
 */
import {lib, createChecker} from './lib-loader.mjs';
import {runLibDateCases} from './lib-date.cases.mjs';

const {check, eq, done} = createChecker();
const d = await lib('date/index.ts');
const chars = await lib('characters.ts');
const groups = await lib('groupItems.ts');
const temporal = await lib('temporal.ts');
const timer = await import(new URL('../../packages/astryx-astro/src/components/Timer/timerFormat.ts', import.meta.url).href);

// Node 22 has no Temporal: lib/temporal.ts loads temporal-polyfill/full. The same cases run
// in Chrome with native Temporal (and the polyfill) in lib-date-browser.test.mjs.
check('lib/temporal is native exactly when the runtime has Temporal', temporal.isNativeTemporal === (typeof globalThis.Temporal !== 'undefined'));
runLibDateCases({d, chars, groups, temporal, timer}, {check, eq});

done('lib/date + characters + groupItems');
