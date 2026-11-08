/**
 * Pure overflow computation: how many items are visible and how many rows they occupy.
 * Verbatim port of @astryxdesign/core hooks/computeOverflow.ts (no DOM). Used by
 * <ax-overflow-list> (src/elements/overflow-list.ts).
 *
 *   visibleCount = clamp(fitCount, minVisibleItems, maxVisibleItems ?? itemCount)
 */

export interface ComputeOverflowInput {
  /** Measured widths of each item, in original DOM order. */
  widths: number[];
  /** Gap between items, in pixels. */
  gap: number;
  /** Width available to lay items out, in pixels. */
  availableWidth: number;
  /** Measured width of the overflow indicator (0 if none). */
  indicatorWidth: number;
  /** Floor — always show at least this many items. */
  minVisibleItems: number;
  /** Ceiling — never show more than this many items. `undefined` = no cap. */
  maxVisibleItems?: number;
  /** Wrap across up to this many rows, then collapse the rest. `undefined`/1 = single line. */
  maxRows?: number;
  /** Which end items collapse from. */
  collapseFrom: 'start' | 'end';
}

export interface ComputeOverflowResult {
  visibleCount: number;
  rows: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(Math.min(value, max), min);
}

function resolveBounds(itemCount: number, minVisibleItems: number, maxVisibleItems: number | undefined) {
  const floor = Math.max(0, Math.min(minVisibleItems, itemCount));
  const rawCeiling = maxVisibleItems == null ? itemCount : maxVisibleItems;
  const ceiling = Math.max(0, Math.min(rawCeiling, itemCount));
  return {floor, ceiling};
}

function computeSingleLineFit(
  orderedWidths: number[],
  gap: number,
  availableWidth: number,
  indicatorWidth: number,
  floor: number,
  ceiling: number,
): number {
  let totalWidth = 0;
  let count = 0;
  for (let i = 0; i < orderedWidths.length; i++) {
    if (count >= ceiling) break;
    const itemWidth = orderedWidths[i];
    const gapWidth = i > 0 ? gap : 0;
    const candidateWidth = totalWidth + itemWidth + gapWidth;
    const isLastItem = i === orderedWidths.length - 1;
    const reservedWidth = isLastItem ? 0 : indicatorWidth + (count > 0 || indicatorWidth > 0 ? gap : 0);
    if (candidateWidth + reservedWidth > availableWidth && count >= floor) break;
    totalWidth = candidateWidth;
    count++;
  }
  return count;
}

function packRows(orderedWidths: number[], gap: number, availableWidth: number, indicatorReserve: number, maxRows: number) {
  let placed = 0;
  let row = 1;
  let rowWidth = 0;
  for (let i = 0; i < orderedWidths.length; i++) {
    const w = orderedWidths[i];
    const isFirstInRow = rowWidth === 0;
    const candidate = isFirstInRow ? w : rowWidth + gap + w;
    const onLastRow = row === maxRows;
    const reserve = onLastRow && indicatorReserve > 0 ? indicatorReserve + gap : 0;
    if (candidate + reserve <= availableWidth) {
      rowWidth = candidate;
      placed++;
      continue;
    }
    if (isFirstInRow) {
      // A single item wider than the row occupies it alone (clipped), unless it cannot
      // coexist with the reserved indicator on the last row.
      if (onLastRow && reserve > 0) break;
      rowWidth = candidate;
      placed++;
      continue;
    }
    if (row >= maxRows) break;
    row++;
    rowWidth = 0;
    i--; // re-attempt this item as the first on the new row
  }
  return {placed, rows: row};
}

/** Count how many rows a set of items occupies when wrapped at availableWidth. */
export function countRows(orderedWidths: number[], gap: number, availableWidth: number): number {
  if (orderedWidths.length === 0) return 0;
  let rows = 1;
  let rowWidth = 0;
  for (let i = 0; i < orderedWidths.length; i++) {
    const w = orderedWidths[i];
    const isFirstInRow = rowWidth === 0;
    const candidate = isFirstInRow ? w : rowWidth + gap + w;
    if (candidate <= availableWidth || isFirstInRow) {
      rowWidth = candidate;
    } else {
      rows++;
      rowWidth = w;
    }
  }
  return rows;
}

function computeMultiRowFit(orderedWidths: number[], gap: number, availableWidth: number, indicatorWidth: number, maxRows: number) {
  const n = orderedWidths.length;
  if (n === 0) return {count: 0, rows: 0};
  const packAll = packRows(orderedWidths, gap, availableWidth, 0, maxRows);
  if (packAll.placed === n) return {count: n, rows: packAll.rows};
  const packWithIndicator = packRows(orderedWidths, gap, availableWidth, indicatorWidth, maxRows);
  const count = packWithIndicator.placed;
  const rows = countRows(orderedWidths.slice(0, count), gap, availableWidth);
  return {count, rows: Math.max(count > 0 ? 1 : 0, rows)};
}

export function computeOverflow(input: ComputeOverflowInput): ComputeOverflowResult {
  const {widths, gap, availableWidth, indicatorWidth, minVisibleItems, maxVisibleItems, maxRows, collapseFrom} = input;
  const itemCount = widths.length;
  if (itemCount === 0) return {visibleCount: 0, rows: 0};
  const {floor, ceiling} = resolveBounds(itemCount, minVisibleItems, maxVisibleItems);
  const orderedWidths = collapseFrom === 'end' ? widths : widths.toReversed();
  const multiRow = maxRows != null && maxRows > 1;
  if (!multiRow) {
    const fitCount = computeSingleLineFit(orderedWidths, gap, availableWidth, indicatorWidth, floor, ceiling);
    const visibleCount = clamp(fitCount, floor, ceiling);
    return {visibleCount, rows: visibleCount > 0 ? 1 : 0};
  }
  const {count, rows} = computeMultiRowFit(orderedWidths, gap, availableWidth, indicatorWidth, maxRows);
  const visibleCount = clamp(count, floor, ceiling);
  const resolvedRows = visibleCount === count ? rows : countRows(orderedWidths.slice(0, visibleCount), gap, availableWidth);
  return {visibleCount, rows: visibleCount > 0 ? Math.max(1, resolvedRows) : 0};
}
