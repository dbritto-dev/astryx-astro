/**
 * <ax-carousel> — the behaviour of Carousel (port of @astryxdesign/core Carousel/Carousel.tsx
 * handlers and effects, hooks/useScrollOverflow.ts, hooks/isRtlElement.ts). Light DOM: the
 * element is the carousel root; it measures its scroller (`.astryx-carousel-scroller`) and
 * drives the buttons in its button layer (`.ax-carousel-buttons`, an `<ax-layer>` anchored to
 * the root).
 *
 * - Overflow state (tolerance 1px, RTL-safe via |scrollLeft|) from scroll, ResizeObserver on
 *   the scroller and each slide, and child mutations; written as `data-ax-overflow-start|end`
 *   and `data-ax-fade` on the scroller, `tabindex` 0 while it overflows (else -1, so the edge
 *   hand-off can still focus it), and the pills' `data-ax-hidden` + the buttons' `disabled`.
 * - Buttons scroll by ~one viewport; `data-ax-loop` wraps at the edges. Shift + vertical wheel
 *   scrolls horizontally. Reduced motion: instant scrolls.
 * - When the focused button's edge runs out it is disabled and focus moves to the scroller
 *   with preventScroll (FR2).
 * API: scrollNext(), scrollPrev(), scrollTo(index), canScrollNext(), canScrollPrev().
 */
interface OverflowState {
  overflowStart: boolean;
  overflowEnd: boolean;
  hasOverflow: boolean;
}

const isRtlElement = (el: Element | null) => el != null && getComputedStyle(el).direction === 'rtl';
const prefersReducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isRendered = (el: HTMLElement) => typeof el.checkVisibility !== 'function' || el.checkVisibility();

export class AxCarousel extends HTMLElement {
  #state: OverflowState = {overflowStart: false, overflowEnd: false, hasOverflow: false};
  #cleanups: Array<() => void> = [];
  #observed = new Map<Element, true>();
  #ro: ResizeObserver | null = null;

  get scroller(): HTMLElement | null {
    return this.querySelector<HTMLElement>(':scope > .astryx-carousel-scroller');
  }

