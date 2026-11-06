// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Port of @astryxdesign/core 0.7.9 src/Chat/ChatLayout.tsx (behaviour),
// useChatStreamScroll.ts, useChatNewMessages.ts and ChatLayoutScrollButton.tsx (state).

/**
 * `<ax-chat-layout>` — stick-to-bottom scrolling, new-message detection and the default
 * scroll-to-bottom button of ChatLayout (components/Chat/ChatLayout.astro documents the
 * behaviour). The framework-free cores are exported for custom layouts:
 *
 *   createChatStreamScroll({scrollElement, …}) — useChatStreamScroll
 *   createChatNewMessages({isLocked, onResize, onChange}) — useChatNewMessages
 *   setChatScrollButton(wrapper, {isVisible, label}) — ChatLayoutScrollButton's state
 */
import {defineElement} from './runtime/layer';

const Base: typeof HTMLElement = typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement;
const SIXTY_FPS_MS = 1000 / 60;
const FOLLOWING_ATTR = 'data-astryx-chat-following';

export interface ChatScrollToBottomOptions {
  /** 'instant' jumps in one frame; 'spring' animates (instant under reduced motion). @default 'spring' */
  behavior?: 'instant' | 'spring';
}

export interface ChatStreamScrollOptions {
  /** The scroll container (the document's scrolling element for page scrolling). */
  scrollElement: HTMLElement;
  /** @default true */
  enabled?: boolean;
  /** Distance from the bottom within which scrollend re-locks. @default 10 */
  lockThreshold?: number;
  /** Distance from the bottom beyond which the button shows. @default 100 */
  buttonThreshold?: number;
  /** @default 0.7 */
  damping?: number;
  /** @default 0.05 */
  stiffness?: number;
  /** @default 1.25 */
  mass?: number;
  /** Called when `isScrolledUp` or `isLocked` changes. */
  onChange?: (state: {isScrolledUp: boolean; isLocked: boolean}) => void;
}

export interface ChatStreamScroll {
  readonly isScrolledUp: boolean;
  readonly isLocked: boolean;
  scrollToBottom(options?: ChatScrollToBottomOptions): void;
  scrollToMessage(el: HTMLElement): void;
  scrollToLastMessage(): void;
  lock(): void;
  unlock(): void;
  scrollIfLocked(): void;
  destroy(): void;
}

const isDocumentScroller = (el: HTMLElement) => el === el.ownerDocument.documentElement || el === el.ownerDocument.body || el === el.ownerDocument.scrollingElement;

