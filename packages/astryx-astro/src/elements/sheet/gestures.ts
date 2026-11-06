/**
 * `createSheetGestures()` — drag-to-snap-points for a bottom-anchored sheet, framework-free.
 *
 * Port of @astryxdesign/core 0.7.9 BottomSheet/useSheetGestures.ts (the React hook BottomSheet
 * and Popover's sheet use; 0.7.9 ships no public `createDragToSnapPoints`, so this is the
 * framework-free core that seeds `<ax-bottom-sheet>` and the Popover's sheet presentation).
 *
 * - A drag moves the sheet live (Pointer Events + `setPointerCapture` on the handle; a
 *   non-passive `touchmove` on the scroll body for the scroll ↔ drag handoff; the mouse/pen
 *   pull-at-top on the body). On release it settles to the detent nearest where the sheet
 *   would coast at the finger's speed (release position + v · r ÷ (1 − r), r = 0.998/ms, over
 *   a 100 ms velocity window; a gesture shorter than 48 px projects nothing), or dismisses
 *   past the dismiss line (the shortest stop + 40 % of its height). Within 40 px of a stop
 *   the live drag eases magnetically onto it; past fully open a finger rubber-bands
 *   (coefficient 0.55, capped by the reserve below the screen), a mouse/pen resists at 0.35
 *   up to 48 px.
 * - A settled detent is split in two: the layout height the scroll body gives up and a
 *   transform. Gestures and snaps move only the transform; the height reconciles at rest in
 *   one transition-free frame with identical visible geometry. A peek (a stop of a quarter
 *   of the sheet or less) keeps the full height and slides. A scroll-preservation end inset
 *   keeps the body's scroll offset across the height change.
 * - A resting sheet re-resolves its detent by index on resize/orientation change.
 * - A second finger (pinch) ends any drag: pinch-zoom stays the browser's (WCAG 1.4.4).
 *
 * The controller writes `transform`, `height` and `transition` inline on the panel and the
 * end inset on the body; the host's stylesheet owns everything else (and the exit pose, which
 * applies once `release()` drops the inline transform).
 *
 * Deviations: the body's pointer path ignores `pointerType: touch` (the touch path owns
 * fingers in every engine, not only where WebKit reuses touch ids); window `blur` and a lost
 * capture cancel a drag (no document `visibilitychange` listener); no haptic tick.
 */
import {DECELERATION_RATE, RUBBER_BAND_COEFFICIENT, prefersReducedMotion, rubberBand, waitForTransition} from './motion';
import {computeDetentOffsets, peekOffsetFor, resolveSettleOffset, scrimOpacityForOffset} from './snapOffsets';

const PROJECTION_FACTOR = DECELERATION_RATE / (1 - DECELERATION_RATE); // ms
const PROJECTION_MIN_TRAVEL = 48;
const VELOCITY_WINDOW_MS = 100;
const DISMISS_OVERSHOOT_RATIO = 0.4;
const MAGNET_RANGE = 40;
const OVERSCROLL_RESISTANCE = 0.35;
/** Must not exceed the smallest reserve the panel keeps below the screen (48px). */
const OVERSCROLL_MAX = 48;
const CONTENT_END_HANDOFF_SLOP = 4;
const DRAG_PROMOTION_SLOP = 8;

export interface SheetGestureOptions {
  /** The sliding surface: transform + height are written here. */
  panel: HTMLElement;
  /** The grab handle (drags at once; touch-action: pinch-zoom). */
  handle?: HTMLElement | null;
  /** The scrolling body: pull-at-top and content-end handoff. May be the panel itself. */
  body: HTMLElement;
  /** A press on the body that acts as the handle (a drawn grab band, no element of its own). */
  isHandleZone?: (clientX: number, clientY: number) => boolean;
  /** Candidate visible detent heights in px below the fully open height (read lazily). */
  snapHeights?: () => number[];
  /** Whether a downward swipe may dismiss (purpose="info"). */
  canDismiss: () => boolean;
  /** The part of the panel's border box kept below the viewport (px). */
  reserve: () => number;
  /** The caller sizes the panel (a style height): the drag never writes the height. */
  hasFixedHeight?: () => boolean;
  /** A release past the dismiss line. `isTouch`: a finger's swipe (reduced motion cross-fades). */
  onDismiss: (info: {isTouch: boolean}) => void;
  /** Scrim opacity to show (1 full … 0 clear) as the drag moves and on settle. */
  onScrimOpacity?: (opacity: number) => void;
  /** A drag first moved the sheet off its detent (dismiss the keyboard here). */
  onTravelStart?: () => void;
  /** The settled visible detent height changed. */
  onSnap?: (visibleHeight: number, offset: number) => void;
}