  get #loop(): boolean {
    return this.hasAttribute('data-ax-loop');
  }

  connectedCallback(): void {
    const scroller = this.scroller;
    if (!scroller) return;
    const measure = () => this.#measure(true);
    const onScroll = () => this.#measure(false);
    this.#ro = new ResizeObserver(measure);
    this.#ro.observe(scroller);
    const follow = () => {
      for (const child of scroller.children) {
        if (!this.#observed.has(child)) {
          this.#ro!.observe(child);
          this.#observed.set(child, true);
        }
      }
    };
    follow();
    const mo = new MutationObserver(() => {
      follow();
      measure();
    });
    mo.observe(scroller, {childList: true, attributes: true, attributeFilter: ['class', 'style']});
    scroller.addEventListener('scroll', onScroll, {passive: true});
    // Map Shift + vertical wheel to horizontal scroll (a mouse only produces deltaY).
    const onWheel = (event: WheelEvent) => {
      if (!event.shiftKey || event.deltaY === 0 || event.deltaX !== 0) return;
      if (scroller.scrollWidth <= scroller.clientWidth) return;
      event.preventDefault();
      scroller.scrollBy({left: event.deltaY, behavior: 'auto'});
    };
    scroller.addEventListener('wheel', onWheel, {passive: false});
    const onClick = (event: Event) => {
      const nav = (event.target as Element).closest<HTMLButtonElement>('.ax-carousel-nav');
      if (!nav || !this.contains(nav) || nav.disabled) return;
      this.#scrollBy(nav.dataset.side === 'start' ? -1 : 1);
    };
    this.addEventListener('click', onClick);
    this.#cleanups.push(() => {
      this.#ro?.disconnect();
      this.#ro = null;
      this.#observed.clear();
      mo.disconnect();
      scroller.removeEventListener('scroll', onScroll);
      scroller.removeEventListener('wheel', onWheel);
      this.removeEventListener('click', onClick);
    });
    this.#measure(true);
  }

  disconnectedCallback(): void {
    for (const fn of this.#cleanups.splice(0)) fn();
  }

  // ── API (CarouselHandle) ──────────────────────────────────────────────────

  scrollNext(): void {
    this.#scrollBy(1);
  }

  scrollPrev(): void {
    this.#scrollBy(-1);
  }

  /**
   * CarouselHandle.scrollTo(index): bring item `index` (clamped) to the start edge, scrolling
   * only the carousel. Element.scrollTo's own forms (options, or x and y) pass through.
   */
  override scrollTo(index?: number | ScrollToOptions, y?: number): void {
    if (typeof index !== 'number' || y !== undefined) {
      if (typeof index === 'number') super.scrollTo(index, y ?? 0);
      else super.scrollTo(index);
      return;
    }
    this.scrollToIndex(index);
  }

  /** The same as `scrollTo(index)`, without the Element overload. */
  scrollToIndex(index: number): void {
    const el = this.scroller;
    const items = el?.children;
    if (!el || !items || items.length === 0) return;
    const target = items[Math.max(0, Math.min(index, items.length - 1))] as HTMLElement;
    const containerRect = el.getBoundingClientRect();
    const itemRect = target.getBoundingClientRect();
    const delta = isRtlElement(el) ? itemRect.right - containerRect.right : itemRect.left - containerRect.left;
    el.scrollBy({left: delta, behavior: prefersReducedMotion() ? 'auto' : 'smooth'});
  }

  canScrollNext(): boolean {
    this.#measure(false);
    return this.#loop ? this.#state.hasOverflow : this.#state.overflowEnd;
  }

  canScrollPrev(): boolean {
    this.#measure(false);
    return this.#loop ? this.#state.hasOverflow : this.#state.overflowStart;
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  #scrollBy(direction: -1 | 1) {
    const el = this.scroller;
    if (!el) return;
    const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
    // Under RTL the scroll axis is inverted (start is 0, the end negative): flip the sign.
    const rtlSign = isRtlElement(el) ? -1 : 1;
    const {overflowStart, overflowEnd, hasOverflow} = this.#state;
    if (this.#loop && hasOverflow) {
      const atEnd = direction === 1 && !overflowEnd;
      const atStart = direction === -1 && !overflowStart;
      if (atEnd || atStart) {
        el.scrollBy({left: rtlSign * -direction * el.scrollWidth, behavior});
        return;
      }
    }
    const firstChild = el.firstElementChild as HTMLElement | null;
    const itemWidth = firstChild ? firstChild.offsetWidth : 0;
    const amount = el.clientWidth - itemWidth * 0.5;
    el.scrollBy({left: rtlSign * direction * Math.max(amount, itemWidth), behavior});
  }

  #measure(requireRendered: boolean) {
    const el = this.scroller;
    if (!el || (requireRendered && !isRendered(el))) return;
    const tolerance = 1;
    const {scrollLeft, scrollWidth, clientWidth} = el;
    const maxScroll = scrollWidth - clientWidth;
    const next: OverflowState = {
      overflowStart: Math.abs(scrollLeft) > tolerance,
      overflowEnd: Math.abs(scrollLeft) < maxScroll - tolerance,
      hasOverflow: scrollWidth > clientWidth + tolerance,
    };
    const prev = this.#state;
    if (prev.overflowStart === next.overflowStart && prev.overflowEnd === next.overflowEnd && prev.hasOverflow === next.hasOverflow && el.hasAttribute('data-ax-measured')) return;
    this.#state = next;
    this.#apply(prev);
  }

  #apply(prev: OverflowState) {
    const el = this.scroller!;
    const {overflowStart, overflowEnd, hasOverflow} = this.#state;
    const loop = this.#loop;
    el.setAttribute('data-ax-measured', '');
    el.toggleAttribute('data-ax-overflow-start', overflowStart);
    el.toggleAttribute('data-ax-overflow-end', overflowEnd);
    // The scroll area is a tab stop only while its content overflows (AST-025 FR12).
    el.tabIndex = hasOverflow ? 0 : -1;
    const fade = !el.hasAttribute('data-edge-fade')
      ? null
      : (loop && hasOverflow) || (overflowStart && overflowEnd) ? 'both' : overflowStart ? 'start' : overflowEnd ? 'end' : null;
    if (fade) el.setAttribute('data-ax-fade', fade);
    else el.removeAttribute('data-ax-fade');

    const canStart = loop && hasOverflow ? true : overflowStart;
    const canEnd = loop && hasOverflow ? true : overflowEnd;
    const wasStart = loop && prev.hasOverflow ? true : prev.overflowStart;
    const wasEnd = loop && prev.hasOverflow ? true : prev.overflowEnd;
    for (const side of ['start', 'end'] as const) {
      const can = side === 'start' ? canStart : canEnd;
      const was = side === 'start' ? wasStart : wasEnd;
      const pill = this.querySelector<HTMLElement>(`.ax-carousel-pill[data-side="${side}"]`);
      const button = pill?.querySelector<HTMLButtonElement>('.ax-carousel-nav');
      pill?.toggleAttribute('data-ax-hidden', !can);
      if (!button) continue;
      const hadFocus = button.ownerDocument.activeElement === button;
      button.disabled = !can;
      button.toggleAttribute('data-ax-disabled', !can);
      // Keep the keyboard user's place: the edge that just ran out under focus hands it to the
      // scroll area (FR2) instead of dropping it on <body>.
      if (was && !can && hadFocus) el.focus({preventScroll: true});
    }
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-carousel')) customElements.define('ax-carousel', AxCarousel);
