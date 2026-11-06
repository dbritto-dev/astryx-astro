/**
 * Pure value math of @astryxdesign/core Slider/Slider.tsx (clamp, getDecimalPrecision,
 * snapToStep, getPercent, insetPosition, travelFraction, cssLength) — shared by the server
 * render (Slider.astro) and the client element (src/elements/slider.ts).
 */

/** The thumb's size along the travel (px). The travel is inset by half of it at each end. */
export const THUMB_SIZE = 20;
const THUMB_INSET = THUMB_SIZE / 2;

export function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

/** Decimal places a value carries, exponent notation included (1e-7 → 7). */
export function getDecimalPrecision(num: number): number {
  if (Math.abs(num) < 1) {
    const parts = num.toExponential().split('e-');
    if (parts.length === 2) {
      const mantissaDecimals = parts[0].split('.')[1]?.length ?? 0;
      return mantissaDecimals + parseInt(parts[1], 10);
    }
  }
  const decimalPart = String(num).split('.')[1];
  return decimalPart ? decimalPart.length : 0;
}

/** Snap to the step grid anchored at `min`, without binary floating-point error. */
export function snapToStep(val: number, min: number, step: number): number {
  if (step <= 0) return val;
  const steps = Math.round((val - min) / step);
  const snapped = min + steps * step;
  const precision = Math.min(Math.max(getDecimalPrecision(min), getDecimalPrecision(step)), 20);
  return Number(snapped.toFixed(precision));
}

export function getPercent(val: number, min: number, max: number): number {
  if (max === min) return 0;
  return ((val - min) / (max - min)) * 100;
}

function cssLength(percent: number, px: number): string {
  const round = (n: number) => Number(n.toFixed(3));
  return `calc(${round(percent)}% ${px < 0 ? '-' : '+'} ${Math.abs(round(px))}px)`;
}

/** Where a value sits along the box: the thumb's travel is inset by half a thumb at each end. */
export function insetPosition(percent: number): string {
  return cssLength(percent, THUMB_INSET - (percent / 100) * THUMB_SIZE);
}

/** Inverse of `insetPosition`: an offset from the box start back to 0–1. */
export function travelFraction(offset: number, size: number): number {
  const travel = size - THUMB_SIZE;
  if (travel > 0) return (offset - THUMB_INSET) / travel;
  return size > 0 ? offset / size : 0;
}

/** The two thumbs' values after thumb `index` moves to `value` (updateValue's range rule). */
export function constrainRange(
  from: readonly number[],
  index: number,
  value: number,
  {min, max, step, minStepsBetweenThumbs}: {min: number; max: number; step: number; minStepsBetweenThumbs: number},
): [number, number] {
  const next = [...from] as [number, number];
  next[index] = value;
  const minGap = minStepsBetweenThumbs * step;
  if (index === 0) next[0] = Math.min(next[0], next[1] - minGap);
  else next[1] = Math.max(next[1], next[0] + minGap);
  next[0] = clamp(next[0], min, max);
  next[1] = clamp(next[1], min, max);
  return next;
}
