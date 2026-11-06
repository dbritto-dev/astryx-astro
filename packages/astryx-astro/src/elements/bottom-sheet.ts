/**
 * `<ax-bottom-sheet>` and `<ax-bottom-sheet-switcher>` — the behaviour of BottomSheet and
 * BottomSheetSwitcher.
 *
 * Ports @astryxdesign/core 0.7.9 BottomSheet/BottomSheet.tsx (StandaloneBottomSheet: the
 * native host, purpose-gated dismissal, scrim ownership, exit focus hold, focus return into a
 * revealed sheet, finalFocusRef), BottomSheetPanel.tsx (motion states, reserve, keyboard
 * scroll for Tall, body keyboard access), BottomSheetSwitcher.tsx (one active step, the
 * handoff, dismissal → null) and, through ./sheet/, useSheetGestures.ts, snapOffsets.ts and
 * bottomSheetStack.ts. The Dialog family's `ModalHostElement` (elements/dialog.ts) supplies
 * the shared lifecycle: invoker commands, the layer stack (Escape topmost-only, IME guard,
 * `cancel` → close request), the backdrop press that must start and end on the backdrop,
 * Tab containment, scroll lock (`data-ax-scroll-lock`), the modal outlet and the opener's
 * focus return.
 *
 * Markup contract (BottomSheet.astro renders it):
 *   <ax-bottom-sheet data-ax-purpose data-ax-modal? data-ax-open? data-ax-snap-points?
 *                    data-ax-final-focus? data-ax-sheet-id? data-ax-sized? data-ax-fixed-height?>
 *     <dialog id class="ax-bottom-sheet-dialog" aria-label [aria-modal] [popover=manual]
 *             data-ax-height data-astryx-layer-root data-ax-scroll-lock? data-ax-scrim?>
 *       <div class="astryx-bottom-sheet" tabindex="-1">            ← panel (theme target)
 *         <div class="ax-bottom-sheet-handle" aria-hidden="true">   ← grab handle
 *         <div class="ax-bottom-sheet-body" role="group" aria-label> ← scroll area
 *           <div class="ax-bottom-sheet-content" data-scroll-content>…</div>
 *       <div class="ax-bottom-sheet-edge-tint" aria-hidden="true">
 *
 * State attributes it writes: dialog `data-sheet-stack` (top|covered|exiting|replaced) and
 * `data-sheet-stack-depth` while sheets stack, `data-sheet-exit`, `data-sheet-exit-focus`,
 * `inert` + `aria-hidden` (covered and blocked, exiting without focus, replaced),
 * `--_sheet-scrim-opacity` / `--_sheet-scrim-duration`; panel `data-sheet-replaced`
 * (covered|aligning|fading), `data-sheet-cross-fade`, `data-sheet-dragging`,
 * `--_sheet-reserve`; body `tabindex="0"` while its content overflows.
 *
 * API: as `<ax-dialog>` — `show({source?})`, `hide()`, `open()`, `close()`, `toggle()`,
 * `isOpen`, `isClosing`, `dialog`; plus `panel`. Event `astryx-open-change`
 * `{isOpen, reason}`; reason is `escape | outside | swipe | api | toggle | host`.
 *
 * Keyboard (as Astryx: the handle is decorative, there is no keyboard resize): Escape through
 * the layer stack (top sheet only, by purpose), Tab contained in a modal sheet, the scroll
 * area a tab stop while it overflows (arrow/page keys scroll it), and a closing sheet that
 * holds focus swallows every key but Tab.
 *
 * Deferred (documented in BottomSheet.astro): a no-scrim sheet shown under an unrelated open
 * modal is not held back from the top layer; the scroll area's forward-Tab delegation to the
 * first link/button (Astryx scrollKeyboardDelegation, a document keydown listener); Gboard
 * keyboard riding (v1: `interactive-widget=resizes-content` + scrollIntoView on focus, Tall
 * only).
 */
