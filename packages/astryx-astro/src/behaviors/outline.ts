/**
 * data-ax-outline — Outline's scroll-spy and navigation. Port of @astryxdesign/core
 * Outline/useScrollSpy.ts (getScrollableAncestor, getRestingTop, scrollToTarget,
 * resolveActiveId, scrollTo with settle detection) and Outline/Outline.tsx (navigate,
 * moveFocusTo, the click and Space handlers).
 *
 * The scroll root is `data-ax-scroll-container` (a selector), else the nearest scrollable
 * ancestor of the nav, else the viewport. Listeners: the scroll root's `scroll` (passive,
 * rAF-throttled) and the window's `resize`; while a navigation is in flight, `scrollend`,
 * `wheel` and `touchmove` on the scroll root and a window `keydown` for manual scroll keys.
 * Without CSS anchor positioning the indicator is placed from the active link's box.
 *
 * Element API (on the nav): `activeId` (get/set; a controlled outline moves only through
 * it). Events (bubbling, composed): `astryx-active-id-change` {id}, `astryx-navigate-start`
 * {id}, `astryx-navigate-end` {id}.
 */
import {defineBehavior} from '../elements/behavior';

const SCROLL_SETTLE_TIMEOUT_MS = 1200;
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar']);

function getScrollableAncestor(element: HTMLElement | null): HTMLElement | null {
  let current = element?.parentElement ?? null;
  while (current != null) {
    const overflowY = getComputedStyle(current).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && current.scrollHeight > current.clientHeight) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

const scrollMarginTop = (el: HTMLElement) => Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
const rootTop = (root: HTMLElement | null) => (root != null ? root.getBoundingClientRect().top : 0);
/** Where a heading comes to rest: shared by the activation line and the scroll landing. */
const restingTop = (target: HTMLElement, root: HTMLElement | null, offset: number) => rootTop(root) + offset + scrollMarginTop(target);
const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.querySelector('[data-astryx-reduced-motion]') != null;

function resolveActiveId(ids: string[], root: HTMLElement | null, offset: number): string | undefined {
  if (ids.length === 0) return undefined;
  const atBottom = root != null
    ? root.scrollTop + root.clientHeight >= root.scrollHeight - 2
    : window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
  if (atBottom) return ids[ids.length - 1];
  let active = ids[0];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el == null) continue;
    // 1px of tolerance absorbs sub-pixel rounding after a scroll lands.
    if (el.getBoundingClientRect().top <= restingTop(el, root, offset) + 1) active = id;
    else break;
  }
  return active;
}

/** A followed in-page link moves the sequential focus starting point to its target. */
function moveFocusTo(id: string) {
  const target = document.getElementById(id);
  if (target == null) return;
  target.focus({preventScroll: true});
  if (document.activeElement !== target && !target.hasAttribute('tabindex')) {
    target.setAttribute('tabindex', '-1');
    target.focus({preventScroll: true});
  }
}

const supportsAnchors = () => typeof CSS !== 'undefined' && CSS.supports('anchor-name: --a');

