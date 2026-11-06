/**
 * Anchoring a layer to its trigger: CSS anchor positioning with a rect fallback.
 *
 * Port of @astryxdesign/core Layer/useLayer.tsx (anchor-name lifetime, anchor-in-view FR5,
 * keepAnchorClear / failsAnchor / placeAfresh / observeMove / observeAnchorClearance for
 * FR4 + FR8), Layer/anchorName.ts and Layer/settledBox.ts. Contract #18 (layer-runtime):
 * anchor names compose and exist only while shown; flips keep clearance; one gutter
 * definition; the first painted frame is final.
 *
 * Static geometry (position-area, position-try-fallbacks, gutters, caps, slide rules) lives
 * in components/Layer/Layer.css keyed on `data-placement` / `data-align`. This module only
 * wires the pair at show time:
 *   anchorLayer(layer, trigger)   synchronously before the layer shows (beforetoggle)
 *   settleLayer(layer)            once it is shown (same task as showPopover(), or the next
 *                                 animation frame for a native popovertarget show: rAF runs
 *                                 before that frame's style/paint, so nothing paints twice)
 *   releaseLayer(layer)           after it hid; the name goes when the exit animation ends
 *
 * Without CSS anchor positioning (`CSS.supports('anchor-name: --a')` false, or
 * `<html data-astryx-anchor-fallback>` to force it) the layer gets `data-astryx-rect` and a
 * small rect positioner places it with `position: fixed` top/left: preferred side, flip to the
 * opposite side, mirrored alignment, then a slide into the viewport minus the gutters. It
 * follows scroll/resize while open. No dependency (the @oddbird polyfill is ~30 KB and parses
 * every stylesheet; layers only need the three cases Astryx's fallbacks cover).
 */
import {ensureId, identFrom} from './dom';

export type LayerPlacement = 'above' | 'below' | 'start' | 'end';
export type LayerAlignment = 'start' | 'center' | 'end';

const CLEARS_ANCHOR = 'data-astryx-clears-anchor';
const SCROLLS = 'data-astryx-layer-scrolls';
const ANCHOR_HIDDEN = 'data-astryx-anchor-hidden';
const RECT = 'data-astryx-rect';
const KEEP_CLEAR = 'data-astryx-keep-clear';
const FORCE_RECT = 'data-astryx-anchor-fallback';

let supported: boolean | null = null;

/** Whether CSS anchor positioning is used (feature-detected once; `<html data-astryx-anchor-fallback>` forces the rect path). */
export function supportsAnchorPositioning(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.hasAttribute(FORCE_RECT)) return false;
  if (supported == null) {
    supported = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' &&
      CSS.supports('anchor-name: --a') && CSS.supports('position-area: block-end');
  }
  return supported;
}

// ── anchor-name lists (anchorName.ts): several layers may share one trigger ──
type StyleRecord = CSSStyleDeclaration & Record<string, string>;

export function readAnchorNames(el: HTMLElement): string[] {
  return ((el.style as StyleRecord).anchorName ?? el.style.getPropertyValue('anchor-name') ?? '')
    .split(',').map((n) => n.trim()).filter((n) => n && n !== 'none');
}

function writeAnchorNames(el: HTMLElement, names: string[]) {
  if (names.length) el.style.setProperty('anchor-name', names.join(', '));
  else el.style.removeProperty('anchor-name');
}

export function addAnchorName(el: HTMLElement, name: string): void {
  const names = readAnchorNames(el);
  if (!names.includes(name)) writeAnchorNames(el, [...names, name]);
}

export function removeAnchorName(el: HTMLElement, name: string): void {
  writeAnchorNames(el, readAnchorNames(el).filter((n) => n !== name));
}

/** The layer's unique anchor name (`--astryx-layer-<id>`). */
export function anchorNameFor(layer: HTMLElement): string {
  return `--astryx-layer-${identFrom(ensureId(layer, 'ax-layer'))}`;
}