import {ModalHostElement, defineHost, type DialogOpenChangeReason, type ShowOptions} from './dialog';
import {returnFocusForLastInput} from './runtime/modality';
import {isFocusDetached} from './runtime/dom';
import {createSheetGestures, type SheetGestures} from './sheet/gestures';
import {prefersReducedMotion, waitForTransition} from './sheet/motion';
import {resolveSnapPoints} from './sheet/snapOffsets';
import {
  closeDialogKeepingFocus,
  focusSheetPanel,
  forceReplaceThisTask,
  hasOtherPresented,
  hideSheetHost,
  isClosingTogether,
  isPresented,
  noteSheetPress,
  primeBatchActor,
  sheetBeneath,
  sheetClosing,
  sheetExited,
  sheetOpened,
  takeGroupReturnTarget,
  viewOf,
  willOwnScrim,
  DEFAULT_VIEW,
  type ScrimWrite,
  type SheetFocusReason,
  type SheetStackHost,
  type SheetStackView,
} from './sheet/stack';

export type BottomSheetOpenChangeReason = DialogOpenChangeReason | 'swipe' | 'host';

const MIN_RESERVE = 48;
const RESERVE_VIEWPORT_SHARE = 0.4;
const TEXT_ENTRY = 'input:not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="submit"]):not([type="reset"]):not([type="file"]):not([type="color"]), textarea, [contenteditable]:not([contenteditable="false"])';
const COARSE_REDUCED = '(prefers-reduced-motion: reduce) and (pointer: coarse)';

function setAttr(el: Element, name: string, value: string | null) {
  if (value == null) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== value) {
    el.setAttribute(name, value);
  }
}

function matches(view: Window, query: string): boolean {
  return view.matchMedia?.(query).matches ?? false;
}

export class BottomSheetElement extends ModalHostElement implements SheetStackHost {
  #gestures: SheetGestures | null = null;
  #gesturePanel: HTMLElement | null = null;
  #scrim: ScrimWrite = {frame: 0};
  #stackOpen = false;
  #view: SheetStackView = DEFAULT_VIEW;
  #exitDone: (() => void) | null = null;
  #exitWait: (() => void) | null = null;
  #exitFocusCleanup: (() => void) | null = null;
  #opener: HTMLElement | null = null;
  #adoptedOpener: HTMLElement | null = null;
  #keepFocusOnClose = false;
  #dismissedByTouch = false;
  #replacedRest = '';
  #presentedCleanup: Array<() => void> = [];
  #owesClose = false;
  #closeReason: BottomSheetOpenChangeReason | null = null;

  // ── Parts ─────────────────────────────────────────────────────────────────

  get panel(): HTMLElement | null {
    return this.dialog?.querySelector<HTMLElement>(':scope > .astryx-bottom-sheet') ?? null;
  }