/** Port of useChatStreamScroll: a spring that follows growing content until the reader scrolls up. */
export function createChatStreamScroll(options: ChatStreamScrollOptions): ChatStreamScroll {
  const {scrollElement: el, enabled = true, lockThreshold = 10, buttonThreshold = 100, damping = 0.7, stiffness = 0.05, mass = 1.25, onChange} = options;
  let isScrolledUp = false;
  let locked = true;
  let initialFillPending = true;
  let velocity = 0;
  let springPosition: number | undefined;
  let animating = false;
  let lastTick: number | undefined;
  let raf = 0;
  // The last position this controller set or saw: a reader's move between two spring frames
  // still shows as "above where we put it".
  let lastScrollTop = el.scrollTop;
  const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

  const notify = () => onChange?.({isScrolledUp, isLocked: locked});
  const setScrolledUp = (next: boolean) => {
    if (next === isScrolledUp) return;
    isScrolledUp = next;
    notify();
  };
  // While following, the controller owns the position: scroll anchoring is off.
  const setLocked = (next: boolean) => {
    const changed = next !== locked;
    locked = next;
    el.toggleAttribute(FOLLOWING_ATTR, next);
    if (changed) notify();
  };

  const stop = () => {
    animating = false;
    lastTick = undefined;
    velocity = 0;
  };

  const animate = () => {
    if (!locked || el.scrollHeight <= el.clientHeight) {
      stop();
      return;
    }
    const target = el.scrollHeight - el.clientHeight;
    const position = Math.max(0, Math.min(target, springPosition ?? el.scrollTop));
    const diff = target - position;
    if (Math.abs(diff) < 0.5 && Math.abs(velocity) < 0.1) {
      el.scrollTop = target;
      stop();
      return;
    }
    const now = performance.now();
    const tickDelta = lastTick ? (now - lastTick) / SIXTY_FPS_MS : 1;
    lastTick = now;
    velocity = (damping * velocity + stiffness * diff) / mass;
    springPosition = position + velocity * tickDelta;
    el.scrollTop = springPosition;
    lastScrollTop = el.scrollTop;
    raf = requestAnimationFrame(animate);
  };

  const jumpToBottom = () => {
    cancelAnimationFrame(raf);
    stop();
    el.scrollTop = el.scrollHeight - el.clientHeight;
    lastScrollTop = el.scrollTop;
  };

  const startAnimation = () => {
    if (!locked) return;
    if (reduced?.matches) {
      jumpToBottom();
      return;
    }
    if (!animating) {
      animating = true;
      lastTick = undefined;
      springPosition = el.scrollTop;
      raf = requestAnimationFrame(animate);
    }
  };

  const scrollToMessage = (message: HTMLElement) => {
    const containerRect = isDocumentScroller(el) ? {top: 0} : el.getBoundingClientRect();
    const offset = message.getBoundingClientRect().top - containerRect.top + el.scrollTop;
    el.scrollTo({top: offset, behavior: 'instant' as ScrollBehavior});
    lastScrollTop = el.scrollTop;
  };

  const onScroll = () => {
    const {scrollTop, scrollHeight, offsetHeight} = el;
    const viewport = isDocumentScroller(el) ? el.clientHeight : offsetHeight;
    setScrolledUp(scrollHeight - scrollTop - viewport > buttonThreshold);
    const isScrollingUp = scrollTop < lastScrollTop;
    lastScrollTop = scrollTop;
    // With anchoring off the browser only moves a following container up to clamp it onto a
    // smaller bottom; a reader scrolling up never lands there.
    const landedAtBottom = scrollHeight - scrollTop - el.clientHeight < 1;
    if (isScrollingUp && !landedAtBottom && locked) {
      setLocked(false);
      animating = false;
    }
  };
  const onScrollEnd = () => {
    const viewport = isDocumentScroller(el) ? el.clientHeight : el.offsetHeight;
    if (el.scrollHeight - el.scrollTop - viewport <= lockThreshold) setLocked(true);
  };

  // The document's scroll events fire at the Document, not at its root element.
  const eventTarget: EventTarget = isDocumentScroller(el) ? el.ownerDocument : el;
  let initialFrame = 0;
  if (enabled) {
    el.toggleAttribute(FOLLOWING_ATTR, locked);
    eventTarget.addEventListener('scroll', onScroll, {passive: true});
    eventTarget.addEventListener('scrollend', onScrollEnd);
    // Content present at load: position at the bottom in one frame.
    initialFrame = requestAnimationFrame(() => {
      if (el.scrollHeight > el.clientHeight) {
        el.scrollTop = el.scrollHeight - el.clientHeight;
        lastScrollTop = el.scrollTop;
        initialFillPending = false;
      }
    });
  }

  return {
    get isScrolledUp() { return isScrolledUp; },
    get isLocked() { return locked; },
    scrollToBottom(opts) {
      setLocked(true);
      setScrolledUp(false);
      initialFillPending = false;
      if (opts?.behavior === 'instant') {
        jumpToBottom();
        return;
      }
      startAnimation();
    },
    scrollToMessage,
    scrollToLastMessage() {
      const messages = el.getElementsByClassName('astryx-chat-message');
      const last = messages[messages.length - 1];
      if (last instanceof HTMLElement) scrollToMessage(last);
    },
    lock() {
      setLocked(true);
      setScrolledUp(false);
      startAnimation();
    },
    unlock() {
      setLocked(false);
      animating = false;
    },
    scrollIfLocked() {
      if (!enabled || !locked) return;
      // The first content that makes the container scroll positions in one frame.
      if (initialFillPending && el.scrollHeight > el.clientHeight) {
        initialFillPending = false;
        jumpToBottom();
        return;
      }
      startAnimation();
    },
    destroy() {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(initialFrame);
      eventTarget.removeEventListener('scroll', onScroll);
      eventTarget.removeEventListener('scrollend', onScrollEnd);
      el.removeAttribute(FOLLOWING_ATTR);
    },
  };
}

export interface ChatNewMessages {
  readonly hasNewMessages: boolean;
  dismiss(): void;
  /** Observe a content element (null detaches); attaching again swaps it. */
  observe(el: HTMLElement | null): void;
  destroy(): void;
}

/** Port of useChatNewMessages: a new last `.astryx-chat-message` while unlocked flags new messages. */
export function createChatNewMessages(options: {isLocked: () => boolean; onResize?: () => void; onChange?: (hasNewMessages: boolean) => void}): ChatNewMessages {
  let hasNew = false;
  let lastMessage: Element | null = null;
  let current: HTMLElement | null = null;
  let observer: ResizeObserver | null = null;
  const set = (next: boolean) => {
    if (next === hasNew) return;
    hasNew = next;
    options.onChange?.(next);
  };
  const detach = () => {
    observer?.disconnect();
    observer = null;
  };
  return {
    get hasNewMessages() { return hasNew; },
    dismiss: () => set(false),
    observe(el) {
      if (el === current) return;
      detach();
      current = el;
      if (!el || typeof ResizeObserver === 'undefined') return;
      observer = new ResizeObserver(() => {
        options.onResize?.();
        const messages = el.getElementsByClassName('astryx-chat-message');
        const last = messages.length > 0 ? messages[messages.length - 1] : null;
        if (last && last !== lastMessage) {
          lastMessage = last;
          if (!options.isLocked()) set(true);
        }
      });
      observer.observe(el);
    },
    destroy: detach,
  };
}

