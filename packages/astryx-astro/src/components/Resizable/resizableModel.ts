/**
 * The resize model's pure parts — size parsing and resolution against a basis, clamping
 * and snapping, persistence, the separator's ARIA derivation and the server's initial state.
 * Port of @astryxdesign/core Resizable/resizableModel.ts, separatorAttributes.ts and
 * createResizable.ts (readInitialResizableState). No DOM work on import: used by the
 * .astro components on the server and by the <ax-resizable> element in the browser.
 */

export type ResizableDirection = 'horizontal' | 'vertical';

export interface PixelWidth {
  type: 'pixel';
  value: number;
}

export type ResizablePercentSize = {
  type: 'percent';
  value: number;
} & ({min: PixelWidth; max?: never} | {min?: never; max: PixelWidth});

/** A number or exact `Npx` is pixels; exact `N%` is a share of the basis; or pixel()/percent(). */
export type ResizableSize = number | `${number}px` | `${number}%` | PixelWidth | ResizablePercentSize;

/**
 * The region configuration — useResizable()'s single-region options that survive the trip
 * from the server to the element (no callbacks or refs: listen for `astryx-size-change` /
 * `astryx-collapse-change` instead, and name the percentage basis with a selector).
 */
export interface ResizableConfig {
  /** Initial size; a basis-dependent value resolves once. @default 250 */
  defaultSize?: ResizableSize | string;
  /** Live minimum. @default 50 */
  minSize?: ResizableSize;
  /** Live maximum. Unbounded when omitted. */
  maxSize?: ResizableSize;
  /** Whether the region can collapse to 0. @default false */
  collapsible?: boolean;
  /** Size in px under which a drag collapses the region. @default 40 */
  collapsedSize?: number;
  /** Pixel values the region may rest on (it rests only on one of them). */
  snaps?: number[];
  /**
   * The element a percentage is a share of: a CSS selector, matched first against the
   * handle's ancestors (closest()), then the document. Omitted: the viewport.
   */
  container?: string;
  /** Key under which size and collapse state persist in localStorage (`astryx-resizable:<key>`). */
  autoSaveId?: string;
  /** Initial collapse state; a persisted entry wins over it. */
  defaultIsCollapsed?: boolean;
  /**
   * Controlled collapse state: requests only dispatch `astryx-collapse-change`; set the
   * element's `isCollapsed` property to apply them.
   */
  isCollapsed?: boolean;
}

export const DEFAULT_MIN = 50;
export const DEFAULT_COLLAPSED_SIZE = 40;
export const DEFAULT_SIZE_FALLBACK = 250;
export const STORAGE_PREFIX = 'astryx-resizable:';
/** The released compatibility basis when there is no window to measure. */
export const SERVER_BASIS = 1200;
/** Pixels an arrow key moves the separator; Shift moves it further. */
export const KEYBOARD_STEP = 10;
export const KEYBOARD_LARGE_STEP = 50;

export function clampSize(size: number, min: number, max: number, snaps: readonly number[]): number {
  const clamped = Math.min(max, Math.max(min, size));
  // With snap points the region rests only on the nearest one.
  if (snaps.length > 0) {
    let nearest = snaps[0];
    let nearestDist = Math.abs(clamped - nearest);
    for (let i = 1; i < snaps.length; i++) {
      const dist = Math.abs(clamped - snaps[i]);
      if (dist < nearestDist) {
        nearest = snaps[i];
        nearestDist = dist;
      }
    }
    return Math.min(max, Math.max(min, nearest));
  }
  return clamped;
}

export interface PersistedResizableState {
  size: number | null;
  isCollapsed: boolean | null;
}