  get #handle(): HTMLElement | null {
    return this.panel?.querySelector<HTMLElement>(':scope > .ax-bottom-sheet-handle') ?? null;
  }

  get #body(): HTMLElement | null {
    return this.panel?.querySelector<HTMLElement>(':scope > .ax-bottom-sheet-body') ?? null;
  }

  get isModal(): boolean {
    return this.hasAttribute('data-ax-modal');
  }

  get #isTall(): boolean {
    return this.dialog?.getAttribute('data-ax-height') === 'tall';
  }

  get #snapPoints(): Array<number | string> {
    const raw = this.getAttribute('data-ax-snap-points');
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  // ── ModalHostElement policy ───────────────────────────────────────────────

  protected isHostOpen(dialog: HTMLDialogElement): boolean {
    return this.isModal ? dialog.open : isPresented(dialog);
  }

  protected showHost(dialog: HTMLDialogElement): void {
    if (this.isModal) dialog.showModal();
    else if (typeof dialog.showPopover === 'function' && dialog.hasAttribute('popover')) dialog.showPopover();
    else dialog.show();
  }

  protected hideHost(dialog: HTMLDialogElement): void {
    const keep = this.#keepFocusOnClose;
    this.#keepFocusOnClose = false;
    if (!this.isModal && dialog.hasAttribute('popover') && typeof dialog.hidePopover === 'function') this.#owesClose = true;
    if (keep) closeDialogKeepingFocus(dialog);
    else hideSheetHost(dialog);
  }

  protected commandAction(command: string, dialog: HTMLDialogElement): 'show' | 'hide' | 'toggle' | null {
    if (this.isModal) return super.commandAction(command, dialog);
    switch (command) {
      case 'show-popover':
        return 'show';
      case 'hide-popover':
      case 'close':
        return 'hide';
      case 'toggle-popover':
        return 'toggle';
      default:
        return null;
    }
  }

  protected willShow(dialog: HTMLDialogElement, opener: HTMLElement | null): void {
    primeBatchActor(dialog.ownerDocument);
    this.#opener = opener;
    this.#adoptedOpener = null;
    this.#dismissedByTouch = false;
    this.#closeReason = null;
    for (const name of ['data-sheet-exit', 'data-sheet-exit-focus', 'inert', 'aria-hidden']) dialog.removeAttribute(name);
    const panel = this.panel;
    if (panel) {
      for (const name of ['data-sheet-replaced', 'data-sheet-cross-fade', 'data-sheet-exit']) panel.removeAttribute(name);
      panel.toggleAttribute('data-ax-settled', dialog.hasAttribute('data-ax-settled'));
      panel.style.removeProperty('--_sheet-align-offset');
      panel.style.removeProperty('opacity');
      this.#ensureGestures()?.reset();
      this.#writeReserve();
    }
    if (this.isModal) {
      // One scrim per stack: a sheet opening over a presented sheet starts clear, and the
      // stack hands it the scrim (instantly) if it becomes the owner.
      const owns = willOwnScrim(dialog);
      dialog.style.removeProperty('--_sheet-scrim-duration');
      if (owns) dialog.style.setProperty('--_sheet-scrim-opacity', '1');
      else writeClear(dialog);
    }
  }

  protected focusInitial(_dialog: HTMLDialogElement): void {
    this.focusSheet('open');
  }

  protected didOpen(): void {
    const dialog = this.dialog;
    if (!dialog) return;
    this.#stackOpen = true;
    sheetOpened(this);
    this.#attachPresented();
    // A sheet open on page load opened settled; later motion in this open animates.
    if (dialog.hasAttribute('data-ax-settled')) {
      const view = this.ownerDocument.defaultView ?? window;
      view.requestAnimationFrame(() => view.requestAnimationFrame(() => {
        dialog.removeAttribute('data-ax-settled');
        this.panel?.removeAttribute('data-ax-settled');
      }));
    }
    // Sheets rendered in this one's content that left with it come back with it, on top.
    for (const nested of this.#nestedSheets()) {
      if (!nested.hasAttribute('data-ax-host-suspended')) continue;
      nested.removeAttribute('data-ax-host-suspended');
      queueMicrotask(() => nested.show({reason: 'host' as DialogOpenChangeReason}));
    }
  }

  show(options: ShowOptions = {}): boolean {
    const wasClosing = this.isClosing;
    const shown = super.show(options);
    if (wasClosing && shown && !this.isClosing) this.#reopenDuringExit();
    return shown;
  }

  hide(reason: DialogOpenChangeReason = 'api'): void {
    if (!this.isOpen || this.isClosing) return;
    // Sheets rendered in this one's content are presented only while it is open: they leave
    // with it (their open state comes back with it).
    for (const nested of this.#nestedSheets()) {
      if (nested.isOpen && !nested.isClosing) {
        nested.setAttribute('data-ax-host-suspended', '');
        nested.hide('host' as DialogOpenChangeReason);
      }
    }
    this.#closeReason = reason as BottomSheetOpenChangeReason;
    super.hide(reason);
  }

  requestDismiss(reason: 'escape' | 'outside'): void {
    // A backdrop press counts only on a modal sheet (hasScrim).
    if (reason === 'outside' && !this.isModal) return;
    super.requestDismiss(reason);
  }

  protected runExit(dialog: HTMLDialogElement, done: () => void): () => void {
    this.#exitDone = done;
    this.#stackOpen = false;
    this.#gestures?.detach();
    this.#hadFocusAtClose = dialog.contains(dialog.ownerDocument.activeElement);
    // The batch (sealed in a microtask, before paint) decides: an exit, or a replace.
    sheetClosing(this);
    return () => {
      this.#exitDone = null;
      this.#exitWait?.();
      this.#exitWait = null;
      this.#releaseExitFocus();
      dialog.removeAttribute('data-sheet-exit');
      dialog.removeAttribute('inert');
      dialog.removeAttribute('aria-hidden');
      this.panel?.removeAttribute('data-sheet-cross-fade');
      this.panel?.removeAttribute('data-sheet-exit');
    };
  }

  #hadFocusAtClose = false;
  #quietClose = false;

  protected didClose(): void {
    const dialog = this.dialog;
    const doc = this.ownerDocument;
    const revealed = this.isModal ? sheetBeneath(this) : null;
    const wasGrouped = isClosingTogether(this);
    this.#detachPresented();
    sheetExited(this);
    this.#gestures?.reset();
    if (dialog) {
      for (const name of ['data-sheet-exit', 'data-sheet-exit-focus', 'inert', 'aria-hidden', 'data-sheet-stack', 'data-sheet-stack-depth']) dialog.removeAttribute(name);
      dialog.style.removeProperty('--_sheet-scrim-opacity');
      dialog.style.removeProperty('--_sheet-scrim-duration');
    }
    const panel = this.panel;
    if (panel) {
      for (const name of ['data-sheet-replaced', 'data-sheet-cross-fade', 'data-sheet-exit', 'data-ax-settled']) panel.removeAttribute(name);
      panel.style.removeProperty('--_sheet-align-offset');
    }
    // Focus return: a replaced sheet or one closing beneath open sheets leaves focus where it
    // is; a group returns once (the bottom sheet's target, after the last dialog left); a top
    // sheet reveals the sheet beneath (its opener there, else its panel); a last sheet goes to
    // finalFocus, else its opener (the element ModalHostElement already returned to, or the
    // flow's opener a replace handed it).
    const quiet = this.#quietClose;
    this.#quietClose = false;
    const finalFocus = this.#finalFocusTarget();
    const groupTarget = wasGrouped ? takeGroupReturnTarget(doc) : null;
    const focusLost = () => isFocusDetached(doc) || !(doc.activeElement as HTMLElement | null)?.checkVisibility?.();
    if (wasGrouped) {
      if (groupTarget?.isConnected) returnFocusForLastInput(groupTarget);
    } else if (quiet) {
      // nothing moves
    } else if (revealed?.dialog && revealed.dialog.isConnected) {
      if (finalFocus && revealed.dialog.contains(finalFocus)) returnFocusForLastInput(finalFocus);
      else if (!revealed.dialog.contains(doc.activeElement)) revealed.focusSheet('reveal');
    } else if (finalFocus && (this.isModal || this.#hadFocusAtClose)) {
      returnFocusForLastInput(finalFocus);
    } else if (this.#adoptedOpener?.isConnected && focusLost()) {
      returnFocusForLastInput(this.#adoptedOpener);
    }
    this.#opener = null;
    this.#adoptedOpener = null;
    if (this.#owesClose && dialog) {
      this.#owesClose = false;
      dialog.dispatchEvent(new Event('close'));
    }
  }

  protected didConnect(): void {
    const dialog = this.dialog;
    dialog?.addEventListener('pointerdown', this.#onPress, true);
  }

  protected didDisconnect(): void {
    this.dialog?.removeEventListener('pointerdown', this.#onPress, true);
    this.#detachPresented();
    this.#gestures?.detach();
    this.#exitWait?.();
    this.#exitWait = null;
    // A sheet removed mid-exit or mid-replace leaves the stack too.
    sheetExited(this);
  }

  #onPress = (event: Event) => {
    const dialog = this.dialog;
    if (dialog) noteSheetPress(dialog, event.target);
  };

  // ── SheetStackHost ────────────────────────────────────────────────────────

  applyView(view: SheetStackView): void {
    const previous = this.#view;
    this.#view = view;
    const dialog = this.dialog;
    const panel = this.panel;
    if (!dialog) return;
    if (this.isModal) {
      const stacked = view.isStacked && isPresented(dialog);
      const state = !stacked ? null : !this.#stackOpen ? (view.replacedMotion ? 'replaced' : 'exiting') : view.isTop ? 'top' : 'covered';
      setAttr(dialog, 'data-sheet-stack', state);
      setAttr(dialog, 'data-sheet-stack-depth', stacked && view.depth > 0 ? String(view.depth) : null);
      // One visible scrim per stack; a change of owner lands with no fade.
      if (this.#stackOpen || view.replacedMotion) {
        const value = !view.isStacked || view.ownsScrim ? '1' : '0';
        const wasOwner = !previous.isStacked || previous.ownsScrim;
        writeScrim(dialog, value, this.#scrim, wasOwner !== (value === '1'));
      } else if (view.isScrimTakenOver) {
        writeScrim(dialog, '0', this.#scrim, true);
      }
    }
    // Blocked: covered (and containing no presented sheet), or retained in a replace.
    const blocked = view.isBlocked || view.replacedMotion != null;
    if (blocked) {
      setAttr(dialog, 'inert', '');
      setAttr(dialog, 'aria-hidden', 'true');
    } else if (this.#stackOpen) {
      dialog.removeAttribute('inert');
      dialog.removeAttribute('aria-hidden');
    }
    if (panel) {
      if (view.replacedMotion && !previous.replacedMotion) this.#replacedRest = panel.style.transform;
      setAttr(panel, 'data-sheet-replaced', view.replacedMotion);
      if (view.replacedMotion === 'aligning' || (view.replacedMotion === 'fading' && view.alignmentOffset > 0)) {
        const offset = `translateY(${view.alignmentOffset}px)`;
        panel.style.transform = [this.#replacedRest, offset].filter(Boolean).join(' ');
      }
    }
  }

  beginExit(): void {
    const dialog = this.dialog;
    const panel = this.panel;
    if (!dialog || !this.#exitDone) return;
    const view = this.ownerDocument.defaultView ?? window;
    const stackView = viewOf(this);
    // A sheet closing beneath open sheets, or with others in one update, keeps focus where it is.
    const beneath = this.isModal && stackView.depth > 0;
    this.#keepFocusOnClose = beneath || isClosingTogether(this);
    this.#quietClose = beneath;
    this.#gestures?.release();
    if (this.isModal) {
      if (stackView.isScrimTakenOver) writeScrim(dialog, '0', this.#scrim, true);
      else dialog.style.setProperty('--_sheet-scrim-opacity', '0');
    }
    const reduced = prefersReducedMotion(dialog);
    const crossFade = matches(view, COARSE_REDUCED) || (reduced && this.#dismissedByTouch);
    if (panel) panel.toggleAttribute('data-sheet-cross-fade', reduced && this.#dismissedByTouch);
    dialog.setAttribute('data-sheet-exit', '');
    panel?.setAttribute('data-sheet-exit', '');
    this.#holdExitFocus(dialog);
    this.#exitWait = waitForTransition(panel, crossFade ? 'opacity' : 'transform', () => {
      this.#exitWait = null;
      this.#completeExit();
    });
  }

  finishReplaced(): void {
    this.#keepFocusOnClose = true;
    this.#quietClose = true;
    this.#completeExit();
  }

  focusSheet(reason: SheetFocusReason): void {
    focusSheetPanel(this.panel, reason, this.isModal);
  }

  getOpener(): HTMLElement | null {
    return this.#adoptedOpener ?? this.#finalFocusTarget() ?? this.#opener;
  }

  setOpener(opener: HTMLElement | null): void {
    this.#adoptedOpener = opener;
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  #completeExit() {
    const done = this.#exitDone;
    this.#exitDone = null;
    this.#releaseExitFocus();
    done?.();
  }

  #finalFocusTarget(): HTMLElement | null {
    const selector = this.getAttribute('data-ax-final-focus');
    if (!selector) return null;
    try {
      return this.ownerDocument.querySelector<HTMLElement>(selector);
    } catch {
      return null;
    }
  }

  #nestedSheets(): BottomSheetElement[] {
    const dialog = this.dialog;
    if (!dialog) return [];
    return [...dialog.querySelectorAll('ax-bottom-sheet')].filter((el): el is BottomSheetElement => el instanceof BottomSheetElement);
  }

  /** Reopened during its own exit: back in the stack, on top of the top layer. */
  #reopenDuringExit() {
    const dialog = this.dialog;
    if (!dialog) return;
    this.#stackOpen = true;
    if (this.isModal && hasOtherPresented(this)) {
      // The top layer is append-only: close and show again (keeping focus) to come back on top.
      const active = this.ownerDocument.activeElement;
      closeDialogKeepingFocus(dialog);
      dialog.showModal();
      if (active instanceof HTMLElement && active.isConnected && dialog.contains(active)) active.focus({preventScroll: true});
    }
    sheetOpened(this);
    this.#gestures?.attach();
  }

  /** A closing sheet that keeps focus takes no activation; one without focus goes inert. */
  #holdExitFocus(dialog: HTMLDialogElement) {
    const doc = dialog.ownerDocument;
    const goInert = () => {
      this.#releaseExitFocus();
      dialog.setAttribute('inert', '');
      dialog.setAttribute('aria-hidden', 'true');
    };
    if (!dialog.contains(doc.activeElement)) {
      goInert();
      return;
    }
    dialog.setAttribute('data-sheet-exit-focus', '');
    const swallow = (event: Event) => {
      if (event.type !== 'click' && (event as KeyboardEvent).key === 'Tab') return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onFocusOut = () => queueMicrotask(() => {
      if (dialog.hasAttribute('data-sheet-exit-focus') && !dialog.contains(doc.activeElement)) goInert();
    });
    dialog.addEventListener('click', swallow, true);
    dialog.addEventListener('keydown', swallow, true);
    dialog.addEventListener('keyup', swallow, true);
    dialog.addEventListener('focusout', onFocusOut);
    this.#exitFocusCleanup = () => {
      dialog.removeAttribute('data-sheet-exit-focus');
      dialog.removeEventListener('click', swallow, true);
      dialog.removeEventListener('keydown', swallow, true);
      dialog.removeEventListener('keyup', swallow, true);
      dialog.removeEventListener('focusout', onFocusOut);
    };
  }

  #releaseExitFocus() {
    this.#exitFocusCleanup?.();
    this.#exitFocusCleanup = null;
  }

  /** The surface kept below the screen: a finger can pull past the top by this much. */
  #reserveValue(): number {
    const view = this.ownerDocument.defaultView ?? window;
    if (this.hasAttribute('data-ax-sized') || !matches(view, '(any-pointer: coarse)')) return MIN_RESERVE;
    return Math.max(MIN_RESERVE, Math.ceil(view.innerHeight * RESERVE_VIEWPORT_SHARE));
  }

  #writeReserve() {
    this.panel?.style.setProperty('--_sheet-reserve', `${this.#reserveValue()}px`);
  }

  #ensureGestures(): SheetGestures | null {
    const panel = this.panel;
    const body = this.#body;
    if (!panel || !body) return null;
    if (this.#gestures && this.#gesturePanel === panel) return this.#gestures;
    this.#gestures?.detach();
    this.#gesturePanel = panel;
    const view = this.ownerDocument.defaultView ?? window;
    this.#gestures = createSheetGestures({
      panel,
      handle: this.#handle,
      body,
      snapHeights: () => resolveSnapPoints(this.#snapPoints, view.innerHeight),
      canDismiss: () => this.purpose === 'info',
      reserve: () => this.#reserveValue(),
      hasFixedHeight: () => this.hasAttribute('data-ax-fixed-height'),
      onDismiss: ({isTouch}) => {
        this.#dismissedByTouch = isTouch;
        this.hide('swipe' as DialogOpenChangeReason);
      },
      onScrimOpacity: (opacity) => {
        const dialog = this.dialog;
        if (!dialog || !this.isModal) return;
        if (this.#view.isStacked && !this.#view.ownsScrim) return;
        dialog.style.setProperty('--_sheet-scrim-opacity', String(opacity));
      },
      onTravelStart: () => {
        // Focusing the sheet dismisses the on-screen keyboard as the sheet starts to move.
        const active = this.ownerDocument.activeElement;
        if (active instanceof HTMLElement && panel.contains(active) && active.matches(TEXT_ENTRY)) panel.focus({preventScroll: true});
      },
    });
    return this.#gestures;
  }

  #attachPresented() {
    this.#detachPresented();
    const view = this.ownerDocument.defaultView ?? window;
    const onResize = () => this.#writeReserve();
    view.addEventListener('resize', onResize);
    this.#presentedCleanup.push(() => view.removeEventListener('resize', onResize));
    this.#ensureGestures()?.attach();
    const body = this.#body;
    const content = body?.querySelector<HTMLElement>(':scope > [data-scroll-content]') ?? null;
    if (body) {
      // Keyboard access to the scroll area: a tab stop only while its content overflows.
      const measure = () => {
        const overflows = body.scrollHeight - body.clientHeight > 1 || body.scrollWidth - body.clientWidth > 1;
        if (overflows) setAttr(body, 'tabindex', '0');
        else setAttr(body, 'tabindex', this.ownerDocument.activeElement === body ? '-1' : null);
      };
      measure();
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(measure);
        ro.observe(body);
        if (content) ro.observe(content);
        this.#presentedCleanup.push(() => ro.disconnect());
      }
      // Tall sheets: bring a focused text control above the on-screen keyboard (v1:
      // `interactive-widget=resizes-content` + scrollIntoView), only while fully expanded.
      if (this.#isTall) {
        let frame = 0;
        const reveal = (target: Element) => {
          if ((this.#gestures?.settledOffset ?? 0) > 0) return;
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => target.scrollIntoView({block: 'nearest', inline: 'nearest'}));
        };
        const onFocusIn = (event: FocusEvent) => {
          const target = event.target;
          if (!(target instanceof HTMLElement) || !target.matches(TEXT_ENTRY)) return;
          reveal(target);
          const vv = view.visualViewport;
          if (!vv) return;
          const onViewport = () => {
            if (this.ownerDocument.activeElement === target) reveal(target);
          };
          vv.addEventListener('resize', onViewport);
          target.addEventListener('blur', () => vv.removeEventListener('resize', onViewport), {once: true});
        };
        body.addEventListener('focusin', onFocusIn);
        this.#presentedCleanup.push(() => {
          body.removeEventListener('focusin', onFocusIn);
          cancelAnimationFrame(frame);
        });
      }
    }
  }

  #detachPresented() {
    for (const fn of this.#presentedCleanup.splice(0)) fn();
  }
}

