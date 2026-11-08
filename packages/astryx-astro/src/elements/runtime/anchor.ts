/**
 * Anchoring a layer to its trigger with CSS anchor positioning.
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
 * The parts of CSS anchor positioning used here are Baseline (docs/platform.md), so, as in
 * Astryx, there is no JS positioner.
 */
import {ensureId, identFrom} from './dom';
import {globalSingleton} from './global';

export type LayerPlacement = 'above' | 'below' | 'start' | 'end';
export type LayerAlignment = 'start' | 'center' | 'end';

const CLEARS_ANCHOR = 'data-astryx-clears-anchor';
const SCROLLS = 'data-astryx-layer-scrolls';
const ANCHOR_HIDDEN = 'data-astryx-anchor-hidden';
const KEEP_CLEAR = 'data-astryx-keep-clear';

// ── anchor-name lists (anchorName.ts): several layers may share one trigger ──
export function readAnchorNames(el: HTMLElement): string[] {
  return el.style.getPropertyValue('anchor-name')
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
  cleanups: Array<() => void>;
  exit: object | null;
}

/** Each shown layer's binding, shared by every copy of this module. */
const states = globalSingleton('anchor', () => new WeakMap<HTMLElement, State>());

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
  const name = anchorNameFor(layer);
  states.set(layer, {anchor, name, cleanups: [], exit: null});
  layer.removeAttribute(CLEARS_ANCHOR);
  layer.removeAttribute(SCROLLS);
  addAnchorName(anchor, name);
  layer.style.setProperty('position-anchor', name);
  // FR5, read before the first frame: an aligned layer whose anchor is out of view holds.
  layer.toggleAttribute(ANCHOR_HIDDEN, !isInView(anchor));
}

/**
 * Once the layer is shown: follow its anchor's visibility and check that a keep-clear layer
 * does not cover its anchor, then follow geometry changes while it stays open.
 */
export function settleLayer(layer: HTMLElement): void {
  const state = states.get(layer);
  if (!state || state.exit) return;
  if (!isShown(layer)) return;
  stopObservers(state);
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
  const running = layer.getAnimations({subtree: true}).filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().endTime !== Infinity);
  if (running.length === 0) done();
  else void Promise.all(running.map((a) => a.finished.catch(() => undefined))).then(done);
}

function isShown(layer: HTMLElement): boolean {
  return layer.matches(':popover-open');
}

// ── FR5: anchor visibility while open ───────────────────────────────────────
function observeAnchorVisibility(layer: HTMLElement, anchor: HTMLElement): () => void {
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
  const ro = new ResizeObserver(reread);
  ro.observe(layer);
  for (const child of layer.children) ro.observe(child);
  ro.observe(anchor);
  let frame: number | null = null;
  const stopMove = observeMove(anchor, () => {
    if (frame !== null) return;
    frame = view.requestAnimationFrame(() => { frame = null; reread(); });
  });
  view.addEventListener('resize', reread);
  return () => {
    ro.disconnect();
    stopMove();
    if (frame !== null) view.cancelAnimationFrame(frame);
    view.removeEventListener('resize', reread);
  };
}
