/**
 * <ax-pagination> — the behaviour of Pagination (light DOM; the element is the painted
 * `.astryx-pagination`). Port of @astryxdesign/core Pagination/Pagination.tsx
 * (handlePageChange, handlePrevious/Next/First/Last, handlePageSizeChange, handleInputCommit,
 * handleDotsFocus, the re-render of the indicator for a new page), with hooks/useAnnounce.ts
 * (runtime/announce.ts) and utils/focusReturn.ts (runtime/modality.ts). The dots' arrows,
 * Home/End and single tab stop are runtime/roving.ts (`data-astryx-roving` on the radio group).
 *
 * Buttons mode (`data-ax-mode="buttons"`): the element owns the page. A user change dispatches
 * `astryx-change` `{page}` (bubbles, composed, cancelable — `preventDefault()` keeps the page),
 * announces "Page X of Y" (or "Page X") politely and re-renders in place: first/prev/next/last
 * enablement (native `disabled` + `data-ax-disabled` + the tooltip's `isEnabled`), page-number
 * buttons keyed by page (retained ones never move, so the pressed button keeps focus) and
 * ellipses from `<template>`s, count / compact text, dots, the NumberInput's value and max.
 * The page-size Selector dispatches `astryx-page-size-change` `{pageSize}` (cancelable: the
 * Selector snaps back) and resets to page 1 through the same change path.
 * Links mode (`data-ax-mode="links"`): navigation is the links'; only the input variant (commit →
 * `astryx-change`, then `location.assign` of `data-ax-href-template` when present) and the
 * page-size Selector (`astryx-page-size-change`) are handled.
 *
 * API: `page`, `pageSize`, `totalItems`, `totalPages`, `hasMore` (get/set; setters re-render and
 * fire nothing, like new controlled props), `pageCount` (resolved count or null), `goTo(page)`
 * (a change as if by the user: events + announcement).
 * Inner NumberInput / Selector `astryx-change` events stop here.
 */
import {announce} from './runtime/announce';
import {focusForLastInput} from './runtime/modality';
import {syncRovingTabStops} from './runtime/roving';
import {
  clampPage,
  computeTotalPages,
  generatePageRange,
  hasNextPage,
  hasPreviousPage,
  isEmptyPaging,
  itemRange,
  normalizePageSize,
  type PagingState,
} from '../components/Pagination/pageRange';

type Messages = Record<'goToPage' | 'pageOfTotal' | 'pageAnnounce' | 'count' | 'ofTotalPages', string>;

const ITEM = '[data-ax-pagination-item]';
const DOT = 'button[role="radio"][data-page]';

const num = (value: string | null): number | undefined => {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/⁣([a-zA-Z]+)⁣/g, (_, name: string) => values[name] ?? '');
}

interface TooltipLayer extends HTMLElement {
  isEnabled?: boolean;
  hideNow?: (reason?: string) => void;
}

export class PaginationElement extends HTMLElement {
  #page = 1;
  #pageSize = 10;
  #totalItems: number | undefined;
  #totalPagesProp: number | undefined;
  #hasMore: boolean | undefined;
  #cleanup: Array<() => void> = [];
  #messages: Partial<Messages> = {};