function writeClear(dialog: HTMLDialogElement) {
  dialog.style.setProperty('--_sheet-scrim-duration', '0s');
  dialog.style.setProperty('--_sheet-scrim-opacity', '0');
  const view = dialog.ownerDocument.defaultView ?? window;
  view.requestAnimationFrame(() => view.requestAnimationFrame(() => dialog.style.removeProperty('--_sheet-scrim-duration')));
}

function writeScrim(dialog: HTMLDialogElement, value: string, pending: ScrimWrite, instant: boolean) {
  const current = dialog.style.getPropertyValue('--_sheet-scrim-opacity');
  if (current === value) return;
  if (!instant) {
    dialog.style.setProperty('--_sheet-scrim-opacity', value);
    return;
  }
  dialog.style.setProperty('--_sheet-scrim-duration', '0s');
  dialog.style.setProperty('--_sheet-scrim-opacity', value);
  const view = dialog.ownerDocument.defaultView ?? window;
  view.cancelAnimationFrame(pending.frame);
  pending.frame = view.requestAnimationFrame(() => {
    pending.frame = view.requestAnimationFrame(() => {
      pending.frame = 0;
      dialog.style.removeProperty('--_sheet-scrim-duration');
    });
  });
}

defineHost('ax-bottom-sheet', BottomSheetElement);

