// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Ported from @astryxdesign/core 0.7.9 src/Typeahead/createStaticSource.ts and
// src/Typeahead/types.ts (SearchSource, SearchContext). Framework-free: usable on the server
// (Typeahead renders a static source's items into the page) and in the browser
// (`el.searchSource = createStaticSource(items)`).
import type {SearchableItem} from '../../lib/searchableItem';

export type {SearchableItem} from '../../lib/searchableItem';

/** Per-call context a typeahead passes to `search` (spec:AST-092). */
export interface SearchContext<T extends SearchableItem = SearchableItem> {
  /** Show a list for this query before `search()` settles (later lists only append). */
  update(items: T[]): void;
}

/** A search source (Astryx SearchSource): sync or async search and bootstrap. */
export interface SearchSource<T extends SearchableItem = SearchableItem> {
  search(query: string, context?: SearchContext<T>): Promise<T[]> | T[];
  bootstrap(): Promise<T[]> | T[];
  cancel?(): void;
}

export interface CreateStaticSourceOptions<T extends SearchableItem = SearchableItem> {
  /** Extra search terms per item, matched like the label. */
  keywords?: (item: T) => string[];
}

/** A source over a fixed list; Typeahead server-renders its items (no request needed). */
export interface StaticSearchSource<T extends SearchableItem = SearchableItem> extends SearchSource<T> {
  readonly kind: 'static';
  readonly items: T[];
  readonly keywords?: (item: T) => string[];
}

/**
 * A search source over a static array: substring match on `label` and optional keywords;
 * an empty query returns every item, as does `bootstrap()`.
 *
 * @example
 * <Typeahead label="Fruit" searchSource={createStaticSource([{id: 'apple', label: 'Apple'}])} />
 */
export function createStaticSource<T extends SearchableItem>(items: T[], options?: CreateStaticSourceOptions<T>): StaticSearchSource<T> {
  const getKeywords = options?.keywords;
  return {
    kind: 'static',
    items,
    keywords: getKeywords,
    search(query: string): T[] {
      const lower = query.toLowerCase().trim();
      if (lower === '') return items;
      return items.filter((item) => {
        if (item.label.toLowerCase().includes(lower)) return true;
        return getKeywords ? getKeywords(item).some((kw) => kw.toLowerCase().includes(lower)) : false;
      });
    },
    bootstrap(): T[] {
      return items;
    },
  };
}
