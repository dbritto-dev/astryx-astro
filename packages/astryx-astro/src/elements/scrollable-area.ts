/**
 * <ax-scrollable-area> — the behaviour of ScrollableArea (light DOM; the element is the
 * viewport, its `[data-scroll-content]` child the observed content box).
 * Port of @astryxdesign/core hooks/useScrollableArea.ts (keyboardAccess owner 'viewport')
 * and hooks/scrollGeometry.ts.
 *
 * - Measures logical overflow per requested axis (writing mode and direction aware) and
 *   makes an axis a scroll container (`auto`, the other `hidden`) only while it overflows;
 *   `clip` while nothing does (`data-sticky-containment="always"` keeps requested axes
 *   `auto`).
 * - tabindex="0" only while an axis is effectively scrollable (AST-025); keeps -1 while it
 *   holds focus after losing overflow.
 * - Edge flags: data-scrollable-inline|block, data-scroll-inline-start|end,
 *   data-scroll-block-start|end ("true" or absent). A scroll updates them from geometry
 *   alone; resize, mutation, transition, font and load signals schedule one full
 *   measurement per frame.
 * - overscroll-behavior "contain" only on axes that scroll, when data-overscroll="contain".
 * Read-only `state` mirrors the hook's ScrollableAreaState.
 */

const TOLERANCE = 1;
type Logical = 'inline' | 'block';
type Physical = 'x' | 'y';

interface Mapping {
  inline: Physical;
  block: Physical;
  inlineReversed: boolean;
  blockReversed: boolean;
}
export interface ScrollAxisState {
  isScrollable: boolean;
  atStart: boolean;
  atEnd: boolean;
}
export interface ScrollableAreaState {
  inline: ScrollAxisState;
  block: ScrollAxisState;
}

const INACTIVE: ScrollAxisState = {isScrollable: false, atStart: true, atEnd: true};
const AXES: Logical[] = ['inline', 'block'];

function getMapping(writingMode: string, direction: string): Mapping {
  const mode = writingMode.toLowerCase();
  const isVertical = mode.startsWith('vertical') || mode.startsWith('sideways');
  const isRtl = direction === 'rtl';
  if (!isVertical) return {inline: 'x', block: 'y', inlineReversed: isRtl, blockReversed: false};
  return {inline: 'y', block: 'x', inlineReversed: mode === 'sideways-lr' ? !isRtl : isRtl, blockReversed: mode.endsWith('-rl')};
}

const isScrollCapable = (v: string) => v === 'auto' || v === 'scroll' || v === 'overlay';

function isMeasurable(el: HTMLElement, cs: CSSStyleDeclaration) {
  return el.isConnected && cs.display !== 'none' && el.clientWidth > 0 && el.clientHeight > 0;
}

function logicalEdges(offset: number, maxOffset: number, reversed: boolean) {
  const logical = Math.min(maxOffset, Math.max(0, reversed ? Math.abs(offset) : offset));
  return {atStart: logical <= TOLERANCE, atEnd: logical >= maxOffset - TOLERANCE};
}

function extent(el: HTMLElement, axis: Physical) {
  return axis === 'x'
    ? {client: el.clientWidth, content: el.scrollWidth, offset: el.scrollLeft}
    : {client: el.clientHeight, content: el.scrollHeight, offset: el.scrollTop};
}

class AxScrollableArea extends HTMLElement {
  #content: HTMLElement | null = null;
  #state: ScrollableAreaState = {inline: INACTIVE, block: INACTIVE};
  #overflow = {inline: false, block: false};
  #mapping: Mapping = {inline: 'x', block: 'y', inlineReversed: false, blockReversed: false};
  #frame: number | null = null;
  #active = false;
  #cleanup: Array<() => void> = [];

  get state(): ScrollableAreaState {
    return this.#state;
  }

