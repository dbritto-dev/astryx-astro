/**
 * `<ax-dialog>` — the behaviour of Dialog (and, through subclasses, AlertDialog and Drawer):
 * a light-DOM host (`display: contents`) around the native `<dialog>` it manages.
 *
 * Ports @astryxdesign/core Dialog/Dialog.tsx (showModal/close sync, directional entry origin,
 * `data-autofocus`, opener capture and focus return), Layer/useLayerDismissal.ts (`cancel` →
 * the shared stack, IME guard), Layer/useBackdropPress.ts (a press must start and end on the
 * backdrop, and a press that dismissed a layer above the dialog is that layer's),
 * hooks/useFocusTrap.ts useFocusRegionContainment (Tab wraps at either end), Layer/modalOutlet.ts
 * (the open modal hosts the toast viewport) and utils/focusReturn.ts (prepareFocusReturnOnRemoval).
 * Scroll lock is CSS (`dialog[data-ax-scroll-lock]:modal`, styles/shared.css); announcements route
 * into the dialog's own live region through runtime/announce.ts.
 *
 * Why not LayerElement: that base is the popover itself (it sets `popover` on the element and
 * listens to its own toggle events). A modal must be a native `<dialog>` and customized
 * built-ins are not portable, so this host wraps the dialog, joins the same layer stack with
 * `registerLayer`, and mirrors LayerElement's API and event.
 *
 * Markup contract (Dialog.astro renders it):
 *   <ax-dialog data-ax-purpose="info|form|required" [data-ax-open="true"]>
 *     <dialog id="D" class="astryx-dialog" aria-modal="true" data-ax-scroll-lock closedby="…">
 *       … [data-ax-dialog-title] … [data-autofocus] …
 *       <button commandfor="D" command="close" data-ax-dialog-close>…</button>
 *     </dialog>
 *   </ax-dialog>
 * Triggers are invokers (`commandfor="D" command="show-modal"`, see components/Dialog/attach.ts):
 * zero JS opens, closes and Escapes natively; with this module the `command` event is taken
 * over so every open and close runs one lifecycle.
 *
 * Attributes read: `data-ax-purpose` (default info), `data-ax-open` ("true" opens on connect,
 * settled, with no entry motion; set "true"/"false" later to show/hide; reflected).
 * API: `show({source?, reason?})`, `hide(reason?)`, `open()`, `close()`, `toggle(force?)`,
 * `requestDismiss(reason)` (applies `purpose`), `isOpen`, `dialog`.
 * Event: `astryx-open-change` (bubbles, composed) `{isOpen, reason}` with reason
 * `escape | outside | api | toggle`.
 *
 * Deferred (touch extra): holdEntranceInput (taps during a coarse-pointer entrance reach nothing).
 */
import {outsideDismissalCount, registerLayer, shouldDismissOnCloseRequest} from './runtime/layerStack';
import {focusForLastInput, returnFocusForLastInput} from './runtime/modality';
import {isFocusLost, tabbables} from './runtime/dom';
import {notifyTopLayerEntry, supplyModalOutlet} from './runtime/modalOutlet';
import {brandClass} from './runtime/global';

export type DialogPurpose = 'required' | 'form' | 'info';
export type DialogOpenChangeReason = 'escape' | 'outside' | 'api' | 'toggle';

export interface DialogOpenChangeDetail {
  isOpen: boolean;
  reason: DialogOpenChangeReason;
}

export interface ShowOptions {
  /** The control that opened the layer: the entry origin and where focus returns. */
  source?: HTMLElement | null;
  reason?: DialogOpenChangeReason;
  /** Open where it rests, with no entry motion (a layer open on page load, spec:AST-013 FR13). */
  settled?: boolean;
}

const Base: typeof HTMLElement = typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement;

export function defineHost(tag: string, ctor: CustomElementConstructor): void {
  if (typeof customElements === 'undefined' || customElements.get(tag)) return;
  customElements.define(tag, ctor);
}

const isPopoverShowing = (el: Element): boolean => el.matches(':popover-open');

/** Open `popover="auto"` layers outside `host` (a press on the backdrop that closes one is theirs). */
function showingAutoPopovers(host: HTMLElement): Element[] {
  return [...host.ownerDocument.querySelectorAll('[popover="auto"], [popover=""]')].filter((el) => !el.contains(host) && isPopoverShowing(el));
}

