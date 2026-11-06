/**
 * Pure detent geometry for bottom sheets — no DOM.
 * Verbatim port of @astryxdesign/core BottomSheet/snapOffsets.ts (0.7.9).
 *
 * A detent is an offset in px from the fully open position (0 = fully open, larger = more
 * collapsed). The panel renders that offset as a translate or as a reduction in layout height.
 */

/**
 * A height the sheet can rest at, expressed as the sheet's VISIBLE height:
 * - a number in `(0, 1]` — a fraction of the viewport (`0.5` is half the screen);
 * - a `'<n>%'` string — the same thing spelled in CSS;
 * - a `'<n>px'` string — an absolute height that does not scale.
 * Anything else is ignored (with a dev warning on the server). Percentages resolve against the
 * layout viewport (`window.innerHeight`), so the mobile keyboard never moves a stop.
 */
export type BottomSheetSnapPoint = number | string;

/** Detents whose resting offsets land within this many px of each other are one stop. */
export const DETENT_DEDUP_PX = 48;

/** Largest share of the fully open sheet the shortest stop may fill and still be a peek. */
export const PEEK_MAX_HEIGHT_RATIO = 0.25;

const SNAP_POINT_PATTERN = /^(\d+(?:\.\d+)?|\.\d+)(px|%)$/i;

function parseSnapPoint(point: BottomSheetSnapPoint, viewportPx: number): number | null {
  if (typeof point === 'number') {
    return Number.isFinite(point) && point > 0 && point <= 1 ? point * viewportPx : null;
  }
  const match = SNAP_POINT_PATTERN.exec(String(point).trim());
  if (match === null) return null;
  const value = Number.parseFloat(match[1]);
  if (!(value > 0)) return null;
  return match[2].toLowerCase() === '%' ? (value / 100) * viewportPx : value;
}

/** Whether a snap point can be resolved at all (the viewport only scales the result). */
export function isValidSnapPoint(point: BottomSheetSnapPoint): boolean {
  return parseSnapPoint(point, 1) !== null;
}

/** Resolve snap points to candidate visible heights in px, dropping the ones it cannot honor. */
export function resolveSnapPoints(points: ReadonlyArray<BottomSheetSnapPoint>, viewportPx: number): number[] {
  const heights: number[] = [];
  for (const point of points) {
    const height = parseSnapPoint(point, viewportPx);
    if (height !== null) heights.push(height);
  }
  return heights;
}

/**
 * Given the sheet's full visible height and candidate detent visible heights (px), the resting
 * offsets from fully open, ascending and de-duplicated. `0` is always first; heights >= the
 * sheet are covered by the fully open stop; offsets closer than `dedupPx` collapse to the
 * smaller (taller) one.
 */
export function computeDetentOffsets(sheetHeight: number, detentHeights: ReadonlyArray<number>, dedupPx: number = DETENT_DEDUP_PX): number[] {
  const collapsed = detentHeights.filter((h) => h > 0 && h < sheetHeight).map((h) => sheetHeight - h);
  const ascending = [0, ...collapsed].sort((a, b) => a - b);
  const deduped: number[] = [];
  for (const offset of ascending) {
    const last = deduped[deduped.length - 1];
    if (last === undefined || offset - last >= dedupPx) deduped.push(offset);
  }
  return deduped;
}

/** Nearest value in `offsets` to `value` (offsets must be non-empty). */
export function nearestOffset(value: number, offsets: ReadonlyArray<number>): number {
  return offsets.reduce((best, o) => (Math.abs(o - value) < Math.abs(best - value) ? o : best), offsets[0]);
}

/** Minimum scrim opacity at the peek detent: a modal sheet never shows a fully clear scrim. */
export const MIN_PEEK_SCRIM_OPACITY = 0.3;

/**
 * The peek detent's offset, or null: the shortest stop when it is a sliver (at most
 * PEEK_MAX_HEIGHT_RATIO of the open sheet). A peek keeps its layout height and slides instead
 * of reflowing, and is the only stop that thins the scrim.
 */
export function peekOffsetFor(offsets: ReadonlyArray<number>, visibleSheetHeight: number): number | null {
  if (offsets.length < 2 || visibleSheetHeight <= 0) return null;
  const shortest = offsets[offsets.length - 1];
  const heightAtShortest = visibleSheetHeight - shortest;
  return heightAtShortest <= PEEK_MAX_HEIGHT_RATIO * visibleSheetHeight ? shortest : null;
}

/**
 * Scrim opacity (1 = full) for a drag/settle `offset`: full down to the shortest working stop,
 * thinning onto a peek (holding MIN_PEEK_SCRIM_OPACITY) or out through the dismiss overshoot
 * toward `dismissOffset` (clearing completely).
 */
export function scrimOpacityForOffset(offset: number, offsets: ReadonlyArray<number>, dismissOffset: number, peekOffset: number | null): number {
  const hasPeek = peekOffset !== null;
  const fadeStart = hasPeek ? offsets[offsets.length - 2] : offsets[offsets.length - 1];
  const fadeEnd = hasPeek ? peekOffset : dismissOffset;
  const floor = hasPeek ? MIN_PEEK_SCRIM_OPACITY : 0;
  if (offset <= fadeStart) return 1;
  if (offset >= fadeEnd) return floor;
  return 1 - (1 - floor) * ((offset - fadeStart) / (fadeEnd - fadeStart));
}

/**
 * Settle target for a released drag: candidates restricted to the drag direction (a down-drag
 * settles at/below where it started, an up-drag at/above), then the nearest. `dir`: 1 down,
 * -1 up, 0 neither.
 */
export function resolveSettleOffset(value: number, offsets: ReadonlyArray<number>, dir: number, baseOffset: number): number {
  let candidates = offsets;
  if (dir > 0) {
    const downward = offsets.filter((o) => o >= baseOffset);
    if (downward.length > 0) candidates = downward;
  } else if (dir < 0) {
    const upward = offsets.filter((o) => o <= baseOffset);
    if (upward.length > 0) candidates = upward;
  }
  return nearestOffset(value, candidates);
}