interface State {
  anchor: HTMLElement;
  name: string;
  mode: 'anchor' | 'rect';
  cleanups: Array<() => void>;
  exit: object | null;
}

const states = new WeakMap<HTMLElement, State>();

function stopObservers(state: State) {
  for (const fn of state.cleanups.splice(0)) fn();
}

/** The anchor `layer` is bound to right now (while shown or exiting), or null. */
export function anchorOf(layer: HTMLElement): HTMLElement | null {
  return states.get(layer)?.anchor ?? null;
}

function isInView(anchor: HTMLElement): boolean {
  const view = anchor.ownerDocument.defaultView ?? window;
  const r = anchor.getBoundingClientRect();
  return r.bottom >= 0 && r.right >= 0 && r.top <= view.innerHeight && r.left <= view.innerWidth;
}

/**
 * Bind `layer` to `anchor` for one showing. Call it synchronously before the layer is shown,
 * so its first frame is laid out against the anchor.
 */
export function anchorLayer(layer: HTMLElement, anchor: HTMLElement): void {
  const previous = states.get(layer);
  if (previous) {
    stopObservers(previous);
    previous.exit = null;
    if (previous.anchor !== anchor) removeAnchorName(previous.anchor, previous.name);
  }
  const mode = supportsAnchorPositioning() ? 'anchor' : 'rect';
  const name = anchorNameFor(layer);
  states.set(layer, {anchor, name, mode, cleanups: [], exit: null});
  layer.removeAttribute(CLEARS_ANCHOR);
  layer.removeAttribute(SCROLLS);
  if (mode === 'anchor') {
    layer.removeAttribute(RECT);
    addAnchorName(anchor, name);
    layer.style.setProperty('position-anchor', name);
    // FR5, read before the first frame: an aligned layer whose anchor is out of view holds.
    layer.toggleAttribute(ANCHOR_HIDDEN, !isInView(anchor));
  } else {
    layer.setAttribute(RECT, '');
    layer.style.removeProperty('position-anchor');
    layer.removeAttribute(ANCHOR_HIDDEN);
  }
}

/**
 * Once the layer is shown: place it (rect mode) or check that a keep-clear layer does not
 * cover its anchor (anchor mode), then follow geometry changes while it stays open.
 */
export function settleLayer(layer: HTMLElement): void {
  const state = states.get(layer);
  if (!state || state.exit) return;
  if (!isShown(layer)) return;
  stopObservers(state);
  if (state.mode === 'rect') {
    positionWithRects(layer, state.anchor);
    state.cleanups.push(followRects(layer, state));
    return;
  }
  state.cleanups.push(observeAnchorVisibility(layer, state.anchor));
  if (layer.hasAttribute(KEEP_CLEAR)) {
    keepAnchorClear(layer, state.anchor);
    state.cleanups.push(observeAnchorClearance(layer, state.anchor, () => states.get(layer) === state && !state.exit));
  }
}

/**
 * After the layer hid. Its trigger stays an anchor until the exit animation (a CSS transition
 * with allow-discrete) ends, so the exit paints in place; a show during the exit keeps it.
 */
export function releaseLayer(layer: HTMLElement): void {
  const state = states.get(layer);
  if (!state) return;
  const exit = {};
  state.exit = exit;
  const done = () => {
    if (state.exit !== exit || states.get(layer) !== state || isShown(layer)) return;
    stopObservers(state);
    removeAnchorName(state.anchor, state.name);
    states.delete(layer);
  };
  // Flush style so the exit transitions exist before they are read.
  void getComputedStyle(layer).opacity;
  const running = typeof layer.getAnimations === 'function'
    ? layer.getAnimations({subtree: true}).filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().endTime !== Infinity)
    : [];
  if (running.length === 0) done();
  else void Promise.all(running.map((a) => a.finished.catch(() => undefined))).then(done);
}

function isShown(layer: HTMLElement): boolean {
  try {
    return layer.matches(':popover-open');
  } catch {
    return layer.style.display !== 'none';
  }
}

