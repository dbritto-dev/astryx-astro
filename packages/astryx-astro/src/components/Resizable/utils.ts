/**
 * Size helpers for Resizable configurations (Astryx Resizable/utils.ts + Table's pixel()).
 *
 *   import {percent, pixel} from 'astryx-astro/components/Resizable/utils';
 *   <ResizeHandle resizable={{defaultSize: percent(40, {min: pixel(333)}), container: '.split'}} />
 */
import type {PixelWidth, ResizablePercentSize} from './resizableModel';

export type {PixelWidth, ResizablePercentSize, ResizableSize, ResizableConfig} from './resizableModel';

/** An exact pixel size. */
export function pixel(value: number): PixelWidth {
  return {type: 'pixel', value};
}

/** A percentage of the basis with exactly one pixel floor (`min`) or ceiling (`max`). */
export function percent(
  value: number,
  options: {min: PixelWidth; max?: never} | {min?: never; max: PixelWidth},
): ResizablePercentSize {
  return {type: 'percent', value, ...options} as ResizablePercentSize;
}
