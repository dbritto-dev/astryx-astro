// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Ported from @astryxdesign/core 0.7.9 src/Outline/types.ts.

/**
 * @file types.ts
 * @input None
 * @output Exports OutlineItem type
 * @position Shared type definitions; consumed by Outline, hooks, and parser utils
 *
 * SYNC: When modified, update /packages/core/src/Outline/Outline.doc.mjs
 */

export interface OutlineItem {
  /** Unique ID, typically matching the target heading's DOM id. */
  id: string;

  /** Display text for the outline item. */
  label: string;

  /** Heading depth from 1 to 6. Controls indentation. */
  level: number;
}
