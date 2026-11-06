// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Framework-free copy of `SearchableItem` from @astryxdesign/core 0.7.9
// src/Typeahead/types.ts, for groupItems.ts. React nodes (`action`, `element`) become
// `unknown`: in Astro they are markup the caller renders (a slot, an HTML string).

/**
 * Base interface for items that can be searched in Typeahead.
 * Extend this interface to add custom data.
 */
export interface SearchableItem<TAuxData = unknown> {
  /**
   * Unique identifier for the item.
   */
  id: string;

  /**
   * Display label for the item.
   */
  label: string;

  /**
   * The item's secondary control as one node the caller renders and names
   * (`spec:AST-058`). Absent and `null` mean the same: none.
   */
  action?: unknown;

  /**
   * Pre-rendered element for SSR compatibility.
   * When provided, takes priority over `renderItem` and default label rendering.
   */
  element?: unknown;

  /**
   * Arbitrary extra data associated with the item.
   * Use generics to type this for your specific use case.
   */
  auxiliaryData?: TAuxData;
}
