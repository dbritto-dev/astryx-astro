/**
 * <ax-tab-list> — the behaviour of TabList (light DOM; the element is the painted
 * `.astryx-tab-list`). Port of @astryxdesign/core TabList/TabList.tsx (selection, the reveal
 * effects, scroll-by-page arrows, handleRootFocus / handleRootBlur), Tab.tsx (handleSelect),
 * TabMenu.tsx (handleSelect, trigger label), hooks/useScrollOverflow.ts and
 * hooks/isRtlElement.ts, with hooks/useKeyboardHint.tsx through runtime/keyboardHint.ts.
 *
 * Roving focus (arrows, Home/End, one stop) is runtime/roving.ts, driven by the root's
 * `data-astryx-roving*` attributes; clicks and keys on `aria-disabled` tabs never get here
 * (runtime/disabledInteraction.ts). TabMenu dropdowns are `<ax-menu>` layers (runtime/menu.ts)
 * with its `data-ax-open-focus="first"` (focus-on-open, whichever input opened it) and
 * `data-ax-trigger-arrows="false"` (↑/↓ on the closed trigger stay with the strip's roving)
 * options; their radio group's `astryx-change` is taken over here and re-emitted as the
 * TabList's.
 *
 * API: `value` (get/set; setting moves the selection and fires nothing, like a new controlled
 * value). Event: `astryx-change` `{value}` — bubbles, composed, cancelable; dispatched on every
 * tab click and TabMenu pick before the selection applies; `preventDefault()` keeps it.
 *
 * Overflow (`.astryx-tab-strip[data-ax-scroll]`): the strip's edge state (1px tolerance,
 * |scrollLeft| so RTL works) from scroll, a ResizeObserver on the strip and each child, and child
 * / class / style mutations — measured only while rendered (checkVisibility) — is written as
 * `data-ax-fade="start|end|both"` on the strip and the scroll buttons' `hidden`. The buttons
 * scroll by 80% of the strip (smooth through the CSS, instant under reduced motion). The
 * selected tab is revealed on connect, on every selection and when the root resizes; a focused
 * stop is revealed past the fade (scroll-padding read back from the computed style).
 */
import {createKeyboardHint} from './runtime/keyboardHint';
import {syncRovingTabStops} from './runtime/roving';
import {isRtl} from './runtime/dom';

const TAB = '[data-tab-value]';
const MENU_TRIGGER = '[data-tab-menu]';
const STOP = `${TAB},${MENU_TRIGGER}`;
const SCROLL_PAGE_RATIO = 0.8;
const TOLERANCE = 1;

const isRendered = (el: HTMLElement) => typeof el.checkVisibility !== 'function' || el.checkVisibility();

export class TabListElement extends HTMLElement {
  #value = '';
  #hint = createKeyboardHint(this, {layer: () => this.querySelector<HTMLElement>(':scope > [data-ax-keyboard-hint]')});
  #cleanup: Array<() => void> = [];
  #overflow = {start: false, end: false};
  #measured = false;
  #focusRevealedValue: string | null = null;
  #revealFrame = 0;

  get strip(): HTMLElement | null {
    return this.querySelector<HTMLElement>(':scope > .astryx-tab-strip');
  }

  get value(): string {
    return this.#value;
  }

  set value(next: string) {
    this.#apply(String(next));
  }

