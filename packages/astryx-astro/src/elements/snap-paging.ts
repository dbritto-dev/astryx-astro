/**
 * <ax-snap-paging> — a horizontal pager on native CSS scroll snap: the element is the
 * viewport (scroll container), its `.ax-snap-paging-track` child the track, each track child a
 * page. Astro-side counterpart of @astryxdesign/core hooks/usePager.ts (`createPager` /
 * `usePager`; the docs' "SnapPaging"): same options, API surface and callbacks, with the
 * browser's scroll snapping doing the physics.
 *
 * Ported from createPager: `pages: 'viewport' | 'children'` and the children-page geometry
 * (each child's start edge, clamped to the travel so the last children can share one page,
 * deduplicated to half a pixel → `pageCount`), `index`, `pageCount`, `isSettling`,
 * `pageOffset(i)`, `nearestPage(px)`, `goTo(i, {animated})`, the change reasons and the
 * settle report. Reduced motion (media query or `[data-astryx-reduced-motion]`): `goTo` lands
 * at once.
 * Not ported (UIKit physics on the gesture system): the pan recognizer with its rubber band
 * and measured release rule (pageForRelease), the settle catcher, `loop`, mouse-drag paging
 * and `shouldBeginPan`. Snap mandatory + `scroll-snap-stop: always` give one page per swipe.
 *
 * Attributes: `data-pages="viewport|children"`, `data-default-index`.
 * Events (bubbles, composed): `astryx-index-change` `{index, reason: 'drag' | 'goTo'}`
 * (onIndexChange), `astryx-settle` `{index, previous}` (onSettle), `astryx-pages-change`
 * `{pageCount}` (onPagesChange; children pages, after a resize or content change).
 */
export type PagerChangeReason = 'drag' | 'goTo';

const SETTLE_FALLBACK_MS = 150;

function reducesMotion(el: Element): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches || el.closest('[data-astryx-reduced-motion]') != null;
}

export class SnapPagingElement extends HTMLElement {
  #offsets: number[] = [0];
  #target = 0;
  #settled = 0;
  #isSettling = false;
  #frame = 0;
  #settleTimer: ReturnType<typeof setTimeout> | null = null;
  #resize: ResizeObserver | null = null;
  #mutation: MutationObserver | null = null;
  #cleanup: (() => void) | null = null;

  get track(): HTMLElement | null {
    return this.querySelector<HTMLElement>(':scope > .ax-snap-paging-track') ?? (this.firstElementChild as HTMLElement | null);
  }

  /** The target page. */
  get index(): number {
    return this.#target;
  }
  set index(value: number) {
    this.goTo(value);
  }

  /** Distinct pages last measured. */
  get pageCount(): number {
    return this.#offsets.length;
  }

  /** Whether the viewport is moving on its own toward a page (after a goTo or a release). */
  get isSettling(): boolean {
    return this.#isSettling;
  }