// ── FR5: anchor visibility while open ───────────────────────────────────────
function observeAnchorVisibility(layer: HTMLElement, anchor: HTMLElement): () => void {
  if (typeof IntersectionObserver === 'undefined') return () => {};
  const io = new IntersectionObserver((entries) => {
    const latest = entries[entries.length - 1];
    if (latest) layer.toggleAttribute(ANCHOR_HIDDEN, !latest.isIntersecting);
  });
  io.observe(anchor);
  return () => io.disconnect();
}

// ── FR4: a layer that must never settle over its anchor (Tooltip) ───────────
/**
 * The layer's box without its entry transform (translate/scale about the centre): the box
 * the engine placed, which is what must clear the anchor.
 */
function settledBox(layer: HTMLElement): DOMRect {
  const rect = layer.getBoundingClientRect();
  const width = layer.offsetWidth;
  const height = layer.offsetHeight;
  const translate = getComputedStyle(layer).translate;
  let tx = 0;
  let ty = 0;
  if (translate && translate !== 'none') {
    const [x = '0', y = '0'] = translate.split(' ');
    tx = parseFloat(x) || 0;
    ty = parseFloat(y) || 0;
  }
  const cx = rect.left + rect.width / 2 - tx;
  const cy = rect.top + rect.height / 2 - ty;
  return new DOMRect(cx - width / 2, cy - height / 2, width, height);
}

function failsAnchor(layer: HTMLElement, anchor: HTMLElement): boolean {
  const a = anchor.getBoundingClientRect();
  const l = settledBox(layer);
  if (l.width <= 0 || l.height <= 0) return false;
  const covers = l.left < a.right && a.left < l.right && l.top < a.bottom && a.top < l.bottom;
  const viewportBlock = layer.ownerDocument.documentElement.clientHeight;
  const anchorInView = a.bottom > 0 && a.top < viewportBlock;
  return covers || (anchorInView && (l.top < 0 || l.bottom > viewportBlock));
}

/**
 * A browser keeps a laid-out layer on the option it last used until it stops being rendered,
 * so take it out of rendering for one forced layout (same task, nothing paints in between).
 */
function placeAfresh(layer: HTMLElement) {
  const display = layer.style.display;
  layer.style.display = 'none';
  void layer.getBoundingClientRect();
  layer.style.display = display;
}

/**
 * Switch a layer whose box covers its anchor (or leaves the viewport on the block axis while
 * the anchor is in view) to its anchor-clear fallback list; let it scroll only when its
 * content overflows the box it got.
 */
export function keepAnchorClear(layer: HTMLElement, anchor: HTMLElement): void {
  if (failsAnchor(layer, anchor)) {
    const switching = !layer.hasAttribute(CLEARS_ANCHOR);
    layer.setAttribute(CLEARS_ANCHOR, '');
    if (!switching || failsAnchor(layer, anchor)) placeAfresh(layer);
  }
  layer.toggleAttribute(SCROLLS, layer.scrollHeight > layer.clientHeight + 1);
}

/**
 * Call `onMove` when `element` moves on screen without resizing (in layout or by a scroll):
 * an IntersectionObserver rooted at the viewport shrunk to the element's own rectangle
 * (observeMove). Reports land after paint; the caller corrects in the next frame.
 */