  // ── API ────────────────────────────────────────────────────────────────
  get page(): number { return this.#page; }
  set page(next: number) {
    if (!Number.isFinite(next)) return;
    this.#page = next;
    this.#render();
  }

  get pageSize(): number { return this.#pageSize; }
  set pageSize(next: number) {
    this.#pageSize = normalizePageSize(next);
    const selector = this.#selector;
    if (selector && selector.value !== String(this.#pageSize)) selector.value = String(this.#pageSize);
    this.#render();
  }

  get totalItems(): number | undefined { return this.#totalItems; }
  set totalItems(next: number | undefined) {
    this.#totalItems = next == null || !Number.isFinite(next) ? undefined : next;
    this.#render();
  }

  get totalPages(): number | undefined { return this.#totalPagesProp; }
  set totalPages(next: number | undefined) {
    this.#totalPagesProp = next == null || !Number.isFinite(next) ? undefined : next;
    this.#render();
  }

  get hasMore(): boolean | undefined { return this.#hasMore; }
  set hasMore(next: boolean | undefined) {
    this.#hasMore = next == null ? undefined : Boolean(next);
    this.#render();
  }

  /** The resolved page count (totalPages, else from totalItems), or null when unknown. */
  get pageCount(): number | null {
    return this.#state.totalPages ?? null;
  }

  /** Go to `page` as a user change would: `astryx-change` (cancelable) and an announcement. */
  goTo(page: number): boolean {
    return this.#change(clampPage(page, this.#state.totalPages));
  }

  // ── Configuration ──────────────────────────────────────────────────────
  get #isLinks(): boolean { return this.getAttribute('data-ax-mode') === 'links'; }
  get #isDisabled(): boolean { return this.hasAttribute('data-ax-disabled'); }
  get #variant(): string { return this.getAttribute('data-variant') ?? 'pages'; }
  get #step(): number { return num(this.getAttribute('data-ax-step')) ?? 1; }
  get #siblings(): number { return num(this.getAttribute('data-ax-siblings')) ?? 1; }
  get #locale(): string | undefined { return this.getAttribute('data-ax-locale') ?? undefined; }
  get #controls(): HTMLElement | null { return this.querySelector<HTMLElement>(':scope > .ax-pagination-controls'); }
  get #selector(): (HTMLElement & {value: string | null}) | null {
    return this.querySelector<HTMLElement & {value: string | null}>(':scope > .ax-pagination-page-size ax-selector');
  }
  get #numberInput(): (HTMLElement & {value: number | null}) | null {
    return this.querySelector<HTMLElement & {value: number | null}>(':scope > .ax-pagination-controls ax-number-input');
  }

  get #state(): PagingState {
    return {
      page: this.#page,
      totalPages: computeTotalPages(this.#totalPagesProp, this.#totalItems, this.#pageSize),
      totalItems: this.#totalItems,
      hasMore: this.#hasMore,
      pageSize: this.#pageSize,
    };
  }

  #format(n: number): string {
    try { return new Intl.NumberFormat(this.#locale).format(n); } catch { return String(n); }
  }

  connectedCallback(): void {
    this.#page = num(this.getAttribute('data-ax-page')) ?? 1;
    this.#pageSize = normalizePageSize(num(this.getAttribute('data-ax-page-size')));
    this.#totalItems = num(this.getAttribute('data-ax-total-items'));
    this.#totalPagesProp = num(this.getAttribute('data-ax-total-pages'));
    const more = this.getAttribute('data-ax-has-more');
    this.#hasMore = more == null ? undefined : more === 'true';
    try { this.#messages = JSON.parse(this.getAttribute('data-ax-messages') ?? '{}'); } catch { this.#messages = {}; }

    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      this.addEventListener(type, fn as EventListener, opts);
      this.#cleanup.push(() => this.removeEventListener(type, fn as EventListener, opts));
    };
    on('click', (e) => this.#onClick(e));
    on('mousedown', (e) => {
      // A press must not choose a dot before release (sliding off takes it back).
      if ((e.target as Element | null)?.closest?.(DOT) && !this.#isLinks) e.preventDefault();
    });
    on('focusin', (e) => this.#onDotFocus(e));
    on('astryx-change', (e) => this.#onInnerChange(e as CustomEvent<{value: unknown}>));
  }

  disconnectedCallback(): void {
    for (const fn of this.#cleanup.splice(0)) fn();
  }

  // ── Events ─────────────────────────────────────────────────────────────

  #onClick(event: MouseEvent): void {
    if (this.#isLinks || event.defaultPrevented) return;
    const target = event.target as Element | null;
    const nav = target?.closest?.<HTMLElement>('[data-ax-nav]');
    if (nav && this.contains(nav)) {
      if (nav.matches(':disabled')) return;
      const s = this.#state;
      const kind = nav.getAttribute('data-ax-nav');
      if (kind === 'first' && hasPreviousPage(s)) this.#change(1);
      else if (kind === 'previous' && hasPreviousPage(s)) this.#change(clampPage(s.page - this.#step, s.totalPages));
      else if (kind === 'next' && hasNextPage(s)) this.#change(clampPage(s.page + this.#step, s.totalPages));
      else if (kind === 'last' && hasNextPage(s) && s.totalPages != null) this.#change(s.totalPages);
      return;
    }
    const dot = target?.closest?.<HTMLElement>(DOT);
    if (dot && this.contains(dot)) {
      // The click focuses the dot with the ring the last input calls for; focus selects.
      focusForLastInput(dot);
      return;
    }
    const pageButton = target?.closest?.<HTMLElement>(`${ITEM}[data-page]`);
    if (pageButton && this.contains(pageButton) && !pageButton.matches(':disabled')) {
      const p = num(pageButton.getAttribute('data-page'));
      if (p != null) this.#change(p);
    }
  }

  /** Selection follows focus in the dots (APG radio group); the current page is a no-op. */
  #onDotFocus(event: FocusEvent): void {
    if (this.#isLinks || this.#isDisabled) return;
    const dot = (event.target as Element | null)?.closest?.<HTMLElement>(DOT);
    if (!dot || !this.contains(dot)) return;
    const p = num(dot.getAttribute('data-page'));
    if (p != null && p !== this.#page) this.#change(p);
  }

  #onInnerChange(event: CustomEvent<{value: unknown}>): void {
    const target = event.target as HTMLElement | null;
    if (!target || target === this) return;
    if (target.matches('ax-number-input') && this.#numberInput === target) {
      event.stopPropagation();
      const next = typeof event.detail?.value === 'number' ? event.detail.value : null;
      if (next == null || this.#isDisabled || next === this.#page) return;
      if (this.#isLinks) {
        const proceed = this.#emitChange(next);
        const template = this.getAttribute('data-ax-href-template');
        if (proceed && template) this.ownerDocument.defaultView?.location.assign(fill(template, {page: String(next)}));
        return;
      }
      this.#change(next);
      return;
    }
    if (target.matches('ax-selector') && this.#selector === target) {
      event.stopPropagation();
      const size = Number(event.detail?.value);
      if (!Number.isFinite(size)) return;
      const previous = this.#pageSize;
      const proceed = this.dispatchEvent(new CustomEvent('astryx-page-size-change', {detail: {pageSize: size}, bubbles: true, composed: true, cancelable: true}));
      if (!proceed) {
        // Controlled: the Selector shows the page size the component still has.
        queueMicrotask(() => { const s = this.#selector; if (s) s.value = String(previous); });
        return;
      }
      if (this.#isLinks) return;
      this.#pageSize = normalizePageSize(size);
      // Reset to page 1 when the page size changes (always reported, as Astryx).
      if (!this.#change(1)) this.#render();
    }
  }

  #emitChange(page: number): boolean {
    return this.dispatchEvent(new CustomEvent('astryx-change', {detail: {page}, bubbles: true, composed: true, cancelable: true}));
  }

  /** handlePageChange: ask, announce, apply. */
  #change(next: number): boolean {
    if (this.#isDisabled) return false;
    if (!this.#emitChange(next)) return false;
    const total = this.#state.totalPages;
    const text = total != null
      ? fill(this.#messages.pageOfTotal ?? '', {current: this.#format(next), total: this.#format(total)})
      : fill(this.#messages.pageAnnounce ?? '', {current: this.#format(next)});
    if (text) announce(text, {politeness: 'polite', from: this});
    this.#page = next;
    this.#render();
    return true;
  }

  // ── Render ─────────────────────────────────────────────────────────────

  /** State back into the server attributes, so a moved element (re)connects with it. */
  #reflect(): void {
    const set = (name: string, value: string | number | boolean | undefined) => {
      if (value == null) this.removeAttribute(name);
      else if (this.getAttribute(name) !== String(value)) this.setAttribute(name, String(value));
    };
    set('data-ax-page', this.#page);
    set('data-ax-page-size', this.#pageSize);
    set('data-ax-total-items', this.#totalItems);
    set('data-ax-total-pages', this.#totalPagesProp);
    set('data-ax-has-more', this.#hasMore);
  }

  #render(): void {
    if (!this.isConnected || this.#isLinks) return;
    this.#reflect();
    const s = this.#state;
    this.hidden = isEmptyPaging(s.totalItems, s.totalPages);
    const disabled = this.#isDisabled;
    const hasPrevious = hasPreviousPage(s);
    const hasNext = hasNextPage(s);
    for (const button of this.querySelectorAll<HTMLButtonElement>('[data-ax-nav]')) {
      const kind = button.getAttribute('data-ax-nav');
      const isEdge = kind === 'first' || kind === 'last';
      if (isEdge) button.hidden = s.totalPages == null;
      const enabled = !disabled && (kind === 'first' || kind === 'previous' ? hasPrevious : hasNext && (kind !== 'last' || s.totalPages != null));
      this.#setEnabled(button, enabled);
    }
    switch (this.#variant) {
      case 'pages': this.#renderPages(s); break;
      case 'count': {
        const known = s.totalItems != null;
        const {from, to} = itemRange(s);
        this.#renderText(known ? fill(this.#messages.count ?? '', {from: this.#format(from), to: this.#format(to), total: this.#format(s.totalItems!)}) : null);
        break;
      }
      case 'compact':
        this.#renderText(s.totalPages != null ? fill(this.#messages.pageOfTotal ?? '', {current: this.#format(s.page), total: this.#format(s.totalPages)}) : null);
        break;
      case 'dots': this.#renderDots(s); break;
      case 'input': this.#renderInput(s); break;
      default: break;
    }
  }

  #setEnabled(button: HTMLButtonElement, enabled: boolean): void {
    if (button.disabled === !enabled) return;
    button.disabled = !enabled;
    button.toggleAttribute('data-ax-disabled', !enabled);
    const id = button.getAttribute('data-ax-tooltip');
    const tip = id ? (this.ownerDocument.getElementById(id) as TooltipLayer | null) : null;
    if (!tip) return;
    if (!enabled) tip.hideNow?.('api');
    if ('isEnabled' in tip) tip.isEnabled = enabled;
    else if (enabled) tip.removeAttribute('data-ax-enabled');
    else tip.setAttribute('data-ax-enabled', 'false');
  }

  #fromTemplate(selector: string, values: Record<string, string>): HTMLElement | null {
    const template = this.querySelector<HTMLTemplateElement>(`:scope > template${selector}`);
    if (!template) return null;
    const scratch = this.ownerDocument.createElement('template');
    scratch.innerHTML = fill(template.innerHTML, values);
    return scratch.content.firstElementChild as HTMLElement | null;
  }

  #renderPages(s: PagingState): void {
    const controls = this.#controls;
    const next = controls?.querySelector<HTMLElement>(':scope > [data-ax-nav="next"]');
    if (!controls || !next) return;
    const range = s.totalPages != null ? generatePageRange(s.page, s.totalPages, this.#siblings) : [];
    const keyOf = (item: number | '...', index: number) => (item === '...' ? `ellipsis-${range[index - 1]}-${range[index + 1]}` : String(item));
    const existing = new Map<string, HTMLElement>();
    for (const el of controls.querySelectorAll<HTMLElement>(`:scope > ${ITEM}`)) existing.set(el.getAttribute('data-ax-key') ?? '', el);
    const nodes: HTMLElement[] = [];
    range.forEach((item, index) => {
      const key = keyOf(item, index);
      let node = existing.get(key) ?? null;
      existing.delete(key);
      if (!node) {
        node = item === '...'
          ? this.#fromTemplate('[data-ax-ellipsis-template]', {})
          : this.#fromTemplate('[data-ax-page-template]', {page: this.#format(item), n: String(item)});
        node?.setAttribute('data-ax-key', key);
      }
      if (node) nodes.push(node);
    });
    for (const stale of existing.values()) stale.remove();
    // Place from the end: retained buttons keep their relative order, so none of them moves
    // (moving a focused node would blur it).
    let anchor: HTMLElement = next;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      let following = node.nextElementSibling;
      while (following && following !== anchor && !following.matches(`${ITEM}, [data-ax-nav]`)) following = following.nextElementSibling;
      if (!node.isConnected || following !== anchor) controls.insertBefore(node, anchor);
      anchor = node;
    }
    for (const node of nodes) {
      if (!node.hasAttribute('data-page')) continue;
      const active = num(node.getAttribute('data-page')) === s.page;
      if (active) node.setAttribute('aria-current', 'page');
      else node.removeAttribute('aria-current');
      node.toggleAttribute('data-ax-active-page', active);
    }
  }

  #renderText(text: string | null): void {
    const info = this.#controls?.querySelector<HTMLElement>(':scope > .ax-pagination-info');
    const el = info?.querySelector<HTMLElement>('[data-ax-pagination-text]');
    if (!info || !el) return;
    info.hidden = text == null;
    if (text != null && el.textContent !== text) el.textContent = text;
  }

  #renderDots(s: PagingState): void {
    const group = this.#controls?.querySelector<HTMLElement>(':scope > .ax-pagination-dots');
    if (!group) return;
    const count = s.totalPages ?? 0;
    group.hidden = s.totalPages == null;
    let dots = [...group.querySelectorAll<HTMLElement>(`:scope > ${DOT}`)];
    if (dots.length !== count) {
      for (const extra of dots.slice(count)) extra.remove();
      for (let p = dots.length + 1; p <= count; p++) {
        const formatted = this.#format(p);
        const dot = this.#fromTemplate('[data-ax-dot-template]', {page: formatted, current: formatted, n: String(p)});
        if (dot) group.append(dot);
      }
      dots = [...group.querySelectorAll<HTMLElement>(`:scope > ${DOT}`)];
    }
    for (const dot of dots) {
      const active = num(dot.getAttribute('data-page')) === s.page;
      dot.setAttribute('aria-checked', String(active));
      if (active) dot.setAttribute('data-active', 'active');
      else dot.removeAttribute('data-active');
      const tabindex = active ? '0' : '-1';
      if (dot.getAttribute('tabindex') !== tabindex) dot.setAttribute('tabindex', tabindex);
    }
    syncRovingTabStops(group);
  }

  #renderInput(s: PagingState): void {
    const input = this.#numberInput;
    if (input) {
      if (input.value !== s.page) input.value = s.page;
      const max = s.totalPages != null ? String(s.totalPages) : null;
      if (max != null) input.setAttribute('data-max', max);
      else input.removeAttribute('data-max');
      const native = input.querySelector<HTMLInputElement>('input[role="spinbutton"]');
      if (native) {
        if (max != null) native.setAttribute('aria-valuemax', max);
        else native.removeAttribute('aria-valuemax');
      }
    }
    const total = this.#controls?.querySelector<HTMLElement>('.astryx-pagination-input-total');
    if (total) {
      total.hidden = s.totalPages == null;
      const text = s.totalPages != null ? fill(this.#messages.ofTotalPages ?? '', {total: this.#format(s.totalPages)}) : '';
      if (total.textContent !== text) total.textContent = text;
    }
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-pagination')) {
  customElements.define('ax-pagination', PaginationElement);
}

declare global {
  interface HTMLElementTagNameMap {
    'ax-pagination': PaginationElement;
  }
}
