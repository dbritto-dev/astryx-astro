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
 * closed (one shared compact-touch MediaQueryList listener).
 */
import './disabledInteraction';
import {FOCUSABLE_SELECTOR} from './dom';
import {LayerElement, defineElement, type OpenChangeReason} from './layer';
import {focusForLastInput} from './modality';
import {notifyTopLayerEntry} from './modalOutlet';
import type {LayerEscapeBehavior, LayerOutsidePress} from './layerStack';
import {resolvePresentation, watchCompactTouch, type ResolvedPresentation} from '../sheet/presentation';
import {createSheetGestures, type SheetGestures} from '../sheet/gestures';

const FALLBACK_CLOSE = '[data-astryx-popover-fallback-close]';
const OVERFLOW = 'data-astryx-overflow';
const SHEET_HANDLE = '.ax-popover-sheet-handle';
const MIN_RESERVE = 48;

/** Adaptive popovers whose closed triggers follow the compact-touch query. */
const adaptive = new Set<PopoverElement>();
let stopWatching: (() => void) | null = null;

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
  /** The surface latched for the current opening (null between openings). */
  #latched: ResolvedPresentation | null = null;
  #original: {role: string | null; modal: string | null; label: string | null} | null = null;
  #gestures: SheetGestures | null = null;
  #sheetCleanup: Array<() => void> = [];

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
    return this.getAttribute('data-ax-presentation') ?? 'popover';
  }

  /** The surface this opening uses (or would use now, while closed). */
  get surfaceMode(): ResolvedPresentation {
    return this.#latched ?? resolvePresentation(this.presentation, this.ownerDocument.defaultView);
  }

  get #isSheet(): boolean {
    return this.#latched === 'bottom-sheet';
  }

  show(options: {anchor?: HTMLElement | null; source?: HTMLElement | null; reason?: OpenChangeReason} = {}): boolean {
    if (!this.isOpen) {
      this.#latch();
      // A sheet is never anchored.
      if (this.#isSheet) return super.show({...options, anchor: null});
    }
    return super.show(options);
  }

  protected resolveAnchor(): HTMLElement | null {
    // The first hook of every open (a native invoker's too): choose the surface here.
    this.#latch();
    if (this.#isSheet) return null;
    return super.resolveAnchor() ?? this.triggers()[0] ?? null;
  }

  protected escapeBehavior(): LayerEscapeBehavior | null {
    if (this.#isSheet) return this.getAttribute('data-ax-escape-dismiss') === 'false' ? 'block' : 'close';
    return this.getAttribute('data-ax-escape') === 'none' ? null : ('close' as const);
  }

  protected outsidePressMode(): LayerOutsidePress {
    // A sheet's layer covers the viewport: its own backdrop-press handler dismisses.
    if (this.#isSheet) return 'ignore';
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
    if (this.presentation === 'adaptive') {
      adaptive.add(this);
      if (!stopWatching) stopWatching = watchCompactTouch(this.ownerDocument.defaultView, () => { for (const p of adaptive) p.syncClosedTriggers(); });
      queueMicrotask(() => this.syncClosedTriggers());
    }
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
    this.#stopSheet();
    adaptive.delete(this);
    if (adaptive.size === 0) {
      stopWatching?.();
      stopWatching = null;
    }
    super.disconnectedCallback();
  }

  protected willOpen(): void {
    for (const t of this.triggers()) if (t.hasAttribute('aria-expanded')) t.setAttribute('aria-expanded', 'true');
  }

  protected didOpen(): void {
    this.#observeOverflow();
    if (this.#isSheet) {
      this.#startSheet();
      this.#focusSheetTarget();
      return;
    }
    if (this.getAttribute('data-ax-autofocus') !== 'false') this.#focusInitialTarget();
  }

  protected willClose(): void {
    for (const t of this.triggers()) if (t.hasAttribute('aria-expanded')) t.setAttribute('aria-expanded', 'false');
    this.#stopObserving();
    this.#stopSheet();
    // The page scrolls again as the exit starts (useScrollLock(isOpen)).
    this.removeAttribute('data-ax-scroll-lock');
  }

  protected didClose(): void {
    // The surface stays latched in the markup through the exit (it styles it); the next open
    // resolves again.
    this.#latched = null;
    this.syncClosedTriggers();
  }

  // ── Presentation ──────────────────────────────────────────────────────────

  /** Choose the surface for this opening and restyle the same element for it. */
  #latch() {
    if (this.#latched && this.isOpen) return;
    const surface = this.surface;
    if (!surface) return;
    if (this.#original === null) {
      this.#original = {role: surface.getAttribute('role'), modal: surface.getAttribute('aria-modal'), label: surface.getAttribute('aria-label')};
    }
    const mode = resolvePresentation(this.presentation, this.ownerDocument.defaultView);
    this.#latched = mode;
    if (this.presentation === 'popover') return;
    this.setAttribute('data-ax-surface', mode);
    const isSheet = mode === 'bottom-sheet';
    surface.classList.toggle('astryx-bottom-sheet', isSheet);
    surface.classList.toggle('astryx-popover', !isSheet);
    this.toggleAttribute('data-ax-scroll-lock', isSheet);
    const set = (name: string, value: string | null) => (value == null ? surface.removeAttribute(name) : surface.setAttribute(name, value));
    if (isSheet) {
      set('role', 'dialog');
      set('aria-modal', 'true');
      set('aria-label', this.getAttribute('data-ax-sheet-label') || this.#triggerText() || null);
      surface.tabIndex = -1;
      surface.style.setProperty('--_sheet-reserve', `${this.#reserve()}px`);
      this.style.removeProperty('--_sheet-scrim-opacity');
    } else {
      const o = this.#original;
      set('role', o?.role ?? null);
      set('aria-modal', o?.modal ?? null);
      set('aria-label', o?.label ?? null);
      if (o?.role !== 'dialog') surface.removeAttribute('tabindex');
    }
    for (const t of this.triggers()) t.setAttribute('aria-haspopup', isSheet || surface.getAttribute('role') === 'dialog' ? 'dialog' : 'true');
  }

  /** Closed adaptive triggers announce the surface an opening would choose now. */
  syncClosedTriggers(): void {
    if (this.isOpen || this.presentation !== 'adaptive') return;
    const sheet = resolvePresentation('adaptive', this.ownerDocument.defaultView) === 'bottom-sheet';
    const dialog = sheet || (this.#original?.role ?? this.surface?.getAttribute('role')) === 'dialog';
    for (const t of this.triggers()) t.setAttribute('aria-haspopup', dialog ? 'dialog' : 'true');
  }

  #triggerText(): string {
    const trigger = this.triggers()[0];
    return trigger?.getAttribute('aria-label')?.trim() || trigger?.textContent?.trim() || '';
  }

  #reserve(): number {
    const view = this.ownerDocument.defaultView ?? window;
    return view.matchMedia?.('(any-pointer: coarse)').matches ? Math.max(MIN_RESERVE, Math.ceil(view.innerHeight * 0.4)) : MIN_RESERVE;
  }

  #startSheet() {
    this.#stopSheet();
    const surface = this.surface;
    if (!surface) return;
    if (!this.#gestures) {
      this.#gestures = createSheetGestures({
        panel: surface,
        handle: surface.querySelector<HTMLElement>(`:scope > ${SHEET_HANDLE}`),
        body: surface,
        // The sheet always light-dismisses (a swipe down), whatever hasLightDismiss says.
        canDismiss: () => true,
        reserve: () => this.#reserve(),
        onDismiss: () => this.hide('outside'),
        onScrimOpacity: (opacity) => this.style.setProperty('--_sheet-scrim-opacity', String(opacity)),
      });
    }
    this.#gestures.reset();
    this.#gestures.attach();
    // A press that starts and ends on the layer itself (beside or above the panel).
    let started = false;
    const onDown = (e: Event) => { started = e.target === this; };
    const onUp = (e: Event) => {
      const ended = started && e.target === this;
      started = false;
      if (ended) queueMicrotask(() => { if (this.isOpen && this.#isSheet) this.hide('outside'); });
    };
    const onCancel = () => { started = false; };
    this.addEventListener('pointerdown', onDown);
    this.addEventListener('pointerup', onUp);
    this.addEventListener('pointercancel', onCancel);
    this.#sheetCleanup.push(() => {
      this.removeEventListener('pointerdown', onDown);
      this.removeEventListener('pointerup', onUp);
      this.removeEventListener('pointercancel', onCancel);
    });
    // Toast hosts re-enter the top layer above the sheet (it is a top-layer surface).
    notifyTopLayerEntry();
  }

  #stopSheet() {
    for (const fn of this.#sheetCleanup.splice(0)) fn();
    if (this.#gestures) {
      this.#gestures.detach();
      // The panel leaves from where it rests: its CSS exit pose takes over.
      this.#gestures.release();
    }
    this.style.removeProperty('--_sheet-scrim-opacity');
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
