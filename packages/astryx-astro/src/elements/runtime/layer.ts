/**
 * `LayerElement` — the base of every layer root (`<ax-layer>`, `<ax-tooltip>`,
 * `<ax-hover-card>`, `<ax-popover>`), and `<ax-layer>` itself (the generic Layer).
 *
 * Port of the open/close lifecycle of @astryxdesign/core Layer/useLayer.tsx: native promotion
 * only (`popover="auto|manual|hint"` + showPopover/hidePopover), `toggle` reconciliation of
 * closes the browser starts itself (light dismiss, auto/hint stack eviction, a close watcher),
 * `wasJustDismissed` (the press that dismissed a layer never reopens it), the trigger's anchor
 * name only while shown, and the focus-trap's focus return (useFocusTrap) with
 * `preventScroll: true` and the ring of the last input (contract #17, #18, #19).
 *
 * Everything works from server-rendered attributes; the element only reacts to the
 * platform's `beforetoggle` / `toggle` events, so a `<button popovertarget>` opens and
 * closes it with zero JS and the runtime merely adds anchoring, the Escape stack and focus.
 *
 * Attributes read:
 *   id                       required (the anchor name and ARIA ids derive from it)
 *   popover                  auto | manual | hint (default manual)
 *   data-ax-anchor="<id>"    the element to anchor to (else the invoker that opened it, from
 *                            the toggle event's `source`, else the first `[popovertarget=<id>]`)
 *   data-ax-escape           close | block | none (default: close for popover=auto, else none)
 *   data-ax-open="true"      open on connect; set "true"/"false" later to show/hide. The element
 *                            reflects its state into it.
 *   data-placement / data-align / data-astryx-keep-clear   geometry, see Layer.css
 * Events: `astryx-open-change` (bubbles, composed) with `detail: {isOpen, reason}`.
 * API: `show({anchor?, source?})`, `hide()`, `open()`, `close()`, `toggle()`, `isOpen`, `anchor`.
 */
import {anchorLayer, releaseLayer, settleLayer} from './anchor';
import {isFocusLost} from './dom';
import {currentGesture, currentGestureHasClicked, registerLayer, type DismissReason, type LayerEscapeBehavior, type LayerOutsidePress} from './layerStack';
import {returnFocusForLastInput} from './modality';

export type OpenChangeReason = DismissReason | 'toggle' | 'api' | 'hover' | 'focus' | 'press';

export interface OpenChangeDetail {
  isOpen: boolean;
  reason: OpenChangeReason;
  /** True when a controlled layer reports a request it did not act on. */
  isRequest?: boolean;
}

const Base: typeof HTMLElement = typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement;

export class LayerElement extends Base {
  static observedAttributes = ['data-ax-open'];

  /** The element the layer is anchored to while it shows. */
  anchor: HTMLElement | null = null;

  #unregister: (() => void) | null = null;
  #ownHide = false;
  #dismissedGesture: number | null = null;
  #settleFrame = 0;
  #opener: HTMLElement | null = null;
  #hadFocusInside = false;
  #pendingAnchor: HTMLElement | null = null;
  #reflecting = false;
  #wasOpen = false;
  #reason: OpenChangeReason = 'toggle';
  /** Set once connectedCallback wired the toggle listeners (an upgrade reports attributes first). */
  #wired = false;

  get isOpen(): boolean {
    return this.matches(':popover-open');
  }

  connectedCallback(): void {
    if (!this.hasAttribute('popover')) this.setAttribute('popover', 'manual');
    this.addEventListener('beforetoggle', this);
    this.addEventListener('toggle', this);
    this.addEventListener('focusin', this);
    this.#wired = true;
    if (this.getAttribute('data-ax-open') === 'true' && !this.isOpen) {
      // After the rest of the document's elements connect (the anchor may follow).
      queueMicrotask(() => { if (this.isConnected && !this.isOpen && this.getAttribute('data-ax-open') === 'true') this.show({reason: 'api'}); });
    }
  }