defineBehavior('outline', (nav) => {
  const isControlled = nav.hasAttribute('data-ax-controlled');
  const offset = Number(nav.getAttribute('data-ax-offset') ?? 0) || 0;
  const hasScrollOnClick = !nav.hasAttribute('data-ax-no-scroll');
  const links = () => [...nav.querySelectorAll<HTMLAnchorElement>('a[data-ax-outline-id]')];
  const ids = () => links().map((a) => a.getAttribute('data-ax-outline-id')!);
  const indicator = nav.querySelector<HTMLElement>(':scope > .astryx-outline-indicator');
  const getScrollRoot = (): HTMLElement | null => {
    const selector = nav.getAttribute('data-ax-scroll-container');
    if (selector) {
      try {
        const el = document.querySelector<HTMLElement>(selector);
        if (el) return el;
      } catch { /* invalid selector: fall through */ }
    }
    return getScrollableAncestor(nav);
  };

  let active: string | undefined = links().find((a) => a.hasAttribute('data-active'))?.getAttribute('data-ax-outline-id') ?? undefined;
  let suppress = false;
  let navigation: {supersede: () => void; teardown: () => void} | null = null;
  let sync: (() => void) | null = null;

  const emit = (type: string, id: string) => nav.dispatchEvent(new CustomEvent(type, {bubbles: true, composed: true, detail: {id}}));

  const placeIndicator = () => {
    if (!indicator || supportsAnchors()) return;
    const link = links().find((a) => a.hasAttribute('data-active'));
    if (!link) { indicator.style.height = '0px'; return; }
    const navBox = nav.getBoundingClientRect();
    const box = link.getBoundingClientRect();
    indicator.style.top = `${box.top - navBox.top}px`;
    indicator.style.height = `${box.height}px`;
  };

  /** Paint `id` as the active item. */
  const paint = (id: string | undefined) => {
    active = id;
    for (const link of links()) {
      const on = link.getAttribute('data-ax-outline-id') === id;
      if (on) {
        link.setAttribute('aria-current', 'location');
        link.setAttribute('data-active', 'active');
      } else {
        link.removeAttribute('aria-current');
        link.removeAttribute('data-active');
      }
    }
    placeIndicator();
  };

  /** Uncontrolled change from scroll or an arrival: paint and notify. */
  const change = (id: string) => {
    if (id === active) return;
    paint(id);
    emit('astryx-active-id-change', id);
  };

  // ── Scroll-spy (uncontrolled) ────────────────────────────────────────────
  const cleanups: Array<() => void> = [];
  if (!isControlled) {
    const scrollRoot = getScrollRoot();
    const scrollTarget: HTMLElement | Window = scrollRoot ?? window;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (suppress) return;
      const next = resolveActiveId(ids(), scrollRoot, offset);
      if (next != null) change(next);
    };
    const onScroll = () => { if (frame === 0) frame = requestAnimationFrame(update); };
    sync = update;
    update();
    scrollTarget.addEventListener('scroll', onScroll, {passive: true});
    window.addEventListener('resize', onScroll, {passive: true});
    cleanups.push(() => {
      sync = null;
      scrollTarget.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    });
  } else {
    const onResize = () => placeIndicator();
    window.addEventListener('resize', onResize, {passive: true});
    cleanups.push(() => window.removeEventListener('resize', onResize));
  }
  placeIndicator();

  // ── Navigation (the single path shared by click and Space) ───────────────
  const scrollTo = (id: string): boolean => {
    const target = document.getElementById(id);
    if (target == null) return false;
    navigation?.supersede();
    emit('astryx-navigate-start', id);
    if (isControlled) emit('astryx-active-id-change', id);
    else suppress = true;

    const scrollRoot = getScrollRoot();
    const scrollTarget: HTMLElement | Window = scrollRoot ?? window;
    let settleTimer = 0;
    let isSettled = false;

    const cleanup = () => {
      scrollTarget.removeEventListener('scrollend', onSettle);
      scrollTarget.removeEventListener('wheel', onManual);
      scrollTarget.removeEventListener('touchmove', onManual);
      window.removeEventListener('keydown', onKeyDown);
      if (settleTimer !== 0) { clearTimeout(settleTimer); settleTimer = 0; }
      navigation = null;
    };
    const finish = (didArrive: boolean, shouldResume = true) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      if (!isControlled) {
        suppress = false;
        if (didArrive) change(id);
        else if (shouldResume) sync?.();
      }
      emit('astryx-navigate-end', id);
    };
    const onSettle = () => finish(true);
    const onManual = () => finish(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.defaultPrevented && SCROLL_KEYS.has(event.key)) finish(false);
    };

    if (hasScrollOnClick) {
      // Armed before scrolling, so an instant jump cannot land before anyone listens.
      scrollTarget.addEventListener('scrollend', onSettle, {once: true});
      scrollTarget.addEventListener('wheel', onManual, {passive: true});
      scrollTarget.addEventListener('touchmove', onManual, {passive: true});
      window.addEventListener('keydown', onKeyDown);
      settleTimer = window.setTimeout(onSettle, SCROLL_SETTLE_TIMEOUT_MS);
      navigation = {supersede: () => finish(false, false), teardown: cleanup};
      const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
      if (offset === 0) {
        target.scrollIntoView({behavior, block: 'start'});
      } else {
        const delta = target.getBoundingClientRect().top - restingTop(target, scrollRoot, offset);
        scrollTarget.scrollBy({top: delta, behavior});
      }
    } else {
      finish(true);
    }
    return true;
  };

  const navigate = (id: string) => {
    if (scrollTo(id)) {
      window.history.pushState(null, '', `#${id}`);
      moveFocusTo(id);
    }
  };
  const hasModifier = (e: MouseEvent | KeyboardEvent) => e.metaKey || e.altKey || e.ctrlKey || e.shiftKey;
  const linkOf = (event: Event) => {
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[data-ax-outline-id]') : null;
    return link && nav.contains(link) ? link : null;
  };

  const onClick = (event: MouseEvent) => {
    const link = linkOf(event);
    if (!link || event.defaultPrevented || hasModifier(event)) return;
    const id = link.getAttribute('data-ax-outline-id')!;
    // No target in the DOM (lazy or virtualized content): native fragment navigation.
    if (document.getElementById(id) == null) return;
    event.preventDefault();
    navigate(id);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== ' ' && event.key !== 'Spacebar') return;
    const link = linkOf(event);
    if (!link || event.defaultPrevented || hasModifier(event)) return;
    // Stops the page scroll, and tells the spy this Space is an activation.
    event.preventDefault();
    navigate(link.getAttribute('data-ax-outline-id')!);
  };
  nav.addEventListener('click', onClick);
  nav.addEventListener('keydown', onKeyDown);

  Object.defineProperty(nav, 'activeId', {
    configurable: true,
    get: () => active,
    set: (id: string | undefined) => paint(id ?? undefined),
  });

  return () => {
    nav.removeEventListener('click', onClick);
    nav.removeEventListener('keydown', onKeyDown);
    navigation?.teardown();
    for (const fn of cleanups.splice(0)) fn();
    delete (nav as unknown as Record<string, unknown>).activeId;
  };
});
