/**
 * Pure paging math shared by Pagination.astro (server) and elements/pagination.ts (client).
 * Port of @astryxdesign/core Pagination/Pagination.tsx: `generatePageRange` verbatim, plus the
 * guards and derivations the component body applies before rendering.
 */

export type PageRangeItem = number | '...';

/**
 * The page numbers to display, with '...' ellipsis markers.
 *
 * @example
 * generatePageRange(5, 10, 1) → [1, '...', 4, 5, 6, '...', 10]
 * generatePageRange(1, 10, 1) → [1, 2, 3, 4, 5, '...', 10]
 * generatePageRange(1, 5, 1)  → [1, 2, 3, 4, 5]
 */
export function generatePageRange(currentPage: number, totalPages: number, siblingCount: number): PageRangeItem[] {
  // Total page number slots (excluding ellipses): first + last + current + 2*siblings = 3 + 2*siblings.
  // With 2 potential ellipsis slots: 5 + 2*siblings.
  const totalSlots = 5 + 2 * siblingCount;

  // If total pages fit within slots, show all pages
  if (totalPages <= totalSlots) {
    return Array.from({length: totalPages}, (_, i) => i + 1);
  }

  const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
  const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages);

  const showLeftEllipsis = leftSiblingIndex > 2;
  const showRightEllipsis = rightSiblingIndex < totalPages - 1;

  if (!showLeftEllipsis && showRightEllipsis) {
    // Near the start: show more pages on the left
    const leftRange = 3 + 2 * siblingCount;
    const pages: PageRangeItem[] = Array.from({length: leftRange}, (_, i) => i + 1);
    pages.push('...', totalPages);
    return pages;
  }

  if (showLeftEllipsis && !showRightEllipsis) {
    // Near the end: show more pages on the right
    const rightRange = 3 + 2 * siblingCount;
    const pages: PageRangeItem[] = [1, '...'];
    for (let i = totalPages - rightRange + 1; i <= totalPages; i++) {
      pages.push(i);
    }
    return pages;
  }

  // In the middle: show ellipsis on both sides
  const pages: PageRangeItem[] = [1, '...'];
  for (let i = leftSiblingIndex; i <= rightSiblingIndex; i++) {
    pages.push(i);
  }
  pages.push('...', totalPages);
  return pages;
}

/** pageSize coerced to a positive integer; non-finite values fall back to 10. */
export function normalizePageSize(pageSize: number | undefined): number {
  return pageSize != null && Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 10;
}

/** Prev/next stride: non-integer or < 1 falls back to 1. */
export function normalizeStep(step: number | undefined): number {
  return step != null && Number.isInteger(step) && step >= 1 ? step : 1;
}

/** totalPages wins when given; otherwise derived from totalItems; undefined when unknown. */
export function computeTotalPages(totalPages: number | null | undefined, totalItems: number | null | undefined, pageSize: number): number | undefined {
  return totalPages ?? (totalItems != null ? Math.ceil(totalItems / pageSize) : undefined);
}

export interface PagingState {
  page: number;
  totalPages: number | undefined;
  totalItems: number | undefined;
  hasMore: boolean | undefined;
  pageSize: number;
}

export function hasPreviousPage(s: PagingState): boolean {
  return s.page > 1;
}

export function hasNextPage(s: PagingState): boolean {
  return s.totalPages != null ? s.page < s.totalPages : (s.hasMore ?? false);
}

/** Clamp into [1, totalPages] (open-ended when the count is unknown). */
export function clampPage(target: number, totalPages: number | undefined): number {
  const lower = Math.max(target, 1);
  return totalPages != null ? Math.min(lower, totalPages) : lower;
}

/** The item range the `count` variant shows. */
export function itemRange(s: PagingState): {from: number; to: number} {
  const from = (s.page - 1) * s.pageSize + 1;
  const to = s.totalItems != null ? Math.min(s.page * s.pageSize, s.totalItems) : s.page * s.pageSize;
  return {from, to};
}

/** Astryx renders nothing for an empty data set. */
export function isEmptyPaging(totalItems: number | null | undefined, totalPages: number | undefined): boolean {
  return (totalItems != null && totalItems <= 0) || (totalPages != null && totalPages <= 0);
}
