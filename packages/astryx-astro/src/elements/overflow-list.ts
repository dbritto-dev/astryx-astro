/**
 * <ax-overflow-list> — the behaviour of OverflowList (light DOM).
 * Port of @astryxdesign/core hooks/useOverflow.ts driving hooks/computeOverflow.ts.
 *
 * Items are the element children other than the `[data-overflow-indicator]` wrapper. A
 * measurement briefly lays every item out of flow (`data-measuring`, nowrap max-content, the
 * indicator at its widest count) inside one task, so nothing paints in between; then the
 * collapsed items get `data-overflow-hidden` + `inert`, the indicator shows the count.
 *
 * Resize-driven updates apply before paint, except ones that change the list's height,
 * which wait a frame (applying them inside the ResizeObserver step makes Chromium report a
 * loop error), as Astryx defers them.
 *
 * API: `visibleCount`, `overflowItems` ({index, element}[]), `measure()`.
 * Event: `astryx-overflow-change` (detail {overflowItems}), when the collapsed set changes.
 */
import {computeOverflow} from '../components/OverflowList/computeOverflow';

export interface OverflowItem {
  index: number;
  element: HTMLElement;
}

const SPACING_PX: Record<string, number> = {0: 0, 0.5: 2, 1: 4, 1.5: 6, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40};