  disconnectedCallback(): void {
    this.removeEventListener('beforetoggle', this);
    this.removeEventListener('toggle', this);
    this.removeEventListener('focusin', this);
    this.#wired = false;
    cancelAnimationFrame(this.#settleFrame);
    // A removed popover hides without events: end its registration and anchor here.
    this.#unregister?.();
    this.#unregister = null;
    releaseLayer(this);
    this.#wasOpen = false;
  }

  attributeChangedCallback(_name: string, _old: string | null, value: string | null): void {
    if (this.#reflecting || !this.#wired) return;
    if (value === 'true' && !this.isOpen) this.show({reason: 'api'});
    else if (value === 'false' && this.isOpen) this.hide('api');
  }

  // ── Overridable policy ────────────────────────────────────────────────────

  /**
   * The element to anchor to when none was passed to `show()`: `data-ax-anchor`, else
   * `invoker` (the control whose `popovertarget` / `commandfor` opened the layer), else the
   * first `[popovertarget=<id>]` in the document.
   */
  protected resolveAnchor(invoker: HTMLElement | null = null): HTMLElement | null {
    const id = this.getAttribute('data-ax-anchor');
    if (id) {
      const el = this.ownerDocument.getElementById(id);
      if (el) return el;
    }
    if (invoker) return invoker;
    return this.id ? this.ownerDocument.querySelector<HTMLElement>(`[popovertarget="${CSS.escape(this.id)}"]`) : null;
  }

  /** What an Escape that reaches this layer does; null keeps it off the Escape stack. */
  protected escapeBehavior(): LayerEscapeBehavior | null {
    const value = this.getAttribute('data-ax-escape');
    if (value === 'close' || value === 'block') return value;
    if (value === 'none') return null;
    return this.getAttribute('popover') === 'auto' ? 'close' : null;
  }

  /** How a press outside the layer is answered. */
  protected outsidePressMode(): LayerOutsidePress {
    return this.getAttribute('popover') === 'auto' ? 'native' : 'ignore';
  }

  /** Whether a press with this composed path counts as inside the layer. */
  protected isInsidePress(path: ReadonlyArray<EventTarget>): boolean {
    return path.includes(this) || (this.anchor != null && path.includes(this.anchor));
  }

  /** Where focus returns when the layer closes with focus inside it. */
  protected restoreFocusTarget(): HTMLElement | null {
    return this.#opener;
  }

  /** A dismissal the stack routed here (Escape or an outside press). */
  protected requestDismiss(reason: DismissReason): void {
    this.hide(reason);
  }

  /** Hooks, all synchronous. `willOpen` runs before the first frame. */
  protected willOpen(): void {}
  protected didOpen(): void {}
  protected willClose(): void {}
  protected didClose(): void {}

  // ── API ───────────────────────────────────────────────────────────────────

  /** Whether the browser closed this layer during the current press (its click must not reopen it). */
  wasJustDismissed(): boolean {
    return this.#dismissedGesture != null && this.#dismissedGesture === currentGesture();
  }

  show(options: {anchor?: HTMLElement | null; source?: HTMLElement | null; reason?: OpenChangeReason} = {}): boolean {
    if (this.isOpen) {
      if (options.anchor && this.anchor !== options.anchor) {
        // Re-anchor a layer shared by several triggers.
        anchorLayer(this, options.anchor);
        this.anchor = options.anchor;
        settleLayer(this);
      }
      return true;
    }
    if (this.wasJustDismissed()) return false;
    this.#pendingAnchor = options.anchor ?? null;
    this.#reason = options.reason ?? 'api';
    const source = options.source ?? options.anchor ?? null;
    try {
      // `source` makes the trigger the invoker: popover nesting and focus order follow it.
      if (source instanceof HTMLElement) (this.showPopover as (o?: {source?: HTMLElement}) => void)({source});
      else this.showPopover();
    } catch (error) {
      this.#pendingAnchor = null;
      if ((error as {name?: string})?.name === 'InvalidStateError') return false;
      throw error;
    }
    this.#pendingAnchor = null;
    // Shown within this call: settle now, before anything paints.
    cancelAnimationFrame(this.#settleFrame);
    settleLayer(this);
    return this.isOpen;
  }

  hide(reason: OpenChangeReason = 'api'): void {
    if (!this.isOpen) return;
    this.#reason = reason;
    this.#ownHide = true;
    try {
      this.hidePopover();
    } finally {
      this.#ownHide = false;
    }
  }

  /** AGENTS.md element API: `open()` / `close()` are `show()` / `hide()`. */
  open(): boolean {
    return this.show({reason: 'api'});
  }

  close(): void {
    this.hide('api');
  }

  toggle(force?: boolean): boolean {
    const next = force ?? !this.isOpen;
    if (next) this.show({reason: 'toggle'});
    else this.hide('toggle');
    return this.isOpen;
  }

  /** Report an open-state change (or, for a controlled layer, a request). */
  protected emitOpenChange(detail: OpenChangeDetail): void {
    this.dispatchEvent(new CustomEvent<OpenChangeDetail>('astryx-open-change', {detail, bubbles: true, composed: true}));
  }

  // ── Platform events ───────────────────────────────────────────────────────

  handleEvent(event: Event): void {
    if (event.type === 'focusin') {
      this.#hadFocusInside = true;
      return;
    }
    if (event.target !== this) return;
    const toggle = event as ToggleEvent;
    if (event.type === 'beforetoggle') {
      if (toggle.newState === 'open') this.#beforeOpen(this.#invokerOf(toggle));
      else this.#beforeClose();
    } else if (event.type === 'toggle') {
      if (toggle.newState === 'open') this.#afterOpen();
      else this.#afterClose();
    }
  }

  /** The invoker a native show reports (ToggleEvent.source), when it is outside the layer. */
  #invokerOf(event: ToggleEvent): HTMLElement | null {
    const source = (event as ToggleEvent & {source?: Element | null}).source;
    return source instanceof HTMLElement && !this.contains(source) ? source : null;
  }

  #beforeOpen(invoker: HTMLElement | null) {
    const doc = this.ownerDocument;
    const anchor = this.#pendingAnchor ?? this.resolveAnchor(invoker);
    this.anchor = anchor;
    const active = doc.activeElement;
    this.#opener = active instanceof HTMLElement && active !== doc.body && !this.contains(active) ? active : null;
    this.#hadFocusInside = false;
    this.#dismissedGesture = null;
    if (anchor) anchorLayer(this, anchor);
    this.willOpen();
    this.#unregister?.();
    this.#unregister = registerLayer({
      element: this,
      escape: () => this.escapeBehavior(),
      outsidePress: () => this.outsidePressMode(),
      isInside: (path) => this.isInsidePress(path),
      isPresent: () => this.isOpen,
      dismiss: (reason) => this.requestDismiss(reason),
    });
    // A native (popovertarget) show: settle in the next frame, which runs before it paints.
    cancelAnimationFrame(this.#settleFrame);
    this.#settleFrame = requestAnimationFrame(() => settleLayer(this));
  }