export interface SheetGestures {
  /** Translate of the resting detent in px (0 = tallest). */
  readonly settledOffset: number;
  readonly isDragging: boolean;
  /** Measured fully open border-box height. */
  readonly sheetHeight: number;
  /** Start listening (the sheet is open). */
  attach(): void;
  /** Stop listening and drop a drag in flight (the sheet is closing). */
  detach(): void;
  /** Back to fully open with no inline geometry (each open starts here). */
  reset(): void;
  /** Drop the inline transform and transition so the host's CSS pose applies (exit). */
  release(): void;
}

interface DragState {
  synthetic: boolean;
  pointerType: string;
  pointerId: number;
  startCoord: number;
  lastTime: number;
  samples: Array<{t: number; y: number}>;
  velocity: number;
  height: number;
  reserve: number;
  baseOffset: number;
  baseLayoutOffset: number;
  renderedOffset: number;
  layoutOffset: number;
  naturalEndGap: number;
  hasTraveled: boolean;
  capture: HTMLElement | null;
}

interface PointerLike {
  synthetic?: boolean;
  pointerId: number;
  pointerType: string;
  clientY: number;
  timeStamp: number;
}

function magnetize(value: number, targets: number[]): number {
  let nearest = targets[0];
  let dist = Math.abs(value - nearest);
  for (const t of targets) {
    const d = Math.abs(value - t);
    if (d < dist) {
      dist = d;
      nearest = t;
    }
  }
  if (dist >= MAGNET_RANGE) return value;
  const t = dist / MAGNET_RANGE;
  return value + (nearest - value) * (1 - t * t);
}

const preservationInset = (base: number, target: number, gap: number) => Math.max(0, base - target - gap);
export const sheetLayoutHeight = (sheetHeight: number, layoutOffset: number) => `${Math.max(0, sheetHeight - Math.max(0, layoutOffset))}px`;
const preservationPadding = (inset: number) => (inset > 0 ? `${inset}px` : '');

function renderedEndPadding(el: HTMLElement): number {
  const v = Number.parseFloat(getComputedStyle(el).paddingBlockEnd);
  return Number.isFinite(v) ? v : 0;
}

function naturalEndGapFor(body: HTMLElement): number {
  const max = Math.max(0, body.scrollHeight - body.clientHeight - renderedEndPadding(body));
  return max - body.scrollTop;
}

function isBlockScroller(el: HTMLElement): boolean {
  if (el.scrollHeight - el.clientHeight <= 1) return false;
  const {overflowY} = getComputedStyle(el);
  return overflowY === 'auto' || overflowY === 'scroll';
}

/** A gesture inside another layer this sheet's content hosts (a nested `<dialog>`) is that layer's. */
export function isInsideNestedLayer(target: EventTarget | null, body: HTMLElement): boolean {
  for (let el = target instanceof Element ? target : null; el && el !== body; el = el.parentElement) {
    if (el.localName === 'dialog' || el.hasAttribute('popover')) return true;
  }
  return false;
}

/** Every scroller between the target and the body, innermost first, the body last. */
export function scrollChainUnder(target: EventTarget | null, body: HTMLElement): HTMLElement[] {
  const chain: HTMLElement[] = [];
  for (let el = target instanceof Element ? target : null; el && el !== body; el = el.parentElement) {
    if (el instanceof HTMLElement && isBlockScroller(el)) chain.push(el);
  }
  chain.push(body);
  return chain;
}