/**
 * The shared lifecycle of every native-dialog layer (Dialog, AlertDialog, Drawer). Subclasses
 * decide how the host is shown and hidden and where focus starts.
 */
export class ModalHostElement extends Base {
  static observedAttributes = ['data-ax-open'];

  #dialog: HTMLDialogElement | null = null;
  #observer: MutationObserver | null = null;
  #unregister: (() => void) | null = null;
  #withdrawOutlet: (() => void) | null = null;
  #isOpen = false;
  #isClosing = false;
  #opener: HTMLElement | null = null;
  #reason: DialogOpenChangeReason = 'toggle';
  #reflecting = false;
  #wired = false;
  #press = {started: false, ended: false, popovers: [] as Element[], dismissals: 0};

  /** The managed `<dialog>`. */
  get dialog(): HTMLDialogElement | null {
    return this.#dialog ?? this.querySelector<HTMLDialogElement>(':scope > dialog');
  }

  /** Whether the layer is open (stays true through an exit animation until the host hides). */
  get isOpen(): boolean {
    return this.#isOpen;
  }

  /** Whether an exit is running. */
  get isClosing(): boolean {
    return this.#isClosing;
  }

  get purpose(): DialogPurpose {
    const value = this.getAttribute('data-ax-purpose');
    return value === 'required' || value === 'form' ? value : 'info';
  }

  /** Whether the host is a native modal (Escape blocks the page, Tab is contained, backdrop). */
  get isModal(): boolean {
    return true;
  }

  // ── Subclass policy ───────────────────────────────────────────────────────

  /** Whether the native host currently shows. */
  protected isHostOpen(dialog: HTMLDialogElement): boolean {
    return dialog.open;
  }

  protected showHost(dialog: HTMLDialogElement): void {
    dialog.showModal();
  }

  protected hideHost(dialog: HTMLDialogElement): void {
    if (dialog.open) dialog.close();
  }

  /**
   * Run the exit, then call `done` in the task the host must hide. Default: at once (the
   * dialog's fade-out is a CSS `allow-discrete` transition that runs after `close()`).
   * Returns a function that abandons the exit (a show during it).
   */
  protected runExit(_dialog: HTMLDialogElement, done: () => void): (() => void) | void {
    done();
  }

  /** Before the host shows (styles the first frame reads). */
  protected willShow(_dialog: HTMLDialogElement, _opener: HTMLElement | null): void {}

  /** Move focus in once the host shows. */
  protected focusInitial(dialog: HTMLDialogElement): void {
    const auto = this.ownElement(dialog, '[data-autofocus]');
    if (auto) focusForLastInput(auto);
  }

  /** Commands an invoker may send this host, mapped to an action. */
  protected commandAction(command: string, dialog: HTMLDialogElement): 'show' | 'hide' | 'toggle' | null {
    if (command === 'show-modal') return 'show';
    if (command === 'close') return dialog.open ? 'hide' : null;
    return null;
  }

  protected didConnect(): void {}
  protected didDisconnect(): void {}
  protected didOpen(): void {}
  protected didClose(): void {}