/** Reads `{size, isCollapsed}`, a legacy plain number, or a legacy plain 0 (collapsed). */
export function loadPersistedState(key: string): PersistedResizableState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'number') {
      if (!Number.isFinite(parsed)) return null;
      return parsed === 0 ? {size: null, isCollapsed: true} : {size: parsed, isCollapsed: null};
    }
    if (typeof parsed === 'object' && parsed != null) {
      const {size, isCollapsed} = parsed as {size?: unknown; isCollapsed?: unknown};
      const hasSize = typeof size === 'number' && Number.isFinite(size) && size > 0;
      if (hasSize || isCollapsed === true) {
        return {size: hasSize ? (size as number) : null, isCollapsed: isCollapsed === true};
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function persistState(key: string, state: PersistedResizableState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export type ParsedSize =
  | {kind: 'px'; value: number}
  | {kind: 'percent'; value: number; min?: number; max?: number};

const PX_PATTERN = /^(\d+(?:\.\d+)?)px$/;
const PERCENT_PATTERN = /^(\d+(?:\.\d+)?)%$/;

function parseSizeString(value: string): ParsedSize | null {
  const px = PX_PATTERN.exec(value);
  if (px) {
    const parsed = Number(px[1]);
    return Number.isFinite(parsed) ? {kind: 'px', value: parsed} : null;
  }
  const pct = PERCENT_PATTERN.exec(value);
  if (pct) {
    const parsed = Number(pct[1]);
    return Number.isFinite(parsed) && parsed <= 100 ? {kind: 'percent', value: parsed} : null;
  }
  return null;
}

function parsePixelSize(value: unknown): number | null {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) return null;
  const c = value as {type?: unknown; value?: unknown};
  return c.type === 'pixel' && typeof c.value === 'number' && Number.isFinite(c.value) && c.value >= 0 ? c.value : null;
}

function parsePercentSize(value: object): ParsedSize | null {
  if (Array.isArray(value)) return null;
  const c = value as {type?: unknown; value?: unknown; min?: unknown; max?: unknown};
  if (c.type !== 'percent' || typeof c.value !== 'number' || !Number.isFinite(c.value) || c.value < 0 || c.value > 100) return null;
  const hasMin = c.min !== undefined;
  const hasMax = c.max !== undefined;
  if (hasMin === hasMax) return null; // exactly one bound
  if (hasMin) {
    const min = parsePixelSize(c.min);
    return min == null ? null : {kind: 'percent', value: c.value, min};
  }
  const max = parsePixelSize(c.max);
  return max == null ? null : {kind: 'percent', value: c.value, max};
}

export function parseSize(value: unknown): ParsedSize | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? {kind: 'px', value} : null;
  if (typeof value === 'string') return parseSizeString(value);
  if (typeof value === 'object' && value != null) {
    const px = parsePixelSize(value);
    return px == null ? parsePercentSize(value) : {kind: 'px', value: px};
  }
  return null;
}

export function dependsOnBasis(parsed: ParsedSize | null): boolean {
  return parsed?.kind === 'percent';
}

export function toPixels(parsed: ParsedSize, basis: number | null): number | null {
  if (parsed.kind === 'px') return parsed.value;
  if (basis == null) return null;
  const pct = Math.round((parsed.value / 100) * basis);
  if (parsed.min !== undefined) return Math.max(pct, parsed.min);
  if (parsed.max !== undefined) return Math.min(pct, parsed.max);
  return pct;
}

/** One configured value, or its role's fallback when the input is not a size. */
export function resolveBound(raw: unknown, basis: number | null, fallback: number): number {
  if (raw === undefined || raw === null) return fallback;
  if (raw === Infinity && fallback === Infinity) return Infinity;
  const parsed = parseSize(raw);
  if (parsed == null) return fallback;
  return toPixels(parsed, basis) ?? fallback;
}

/** The container's content-box size on the active axis. */
export function measureContentBox(element: HTMLElement, direction: ResizableDirection, entry?: ResizeObserverEntry): number | null {
  const box = entry?.contentBoxSize?.[0];
  if (box) return direction === 'vertical' ? box.blockSize : box.inlineSize;
  const style = getComputedStyle(element);
  const size = direction === 'vertical'
    ? element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
    : element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  return Number.isFinite(size) ? size : null;
}

export interface SeparatorValue {
  size: number;
  minPx: number;
  maxPx: number | undefined;
  isCollapsed: boolean;
  collapsedText: string;
}

/** The ARIA a window-splitter separator renders (Astryx separatorAttributes). */
export function separatorAttributes(direction: ResizableDirection, isDisabled: boolean, value?: SeparatorValue) {
  return {
    'aria-orientation': direction === 'horizontal' ? 'vertical' : 'horizontal',
    'aria-valuenow': value == null ? undefined : value.isCollapsed ? Math.max(value.size, value.minPx) : value.size,
    'aria-valuemin': value?.minPx,
    'aria-valuemax': value?.maxPx != null && Number.isFinite(value.maxPx) ? value.maxPx : undefined,
    'aria-valuetext': value?.isCollapsed ? value.collapsedText : undefined,
    'aria-disabled': isDisabled ? 'true' : undefined,
  } as const;
}

export interface ResizableSnapshot {
  size: number;
  isCollapsed: boolean;
  expandedSize: number;
  minPx: number;
  maxPx: number;
  effectiveMaxPx: number | undefined;
}

/**
 * The state the server renders (Astryx readInitialResizableState(options, 'server')):
 * percentages resolve against the deterministic 1200px basis and nothing saved is read.
 * The element corrects it on connect (persisted entry, measured basis).
 */
export function readServerResizableState(config: ResizableConfig = {}): ResizableSnapshot {
  const {defaultSize, minSize, maxSize, collapsible = false, snaps = [], defaultIsCollapsed, isCollapsed: controlled} = config;
  const basis = SERVER_BASIS;
  const min = resolveBound(minSize, basis, DEFAULT_MIN);
  const max = resolveBound(maxSize, basis, Infinity);
  const defaultPx = resolveBound(defaultSize, basis, DEFAULT_SIZE_FALLBACK);
  const size = clampSize(defaultPx, min, max, snaps);
  const isCollapsed = collapsible && (controlled !== undefined ? controlled : (defaultIsCollapsed ?? false));
  return {
    size: isCollapsed ? 0 : size,
    isCollapsed,
    expandedSize: size,
    minPx: min,
    maxPx: max,
    effectiveMaxPx: max !== Infinity ? max : undefined,
  };
}
