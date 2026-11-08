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
 *
 * Presentation (Popover.tsx `usePresentationSurface` + the PopoverBottomSheet path; the
 * contract other overlays adopt is in ../sheet/presentation.ts): `data-ax-presentation`
 * `bottom-sheet | adaptive`. As the layer opens (the first hook of the open sequence, before
 * anchoring) the surface is resolved and latched in `data-ax-surface` until the next open:
 * a sheet skips anchoring, swaps the surface's theme class to `astryx-bottom-sheet`, becomes a
 * modal dialog named by `data-ax-sheet-label` (else the trigger's text), locks page scroll
 * (`data-ax-scroll-lock` + the reflected `data-ax-open`), runs the sheet gestures (swipe down
 * dismisses), dismisses on a press that starts and ends on the layer beside/above the panel,
 * takes Escape per `data-ax-escape-dismiss`, focuses as Astryx's sheet does (always: a
 * `[data-autofocus]`, else the first content control, else the surface) and lets toast hosts
 * re-enter the top layer above it. Adaptive triggers keep `aria-haspopup` current while
 * closed (one shared compact-touch MediaQueryList listener). The surface handling is the shared
 * `createSheetSurface()` (../sheet/surface.ts); subclasses read `isSheetSurface`.
 */
import './disabledInteraction';
import {FOCUSABLE_SELECTOR} from './dom';
import {LayerElement, defineElement, type OpenChangeReason} from './layer';
import {focusForLastInput} from './modality';
import type {LayerEscapeBehavior, LayerOutsidePress} from './layerStack';
import type {ResolvedPresentation} from '../sheet/presentation';
import {createSheetSurface} from '../sheet/surface';
import {brandClass, globalSingleton} from './global';

const FALLBACK_CLOSE = '[data-astryx-popover-fallback-close]';
const OVERFLOW = 'data-astryx-overflow';
const SHEET_HANDLE = '.ax-popover-sheet-handle';

function attemptFocus(element: HTMLElement, options?: FocusOptions): boolean {
  try {
    focusForLastInput(element, options);
  } catch {
    // not focusable: the caller tries the next one
  }
  return element.ownerDocument.activeElement === element;
}

export class PopoverElement extends LayerElement {
  #observers: Array<() => void> = [];
  #sheet = createSheetSurface({
    layer: this,
    surface: () => this.surface,
    anchoredClass: 'astryx-popover',
    triggers: () => this.triggers(),
    anchoredHaspopup: (role) => (role === 'dialog' ? 'dialog' : 'true'),
    handle: () => this.surface?.querySelector<HTMLElement>(`:scope > ${SHEET_HANDLE}`) ?? null,
  });

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

  /** The presentation prop (`popover` when absent). */
  get presentation(): string {
    return this.#sheet.presentation;
  }

  /** The surface this opening uses (or would use now, while closed). */
  get surfaceMode(): ResolvedPresentation {
    return this.#sheet.mode;
  }

  /** Latched as a bottom sheet for the current opening. */
  protected get isSheetSurface(): boolean {
    return this.#sheet.isSheet;
  }

  show(options: {anchor?: HTMLElement | null; source?: HTMLElement | null; reason?: OpenChangeReason} = {}): boolean {
    if (!this.isOpen) {
      this.#sheet.latch();
      // A sheet is never anchored.
      if (this.#sheet.isSheet) return super.show({...options, anchor: null});
    }
    return super.show(options);
  }

  protected resolveAnchor(invoker: HTMLElement | null = null): HTMLElement | null {
    // The first hook of every open (a native invoker's too): choose the surface here.
    this.#sheet.latch();
    if (this.#sheet.isSheet) return null;
    return super.resolveAnchor(invoker) ?? this.triggers()[0] ?? null;
  }

  protected escapeBehavior(): LayerEscapeBehavior | null {
    if (this.#sheet.isSheet) return this.getAttribute('data-ax-escape-dismiss') === 'false' ? 'block' : 'close';
    return this.getAttribute('data-ax-escape') === 'none' ? null : ('close' as const);
  }

  protected outsidePressMode(): LayerOutsidePress {
    // A sheet's layer covers the viewport: its own backdrop-press handler dismisses.
    if (this.#sheet.isSheet) return 'ignore';
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
    this.#sheet.connect();
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
    this.#sheet.disconnect();
    super.disconnectedCallback();
  }

  protected willOpen(): void {
    for (const t of this.triggers()) if (t.hasAttribute('aria-expanded')) t.setAttribute('aria-expanded', 'true');
  }

  protected didOpen(): void {
    this.#observeOverflow();
    if (this.#sheet.isSheet) {
      this.#sheet.start();
      this.#focusSheetTarget();
      return;
    }
    if (this.getAttribute('data-ax-autofocus') !== 'false') this.#focusInitialTarget();
  }

  protected willClose(): void {
    for (const t of this.triggers()) if (t.hasAttribute('aria-expanded')) t.setAttribute('aria-expanded', 'false');
    this.#stopObserving();
    this.#sheet.stop();
    // The page scrolls again as the exit starts (useScrollLock(isOpen)).
    this.removeAttribute('data-ax-scroll-lock');
  }

  protected didClose(): void {
    // The surface stays latched in the markup through the exit (it styles it); the next open
    // resolves again.
    this.#sheet.closed();
  }

  /** Closed adaptive triggers announce the surface an opening would choose now. */
  syncClosedTriggers(): void {
    this.#sheet.syncClosedTriggers();
  }

  /** Popover.tsx sheet focus: `[data-autofocus]`, else the first genuine content control, else the surface. */
  #focusSheetTarget() {
    const surface = this.surface;
    if (!surface) return;
    const active = this.ownerDocument.activeElement;
    if (active && active !== surface && surface.contains(active)) return;
    // preventScroll: the panel is still rising; focus must not scroll the sheet or the page.
    const options = {preventScroll: true};
    const auto = surface.querySelector<HTMLElement>('[data-autofocus]');
    if (auto && attemptFocus(auto, options)) return;
    for (const el of surface.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) {
      if (el.closest(FALLBACK_CLOSE) || el.closest(SHEET_HANDLE)) continue;
      if (attemptFocus(el, options)) return;
    }
    attemptFocus(surface, options);
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
    const ro = new ResizeObserver(schedule);
    ro.observe(surface);
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

brandClass(PopoverElement, 'popover-element');
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

// One page-wide flag: a second copy of this module adds no second listener.
const triggers = globalSingleton('popover-triggers', () => ({listening: false}));
if (typeof document !== 'undefined' && !triggers.listening) {
  triggers.listening = true;
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
