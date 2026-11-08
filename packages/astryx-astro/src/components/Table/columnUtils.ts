/**
 * Column width, layout resolution and auto-generation — port of @astryxdesign/core
 * Table/columnUtils.ts (0.7.9). Pure; runs in frontmatter and in the browser.
 */
import {firstCharacter} from '../../lib/characters';
import {temporalKind} from '../../lib/temporalKind';
import type {PixelWidth, ProportionalWidth, TableColumn} from './types';

/** Default minimum width (px) for explicit proportional columns. */
export const DEFAULT_MIN_COLUMN_WIDTH = 120;
/** Compact readability floor (px) for columns with no width. */
export const DEFAULT_FLEXIBLE_COLUMN_MIN_WIDTH = 60;

function resolveFlexibleColumnMinWidth(width: ProportionalWidth | undefined): number {
  return width?.minWidth ?? (width == null ? DEFAULT_FLEXIBLE_COLUMN_MIN_WIDTH : DEFAULT_MIN_COLUMN_WIDTH);
}

export interface ResolvedColumnWidth {
  /** Inline style for the column's `<th>`. */
  style: Record<string, string>;
}

export interface ResolvedColumnWidths {
  columns: Map<string, ResolvedColumnWidth>;
  /** Minimum table width (px) that keeps every flexible column at its floor. */
  tableMinWidth: number;
}

interface ColumnSpacePlan {
  totalProportion: number;
  pixelTotal: number;
  maxProportionalSpace: number;
}

function planColumnSpace<T extends Record<string, unknown>>(columns: ReadonlyArray<TableColumn<T>>): ColumnSpacePlan {
  let totalProportion = 0;
  let pixelTotal = 0;
  const flexibleCols: {proportion: number; minWidth: number}[] = [];
  for (const col of columns) {
    const w = col.width;
    if (w?.type === 'pixel') {
      pixelTotal += w.value;
    } else {
      const proportion = w?.value ?? 1;
      totalProportion += proportion;
      flexibleCols.push({proportion, minWidth: resolveFlexibleColumnMinWidth(w)});
    }
  }
  let maxProportionalSpace = 0;
  if (totalProportion > 0) {
    for (const col of flexibleCols) {
      const required = (col.minWidth * totalProportion) / col.proportion;
      if (required > maxProportionalSpace) maxProportionalSpace = required;
    }
  }
  return {totalProportion, pixelTotal, maxProportionalSpace};
}

/**
 * Inline width (px) of each column while the table sits at its minimum width (the width an
 * overflowing table renders at) — what sticky offsets accumulate.
 */
export function resolveColumnFloorWidths<T extends Record<string, unknown>>(columns: ReadonlyArray<TableColumn<T>>): Map<string, number> {
  const {totalProportion, maxProportionalSpace} = planColumnSpace(columns);
  const widths = new Map<string, number>();
  for (const col of columns) {
    const w = col.width;
    if (w?.type === 'pixel') widths.set(col.key, w.value);
    else {
      const proportion = w?.value ?? 1;
      widths.set(col.key, totalProportion > 0 ? (maxProportionalSpace * proportion) / totalProportion : 0);
    }
  }
  return widths;
}

const MAX_COMPATIBLE_LENGTH =
  /^[+-]?(?:\d+\.?\d*|\.\d+)(?:px|r?em|r?lh|r?ex|r?ch|r?cap|r?ic|vw|vh|vi|vb|vmin|vmax|[sld]v(?:w|h|i|b|min|max)|cq(?:w|h|i|b|min|max)|cm|mm|q|in|pt|pc|%)$/i;