// ── <ax-bottom-sheet-switcher> ──────────────────────────────────────────────

export interface ActiveSheetChangeDetail {
  activeSheet: string | null;
}

/**
 * `<ax-bottom-sheet-switcher>` (display: contents) — BottomSheetSwitcher: one active step,
 * named by `activeSheet` (`data-ax-active-sheet` on the server). Moving from one step to the
 * next runs the replace handoff (the next step rises above the inert previous one, a taller
 * previous step moves down to meet it, then fades; one scrim throughout; focus moves into the
 * next step). A step that dismisses itself (Escape, scrim, swipe, by its purpose) closes the
 * flow. Focus returns to the element that opened the flow.
 *
 * Wiring: `switcher.activeSheet = 'confirm' | null`, or a control with
 * `data-ax-switch-to="confirm"` (empty value closes the flow) anywhere inside the switcher.
 * A step opened by its own invoker (from outside the flow) makes it the active step.
 * Event: `astryx-active-sheet-change` `{activeSheet}` (bubbles, composed) on every change.
 */
export class BottomSheetSwitcherElement extends (typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement) {
  #active: string | null = null;
  #driving = false;

  get activeSheet(): string | null {
    return this.#active;
  }

  set activeSheet(value: string | null) {
    this.#switch(value || null);
  }

