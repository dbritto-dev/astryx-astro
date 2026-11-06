// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Ported from @astryxdesign/core 0.7.9 src/CodeBlock/languages/lua.ts.

/**
 * @file languages/lua.ts
 * @input Shared grammar builders from ../grammar
 * @output The `lua` language value for CodeBlock: Lua: `lua`
 * @position Subpath entry: @astryxdesign/core/CodeBlock/languages/lua
 */

import {cLike, defineCodeLanguage} from '../grammar';

/** Lua: `lua`. */
export const lua = /* @__PURE__ */ defineCodeLanguage(
  {name: 'lua', identifiers: ['lua'], fileExtensions: ['lua'], fileNames: []},
  () =>
    cLike(
      'and break do else elseif end false for function goto if in local nil not or repeat return then true until while',
      [{type: 'string', regex: /\[(=*)\[[\s\S]*?\]\1\]/}],
      [/--\[(=*)\[[\s\S]*?\]\1\]/, /--[^\n]*/],
    ),
);
