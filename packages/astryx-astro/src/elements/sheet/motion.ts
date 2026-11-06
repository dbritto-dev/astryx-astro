/**
 * The motion math and transition plumbing bottom sheets need — no framework.
 *
 * Ports of @astryxdesign/core 0.7.9:
 * - motion/rubberBand.ts (`rubberBand`: UIScrollView's resistance past an edge,
 *   b = (1 − 1 ÷ (x·c ÷ d + 1))·d) and the two motion/uikit/scroll.ts constants it and the
 *   release projection read (rubber-band coefficient 0.55, normal deceleration 0.998/ms);
 * - BottomSheet/BottomSheetPanel.tsx `waitForTransition` / `hasRunningTransition` /
 *   `parseTransitionTime` (a motion completes when its CSS transition ends, with a backstop
 *   from the computed timing so `transition: none` or a 0s token never strands it).
 *
 * The rest of motion/ (springs, decay, coast, the compositor animator) is not needed: the
 * sheet settles with CSS transitions on the design tokens, as Astryx's panel does.
 */

/** motion/uikit/scroll.ts `scroll.rubberBand.coefficient` (measured, UISheetPresentationController). */
export const RUBBER_BAND_COEFFICIENT = 0.55;
/** motion/uikit/scroll.ts `scroll.decelerationRate.normal`: velocity × this every ms. */
export const DECELERATION_RATE = 0.998;

/** Displayed overflow for a finger `overflow` past the edge (signed); `dimension` is the axis size. */
export function rubberBand(overflow: number, dimension: number, coefficient: number = RUBBER_BAND_COEFFICIENT): number {
  if (!(dimension > 0)) return 0;
  const x = Math.abs(overflow);
  const banded = (1 - 1 / ((x * coefficient) / dimension + 1)) * dimension;
  return overflow < 0 ? -banded : banded;
}

const TRANSITION_BACKSTOP_BUFFER_MS = 50;

function parseTransitionTime(value: string): number | null {
  const v = value.trim();
  if (!/^-?(?:\d+|\d*\.\d+)(?:ms|s)$/.test(v)) return null;
  const time = Number.parseFloat(v);
  return v.endsWith('ms') ? time : time * 1000;
}

/** Whether a CSS transition of `property` runs (or is pending) on `element` now. */
export function isTransitionRunning(element: HTMLElement, property: string): boolean {
  void getComputedStyle(element).transform;
  return hasRunningTransition(element, property);
}

/** Whether a CSS transition of `property` still runs on `element`. */
function hasRunningTransition(element: HTMLElement, property: string): boolean {
  return (element.getAnimations?.() ?? []).some(
    (a) => (a as Animation & {transitionProperty?: string}).transitionProperty === property && (a.playState === 'running' || a.playState === 'paused'),
  );
}

/**
 * Call `complete` once `element`'s `property` transition ends (or is cancelled for good), or
 * at once when there is none to wait for. Returns a cancel function.
 */
export function waitForTransition(element: HTMLElement | null, property: 'transform' | 'opacity', complete: () => void): () => void {
  if (!element) {
    complete();
    return () => {};
  }
  let done = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let backstop = 0;
  const cleanup = () => {
    if (timer != null) clearTimeout(timer);
    timer = null;
    element.removeEventListener('transitionend', onEnd);
    element.removeEventListener('transitioncancel', onEnd);
  };
  const finish = () => {
    if (done) return;
    done = true;
    cleanup();
    complete();
  };
  const onEnd = (event: TransitionEvent) => {
    if (event.target !== element || event.propertyName !== property) return;
    // A transition whose end value moved mid-flight is cancelled and replaced; the
    // replacement ends the motion, not the cancel.
    if (event.type === 'transitioncancel' && hasRunningTransition(element, property)) {
      if (timer != null) {
        clearTimeout(timer);
        timer = setTimeout(finish, backstop);
      }
      return;
    }
    finish();
  };
  element.addEventListener('transitionend', onEnd);
  element.addEventListener('transitioncancel', onEnd);
  const cs = getComputedStyle(element);
  if (element.style.transition.trim() === 'none' || cs.transition.trim() === 'none') {
    finish();
    return () => {};
  }
  const properties = cs.transitionProperty.split(',').map((p) => p.trim());
  const durations = cs.transitionDuration.split(',').map(parseTransitionTime);
  const delays = cs.transitionDelay.split(',').map(parseTransitionTime);
  let unresolved = false;
  const ms = properties.reduce((longest, p, i) => {
    if (p !== property && p !== 'all') return longest;
    const d = durations[i % durations.length];
    const dl = delays[i % delays.length];
    if (d == null || dl == null) {
      unresolved = true;
      return longest;
    }
    return Math.max(longest, d + dl);
  }, 0);
  if (unresolved) return () => { done = true; cleanup(); };
  if (ms <= 0) {
    finish();
    return () => {};
  }
  backstop = ms + TRANSITION_BACKSTOP_BUFFER_MS;
  timer = setTimeout(finish, backstop);
  return () => {
    done = true;
    cleanup();
  };
}

/** `(prefers-reduced-motion: reduce)` or a theme's `[data-astryx-reduced-motion]`. */
export function prefersReducedMotion(el?: Element | null): boolean {
  if (typeof window === 'undefined') return false;
  if (el?.closest?.('[data-astryx-reduced-motion]')) return true;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
