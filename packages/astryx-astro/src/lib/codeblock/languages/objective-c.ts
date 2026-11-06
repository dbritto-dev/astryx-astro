// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Ported from @astryxdesign/core 0.7.9 src/CodeBlock/languages/objective-c.ts.

/**
 * @file languages/objective-c.ts
 * @input Shared grammar builders from ../grammar
 * @output The `objectiveC` language value for CodeBlock: Objective-C: `objective-c`, `objc`, `m`, `mm`
 * @position Subpath entry: @astryxdesign/core/CodeBlock/languages/objective-c
 */

import {CPP_WORDS, DIRECTIVE, cLike, defineCodeLanguage} from '../grammar';

/** Objective-C: `objective-c`, `objc`, `m`, `mm`. */
export const objectiveC = /* @__PURE__ */ defineCodeLanguage(
  {
    name: 'objective-c',
    identifiers: ['objective-c', 'objc', 'm', 'mm'],
    fileExtensions: ['m', 'mm'],
    fileNames: [],
  },
  () =>
    cLike(`${CPP_WORDS} id self super nil Nil YES NO SEL BOOL instancetype`, [
      {type: 'keyword', regex: DIRECTIVE},
      {type: 'string', regex: /@"(?:[^"\\\n]|\\.)*"/},
      {type: 'keyword', regex: /@\w+/},
    ]),
);
