/**
 * `<ax-popover>` — the layer root of a click-triggered Popover (and of menus/listboxes that
 * build on it).
 *
 * Port of @astryxdesign/core Popover/usePopover.tsx + Popover/Popover.tsx: `popover="auto"`
 * light dismiss (or `manual` with `hasLightDismiss={false}`), the trigger's
 * `aria-expanded`, initial focus (first genuine content control, never the fallback close;
 * else the labelled dialog surface), Tab containment for `aria-modal` dialogs
 * (hooks/useFocusTrap.ts), focus return, overflow → scrollable surface.
 *
 * Open, close, Escape and light dismiss already work with zero JS through
 * `<button popovertarget>`; this element only syncs `aria-expanded`, moves focus, anchors the
 * layer and joins the shared Escape stack (so a popover inside a dialog peels off first).
 *
 * Markup contract:
 *   <span class="ax-popover-anchor" id="P-anchor"><button popovertarget="P"
 *     aria-haspopup="dialog" aria-expanded="false" aria-controls="P">…</button></span>
 *   <ax-popover id="P" popover="auto" class="ax-layer ax-layer-motion" data-ax-anchor="P-anchor"
 *     data-placement="below" data-align="start" [data-ax-escape="none"] [data-ax-autofocus="false"]>
 *     <div class="astryx-popover" role="dialog" aria-modal="true" aria-label tabindex="-1">…
 *       <div data-astryx-popover-fallback-close><button popovertarget="P"
 *         popovertargetaction="hide">Close popover</button></div></div>
 *   </ax-popover>
 * A trigger that cannot be an invoker (`[role="button"]`) carries
 * `data-ax-popover-trigger="P"` instead of `popovertarget`; a delegated click/Enter/Space
 * listener toggles it (and ignores the click of the press that light-dismissed it).
 */
import './disabledInteraction';
import {FOCUSABLE_SELECTOR} from './dom';
import {LayerElement, defineElement} from './layer';
import {focusForLastInput} from './modality';
import type {LayerOutsidePress} from './layerStack';

const FALLBACK_CLOSE = '[data-astryx-popover-fallback-close]';
const OVERFLOW = 'data-astryx-overflow';

function attemptFocus(element: HTMLElement): boolean {
  try {
    focusForLastInput(element);
  } catch {
    // not focusable: the caller tries the next one
  }
  return element.ownerDocument.activeElement === element;
}

export class PopoverElement extends LayerElement {
  #observers: Array<() => void> = [];

  /** The painted surface (`.astryx-popover`), the dialog when role="dialog". */
  get surface(): HTMLElement | null {
    return this.querySelector<HTMLElement>(':scope > .astryx-popover') ?? this.firstElementChild as HTMLElement | null;
  }

  /** Every trigger that reports this popover's state. */
  triggers(): HTMLElement[] {
    if (!this.id) return [];
    const id = CSS.escape(this.id);
    return [...this.ownerDocument.querySelectorAll<HTMLElement>(`[aria-controls~="${id}"][aria-expanded], [data-ax-popover-trigger="${id}"]`)];
  }

  protected resolveAnchor(): HTMLElement | null {
    return super.resolveAnchor() ?? this.triggers()[0] ?? null;
  }

  protected escapeBehavior() {
    return this.getAttribute('data-ax-escape') === 'none' ? null : ('close' as const);
  }

  protected outsidePressMode(): LayerOutsidePress {
    return this.getAttribute('popover') === 'auto' ? 'native' : 'ignore';
  }

  protected isInsidePress(path: ReadonlyArray<EventTarget>): boolean {
    return super.isInsidePress(path) || this.triggers().some((t) => path.includes(t));
  }