const atTop = (chain: HTMLElement[]) => chain.every((el) => el.scrollTop <= 0);
const atBottom = (chain: HTMLElement[]) => chain.every((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 1);
const scrolls = (chain: HTMLElement[]) => chain.some((el) => el.scrollHeight - el.clientHeight > 1);

/** iOS rubber-bands a scroller past its end even under `contain`; `none` holds it still. */
function holdAtEnd(chain: HTMLElement[]): () => void {
  const previous = chain.map((el) => el.style.overscrollBehaviorY);
  for (const el of chain) el.style.overscrollBehaviorY = 'none';
  return () => chain.forEach((el, i) => { el.style.overscrollBehaviorY = previous[i]; });
}

const touchPointerType = (touch: Touch) => ((touch as Touch & {touchType?: string}).touchType === 'stylus' ? 'pen' : 'touch');

export function createSheetGestures(options: SheetGestureOptions): SheetGestures {
  const {panel, body} = options;
  const handle = options.handle ?? null;
  const view = panel.ownerDocument.defaultView ?? window;

  let attached = false;
  let sheetHeight = 0;
  let settledOffset = 0;
  let settledLayoutOffset = 0;
  let detentIndex = 0;
  let settlingLayoutOffset: number | null = null;
  let pendingInset: number | null = null;
  let inset = 0;
  let activeOffset = 0;
  let drag: DragState | null = null;
  let reconcileFrame = 0;
  let cancelSettleWait: (() => void) | null = null;
  let observer: ResizeObserver | null = null;
  let armedBody: {pointerId: number; startCoord: number; scrollers: HTMLElement[]} | null = null;
  let touchDrag: {
    id: number;
    startY: number;
    scrollers: HTMLElement[];
    top: boolean;
    bottom: boolean;
    handle: boolean;
    contentEndY: number | null;
    promotedAtContentEnd: boolean;
    releaseHold: (() => void) | null;
  } | null = null;

  const reserve = () => Math.max(0, options.reserve());
  const fixedHeight = () => options.hasFixedHeight?.() ?? false;
  const visibleHeight = (height: number, offset: number) => Math.max(0, height - reserve() - offset);

  function resolveDetents(height: number) {
    const visible = visibleHeight(height, 0);
    const offsets = computeDetentOffsets(visible, options.snapHeights?.() ?? []);
    return {offsets, peekOffset: peekOffsetFor(offsets, visible)};
  }

  function dismissOffsetFor(height: number, offsets: number[]) {
    const max = offsets[offsets.length - 1];
    return max + visibleHeight(height, max) * DISMISS_OVERSHOOT_RATIO;
  }

  function scrimFor(offset: number, height: number) {
    const {offsets, peekOffset} = resolveDetents(height);
    return scrimOpacityForOffset(offset, offsets, dismissOffsetFor(height, offsets), peekOffset);
  }

  function measureHeight(): number {
    return sheetHeight > 0 ? sheetHeight : panel.getBoundingClientRect().height;
  }

  /** The fully open height now: drop a resized inline height for one synchronous read. */
  function measureFullyOpenHeight(): number {
    const inline = panel.style.height;
    if (inline === '' || fixedHeight()) return panel.getBoundingClientRect().height;
    panel.style.height = '';
    const h = panel.getBoundingClientRect().height;
    panel.style.height = inline;
    return h;
  }

  function writeInset(value: number) {
    const next = Math.max(0, value);
    if (Math.abs(next - inset) <= 0.5) return;
    inset = next;
    if (body !== panel) body.style.paddingBlockEnd = preservationPadding(inset);
  }

  /** The resting geometry (outside a drag), written after every state change. */
  function apply(transitionOff = false) {
    if (drag) return;
    if (sheetHeight > 0) {
      const layoutOffset = settlingLayoutOffset ?? settledLayoutOffset;
      const translation = settledOffset - layoutOffset;
      const traveling = settlingLayoutOffset != null;
      if (!fixedHeight()) panel.style.height = layoutOffset > 0 || traveling ? sheetLayoutHeight(sheetHeight, layoutOffset) : '';
      panel.style.transform = translation !== 0 ? `translateY(${translation}px)` : '';
    }
    panel.style.transition = transitionOff ? 'none' : '';
    if (body !== panel) body.style.paddingBlockEnd = preservationPadding(inset);
  }

  /** One transition-free frame: the transform/height swap has identical visible geometry. */
  function reconcile() {
    apply(true);
    void panel.offsetHeight;
    view.cancelAnimationFrame(reconcileFrame);
    reconcileFrame = view.requestAnimationFrame(() => {
      reconcileFrame = 0;
      if (!drag) panel.style.transition = '';
    });
  }

  function completeSettle() {
    cancelSettleWait = null;
    settlingLayoutOffset = null;
    const p = pendingInset;
    pendingInset = null;
    if (p != null) inset = Math.max(0, p);
    reconcile();
  }

  function prepareSettle(baseLayout: number, target: number, targetLayout: number, rendered: number, layout: number, gap: number, animate: boolean) {
    cancelSettleWait?.();
    cancelSettleWait = null;
    const targetInset = preservationInset(baseLayout, targetLayout, gap);
    if (animate && Math.abs(rendered - target) > 0.5 && !prefersReducedMotion(panel)) {
      pendingInset = targetInset;
      settlingLayoutOffset = layout;
      return true;
    }
    pendingInset = null;
    settlingLayoutOffset = null;
    inset = targetInset;
    return false;
  }

  function settleAt(target: number, d: {baseLayoutOffset: number; renderedOffset: number; layoutOffset: number; naturalEndGap: number; height: number}, offsets: number[], peekOffset: number | null) {
    const targetLayout = target === peekOffset ? 0 : target;
    const animating = prepareSettle(d.baseLayoutOffset, target, targetLayout, d.renderedOffset, d.layoutOffset, d.naturalEndGap, true);
    settledLayoutOffset = targetLayout;
    detentIndex = Math.max(0, offsets.indexOf(target));
    settledOffset = target;
    activeOffset = target;
    options.onSnap?.(visibleHeight(d.height, target), target);
    options.onScrimOpacity?.(scrimOpacityForOffset(target, offsets, dismissOffsetFor(d.height, offsets), peekOffset));
    if (animating) {
      apply();
      cancelSettleWait = waitForTransition(panel, 'transform', completeSettle);
    } else if (Math.abs(d.layoutOffset - targetLayout) > 0.5) {
      reconcile();
    } else {
      apply();
    }
  }

  function settleFromDrag(d: DragState, offset: number, velocity: number, dir: number, travel: number, isTouch: boolean) {
    const height = d.height || 1;
    const {offsets, peekOffset} = resolveDetents(height);
    const maxOffset = offsets[offsets.length - 1];
    const dismissOffset = dismissOffsetFor(height, offsets);
    const projected = travel > PROJECTION_MIN_TRAVEL ? offset + velocity * PROJECTION_FACTOR : offset;
    if (dir > 0 && projected > dismissOffset) {
      if (options.canDismiss()) {
        prepareSettle(d.baseLayoutOffset, d.baseOffset, d.baseLayoutOffset, d.baseLayoutOffset, d.baseLayoutOffset, d.naturalEndGap, false);
        settledOffset = d.baseOffset;
        activeOffset = d.baseOffset;
        // The panel leaves from where the finger let go: the host's exit pose takes over.
        panel.style.transition = '';
        options.onDismiss({isTouch});
        return;
      }
      settleAt(maxOffset, d, offsets, peekOffset);
      return;
    }
    const target = resolveSettleOffset(Math.min(Math.max(projected, 0), maxOffset), offsets, dir, d.baseOffset);
    settleAt(target, d, offsets, peekOffset);
  }

  function beginDrag(event: PointerLike, height: number, capture: HTMLElement | null, startCoord?: number) {
    if (!attached) return;
    cancelSettleWait?.();
    cancelSettleWait = null;
    if (settlingLayoutOffset != null) {
      // Caught mid-settle: take the settle's end as the base (its layout split stays).
      settlingLayoutOffset = null;
      if (pendingInset != null) inset = pendingInset;
      pendingInset = null;
    }
    if (capture && !event.synthetic) {
      try {
        capture.setPointerCapture(event.pointerId);
      } catch {
        /* not an active pointer */
      }
    }
    if (sheetHeight <= 0 && height > 0) sheetHeight = height;
    const gap = naturalEndGapFor(body);
    drag = {
      synthetic: !!event.synthetic,
      pointerType: event.pointerType,
      pointerId: event.pointerId,
      startCoord: startCoord ?? event.clientY,
      lastTime: event.timeStamp,
      samples: [{t: event.timeStamp, y: event.clientY}],
      velocity: 0,
      height,
      reserve: reserve(),
      baseOffset: settledOffset,
      baseLayoutOffset: settledLayoutOffset,
      renderedOffset: settledOffset,
      layoutOffset: settledLayoutOffset,
      naturalEndGap: gap,
      hasTraveled: false,
      capture: event.synthetic ? null : capture,
    };
    writeInset(preservationInset(settledLayoutOffset, settledLayoutOffset, gap));
    panel.style.transition = 'none';
    if (sheetHeight > 0 && !fixedHeight()) panel.style.height = sheetLayoutHeight(sheetHeight, settledLayoutOffset);
    panel.toggleAttribute('data-sheet-dragging', true);
  }

  function moveDrag(event: PointerLike) {
    const d = drag;
    if (!d || d.pointerId !== event.pointerId) return;
    if (d.synthetic && !event.synthetic) return;
    const delta = event.clientY - d.startCoord;
    const dt = event.timeStamp - d.lastTime;
    if (dt > 0) {
      d.lastTime = event.timeStamp;
      d.samples.push({t: event.timeStamp, y: event.clientY});
      while (d.samples.length > 2 && event.timeStamp - d.samples[0].t > VELOCITY_WINDOW_MS) d.samples.shift();
      const first = d.samples[0];
      const span = Math.min(event.timeStamp - first.t, VELOCITY_WINDOW_MS);
      d.velocity = span > 0 ? (event.clientY - first.y) / span : 0;
    }
    const {offsets, peekOffset} = resolveDetents(d.height);
    const raw = d.baseOffset + delta;
    const maxDetent = offsets[offsets.length - 1];
    let next: number;
    if (raw < 0) {
      next = d.pointerType === 'touch'
        ? Math.max(-d.reserve, rubberBand(raw, d.height - d.reserve, RUBBER_BAND_COEFFICIENT))
        : Math.max(-OVERSCROLL_MAX, raw * OVERSCROLL_RESISTANCE);
    } else if (raw > maxDetent) {
      next = raw;
    } else {
      next = magnetize(raw, offsets);
    }
    const layoutOffset = next < d.baseOffset ? 0 : d.baseLayoutOffset;
    const layoutChanged = layoutOffset !== d.layoutOffset;
    d.renderedOffset = next;
    d.layoutOffset = layoutOffset;
    activeOffset = next;
    writeInset(preservationInset(d.baseLayoutOffset, layoutOffset, d.naturalEndGap));
    const translation = next - layoutOffset;
    panel.style.transform = translation !== 0 ? `translateY(${translation}px)` : '';
    if (layoutChanged && d.height > 0 && !fixedHeight()) panel.style.height = sheetLayoutHeight(d.height, layoutOffset);
    if (!d.hasTraveled && next !== d.baseOffset) {
      d.hasTraveled = true;
      options.onTravelStart?.();
    }
    options.onScrimOpacity?.(scrimOpacityForOffset(next, offsets, dismissOffsetFor(d.height, offsets), peekOffset));
  }

  function endDrag(event: PointerLike) {
    const d = drag;
    if (!d || d.pointerId !== event.pointerId) return;
    if (d.synthetic && !event.synthetic) return;
    const delta = event.clientY - d.startCoord;
    const offset = Math.max(0, d.baseOffset + delta);
    const dir = delta === 0 ? 0 : delta > 0 ? 1 : -1;
    const velocity = event.timeStamp - d.lastTime < VELOCITY_WINDOW_MS ? d.velocity : 0;
    drag = null;
    panel.removeAttribute('data-sheet-dragging');
    if (d.capture?.hasPointerCapture?.(d.pointerId)) d.capture.releasePointerCapture(d.pointerId);
    settleFromDrag(d, offset, velocity, dir, Math.abs(delta), d.pointerType === 'touch');
  }

  /** An interrupted drag returns to its resting detent (and its scrim). */
  function cancelDrag() {
    const d = drag;
    if (!d) return;
    drag = null;
    panel.removeAttribute('data-sheet-dragging');
    if (d.capture?.hasPointerCapture?.(d.pointerId)) d.capture.releasePointerCapture(d.pointerId);
    const animating = prepareSettle(d.baseLayoutOffset, d.baseOffset, d.baseLayoutOffset, d.renderedOffset, d.layoutOffset, d.naturalEndGap, true);
    settledOffset = d.baseOffset;
    activeOffset = d.baseOffset;
    options.onScrimOpacity?.(scrimFor(d.baseOffset, d.height));
    if (animating) {
      apply();
      cancelSettleWait = waitForTransition(panel, 'transform', completeSettle);
    } else {
      reconcile();
    }
  }

  function yieldToPinch() {
    touchDrag?.releaseHold?.();
    touchDrag = null;
    armedBody = null;
    cancelDrag();
  }

  /** Viewport fractions mean new pixels after a resize: re-anchor the same stop by index. */
  function reanchor() {
    if (!attached || drag || settlingLayoutOffset != null) return;
    const height = measureFullyOpenHeight();
    if (height <= 0) return;
    const {offsets, peekOffset} = resolveDetents(height);
    const index = Math.min(detentIndex, offsets.length - 1);
    const target = offsets[index];
    const targetLayout = target === peekOffset ? 0 : target;
    if (height === sheetHeight && Math.abs(target - activeOffset) <= 0.5 && Math.abs(targetLayout - settledLayoutOffset) <= 0.5) return;
    sheetHeight = height;
    detentIndex = index;
    prepareSettle(settledLayoutOffset, target, targetLayout, target, settledLayoutOffset, naturalEndGapFor(body), false);
    settledLayoutOffset = targetLayout;
    settledOffset = target;
    activeOffset = target;
    options.onSnap?.(visibleHeight(height, target), target);
    options.onScrimOpacity?.(scrimOpacityForOffset(target, offsets, dismissOffsetFor(height, offsets), peekOffset));
    reconcile();
  }

  // ── Event handling (element listeners only; window resize/blur while attached) ──

  const asPointer = (touch: Touch, timeStamp: number): PointerLike => ({
    synthetic: true,
    pointerId: touch.identifier,
    pointerType: touchPointerType(touch),
    clientY: touch.clientY,
    timeStamp,
  });

  function onHandlePointerDown(event: PointerEvent) {
    if (!event.isPrimary) return yieldToPinch();
    if (event.button !== 0) return;
    // The handle has no focus action: keep focus (and the keyboard) where it is on a tap.
    event.preventDefault();
    beginDrag(event, measureHeight(), handle);
  }

  function onBodyPointerDown(event: PointerEvent) {
    if (!event.isPrimary) return yieldToPinch();
    if (event.button !== 0 || event.pointerType === 'touch') return;
    if (isInsideNestedLayer(event.target, body)) {
      armedBody = null;
      return;
    }
    if (options.isHandleZone?.(event.clientX, event.clientY)) {
      event.preventDefault();
      beginDrag(event, measureHeight(), body);
      return;
    }
    const scrollers = scrollChainUnder(event.target, body);
    armedBody = atTop(scrollers) ? {pointerId: event.pointerId, startCoord: event.clientY, scrollers} : null;
  }

  function onPointerMove(event: PointerEvent) {
    if (drag) {
      moveDrag(event);
      return;
    }
    const armed = armedBody;
    if (!armed || armed.pointerId !== event.pointerId || event.currentTarget !== body) return;
    const delta = event.clientY - armed.startCoord;
    if (delta > DRAG_PROMOTION_SLOP && atTop(armed.scrollers)) {
      armedBody = null;
      beginDrag(event, measureHeight(), body, armed.startCoord);
      moveDrag(event);
    } else if (delta < 0) {
      armedBody = null;
    }
  }

  function onPointerUp(event: PointerEvent) {
    armedBody = null;
    if (drag?.synthetic) return;
    endDrag(event);
  }

  function onPointerCancel(event: PointerEvent) {
    armedBody = null;
    // A cancel is not a release: return to the detent (pinch, a browser gesture).
    if (drag && !drag.synthetic && drag.pointerId === event.pointerId) cancelDrag();
  }

  function onLostCapture(event: PointerEvent) {
    if (drag && !drag.synthetic && drag.pointerId === event.pointerId) cancelDrag();
  }

  function onContextMenu(event: MouseEvent) {
    if (!drag) return;
    event.preventDefault();
    cancelDrag();
  }

  function onHandleTouch(event: TouchEvent) {
    if (event.touches.length > 1) yieldToPinch();
  }

  function onTouchStart(event: TouchEvent) {
    if (event.touches.length > 1) return yieldToPinch();
    touchDrag?.releaseHold?.();
    const touch = event.changedTouches[0];
    if (!touch || isInsideNestedLayer(event.target, body)) {
      touchDrag = null;
      return;
    }
    const scrollers = scrollChainUnder(event.target, body);
    const isHandle = options.isHandleZone?.(touch.clientX, touch.clientY) ?? false;
    touchDrag = {
      id: touch.identifier,
      startY: touch.clientY,
      scrollers,
      top: atTop(scrollers),
      // Claim a pull up only below the tallest stop or over content that cannot scroll.
      bottom: atBottom(scrollers) && (activeOffset > 0 || !scrolls(scrollers)),
      handle: isHandle,
      contentEndY: null,
      promotedAtContentEnd: false,
      releaseHold: null,
    };
  }

  function onTouchMove(event: TouchEvent) {
    if (event.touches.length > 1) return yieldToPinch();
    const armed = touchDrag;
    if (drag) {
      const t = [...event.changedTouches].find((x) => x.identifier === drag?.pointerId);
      if (!t) return;
      if (armed?.promotedAtContentEnd && armed.contentEndY != null) {
        if (t.clientY >= armed.contentEndY) {
          // Back where the content ran out: hand the gesture back to the scroller.
          armed.contentEndY = null;
          armed.promotedAtContentEnd = false;
          armed.releaseHold?.();
          armed.releaseHold = null;
          cancelDrag();
          return;
        }
        moveDrag(asPointer(t, event.timeStamp));
        return;
      }
      if (event.cancelable) event.preventDefault();
      moveDrag(asPointer(t, event.timeStamp));
      return;
    }
    if (!armed) return;
    const t = [...event.changedTouches].find((x) => x.identifier === armed.id);
    if (!t) return;
    const delta = t.clientY - armed.startY;
    const pullDownAtTop = armed.top && delta > DRAG_PROMOTION_SLOP && atTop(armed.scrollers);
    const pullUpAtBottom = armed.bottom && delta < -DRAG_PROMOTION_SLOP && atBottom(armed.scrollers);
    const handleDrag = armed.handle && Math.abs(delta) > DRAG_PROMOTION_SLOP;
    if ((pullDownAtTop || pullUpAtBottom || handleDrag) && event.cancelable) {
      event.preventDefault();
      armed.releaseHold?.();
      touchDrag = null;
      beginDrag(asPointer(t, event.timeStamp), measureHeight(), null, armed.startY);
      moveDrag(asPointer(t, event.timeStamp));
      return;
    }
    if ((armed.top && delta < 0) || (armed.bottom && delta > 0)) {
      armed.top = false;
      armed.bottom = false;
    }
    // The content ran out mid-gesture: anchor there and give the sheet the travel beyond it.
    if (atBottom(armed.scrollers)) {
      if (armed.contentEndY == null) {
        armed.contentEndY = t.clientY;
        armed.releaseHold ??= holdAtEnd(armed.scrollers);
      } else if (armed.contentEndY - t.clientY >= CONTENT_END_HANDOFF_SLOP) {
        armed.promotedAtContentEnd = true;
        beginDrag(asPointer(t, event.timeStamp), measureHeight(), null, armed.contentEndY);
        moveDrag(asPointer(t, event.timeStamp));
      }
    } else {
      armed.contentEndY = null;
      armed.releaseHold?.();
      armed.releaseHold = null;
    }
  }

  function onTouchEnd(event: TouchEvent) {
    touchDrag?.releaseHold?.();
    touchDrag = null;
    const id = drag?.pointerId;
    if (id == null || !drag?.synthetic) return;
    const t = [...event.changedTouches].find((x) => x.identifier === id);
    if (t) endDrag(asPointer(t, event.timeStamp));
    else if (event.touches.length === 0) cancelDrag();
  }

  function onBodyScroll() {
    if (drag || settlingLayoutOffset != null || inset <= 0) return;
    const max = Math.max(0, body.scrollHeight - body.clientHeight - renderedEndPadding(body));
    const required = Math.max(0, body.scrollTop - max);
    if (required < inset - 0.5) writeInset(required);
  }

  function onBlur() {
    cancelDrag();
  }

  function recordHeight(height: number) {
    if (height <= 0 || !attached || drag || activeOffset > 0 || settlingLayoutOffset != null) return;
    sheetHeight = height;
  }

  const listeners: Array<[EventTarget, string, EventListener, AddEventListenerOptions?]> = [];
  const listen = (target: EventTarget | null, type: string, fn: (e: never) => void, opts?: AddEventListenerOptions) => {
    if (target) listeners.push([target, type, fn as EventListener, opts]);
  };
  if (handle) {
    listen(handle, 'pointerdown', onHandlePointerDown);
    listen(handle, 'pointermove', onPointerMove);
    listen(handle, 'pointerup', onPointerUp);
    listen(handle, 'pointercancel', onPointerCancel);
    listen(handle, 'lostpointercapture', onLostCapture);
    listen(handle, 'contextmenu', onContextMenu);
    listen(handle, 'touchstart', onHandleTouch, {passive: true});
    listen(handle, 'touchmove', onHandleTouch, {passive: true});
  }
  listen(body, 'pointerdown', onBodyPointerDown);
  listen(body, 'pointermove', onPointerMove);
  listen(body, 'pointerup', onPointerUp);
  listen(body, 'pointercancel', onPointerCancel);
  listen(body, 'lostpointercapture', onLostCapture);
  listen(body, 'contextmenu', onContextMenu);
  listen(body, 'touchstart', onTouchStart, {passive: true});
  listen(body, 'touchmove', onTouchMove, {passive: false});
  listen(body, 'touchend', onTouchEnd, {passive: true});
  listen(body, 'touchcancel', onTouchEnd, {passive: true});
  listen(body, 'scroll', onBodyScroll, {passive: true});
  listen(view, 'resize', reanchor);
  listen(view, 'orientationchange', reanchor);
  listen(view, 'blur', onBlur);

  return {
    get settledOffset() {
      return settledOffset;
    },
    get isDragging() {
      return drag != null;
    },
    get sheetHeight() {
      return sheetHeight;
    },
    attach() {
      if (attached) return;
      attached = true;
      for (const [t, type, fn, opts] of listeners) t.addEventListener(type, fn, opts);
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (entry) recordHeight(entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height);
        });
        observer.observe(panel);
      }
    },
    detach() {
      if (!attached) return;
      if (drag) {
        const d = drag;
        drag = null;
        panel.removeAttribute('data-sheet-dragging');
        if (d.capture?.hasPointerCapture?.(d.pointerId)) d.capture.releasePointerCapture(d.pointerId);
      }
      touchDrag?.releaseHold?.();
      touchDrag = null;
      armedBody = null;
      attached = false;
      for (const [t, type, fn, opts] of listeners) t.removeEventListener(type, fn, opts);
      observer?.disconnect();
      observer = null;
      cancelSettleWait?.();
      cancelSettleWait = null;
      view.cancelAnimationFrame(reconcileFrame);
      reconcileFrame = 0;
    },
    reset() {
      settledOffset = 0;
      settledLayoutOffset = 0;
      activeOffset = 0;
      detentIndex = 0;
      settlingLayoutOffset = null;
      pendingInset = null;
      inset = 0;
      sheetHeight = 0;
      panel.style.removeProperty('transform');
      panel.style.removeProperty('transition');
      if (!fixedHeight()) panel.style.removeProperty('height');
      if (body !== panel) body.style.removeProperty('padding-block-end');
    },
    release() {
      panel.style.removeProperty('transform');
      panel.style.removeProperty('transition');
      panel.removeAttribute('data-sheet-dragging');
    },
  };
}