  /** The first element matching `selector` that belongs to this dialog (not a nested one). */
  protected ownElement(dialog: HTMLDialogElement, selector: string): HTMLElement | null {
    for (const el of dialog.querySelectorAll<HTMLElement>(selector)) if (el.closest('dialog') === dialog) return el;
    return null;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  connectedCallback(): void {
    const dialog = this.querySelector<HTMLDialogElement>(':scope > dialog');
    if (!dialog) return;
    this.#dialog = dialog;
    for (const type of ['command', 'beforetoggle', 'toggle', 'cancel', 'keydown', 'click']) dialog.addEventListener(type, this);
    for (const type of ['pointerdown', 'pointerup', 'pointercancel']) dialog.addEventListener(type, this, true);
    this.#observer = new MutationObserver(() => this.#reconcile());
    this.#observer.observe(dialog, {attributes: true, attributeFilter: ['open']});
    this.#wired = true;
    // With the runtime here, backdrop presses follow the start-and-end rule below, so the
    // native light dismiss the server markup asks for (closedby="any", zero JS) steps down.
    if (dialog.getAttribute('closedby') === 'any') dialog.setAttribute('closedby', 'closerequest');
    this.didConnect();
    if (this.isHostOpen(dialog)) this.#reconcile();
    else if (this.getAttribute('data-ax-open') === 'true') {
      queueMicrotask(() => {
        if (this.isConnected && !this.#isOpen && this.getAttribute('data-ax-open') === 'true') this.show({reason: 'api', settled: true});
      });
    }
  }

  disconnectedCallback(): void {
    const dialog = this.#dialog;
    this.#wired = false;
    this.#observer?.disconnect();
    this.#observer = null;
    if (dialog) {
      for (const type of ['command', 'beforetoggle', 'toggle', 'cancel', 'keydown', 'click']) dialog.removeEventListener(type, this);
      for (const type of ['pointerdown', 'pointerup', 'pointercancel']) dialog.removeEventListener(type, this, true);
    }
    this.didDisconnect();
    if (this.#isOpen && dialog) {
      // Removed while open: the host leaves the top layer without a close; end the layer here
      // and give focus the removal lost back to the opener (prepareFocusReturnOnRemoval).
      try {
        this.hideHost(dialog);
      } catch {
        /* already gone */
      }
      this.#finishClose(dialog, {emit: false});
    }
  }

  attributeChangedCallback(_name: string, _old: string | null, value: string | null): void {
    if (this.#reflecting || !this.#wired) return;
    if (value === 'true' && !this.#isOpen) this.show({reason: 'api'});
    else if (value === 'false' && this.#isOpen) this.hide('api');
  }

  // ── API ───────────────────────────────────────────────────────────────────

  show(options: ShowOptions = {}): boolean {
    const dialog = this.dialog;
    if (!dialog || !this.isConnected) return false;
    if (this.#isClosing) {
      // A show during the exit: abandon the exit and stay open.
      this.#cancelExit?.();
      this.#cancelExit = null;
      this.#isClosing = false;
      dialog.removeAttribute('data-ax-closing');
      this.#enterOutlet(dialog);
      return true;
    }
    if (this.isHostOpen(dialog)) {
      if (!this.#isOpen) this.#reconcile();
      return true;
    }
    this.#reason = options.reason ?? 'api';
    this.#captureOpener(dialog, options.source ?? null);
    dialog.toggleAttribute('data-ax-settled', options.settled === true);
    this.willShow(dialog, this.#opener);
    this.#selfToggle = true;
    try {
      this.showHost(dialog);
    } catch (error) {
      if ((error as {name?: string})?.name === 'InvalidStateError') return false;
      throw error;
    } finally {
      this.#selfToggle = false;
    }
    this.#didOpen(dialog);
    return true;
  }

  hide(reason: DialogOpenChangeReason = 'api'): void {
    const dialog = this.dialog;
    if (!dialog || !this.#isOpen || this.#isClosing) return;
    this.#reason = reason;
    this.#isClosing = true;
    dialog.setAttribute('data-ax-closing', '');
    // Hosts leave as the exit starts (Drawer: "it releases them when its exit starts").
    this.#withdrawOutlet?.();
    this.#withdrawOutlet = null;
    // The page scrolls again as the exit starts (useScrollLock(isOpen && hasScrim)).
    if (this.isModal) dialog.removeAttribute('data-ax-scroll-lock');
    const cancel = this.runExit(dialog, () => {
      this.#cancelExit = null;
      if (!this.#isClosing) return;
      this.hideHost(dialog);
      this.#finishClose(dialog, {emit: true});
    });
    if (this.#isClosing && typeof cancel === 'function') this.#cancelExit = cancel;
  }

  open(): boolean {
    return this.show({reason: 'api'});
  }

  close(): void {
    this.hide('api');
  }

  toggle(force?: boolean): boolean {
    const next = force ?? !this.#isOpen;
    if (next) this.show({reason: 'toggle'});
    else this.hide('toggle');
    return this.#isOpen;
  }

  /** An implicit dismissal (Escape, a close request, a backdrop press), as `purpose` allows. */
  requestDismiss(reason: 'escape' | 'outside'): void {
    const purpose = this.purpose;
    if (purpose === 'required') return;
    if (reason === 'outside' && purpose !== 'info') return;
    this.hide(reason);
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  #cancelExit: (() => void) | null = null;
  /** True while this element itself shows the host (its beforetoggle is not a foreign show). */
  #selfToggle = false;

  #captureOpener(dialog: HTMLDialogElement, source: HTMLElement | null) {
    const doc = this.ownerDocument;
    const active = doc.activeElement;
    const focused = active instanceof HTMLElement && active !== doc.body && !dialog.contains(active) ? active : null;
    this.#opener = source && source.isConnected && !dialog.contains(source) ? source : focused;
  }

  #didOpen(dialog: HTMLDialogElement) {
    if (this.#isOpen) return;
    this.#isOpen = true;
    this.#isClosing = false;
    dialog.removeAttribute('data-ax-closing');
    this.#unregister?.();
    this.#unregister = registerLayer({
      element: dialog,
      escape: () => (this.purpose === 'required' ? 'block' : 'close'),
      outsidePress: 'ignore',
      isPresent: () => this.isHostOpen(dialog),
      dismiss: (reason) => this.requestDismiss(reason),
    });
    this.#enterOutlet(dialog);
    this.focusInitial(dialog);
    this.didOpen();
    this.#reflect('true');
    this.#emit({isOpen: true, reason: this.#reason});
    this.#reason = 'toggle';
  }

  #enterOutlet(dialog: HTMLDialogElement) {
    if (this.isModal) {
      dialog.setAttribute('data-ax-scroll-lock', '');
      this.#withdrawOutlet?.();
      this.#withdrawOutlet = supplyModalOutlet(dialog);
    } else {
      notifyTopLayerEntry();
    }
  }

  #finishClose(dialog: HTMLDialogElement, {emit}: {emit: boolean}) {
    if (!this.#isOpen) return;
    this.#isOpen = false;
    this.#isClosing = false;
    this.#cancelExit = null;
    dialog.removeAttribute('data-ax-closing');
    dialog.removeAttribute('data-ax-settled');
    // Back for the next open, which may be a native one (zero-JS invoker semantics).
    if (this.isModal) dialog.setAttribute('data-ax-scroll-lock', '');
    this.#withdrawOutlet?.();
    this.#withdrawOutlet = null;
    this.#unregister?.();
    this.#unregister = null;
    // Focus returns to the opener after the host left (a modal makes the page inert until
    // then), without scrolling and with the ring the last input calls for.
    const opener = this.#opener;
    this.#opener = null;
    const doc = this.ownerDocument;
    if (opener && opener.isConnected && (isFocusLost(dialog, doc) || doc.activeElement === opener)) returnFocusForLastInput(opener);
    this.didClose();
    if (!emit) return;
    this.#reflect('false');
    this.#emit({isOpen: false, reason: this.#reason});
    this.#reason = 'toggle';
  }

  /** The native host changed without this element asking (an invoker without JS takeover, a
   *  `method="dialog"` form, script calling showModal()/close()). */
  #reconcile() {
    const dialog = this.#dialog;
    if (!dialog) return;
    const open = this.isHostOpen(dialog);
    if (open && !this.#isOpen) {
      if (!this.#opener) this.#captureOpener(dialog, null);
      this.#didOpen(dialog);
    } else if (!open && this.#isOpen) {
      this.#finishClose(dialog, {emit: true});
    }
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

  #emit(detail: DialogOpenChangeDetail) {
    this.dispatchEvent(new CustomEvent<DialogOpenChangeDetail>('astryx-open-change', {detail, bubbles: true, composed: true}));
  }

  handleEvent(event: Event): void {
    const dialog = this.#dialog;
    if (!dialog) return;
    switch (event.type) {
      case 'command': {
        if (event.target !== dialog) return;
        const {command, source} = event as Event & {command: string; source: Element | null};
        const action = this.commandAction(command, dialog);
        if (!action) return;
        event.preventDefault();
        const from = source instanceof HTMLElement ? source : null;
        if (action === 'show' || (action === 'toggle' && !this.#isOpen)) this.show({source: from, reason: 'toggle'});
        else this.hide('toggle');
        return;
      }
      case 'beforetoggle': {
        // A native show this element did not start: the opener still holds focus now.
        if (event.target === dialog && !this.#selfToggle && (event as ToggleEvent).newState === 'open' && !this.#isOpen) {
          this.#captureOpener(dialog, null);
          this.willShow(dialog, this.#opener);
        }
        return;
      }
      case 'toggle':
        if (event.target === dialog) this.#reconcile();
        return;
      case 'cancel': {
        // A close request (Android back, requestClose(), an Escape the stack never saw). One
        // bubbling up from a file input is not this dialog's.
        if (event.target !== dialog) return;
        event.preventDefault();
        if (this.#isOpen && shouldDismissOnCloseRequest(dialog)) this.requestDismiss('escape');
        return;
      }
      case 'keydown':
        this.#containTab(event as KeyboardEvent, dialog);
        return;
      case 'pointerdown': {
        const onBackdrop = event.target === dialog;
        this.#press = {
          started: onBackdrop,
          ended: false,
          popovers: onBackdrop ? showingAutoPopovers(dialog) : [],
          dismissals: outsideDismissalCount(this.ownerDocument),
        };
        return;
      }
      case 'pointerup':
        this.#press.ended = this.#press.started && event.target === dialog;
        this.#press.started = false;
        return;
      case 'pointercancel':
        this.#press = {started: false, ended: false, popovers: [], dismissals: 0};
        return;
      case 'click': {
        const press = this.#press;
        const wasOnBackdrop = press.ended;
        const dismissedAbove = press.popovers.some((p) => !isPopoverShowing(p)) || outsideDismissalCount(this.ownerDocument) !== press.dismissals;
        this.#press = {started: false, ended: false, popovers: [], dismissals: 0};
        if (this.isModal && this.#isOpen && wasOnBackdrop && !dismissedAbove && event.target === dialog) this.requestDismiss('outside');
        return;
      }
    }
  }

  /** Tab and Shift+Tab wrap at either end of an open modal (useFocusRegionContainment). */
  #containTab(event: KeyboardEvent, dialog: HTMLDialogElement) {
    if (event.key !== 'Tab' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (!this.isModal || !this.#isOpen) return;
    const doc = this.ownerDocument;
    const active = doc.activeElement as HTMLElement | null;
    // A dialog nested in this one is its own focus context.
    const nested = active?.closest('dialog[open]');
    if (nested && nested !== dialog) return;
    const items = tabbables(dialog);
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const index = active ? items.indexOf(active) : -1;
    if (index === -1) {
      // Focus on a non-tabbable spot inside (the title, the dialog itself): wrap only when no
      // tabbable lies ahead in the direction of travel.
      const inside = active != null && dialog.contains(active);
      const ahead = inside
        ? items.some((el) => (active!.compareDocumentPosition(el) & (event.shiftKey ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING)) !== 0)
        : false;
      if (ahead) return;
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (event.shiftKey && index === 0) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && index === items.length - 1) {
      event.preventDefault();
      first.focus();
    }
  }
}

/** Entry origin: a unit vector from the opener toward the viewport centre, 16px long. */
function dialogDirection(trigger: HTMLElement, distance = 16): {x: number; y: number} {
  const rect = trigger.getBoundingClientRect();
  const view = trigger.ownerDocument.defaultView ?? window;
  const dx = rect.left + rect.width / 2 - view.innerWidth / 2;
  const dy = rect.top + rect.height / 2 - view.innerHeight / 2;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  return {x: Math.round((dx / dist) * distance), y: Math.round((dy / dist) * distance)};
}

/** `<ax-dialog>`: Dialog (and AlertDialog's base). */
export class DialogElement extends ModalHostElement {
  protected willShow(dialog: HTMLDialogElement, opener: HTMLElement | null): void {
    if (opener && opener !== opener.ownerDocument.body) {
      const dir = dialogDirection(opener);
      dialog.style.setProperty('--dialog-dir-x', `${dir.x}px`);
      dialog.style.setProperty('--dialog-dir-y', `${dir.y}px`);
    } else {
      dialog.style.setProperty('--dialog-dir-x', '0px');
      dialog.style.setProperty('--dialog-dir-y', '16px');
    }
  }

  /** `[data-autofocus]` first, then a native `[autofocus]`, then the DialogHeader title. */
  protected focusInitial(dialog: HTMLDialogElement): void {
    const auto = this.ownElement(dialog, '[data-autofocus]');
    if (auto) {
      focusForLastInput(auto);
      return;
    }
    if (this.ownElement(dialog, '[autofocus]')) return;
    const title = this.ownElement(dialog, '[data-ax-dialog-title]');
    if (title) focusForLastInput(title);
  }
}

// Drawer, MobileNav and BottomSheet extend it from their own modules (maybe another copy).
brandClass(ModalHostElement, 'modal-host-element');
defineHost('ax-dialog', DialogElement);