  steps(): BottomSheetElement[] {
    return [...this.querySelectorAll('ax-bottom-sheet[data-ax-sheet-id]')].filter(
      (el): el is BottomSheetElement => el instanceof BottomSheetElement && el.closest('ax-bottom-sheet-switcher') === this,
    );
  }

  step(id: string | null): BottomSheetElement | null {
    return id ? this.steps().find((s) => s.getAttribute('data-ax-sheet-id') === id) ?? null : null;
  }

  connectedCallback(): void {
    this.addEventListener('astryx-open-change', this.#onStepChange);
    this.addEventListener('click', this.#onClick);
    this.#active = this.getAttribute('data-ax-active-sheet') || null;
  }

  disconnectedCallback(): void {
    this.removeEventListener('astryx-open-change', this.#onStepChange);
    this.removeEventListener('click', this.#onClick);
  }

  #switch(next: string | null) {
    if (next === this.#active) return;
    const previous = this.step(this.#active);
    const target = this.step(next);
    if (next != null && !target) return;
    this.#driving = true;
    try {
      if (previous?.isOpen && target) forceReplaceThisTask();
      if (previous?.isOpen && !previous.isClosing) previous.hide('api');
      if (target && !target.isOpen) target.show({reason: 'api'});
    } finally {
      this.#driving = false;
    }
    this.#setActive(next);
  }

  #setActive(next: string | null) {
    if (next === this.#active) return;
    this.#active = next;
    if (next) this.setAttribute('data-ax-active-sheet', next);
    else this.removeAttribute('data-ax-active-sheet');
    this.dispatchEvent(new CustomEvent<ActiveSheetChangeDetail>('astryx-active-sheet-change', {detail: {activeSheet: next}, bubbles: true, composed: true}));
  }

  #onStepChange = (event: Event) => {
    if (this.#driving) return;
    const step = event.target;
    if (!(step instanceof BottomSheetElement) || step.closest('ax-bottom-sheet-switcher') !== this) return;
    const id = step.getAttribute('data-ax-sheet-id');
    if (!id) return;
    const {isOpen} = (event as CustomEvent<{isOpen: boolean}>).detail;
    if (isOpen && id !== this.#active) {
      // Opened by its own invoker: it is the active step now (another open step yields).
      const previous = this.step(this.#active);
      this.#driving = true;
      try {
        if (previous?.isOpen && !previous.isClosing) previous.hide('api');
      } finally {
        this.#driving = false;
      }
      this.#setActive(id);
    } else if (!isOpen && id === this.#active) {
      // The active step dismissed itself by its purpose: the flow closes.
      this.#setActive(null);
    }
  };

  #onClick = (event: Event) => {
    const control = (event.target as Element | null)?.closest?.('[data-ax-switch-to]');
    if (!control || control.closest('ax-bottom-sheet-switcher') !== this) return;
    if (control.getAttribute('aria-disabled') === 'true' || (control as HTMLButtonElement).disabled) return;
    this.#switch(control.getAttribute('data-ax-switch-to') || null);
  };
}

defineHost('ax-bottom-sheet-switcher', BottomSheetSwitcherElement);