  get #isTabsPattern(): boolean {
    return this.getAttribute('data-ax-pattern') === 'tabs';
  }

  get #hasScroll(): boolean {
    return this.strip?.hasAttribute('data-ax-scroll') ?? false;
  }

  /** A stop of this list (not of a nested list, not inside one of its layers). */
  #owns(el: Element | null): el is HTMLElement {
    return el instanceof HTMLElement && el.closest('.astryx-tab-list') === this && el.parentElement?.closest('[popover]')?.closest('.astryx-tab-list') !== this;
  }

  get tabs(): HTMLElement[] {
    return [...this.querySelectorAll<HTMLElement>(TAB)].filter((el) => this.#owns(el));
  }

  get #menuTriggers(): HTMLElement[] {
    return [...this.querySelectorAll<HTMLElement>(MENU_TRIGGER)].filter((el) => this.#owns(el));
  }

  #menuOf(trigger: HTMLElement): HTMLElement | null {
    const id = trigger.getAttribute('aria-controls');
    return id ? this.ownerDocument.getElementById(id) : null;
  }

  connectedCallback(): void {
    this.#value = this.getAttribute('data-ax-value') ?? '';
    const on = <K extends keyof HTMLElementEventMap>(target: EventTarget, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, opts);
      this.#cleanup.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };
    // The hint's focus handling runs first, as Astryx calls hint.onFocus before the rest.
    this.#cleanup.push(this.#hint.attach());
    on(this, 'click', (e) => this.#onClick(e));
    on(this, 'mousedown', (e) => {
      // Nothing hidden from assistive technology should take focus: the scroll buttons.
      if ((e.target as Element | null)?.closest?.('.astryx-tab-scroll-button')) e.preventDefault();
    });
    on(this, 'focusin', (e) => this.#onFocusIn(e));
    on(this, 'focusout', () => { this.#focusRevealedValue = null; });
    on(this, 'astryx-change', (e) => this.#onMenuChange(e as CustomEvent<{value: string}>));
    if (this.#hasScroll) this.#observeOverflow();
    this.#reveal();
  }

  disconnectedCallback(): void {
    for (const fn of this.#cleanup.splice(0)) fn();
    cancelAnimationFrame(this.#revealFrame);
    this.#revealFrame = 0;
    this.#measured = false;
  }

  // ── Selection ──────────────────────────────────────────────────────────

  #onClick(event: MouseEvent): void {
    const target = event.target as Element | null;
    const button = target?.closest?.<HTMLElement>('.astryx-tab-scroll-button');
    if (button && button.closest('.astryx-tab-list') === this) {
      this.#scrollByPage(button.getAttribute('data-ax-side') === 'start' ? -1 : 1);
      return;
    }
    const tab = target?.closest?.<HTMLElement>(TAB) ?? null;
    if (!this.#owns(tab)) return;
    if (tab.getAttribute('aria-disabled') === 'true') {
      event.preventDefault();
      return;
    }
    // A caller's click handler that prevented the default keeps the selection (Astryx onClick).
    if (event.defaultPrevented) return;
    this.#select(tab.getAttribute('data-tab-value') ?? '');
  }

  /** A user selection: ask first (cancelable `astryx-change`), then apply. */
  #select(value: string): boolean {
    const proceed = this.dispatchEvent(new CustomEvent('astryx-change', {detail: {value}, bubbles: true, composed: true, cancelable: true}));
    if (proceed) this.#apply(value);
    return proceed;
  }

  /** A TabMenu's radio group changed: re-emit it as this list's change. */
  #onMenuChange(event: CustomEvent<{value: string}>): void {
    const list = event.target as HTMLElement | null;
    if (list === this || !list?.hasAttribute?.('data-ax-tab-menu-list')) return;
    const trigger = this.#menuTriggers.find((t) => t.getAttribute('aria-controls') === list.id);
    if (!trigger) return;
    event.stopPropagation();
    if (!this.#select(String(event.detail?.value ?? ''))) event.preventDefault();
  }

  #apply(next: string): void {
    this.#value = next;
    // Reflected, so an element that is moved (disconnected and connected again) keeps it.
    if (this.getAttribute('data-ax-value') !== next) this.setAttribute('data-ax-value', next);
    const tabsPattern = this.#isTabsPattern;
    for (const tab of this.tabs) {
      const selected = tab.getAttribute('data-tab-value') === next;
      if (tabsPattern || tab.getAttribute('role') === 'tab') tab.setAttribute('aria-selected', String(selected));
      else if (selected) tab.setAttribute('aria-current', 'true');
      else tab.removeAttribute('aria-current');
      if (selected) tab.setAttribute('data-selected', 'selected');
      else tab.removeAttribute('data-selected');
      const indicator = tab.querySelector<HTMLElement>(':scope > .astryx-tab-indicator');
      if (indicator) {
        if (selected) indicator.setAttribute('data-selected', 'selected');
        else indicator.removeAttribute('data-selected');
      }
      setTabIndex(tab, selected ? 0 : -1);
    }
    for (const trigger of this.#menuTriggers) this.#syncMenu(trigger, next);
    if (this.isConnected) syncRovingTabStops(this);
    // The tab you are on has to be visible. Selection that a press or an arrow already
    // revealed (by focusing it) finishes next frame, when the selected weight has laid out.
    if (this.#focusRevealedValue != null && this.#focusRevealedValue === next) {
      cancelAnimationFrame(this.#revealFrame);
      this.#revealFrame = requestAnimationFrame(() => { this.#revealFrame = 0; this.#reveal(); });
    } else {
      this.#reveal();
    }
  }

  #syncMenu(trigger: HTMLElement, next: string): void {
    const menu = this.#menuOf(trigger);
    const rows = menu ? [...menu.querySelectorAll<HTMLElement>('[role="menuitemradio"]')] : [];
    let selectedLabel: string | null = null;
    for (const row of rows) {
      const checked = row.getAttribute('data-value') === next;
      row.setAttribute('aria-checked', String(checked));
      if (checked) selectedLabel = row.getAttribute('data-ax-label') ?? row.textContent ?? '';
    }
    const hasSelected = selectedLabel != null;
    const text = selectedLabel ?? trigger.getAttribute('data-ax-menu-label') ?? '';
    for (const span of trigger.querySelectorAll<HTMLElement>(':scope > .ax-tab-menu-label > span')) {
      if (span.textContent !== text) span.textContent = text;
    }
    trigger.toggleAttribute('data-ax-selected', hasSelected);
    setTabIndex(trigger, hasSelected ? 0 : -1);
    let indicator = trigger.querySelector<HTMLElement>(':scope > .astryx-tab-indicator');
    if (hasSelected && !indicator) {
      indicator = trigger.ownerDocument.createElement('span');
      indicator.className = 'astryx-tab-indicator';
      indicator.setAttribute('data-selected', 'selected');
      trigger.append(indicator);
    } else if (!hasSelected && indicator) {
      indicator.remove();
    }
  }

  // ── Focus ──────────────────────────────────────────────────────────────

  #onFocusIn(event: FocusEvent): void {
    const stop = (event.target as Element | null)?.closest?.<HTMLElement>(STOP) ?? null;
    if (!this.#owns(stop)) return;
    // The browser scrolls a focused element into view only when it is entirely outside the
    // scrollport, so arrowing onto a half-visible stop would leave it under the fade.
    this.#revealStop(stop);
    this.#focusRevealedValue = stop.getAttribute('data-tab-value');
  }

  // ── Reveal / scroll ────────────────────────────────────────────────────

  #reveal(): void {
    const tab = this.tabs.find((t) => t.getAttribute('data-tab-value') === this.#value)
      ?? this.#menuTriggers.find((t) => t.hasAttribute('data-ax-selected'))
      ?? null;
    this.#revealStop(tab);
  }

  #revealStop(stop: HTMLElement | null): void {
    const strip = this.strip;
    if (!this.#hasScroll || !strip || !stop || !isRendered(strip)) return;
    const stripBox = strip.getBoundingClientRect();
    const stopBox = stop.getBoundingClientRect();
    const inset = parseFloat(getComputedStyle(strip).scrollPaddingLeft) || 0;
    const pastEnd = stopBox.right - (stripBox.right - inset);
    const pastStart = stopBox.left - (stripBox.left + inset);
    // A stop wider than the space kept clear cannot be shown whole: show its reading start.
    const tooWide = stopBox.width > stripBox.width - 2 * inset;
    const delta = tooWide ? (isRtl(strip) ? pastEnd : pastStart) : pastEnd > 0 ? pastEnd : pastStart < 0 ? pastStart : 0;
    // Not an animation: the strip arrives already showing the right tab.
    if (delta !== 0) strip.scrollBy({left: delta, behavior: 'instant'});
  }

  #scrollByPage(direction: -1 | 1): void {
    const strip = this.strip;
    if (!strip) return;
    // Under RTL the scroll axis is inverted: flip the physical delta.
    const rtlSign = isRtl(strip) ? -1 : 1;
    strip.scrollBy({left: rtlSign * direction * strip.clientWidth * SCROLL_PAGE_RATIO});
  }

  #observeOverflow(): void {
    const strip = this.strip;
    if (!strip) return;
    const measure = () => { if (isRendered(strip)) this.#measure(); };
    const observed = new Set<Element>();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver((entries) => {
      measure();
      // A strip that fitted at one width can hide the selected tab at a narrower one.
      if (entries.some((entry) => entry.target === this)) this.#reveal();
    });
    const follow = () => {
      if (!ro) return;
      const children = new Set(strip.children);
      for (const child of observed) if (!children.has(child)) { ro.unobserve(child); observed.delete(child); }
      for (const child of children) if (!observed.has(child)) { ro.observe(child); observed.add(child); }
    };
    ro?.observe(this);
    ro?.observe(strip);
    follow();
    const mo = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => { follow(); measure(); });
    mo?.observe(strip, {childList: true, attributes: true, attributeFilter: ['class', 'style']});
    // A scroll is measured hidden or not: script scrolled it, so its layout is current.
    const onScroll = () => this.#measure();
    strip.addEventListener('scroll', onScroll, {passive: true});
    this.#cleanup.push(() => {
      ro?.disconnect();
      mo?.disconnect();
      strip.removeEventListener('scroll', onScroll);
    });
    measure();
  }

  #measure(): void {
    const strip = this.strip;
    if (!strip) return;
    const {scrollLeft, scrollWidth, clientWidth} = strip;
    const maxScroll = scrollWidth - clientWidth;
    const start = Math.abs(scrollLeft) > TOLERANCE;
    const end = Math.abs(scrollLeft) < maxScroll - TOLERANCE;
    if (this.#measured && start === this.#overflow.start && end === this.#overflow.end) return;
    this.#measured = true;
    this.#overflow = {start, end};
    const fade = start && end ? 'both' : start ? 'start' : end ? 'end' : null;
    if (fade) strip.setAttribute('data-ax-fade', fade);
    else strip.removeAttribute('data-ax-fade');
    for (const button of this.querySelectorAll<HTMLElement>(':scope > .astryx-tab-scroll-button')) {
      const side = button.getAttribute('data-ax-side');
      button.hidden = !(side === 'start' ? start : end);
    }
  }
}

function setTabIndex(el: HTMLElement, value: 0 | -1): void {
  if (el.getAttribute('tabindex') !== String(value)) el.setAttribute('tabindex', String(value));
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-tab-list')) {
  customElements.define('ax-tab-list', TabListElement);
}

declare global {
  interface HTMLElementTagNameMap {
    'ax-tab-list': TabListElement;
  }
}