const num = (v: string | null): number | undefined => {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

class AxOverflowList extends HTMLElement {
  #ro: ResizeObserver | null = null;
  #mo: MutationObserver | null = null;
  #observed = new Set<Element>();
  #frame: number | null = null;
  #visibleCount = -1;
  #reportedKey = '[]';
  #overflowItems: OverflowItem[] = [];

  get visibleCount(): number {
    return this.#visibleCount < 0 ? this.#items().length : this.#visibleCount;
  }

  get overflowItems(): OverflowItem[] {
    return this.#overflowItems.slice();
  }

  connectedCallback() {
    this.#ro = new ResizeObserver(() => this.#run('observer'));
    this.#mo = new MutationObserver(() => {
      this.#observe();
      this.#run('now');
    });
    this.#mo.observe(this, {childList: true});
    this.#observe();
    this.#run('now');
  }

  disconnectedCallback() {
    this.#ro?.disconnect();
    this.#mo?.disconnect();
    this.#ro = null;
    this.#mo = null;
    this.#observed.clear();
    if (this.#frame != null) cancelAnimationFrame(this.#frame);
    this.#frame = null;
  }

  /** Measure and apply now (e.g. after changing an item's content programmatically). */
  measure() {
    this.#run('now');
  }

  #indicator(): HTMLElement | null {
    return this.querySelector<HTMLElement>(':scope > [data-overflow-indicator]');
  }

  #items(): HTMLElement[] {
    return Array.from(this.children).filter(
      (c): c is HTMLElement => c instanceof HTMLElement && !c.hasAttribute('data-overflow-indicator'),
    );
  }

  #observeParent() {
    return this.getAttribute('data-behavior') === 'observeParent';
  }

  /** Follow the list (or its parent), every item and the indicator. */
  #observe() {
    if (!this.#ro) return;
    const targets = new Set<Element>([...this.#items()]);
    const indicator = this.#indicator();
    if (indicator) targets.add(indicator);
    targets.add(this.#observeParent() && this.parentElement ? this.parentElement : this);
    for (const el of this.#observed) if (!targets.has(el)) this.#ro.unobserve(el);
    for (const el of targets) if (!this.#observed.has(el)) this.#ro.observe(el);
    this.#observed = targets;
  }

  #setCount(indicator: HTMLElement | null, count: number) {
    if (!indicator) return;
    const text = String(count);
    if (indicator.getAttribute('data-count') !== text) indicator.setAttribute('data-count', text);
    indicator.querySelectorAll<HTMLElement>('[data-overflow-count]').forEach((el) => {
      if (el.textContent !== text) el.textContent = text;
    });
  }

  #run(timing: 'now' | 'observer') {
    if (!this.isConnected) return;
    const items = this.#items();
    const indicator = this.#indicator();
    const maxRows = num(this.getAttribute('data-max-rows'));
    const multiRow = maxRows != null && maxRows > 1;

    let available: number;
    const parent = this.parentElement;
    if (this.#observeParent() && parent) {
      const ps = getComputedStyle(parent);
      available = parent.clientWidth - parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight);
    } else {
      available = this.offsetWidth;
    }

    if (items.length === 0) {
      this.#apply(items, indicator, 0, 0);
      return;
    }

    // Measure every item out of flow at its single-line max-content size, and the indicator
    // as it renders with every item collapsed (its widest).
    const shownCount = indicator?.getAttribute('data-count') ?? null;
    this.#setCount(indicator, items.length);
    this.setAttribute('data-measuring', '');
    const widths = items.map((el) => el.offsetWidth);
    const heights = items.map((el) => el.offsetHeight);
    const indicatorWidth = indicator ? indicator.offsetWidth : 0;
    const indicatorHeight = indicator ? indicator.offsetHeight : 0;
    this.removeAttribute('data-measuring');
    if (shownCount != null) this.#setCount(indicator, Number(shownCount));

    const gapAttr = this.getAttribute('data-gap') ?? '2';
    const computedGap = parseFloat(getComputedStyle(this).columnGap);
    const gap = Number.isFinite(computedGap) ? computedGap : (SPACING_PX[gapAttr] ?? 0);

    const {visibleCount} = computeOverflow({
      widths,
      gap,
      availableWidth: available,
      indicatorWidth,
      minVisibleItems: num(this.getAttribute('data-min-visible-items')) ?? 0,
      maxVisibleItems: num(this.getAttribute('data-max-visible-items')),
      maxRows,
      collapseFrom: this.getAttribute('data-collapse-from') === 'start' ? 'start' : 'end',
    });
    const rowHeight = heights.reduce((m, h) => Math.max(m, h || 0), 0);

    // Folding to a new list height inside the resize step makes Chromium report a loop
    // error: such an update renders on the next frame.
    if (timing === 'observer') {
      const tallest = (count: number) => {
        const from = this.getAttribute('data-collapse-from') === 'start' ? items.length - count : 0;
        let t = 0;
        for (let i = from; i < from + count; i++) t = Math.max(t, heights[i] ?? 0);
        if (count < items.length) t = Math.max(t, indicatorHeight);
        return t;
      };
      const current = this.#visibleCount < 0 ? items.length : this.#visibleCount;
      const changesHeight = tallest(current) !== tallest(visibleCount) || (multiRow && current !== visibleCount);
      if (changesHeight) {
        if (this.#frame != null) cancelAnimationFrame(this.#frame);
        this.#frame = requestAnimationFrame(() => {
          this.#frame = null;
          this.#run('now');
        });
        return;
      }
    }
    this.#apply(items, indicator, visibleCount, rowHeight, gap, maxRows);
  }

  #apply(items: HTMLElement[], indicator: HTMLElement | null, visibleCount: number, rowHeight: number, gap = 0, maxRows?: number) {
    const fromStart = this.getAttribute('data-collapse-from') === 'start';
    const first = fromStart ? items.length - visibleCount : 0;
    const overflowItems: OverflowItem[] = [];
    items.forEach((el, index) => {
      const hidden = index < first || index >= first + visibleCount;
      if (hidden) overflowItems.push({index, element: el});
      if (el.hasAttribute('data-overflow-hidden') !== hidden) {
        el.toggleAttribute('data-overflow-hidden', hidden);
        el.inert = hidden;
      }
    });
    const hasOverflow = overflowItems.length > 0;
    if (indicator) {
      this.#setCount(indicator, overflowItems.length);
      if (indicator.hasAttribute('data-overflow-hidden') === hasOverflow) {
        indicator.toggleAttribute('data-overflow-hidden', !hasOverflow);
        indicator.inert = !hasOverflow;
      }
    }
    this.toggleAttribute('data-has-overflow', hasOverflow);

    // Bounded multi-row: cap the list's height at maxRows rows.
    const multiRow = maxRows != null && maxRows > 1;
    const maxHeight = multiRow && rowHeight > 0 ? `calc(${rowHeight}px * ${maxRows} + ${gap}px * ${maxRows - 1})` : '';
    if (this.style.maxHeight !== maxHeight) this.style.maxHeight = maxHeight;

    this.#visibleCount = visibleCount;
    this.#overflowItems = overflowItems;
    const key = JSON.stringify(overflowItems.map((o) => o.index));
    if (key !== this.#reportedKey) {
      this.#reportedKey = key;
      this.dispatchEvent(new CustomEvent('astryx-overflow-change', {
        bubbles: true,
        composed: true,
        detail: {overflowItems: overflowItems.slice()},
      }));
    }
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-overflow-list')) {
  customElements.define('ax-overflow-list', AxOverflowList);
}

declare global {
  interface HTMLElementTagNameMap {
    'ax-overflow-list': AxOverflowList;
  }
}

export {AxOverflowList};