function observeMove(element: HTMLElement, onMove: () => void): () => void {
  const doc = element.ownerDocument;
  if (typeof IntersectionObserver === 'undefined') return () => {};
  let observer: IntersectionObserver | null = null;
  let visibility: IntersectionObserver | null = null;
  const stop = () => {
    observer?.disconnect(); observer = null;
    visibility?.disconnect(); visibility = null;
  };
  const moved = (threshold: number) => { onMove(); arm(threshold); };
  const arm = (threshold: number) => {
    stop();
    const root = doc.documentElement;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const top = Math.floor(rect.top);
    const left = Math.floor(rect.left);
    const right = Math.floor(root.clientWidth - rect.right);
    const bottom = Math.floor(root.clientHeight - rect.bottom);
    const hasMoved = () => {
      const now = element.getBoundingClientRect();
      return now.top !== rect.top || now.left !== rect.left || now.width !== rect.width || now.height !== rect.height;
    };
    const awaitVisible = () => {
      let first = true;
      visibility = new IntersectionObserver((entries) => {
        const visible = entries[entries.length - 1]?.isIntersecting ?? false;
        const wasFirst = first;
        first = false;
        if (visible && (!wasFirst || hasMoved())) moved(1);
      }, {root: doc, threshold: 0});
      visibility.observe(element);
    };
    let isFirst = true;
    try {
      observer = new IntersectionObserver((entries) => {
        const ratio = entries[entries.length - 1]?.intersectionRatio ?? 0;
        const first = isFirst;
        isFirst = false;
        if (ratio === threshold) {
          if (ratio === 1 && hasMoved()) moved(1);
          return;
        }
        if (!first || ratio > 0) { moved(first ? ratio : 1); return; }
        if (hasMoved()) { moved(1); return; }
        if (visibility === null) awaitVisible();
      }, {root: doc, rootMargin: `${-top}px ${-right}px ${-bottom}px ${-left}px`, threshold});
      observer.observe(element);
    } catch {
      // A root margin the engine rejects (element larger than the viewport): no move tracking.
    }
  };
  arm(1);
  return stop;
}

function observeAnchorClearance(layer: HTMLElement, anchor: HTMLElement, isCurrent: () => boolean): () => void {
  const view = layer.ownerDocument.defaultView ?? window;
  const reread = () => { if (isCurrent()) keepAnchorClear(layer, anchor); };
  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(reread);
    ro.observe(layer);
    for (const child of layer.children) ro.observe(child);
    ro.observe(anchor);
  }
  let frame: number | null = null;
  const stopMove = observeMove(anchor, () => {
    if (frame !== null) return;
    frame = view.requestAnimationFrame(() => { frame = null; reread(); });
  });
  view.addEventListener('resize', reread);
  return () => {
    ro?.disconnect();
    stopMove();
    if (frame !== null) view.cancelAnimationFrame(frame);
    view.removeEventListener('resize', reread);
  };
}

// ── Rect fallback ───────────────────────────────────────────────────────────
type Side = 'top' | 'bottom' | 'left' | 'right';