  #beforeClose() {
    if (!this.#ownHide) {
      // The browser is closing the layer itself: remember the gesture, unless its click ran.
      this.#reason = this.#reason === 'api' ? 'toggle' : this.#reason;
      if (!currentGestureHasClicked()) this.#dismissedGesture = currentGesture();
    }
    cancelAnimationFrame(this.#settleFrame);
    const doc = this.ownerDocument;
    // Focus return (useFocusTrap): only when focus was inside and would otherwise be lost,
    // moved before the hide so the browser's own restore (which may scroll) has nothing to do.
    const hadFocus = this.#hadFocusInside || this.contains(doc.activeElement);
    if (hadFocus && isFocusLost(this, doc)) {
      const target = this.restoreFocusTarget();
      if (target && target.isConnected && !this.contains(target)) returnFocusForLastInput(target);
    }
    this.willClose();
    this.#unregister?.();
    this.#unregister = null;
  }

  #afterOpen() {
    if (this.#wasOpen) return;
    this.#wasOpen = true;
    this.didOpen();
    this.#reflect('true');
    this.emitOpenChange({isOpen: true, reason: this.#reason});
    this.#reason = 'toggle';
  }

  #afterClose() {
    releaseLayer(this);
    if (!this.#wasOpen) return;
    this.#wasOpen = false;
    this.didClose();
    this.#reflect('false');
    this.emitOpenChange({isOpen: false, reason: this.#reason});
    this.#reason = 'toggle';
  }

  #reflect(value: 'true' | 'false') {
    if (this.getAttribute('data-ax-open') === value) return;
    this.#reflecting = true;
    try {
      this.setAttribute('data-ax-open', value);
    } finally {
      this.#reflecting = false;
    }
  }
}

/** Define a custom element once (duplicate bundles and re-imports are fine). */
export function defineElement(tag: string, ctor: CustomElementConstructor): void {
  if (typeof customElements === 'undefined' || customElements.get(tag)) return;
  customElements.define(tag, ctor);
}

/** `<ax-layer>`: the generic anchored layer (useLayer, context mode). */
export class AxLayerElement extends LayerElement {}

defineElement('ax-layer', AxLayerElement);