  get #axis(): 'inline' | 'block' | 'both' {
    const a = this.getAttribute('data-scroll-axis');
    return a === 'inline' || a === 'both' ? a : 'block';
  }

  #requested(axis: Logical) {
    const a = this.#axis;
    return a === axis || a === 'both';
  }

  connectedCallback() {
    this.#content = this.querySelector<HTMLElement>(':scope > [data-scroll-content]');
    if (!this.#content) return;
    this.#active = true;
    const schedule = () => this.#schedule();
    const onScroll = () => this.#onScroll();
    // A fitting viewport keeps tabindex=-1 only while it holds focus.
    const onFocusOut = () => queueMicrotask(() => this.#apply());
    const ro = new ResizeObserver(schedule);
    ro.observe(this);
    ro.observe(this.#content);
    this.addEventListener('scroll', onScroll, {passive: true});
    this.addEventListener('focusout', onFocusOut);
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    this.#content.addEventListener('load', schedule, true);
    for (const t of [this, this.#content]) {
      t.addEventListener('transitionend', schedule);
      t.addEventListener('animationend', schedule);
    }
    const filter = ['class', 'dir', 'hidden', 'style'];
    const mo = new MutationObserver(schedule);
    mo.observe(this, {attributes: true, attributeFilter: filter});
    mo.observe(this.#content, {attributes: true, attributeFilter: filter, characterData: true, childList: true, subtree: true});
    for (let a = this.parentElement; a; a = a.parentElement) mo.observe(a, {attributes: true, attributeFilter: filter});
    const fonts = document.fonts;
    fonts.addEventListener('loadingdone', schedule);
    void fonts.ready.then(schedule);
    const content = this.#content;
    this.#cleanup.push(() => {
      ro.disconnect();
      mo.disconnect();
      this.removeEventListener('scroll', onScroll);
      this.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      content.removeEventListener('load', schedule, true);
      for (const t of [this, content]) {
        t.removeEventListener('transitionend', schedule);
        t.removeEventListener('animationend', schedule);
      }
      fonts.removeEventListener('loadingdone', schedule);
    });
    this.#measure();
  }

  disconnectedCallback() {
    this.#active = false;
    if (this.#frame != null) cancelAnimationFrame(this.#frame);
    this.#frame = null;
    for (const fn of this.#cleanup.splice(0)) fn();
  }

  #schedule() {
    if (!this.#active || this.#frame != null) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = null;
      this.#measure();
    });
  }

  /** Full measurement: computed style (mapping, overflow capability) and geometry. */
  #measure(depth = 0) {
    const cs = getComputedStyle(this);
    if (!isMeasurable(this, cs)) return; // unknown, not fitting: keep the last valid state
    const mapping = getMapping(cs.writingMode, cs.direction);
    const overflow = {inline: false, block: false};
    const state: ScrollableAreaState = {inline: INACTIVE, block: INACTIVE};
    for (const axis of AXES) {
      if (!this.#requested(axis)) continue;
      const phys = mapping[axis];
      const m = extent(this, phys);
      overflow[axis] = m.content - m.client > TOLERANCE;
      const capable = isScrollCapable(phys === 'x' ? cs.overflowX : cs.overflowY);
      const maxOffset = m.content - m.client;
      state[axis] = !capable || maxOffset <= TOLERANCE
        ? INACTIVE
        : {isScrollable: true, ...logicalEdges(m.offset, maxOffset, mapping[`${axis}Reversed`])};
    }
    const gained = (overflow.inline && !this.#overflow.inline) || (overflow.block && !this.#overflow.block);
    const remapped = mapping.inline !== this.#mapping.inline || mapping.block !== this.#mapping.block
      || mapping.inlineReversed !== this.#mapping.inlineReversed || mapping.blockReversed !== this.#mapping.blockReversed;
    this.#overflow = overflow;
    this.#mapping = mapping;
    this.#state = state;
    this.#apply();
    // The first measurement runs while an overflowing axis is still `clip`; on a gain (or a
    // remap) measure again now, so the viewport is a tab stop from the first scrolling frame.
    if ((gained || remapped) && depth < 2) this.#measure(depth + 1);
  }

  /** A scroll moves only the offset: derive the edges from box geometry. */
  #onScroll() {
    if (!this.#active || this.#frame != null) return;
    if (!this.isConnected || this.clientWidth <= 0 || this.clientHeight <= 0) return;
    let next = this.#state;
    for (const axis of AXES) {
      if (!this.#requested(axis)) continue;
      const phys = this.#mapping[axis];
      const reversed = this.#mapping[`${axis}Reversed`];
      const m = extent(this, phys);
      const maxOffset = m.content - m.client;
      const overflows = maxOffset > TOLERANCE;
      const contradicts = reversed ? m.offset > TOLERANCE : m.offset < -TOLERANCE;
      if (overflows !== this.#overflow[axis] || contradicts) {
        this.#schedule();
        return;
      }
      const current = next[axis];
      if (!current.isScrollable) continue;
      const edges = logicalEdges(m.offset, maxOffset, reversed);
      if (current.atStart === edges.atStart && current.atEnd === edges.atEnd) continue;
      next = {...next, [axis]: {isScrollable: true, ...edges}};
    }
    if (next !== this.#state) {
      this.#state = next;
      this.#apply();
    }
  }

  #attr(name: string, value: string | null) {
    if (value == null) {
      if (this.hasAttribute(name)) this.removeAttribute(name);
    } else if (this.getAttribute(name) !== value) {
      this.setAttribute(name, value);
    }
  }

  #style(prop: string, value: string) {
    if (this.style.getPropertyValue(prop) !== value) this.style.setProperty(prop, value);
  }

  #apply() {
    const {inline, block} = this.#state;
    const m = this.#mapping;
    const always = this.getAttribute('data-sticky-containment') === 'always';
    const requestedX = (this.#requested('inline') && m.inline === 'x') || (this.#requested('block') && m.block === 'x');
    const requestedY = (this.#requested('inline') && m.inline === 'y') || (this.#requested('block') && m.block === 'y');
    const overflowingX = (this.#overflow.inline && m.inline === 'x') || (this.#overflow.block && m.block === 'x');
    const overflowingY = (this.#overflow.inline && m.inline === 'y') || (this.#overflow.block && m.block === 'y');
    const containsSticky = overflowingX || overflowingY || always;
    const scrollsOnX = always ? requestedX : overflowingX;
    const scrollsOnY = always ? requestedY : overflowingY;
    this.#style('overflow-x', containsSticky ? (scrollsOnX ? 'auto' : 'hidden') : 'clip');
    this.#style('overflow-y', containsSticky ? (scrollsOnY ? 'auto' : 'hidden') : 'clip');

    const contain = this.getAttribute('data-overscroll') === 'contain';
    if (this.#requested('inline')) {
      this.#style(m.inline === 'x' ? 'overscroll-behavior-x' : 'overscroll-behavior-y', contain && inline.isScrollable ? 'contain' : 'auto');
    }
    if (this.#requested('block')) {
      this.#style(m.block === 'x' ? 'overscroll-behavior-x' : 'overscroll-behavior-y', contain && block.isScrollable ? 'contain' : 'auto');
    }

    const effective = inline.isScrollable || block.isScrollable;
    const keepsFocus = !effective && document.activeElement === this;
    this.#attr('tabindex', effective ? '0' : keepsFocus ? '-1' : null);

    this.#attr('data-scrollable-inline', inline.isScrollable ? 'true' : null);
    this.#attr('data-scrollable-block', block.isScrollable ? 'true' : null);
    this.#attr('data-scroll-inline-start', inline.atStart ? 'true' : null);
    this.#attr('data-scroll-inline-end', inline.atEnd ? 'true' : null);
    this.#attr('data-scroll-block-start', block.atStart ? 'true' : null);
    this.#attr('data-scroll-block-end', block.atEnd ? 'true' : null);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-scrollable-area')) {
  customElements.define('ax-scrollable-area', AxScrollableArea);
}

declare global {
  interface HTMLElementTagNameMap {
    'ax-scrollable-area': AxScrollableArea;
  }
}

export {AxScrollableArea};