const MAX_COMPATIBLE_FUNCTION = /^(?:calc|min|max|clamp|var)\(/i;
const ZERO_LENGTH = /^[+-]?(?:0+\.?0*|\.0+)(?:[a-z]+|%)?$/i;
const PX_LENGTH = /^(\d+(?:\.\d+)?)px$/i;

/** The larger of the column-floor minimum and a consumer `min-width`. */
export function resolveTableMinWidth(consumer: string | number | null | undefined, floorPx: number): string {
  const floor = `${floorPx}px`;
  if (consumer == null) return floor;
  if (typeof consumer === 'number') return `${Math.max(consumer, floorPx)}px`;
  const value = consumer.trim();
  if (value === '' || ZERO_LENGTH.test(value)) return floor;
  const px = PX_LENGTH.exec(value);
  if (px) return `${Math.max(Number(px[1]), floorPx)}px`;
  if (MAX_COMPATIBLE_LENGTH.test(value) || MAX_COMPATIBLE_FUNCTION.test(value)) return `max(${value}, ${floor})`;
  return floor;
}

/** Per-column `<th>` width styles and the aggregate table min-width, in one pass. */
export function resolveColumnWidths<T extends Record<string, unknown>>(columns: ReadonlyArray<TableColumn<T>>): ResolvedColumnWidths {
  const {totalProportion, pixelTotal, maxProportionalSpace} = planColumnSpace(columns);
  const tableMinWidth = pixelTotal + maxProportionalSpace;
  const result = new Map<string, ResolvedColumnWidth>();
  for (const col of columns) {
    const w = col.width;
    const style: Record<string, string> = {};
    if (w?.type === 'pixel') {
      style.width = `${w.value}px`;
      style.minWidth = `${w.value}px`;
    } else {
      const proportion = w?.value ?? 1;
      if (totalProportion > 0) style.width = `${(proportion / totalProportion) * 100}%`;
      style.minWidth = `${resolveFlexibleColumnMinWidth(w)}px`;
    }
    result.set(col.key, {style});
  }
  return {columns: result, tableMinWidth};
}

/** A proportional (fr-like) width; `minWidth` defaults to 120px. */
export function proportional(value = 1, options?: {minWidth?: number}): ProportionalWidth {
  return {type: 'proportional', value, minWidth: options?.minWidth ?? DEFAULT_MIN_COLUMN_WIDTH};
}

/** A fixed pixel width. */
export function pixel(value: number): PixelWidth {
  return {type: 'pixel', value};
}

/** Capitalize the first grapheme (auto-generated headers). */
export function capitalize(str: string): string {
  if (str.length === 0) return str;
  const first = firstCharacter(str);
  return first.toUpperCase() + str.slice(first.length);
}

/** Default cell text for a value (Astryx defaultCellRenderer). */
export function defaultCellText(value: unknown): string {
  if (value == null) return '';
  // `Date` is Astryx's own cell type: read here, never built.
  if (value instanceof Date) return value.toISOString();
  // Port addition: a Temporal value shows its ISO string (recognized by brand, no Temporal loaded).
  if (temporalKind(value) !== null) return String(value);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
}

function estimateContentLength(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'string') return value.length;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).length;
  return 0;
}

function longestWord(value: unknown): number {
  if (value == null) return 0;
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return 0;
  const str = String(value);
  let max = 0;
  let current = 0;
  for (let i = 0; i <= str.length; i++) {
    if (i === str.length || str[i] === ' ' || str[i] === '\t' || str[i] === '\n') {
      if (current > max) max = current;
      current = 0;
    } else {
      current++;
    }
  }
  return max;
}

const PX_PER_CHAR = 8;

/** Columns from the first row's keys, with content-proportional widths (Astryx generateColumns). */
export function generateColumns<T extends Record<string, unknown>>(data: readonly T[]): TableColumn<T>[] {
  if (data.length === 0) return [];
  const keys = Object.keys(data[0]);
  const sampleRows = data.slice(0, Math.min(5, data.length));
  const measurements = keys.map((key) => {
    const headerLen = capitalize(key).length;
    let maxContentLen = headerLen;
    let maxWordLen = headerLen;
    for (const row of sampleRows) {
      const contentLen = estimateContentLength(row[key]);
      if (contentLen > maxContentLen) maxContentLen = contentLen;
      const wordLen = longestWord(row[key]);
      if (wordLen > maxWordLen) maxWordLen = wordLen;
    }
    return {key, headerLen, maxContentLen, maxWordLen};
  });
  return measurements.map((m) => {
    const proportion = m.maxContentLen <= 6 ? 1 : m.maxContentLen <= 15 ? 2 : 3;
    const minWidth = Math.max(Math.max(m.headerLen, m.maxWordLen) * PX_PER_CHAR, DEFAULT_FLEXIBLE_COLUMN_MIN_WIDTH);
    return {key: m.key, header: capitalize(m.key), width: proportional(proportion, {minWidth})};
  });
}
