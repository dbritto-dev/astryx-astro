// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Port of the behaviour of @astryxdesign/core 0.7.9 src/Chat/ChatMessageList.tsx
// (streaming aria-busy, the scrollToTopAction sentinel + transition, useBusyAnnouncement).

/**
 * `<ax-chat-message-list role="log">` — the message log.
 *  - `isStreaming` (property, mirrors `aria-busy="true"`): assistive tech waits for the
 *    completed message instead of re-reading every partial token.
 *  - With `[data-ax-chat-sentinel]` (hasScrollToTopAction): when the top sentinel scrolls into
 *    view of the enclosing ChatLayout's scroller (else the viewport) the list dispatches
 *    `astryx-scroll-to-top` {waitUntil(promise)}; while that promise is pending the top Spinner
 *    shows and "Loading" is announced once through the runtime (the spinner is silent).
 *  - `contentElement`: the inner column; append rows there.
 */
import {defineElement} from './runtime/layer';
import {createBusyAnnouncement} from './chat/busy';

const Base: typeof HTMLElement = typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement;

export interface ChatScrollToTopDetail {
  /** Keep the loading state until `promise` settles (load older messages). */
  waitUntil(promise: Promise<unknown>): void;
}

export class ChatMessageListElement extends Base {
  #observer: IntersectionObserver | null = null;
  #pending = 0;
  #busy = createBusyAnnouncement(() => this.contentElement);

  connectedCallback(): void {
    const sentinel = this.querySelector<HTMLElement>('[data-ax-chat-sentinel]');
    if (!sentinel) return;
    const layout = this.closest('ax-chat-layout');
    let root: Element | null = null;
    if (layout) {
      const selector = layout.getAttribute('data-ax-scroll-ref');
      try { root = selector ? this.ownerDocument.querySelector(selector) : layout; } catch { root = layout; }
      if (root === this.ownerDocument.documentElement || root === this.ownerDocument.body) root = null;
    }
    this.#observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && this.#pending === 0) this.#requestOlder();
    }, {root, threshold: 0});
    this.#observer.observe(sentinel);
  }

  disconnectedCallback(): void {
    this.#observer?.disconnect();
    this.#observer = null;
    this.#busy.destroy();
  }

  /** The inner column that holds the rows. */
  get contentElement(): HTMLElement | null {
    return this.querySelector<HTMLElement>(':scope > [data-ax-chat-list-content]');
  }

  get isStreaming(): boolean { return this.getAttribute('aria-busy') === 'true'; }
  set isStreaming(next: boolean) {
    if (next) this.setAttribute('aria-busy', 'true');
    else this.removeAttribute('aria-busy');
  }

  #setLoading(isLoading: boolean) {
    const row = this.querySelector<HTMLElement>('[data-ax-chat-loading]');
    if (row) row.hidden = !isLoading;
    this.#busy.set(isLoading, this.getAttribute('data-ax-loading-label') ?? '');
  }

  #requestOlder() {
    const waits: Promise<unknown>[] = [];
    const detail: ChatScrollToTopDetail = {waitUntil: (promise) => { waits.push(Promise.resolve(promise)); }};
    this.dispatchEvent(new CustomEvent('astryx-scroll-to-top', {detail, bubbles: true, composed: true}));
    if (waits.length === 0) return;
    this.#pending++;
    this.#setLoading(true);
    Promise.allSettled(waits).then(() => {
      this.#pending--;
      if (this.#pending === 0) this.#setLoading(false);
    });
  }
}

defineElement('ax-chat-message-list', ChatMessageListElement);

declare global {
  interface HTMLElementTagNameMap {
    'ax-chat-message-list': ChatMessageListElement;
  }
}