  #isRtl(): boolean {
    return getComputedStyle(this).direction === 'rtl';
  }

  /** The content offset (px from page 0, growing toward later pages in both directions). */
  get position(): number {
    return Math.abs(this.scrollLeft);
  }

  /** Where page `index` rests (px). */
  pageOffset(index: number): number {
    const o = this.#offsets;
    return o[Math.max(0, Math.min(o.length - 1, index))] ?? 0;
  }

  /** The page whose rest is nearest `position` (px). */
  nearestPage(position: number): number {
    let best = 0;
    for (let i = 1; i < this.#offsets.length; i++) {
      if (Math.abs(this.#offsets[i] - position) < Math.abs(this.#offsets[best] - position)) best = i;
    }
    return best;
  }

  /** Move to a page (clamped). Reports `astryx-index-change` with `reason`. */
  goTo(index: number, options: {animated?: boolean; reason?: PagerChangeReason} = {}): void {
    const target = Math.max(0, Math.min(this.pageCount - 1, Math.round(index)));
    const animated = (options.animated ?? true) && !reducesMotion(this);
    const offset = this.pageOffset(target);
    this.#setTarget(target, options.reason ?? 'goTo');
    if (Math.abs(this.position - offset) < 0.5) {
      this.#settle();
      return;
    }
    this.#isSettling = true;
    this.scrollTo({left: this.#isRtl() ? -offset : offset, behavior: animated ? 'smooth' : 'instant'});
    this.#armSettleFallback();
  }

  next(options?: {animated?: boolean}): void {
    this.goTo(this.#target + 1, options);
  }

  prev(options?: {animated?: boolean}): void {
    this.goTo(this.#target - 1, options);
  }

  connectedCallback(): void {
    this.#measure(false);
    const initial = Number(this.getAttribute('data-default-index') ?? 0) || 0;
    this.#target = this.#settled = Math.max(0, Math.min(this.pageCount - 1, initial));
    if (this.#target > 0) {
      const offset = this.pageOffset(this.#target);
      this.scrollTo({left: this.#isRtl() ? -offset : offset, behavior: 'instant'});
    }
    const onScroll = () => {
      if (this.#frame) return;
      this.#frame = requestAnimationFrame(() => {
        this.#frame = 0;
        if (!this.#isSettling) {
          const nearest = this.nearestPage(this.position);
          if (nearest !== this.#target) this.#setTarget(nearest, 'drag');
        }
      });
      this.#armSettleFallback();
    };
    const onScrollEnd = () => this.#settle();
    this.addEventListener('scroll', onScroll, {passive: true});
    this.addEventListener('scrollend', onScrollEnd);
    this.#resize = new ResizeObserver(() => this.#measure(true));
    this.#resize.observe(this);
    if (this.track) this.#resize.observe(this.track);
    this.#mutation = new MutationObserver(() => this.#measure(true));
    if (this.track) this.#mutation.observe(this.track, {childList: true});
    this.#cleanup = () => {
      this.removeEventListener('scroll', onScroll);
      this.removeEventListener('scrollend', onScrollEnd);
    };
  }

  disconnectedCallback(): void {
    this.#cleanup?.();
    this.#cleanup = null;
    this.#resize?.disconnect();
    this.#mutation?.disconnect();
    if (this.#frame) cancelAnimationFrame(this.#frame);
    if (this.#settleTimer) clearTimeout(this.#settleTimer);
    this.#frame = 0;
  }

  #setTarget(index: number, reason: PagerChangeReason): void {
    if (index === this.#target) return;
    this.#target = index;
    this.dispatchEvent(new CustomEvent('astryx-index-change', {detail: {index, reason}, bubbles: true, composed: true}));
  }

  /** Engines without `scrollend` settle after the scroll goes quiet. */
  #armSettleFallback(): void {
    if ('onscrollend' in window) return;
    if (this.#settleTimer) clearTimeout(this.#settleTimer);
    this.#settleTimer = setTimeout(() => this.#settle(), SETTLE_FALLBACK_MS);
  }

  #settle(): void {
    if (this.#settleTimer) clearTimeout(this.#settleTimer);
    this.#settleTimer = null;
    this.#isSettling = false;
    const index = this.nearestPage(this.position);
    if (index !== this.#target) this.#setTarget(index, 'drag');
    const previous = this.#settled;
    this.#settled = index;
    this.dispatchEvent(new CustomEvent('astryx-settle', {detail: {index, previous}, bubbles: true, composed: true}));
  }

  /**
   * Children pages: each child's start edge from the track's start, clamped to the travel
   * (the scroll range), pages closer than half a pixel merged (createPager measureChildOffsets).
   */
  #measure(report: boolean): void {
    const track = this.track;
    const before = this.#offsets;
    if (!track || track.children.length === 0) {
      this.#offsets = [0];
    } else {
      const rtl = this.#isRtl();
      const box = track.getBoundingClientRect();
      const end = Math.max(0, this.scrollWidth - this.clientWidth);
      const offsets: number[] = [];
      for (const child of Array.from(track.children)) {
        const r = child.getBoundingClientRect();
        const start = rtl ? box.right - r.right : r.left - box.left;
        const offset = Math.min(Math.max(start, 0), end);
        if (offsets.length === 0 || offset > offsets[offsets.length - 1] + 0.5) offsets.push(offset);
      }
      this.#offsets = offsets.length ? offsets : [0];
    }
    const changed = before.length !== this.#offsets.length || before.some((o, i) => Math.abs(o - this.#offsets[i]) >= 0.5);
    if (!report || !changed) return;
    if (this.#target > this.pageCount - 1) this.#target = this.pageCount - 1;
    // Keep the current page in place after a resize.
    if (!this.#isSettling) {
      const offset = this.pageOffset(this.#target);
      this.scrollTo({left: this.#isRtl() ? -offset : offset, behavior: 'instant'});
    }
    if (before.length !== this.#offsets.length) {
      this.dispatchEvent(new CustomEvent('astryx-pages-change', {detail: {pageCount: this.pageCount}, bubbles: true, composed: true}));
    }
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-snap-paging')) {
  customElements.define('ax-snap-paging', SnapPagingElement);
}

declare global {
  interface HTMLElementTagNameMap {
    'ax-snap-paging': SnapPagingElement;
  }
}