/** ChatLayoutScrollButton state: visibility (inert while hidden) and the expanding label. */
export function setChatScrollButton(wrapper: HTMLElement, state: {isVisible: boolean; label?: string | null}): void {
  const pill = wrapper.querySelector<HTMLElement>('.astryx-chat-layout-scroll-button');
  const button = pill?.querySelector<HTMLElement>('.astryx-button');
  if (!pill || !button) return;
  pill.toggleAttribute('data-ax-visible', state.isVisible);
  pill.inert = !state.isVisible;
  const label = state.label || null;
  pill.toggleAttribute('data-ax-expanded', label != null);
  const name = label ?? wrapper.getAttribute('data-ax-default-label') ?? '';
  button.setAttribute('aria-label', name);
  button.toggleAttribute('data-ax-icon-only', label == null);
  const content = button.querySelector<HTMLElement>('.ax-button-content') ?? button;
  let labelEl = content.querySelector<HTMLElement>(':scope > .ax-button-label');
  if (label == null) {
    labelEl?.remove();
  } else {
    if (!labelEl) {
      labelEl = document.createElement('span');
      labelEl.className = 'ax-button-label';
      content.append(labelEl);
    }
    labelEl.textContent = label;
  }
}

export class ChatLayoutElement extends Base {
  #stream: ChatStreamScroll | null = null;
  #newMessages: ChatNewMessages | null = null;
  #mutations: MutationObserver | null = null;
  #onButtonClick = (event: MouseEvent) => {
    if (!(event.target as Element | null)?.closest?.('.astryx-button')) return;
    this.#newMessages?.dismiss();
    this.#stream?.scrollToBottom();
  };

  connectedCallback(): void {
    const selector = this.getAttribute('data-ax-scroll-ref');
    let scroller: HTMLElement | null = this;
    if (selector) {
      try { scroller = this.ownerDocument.querySelector<HTMLElement>(selector); } catch { scroller = null; }
    }
    scroller ??= this;
    if (scroller === this.ownerDocument.body) scroller = (this.ownerDocument.scrollingElement as HTMLElement | null) ?? scroller;
    this.#stream = createChatStreamScroll({scrollElement: scroller, onChange: () => this.#renderButton()});
    this.#newMessages = createChatNewMessages({
      isLocked: () => this.#stream?.isLocked ?? true,
      onResize: () => this.#stream?.scrollIfLocked(),
      onChange: () => this.#renderButton(),
    });
    const area = this.querySelector<HTMLElement>(':scope > [data-ax-chat-message-area]');
    const findContent = () => this.#newMessages?.observe(area?.querySelector<HTMLElement>('[data-ax-chat-list-content]') ?? null);
    findContent();
    if (area) {
      // The list may mount (or be replaced) later: attach whenever it appears.
      this.#mutations = new MutationObserver(findContent);
      this.#mutations.observe(area, {childList: true, subtree: true});
    }
    this.#button?.addEventListener('click', this.#onButtonClick);
    this.#renderButton();
  }

  disconnectedCallback(): void {
    this.#button?.removeEventListener('click', this.#onButtonClick);
    this.#mutations?.disconnect();
    this.#mutations = null;
    this.#stream?.destroy();
    this.#stream = null;
    this.#newMessages?.destroy();
    this.#newMessages = null;
  }

  get #button(): HTMLElement | null {
    return this.querySelector<HTMLElement>(':scope > .ax-chat-layout-dock-container > [data-ax-layout-owned]');
  }

  #renderButton() {
    const button = this.#button;
    if (!button || !this.#stream || !this.#newMessages) return;
    const hasNew = this.#newMessages.hasNewMessages;
    setChatScrollButton(button, {
      isVisible: this.#stream.isScrolledUp || hasNew,
      label: hasNew ? this.getAttribute('data-ax-new-messages-label') : null,
    });
  }

  // ── Public API (useChatStreamScroll / useChatNewMessages returns) ─────────

  get isLocked(): boolean { return this.#stream?.isLocked ?? true; }
  get isScrolledUp(): boolean { return this.#stream?.isScrolledUp ?? false; }
  get hasNewMessages(): boolean { return this.#newMessages?.hasNewMessages ?? false; }
  scrollToBottom(options?: ChatScrollToBottomOptions): void { this.#stream?.scrollToBottom(options); }
  scrollToMessage(el: HTMLElement): void { this.#stream?.scrollToMessage(el); }
  scrollToLastMessage(): void { this.#stream?.scrollToLastMessage(); }
  lock(): void { this.#stream?.lock(); }
  unlock(): void { this.#stream?.unlock(); }
  dismissNewMessages(): void { this.#newMessages?.dismiss(); }
}

defineElement('ax-chat-layout', ChatLayoutElement);

declare global {
  interface HTMLElementTagNameMap {
    'ax-chat-layout': ChatLayoutElement;
  }
}