  protected restoreFocusTarget(): HTMLElement | null {
    return super.restoreFocusTarget() ?? this.triggers()[0] ?? null;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('keydown', this.#onKeyDown);
    // Sibling mode by id: a trigger rendered without the invoker attributes gets them now.
    const anchorId = this.getAttribute('data-ax-anchor');
    if (anchorId && this.id) {
      queueMicrotask(() => {
        const el = this.ownerDocument.getElementById(anchorId);
        if (!el || el.hasAttribute('aria-controls') || el.contains(this)) return;
        const isButton = el.tagName === 'BUTTON';
        if (!isButton && el.getAttribute('role') !== 'button') return;
        if (isButton) el.setAttribute('popovertarget', this.id);
        else el.setAttribute('data-ax-popover-trigger', this.id);
        const dialog = this.surface?.getAttribute('role') === 'dialog';
        el.setAttribute('aria-haspopup', dialog ? 'dialog' : 'true');
        el.setAttribute('aria-expanded', String(this.isOpen));
        el.setAttribute('aria-controls', this.id);
      });
    }
  }

  disconnectedCallback(): void {
    this.removeEventListener('keydown', this.#onKeyDown);
    this.#stopObserving();
    super.disconnectedCallback();
  }

  protected willOpen(): void {
    for (const t of this.triggers()) if (t.hasAttribute('aria-expanded')) t.setAttribute('aria-expanded', 'true');
  }

  protected didOpen(): void {
    this.#observeOverflow();
    if (this.getAttribute('data-ax-autofocus') !== 'false') this.#focusInitialTarget();
  }

  protected willClose(): void {
    for (const t of this.triggers()) if (t.hasAttribute('aria-expanded')) t.setAttribute('aria-expanded', 'false');
    this.#stopObserving();
  }

  /** usePopover focusInitialTarget */
  #focusInitialTarget() {
    const surface = this.surface;
    if (!surface) return;
    const active = this.ownerDocument.activeElement;
    // Focus already inside (a press in the content, a caller's own focus) stays.
    if (active && active !== surface && surface.contains(active)) return;
    const auto = surface.querySelector<HTMLElement>('[autofocus], [data-autofocus]');
    if (auto && attemptFocus(auto)) return;
    for (const el of surface.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) {
      if (el.closest(FALLBACK_CLOSE)) continue;
      if (attemptFocus(el)) return;
    }
    if (surface.getAttribute('role') === 'dialog') attemptFocus(surface);
  }

  /** Tab and Shift+Tab wrap inside an `aria-modal` surface (useFocusTrap containment). */
  #onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const surface = this.surface;
    if (!surface || surface.getAttribute('aria-modal') !== 'true') return;
    const items = [...surface.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((el) => el.tabIndex >= 0 && !el.closest('[inert]'));
    const active = this.ownerDocument.activeElement as HTMLElement | null;
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (active === first || active === surface || !surface.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !surface.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  };

  /** Popover.tsx measureOverflow: the surface scrolls only while its content overflows. */
  #observeOverflow() {
    const surface = this.surface;
    if (!surface) return;
    const view = this.ownerDocument.defaultView ?? window;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const over = surface.scrollHeight > surface.clientHeight + 1 || surface.scrollWidth > surface.clientWidth + 1;
      surface.toggleAttribute(OVERFLOW, over);
    };
    const schedule = () => { if (!frame) frame = view.requestAnimationFrame(measure); };
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    ro?.observe(surface);
    const mo = new MutationObserver(schedule);
    mo.observe(surface, {childList: true, characterData: true, subtree: true});
    view.addEventListener('resize', schedule);
    this.#observers.push(() => {
      ro?.disconnect();
      mo.disconnect();
      view.removeEventListener('resize', schedule);
      if (frame) view.cancelAnimationFrame(frame);
    });
  }

  #stopObserving() {
    for (const fn of this.#observers.splice(0)) fn();
  }
}

defineElement('ax-popover', PopoverElement);

// Triggers that are not native invokers (role="button"): one delegated listener.
function popoverFor(trigger: Element): PopoverElement | null {
  const id = trigger.getAttribute('data-ax-popover-trigger');
  const el = id ? trigger.ownerDocument.getElementById(id) : null;
  return el instanceof PopoverElement ? el : null;
}

function activate(trigger: HTMLElement, event: Event) {
  if (trigger.getAttribute('aria-disabled') === 'true' || trigger.hasAttribute('popovertarget')) return;
  const layer = popoverFor(trigger);
  if (!layer) return;
  event.preventDefault();
  if (layer.isOpen) layer.hide('toggle');
  else layer.show({anchor: null, source: trigger, reason: 'toggle'});
}

const LISTENING = Symbol.for('astryx-astro/popover-triggers/v1');
if (typeof document !== 'undefined' && !(document as Document & {[LISTENING]?: true})[LISTENING]) {
  Object.defineProperty(document, LISTENING, {value: true});
  document.addEventListener('click', (event) => {
    const trigger = (event.target as Element | null)?.closest?.<HTMLElement>('[data-ax-popover-trigger]');
    if (trigger) activate(trigger, event);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const trigger = (event.target as Element | null)?.closest?.<HTMLElement>('[data-ax-popover-trigger]');
    if (!trigger || trigger !== event.target || trigger.tagName === 'BUTTON') return;
    activate(trigger, event);
  });
}