/** Place a `data-astryx-rect` layer beside its anchor with flip and slide. */
export function positionWithRects(layer: HTMLElement, anchor: HTMLElement): void {
  const placement = layer.dataset.placement as LayerPlacement | undefined;
  if (!placement) return;
  const alignment = (layer.dataset.align as LayerAlignment | undefined) ?? 'center';
  const view = layer.ownerDocument.defaultView ?? window;
  const root = layer.ownerDocument.documentElement;
  // The stylesheet's placement margins carry the clearance (anchor side) and the gutters (far
  // sides): read them, then lay the box out flush and place it with those values.
  layer.style.removeProperty('margin');
  layer.style.removeProperty('max-block-size');
  const cs = view.getComputedStyle(layer);
  const rtl = cs.direction === 'rtl';
  const m = {top: parseFloat(cs.marginTop) || 0, right: parseFloat(cs.marginRight) || 0, bottom: parseFloat(cs.marginBottom) || 0, left: parseFloat(cs.marginLeft) || 0};
  const side: Side = placement === 'above' ? 'top' : placement === 'below' ? 'bottom' : (placement === 'start') !== rtl ? 'left' : 'right';
  const vertical = side === 'top' || side === 'bottom';
  const clearance = {top: m.bottom, bottom: m.top, left: m.right, right: m.left}[side];
  const gutterMain = m[side];
  const gutterCross = vertical ? Math.max(m.left, m.right) : Math.max(m.top, m.bottom);
  layer.style.margin = '0';
  layer.style.setProperty('--_ax-anchor-width', `${anchor.getBoundingClientRect().width}px`);
  const a = anchor.getBoundingClientRect();
  let w = layer.offsetWidth;
  let h = layer.offsetHeight;
  const vw = root.clientWidth;
  const vh = root.clientHeight;

  const mainFor = (s: Side) => (s === 'top' ? a.top - clearance - h : s === 'bottom' ? a.bottom + clearance : s === 'left' ? a.left - clearance - w : a.right + clearance);
  const fits = (s: Side) => {
    const v = mainFor(s);
    return s === 'top' ? v >= gutterMain : s === 'bottom' ? v + h <= vh - gutterMain : s === 'left' ? v >= gutterMain : v + w <= vw - gutterMain;
  };
  const room = (s: Side) => (s === 'top' ? a.top - clearance - gutterMain : s === 'bottom' ? vh - a.bottom - clearance - gutterMain : s === 'left' ? a.left - clearance - gutterMain : vw - a.right - clearance - gutterMain);
  const opposite: Record<Side, Side> = {top: 'bottom', bottom: 'top', left: 'right', right: 'left'};
  let chosen: Side = side;
  if (!fits(side)) {
    if (fits(opposite[side])) chosen = opposite[side];
    else {
      chosen = room(opposite[side]) > room(side) ? opposite[side] : side;
      // Taller than the room on both block sides: size to the roomier side and scroll (FR3).
      if (vertical) {
        const cap = Math.max(0, room(chosen));
        layer.style.setProperty('max-block-size', `${cap}px`);
        h = layer.offsetHeight;
        layer.toggleAttribute(SCROLLS, layer.scrollHeight > layer.clientHeight + 1);
      }
    }
  }
  w = layer.offsetWidth;
  // Alignment along the cross axis; start/end are logical (inline for above/below).
  const crossFor = (align: LayerAlignment) => {
    if (vertical) {
      if (align === 'center') return a.left + a.width / 2 - w / 2;
      const startEdge = (align === 'start') !== rtl;
      return startEdge ? a.left : a.right - w;
    }
    if (align === 'center') return a.top + a.height / 2 - h / 2;
    return align === 'start' ? a.top : a.bottom - h;
  };
  const size = vertical ? w : h;
  const limit = vertical ? vw : vh;
  const crossFits = (v: number) => v >= gutterCross && v + size <= limit - gutterCross;
  let cross = crossFor(alignment);
  if (!crossFits(cross) && alignment !== 'center') {
    const mirrored = crossFor(alignment === 'start' ? 'end' : 'start');
    if (crossFits(mirrored)) cross = mirrored;
  }
  // Slide: keep the box (and its gutters) inside the viewport.
  cross = Math.min(Math.max(cross, gutterCross), Math.max(gutterCross, limit - gutterCross - size));
  const main = mainFor(chosen);
  layer.style.setProperty('top', `${Math.round(vertical ? main : cross)}px`);
  layer.style.setProperty('left', `${Math.round(vertical ? cross : main)}px`);
  layer.dataset.astryxRectSide = chosen;
}

function followRects(layer: HTMLElement, state: State): () => void {
  const view = layer.ownerDocument.defaultView ?? window;
  let frame: number | null = null;
  const schedule = () => {
    if (frame !== null) return;
    frame = view.requestAnimationFrame(() => {
      frame = null;
      if (states.get(layer) === state && isShown(layer)) positionWithRects(layer, state.anchor);
    });
  };
  view.addEventListener('scroll', schedule, {capture: true, passive: true});
  view.addEventListener('resize', schedule);
  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(schedule);
    ro.observe(layer);
    ro.observe(state.anchor);
  }
  return () => {
    view.removeEventListener('scroll', schedule, {capture: true});
    view.removeEventListener('resize', schedule);
    ro?.disconnect();
    if (frame !== null) view.cancelAnimationFrame(frame);
  };
}
