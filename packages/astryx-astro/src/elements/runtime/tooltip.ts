/**
 * Hover layers: `<ax-tooltip>` (Tooltip, InfoTip, truncation tooltips, any component's
 * `tooltip` prop) and `<ax-hover-card>` (HoverCard), with one set of delegated document
 * listeners for every trigger on the page.
 *
 * Ports of @astryxdesign/core Tooltip/useTooltip.tsx, HoverCard/useHoverCard.tsx,
 * InfoTip/InfoTip.tsx (press-to-pin), utils/triggerFocus.ts and the tap rule of
 * Layer/useTouchTrigger.ts (`isActionTrigger`).
 *
 * Markup contract (server-rendered; see README.md):
 *   trigger:  data-ax-tooltip="<layer id>"  (or data-ax-hover-card="<layer id>")
 *             + aria-describedby="<layer id>" for tooltips (SSR, so it is named before JS)
 *   layer:    <ax-tooltip id popover="hint" role="tooltip" class="astryx-tooltip ax-layer …"
 *               data-placement data-align data-astryx-keep-clear [data-ax-anchor="<id>"]
 *               [data-ax-delay] [data-ax-hide-delay] [data-ax-focus-trigger] [data-ax-touch-trigger]
 *               [data-ax-enabled="false"] [data-ax-open="true|false"] [data-ax-controlled]>
 *   anchor:   the layer positions against its trigger, or against `data-ax-anchor` when that
 *             names another element (Astryx `positionRef` beside `interactionRef`: a row is the
 *             hover/focus trigger, its checkbox the anchor). With no trigger in the markup,
 *             `data-ax-anchor` (or `data-ax-for`) is wired as the trigger (`<Tooltip for>`).
 *
 * Tooltip behaviour (Astryx 0.7.9):
 * - hover shows after `delay` (200), leaving hides after `hideDelay`, or a 100ms bridge so the
 *   pointer can cross onto the surface (WCAG 1.4.13 hoverable); the surface keeps it open;
 * - keyboard focus (`:focus-visible` only, never a tap or a mouse focus) shows at once, blur
 *   hides; `focusTrigger` auto|always|never decides which focus counts;
 * - pressing the trigger hides it; it is never focusable; Escape hides it when it is the
 *   top-most layer (one press, one layer: a tooltip over a dialog takes the first Escape);
 * - `pin()` (Astryx `show()`, InfoTip's press) holds it open until `unpin()`, Escape, a press
 *   outside or focus leaving trigger and tooltip, and announces its text once;
 * - controlled (`data-ax-controlled` + `data-ax-open`): hover/focus never change it; Escape
 *   reports through `astryx-open-change` with `isRequest`.
 * - Group handoff (an addition the task asked for; Astryx 0.7.9 has none): while one tooltip is
 *   open, or within 300ms of one closing, another trigger's tooltip shows without its delay
 *   and replaces it.
 * HoverCard differs: interactive (hovering or focusing the card keeps it open, a 200ms exit
 * grace), any focus on the trigger opens it, delays 300/200, Escape with focus inside returns
 * focus to the trigger without reopening.
 *
 * Deferred (AGENTS.md scope): the coarse-pointer press controller and touch extras of
 * useTouchTrigger beyond tap-to-open + outside-tap dismissal (scroll dismissal, pen arrival).
 */
import './disabledInteraction';
import {announceText} from './announce';
import {LayerElement, defineElement, type OpenChangeReason} from './layer';
import {noteOutsideDismissal, type DismissReason, type LayerOutsidePress} from './layerStack';
import {isTouchInteraction} from './modality';

type FocusTrigger = 'auto' | 'always' | 'never';
type TouchTrigger = 'auto' | 'tap' | 'none';

const HOVER_BRIDGE_DELAY = 100;
const SKIP_DELAY_MS = 300;
const TRIGGER_ATTRS = ['data-ax-tooltip', 'data-ax-hover-card'] as const;
const TRIGGER_SELECTOR = '[data-ax-tooltip], [data-ax-hover-card]';
const LAYER_SELECTOR = 'ax-tooltip, ax-hover-card';

// ── utils/triggerFocus.ts ───────────────────────────────────────────────────
function isFocusableTrigger(element: HTMLElement): boolean {
  if (element.hasAttribute('tabindex')) return element.tabIndex >= 0;
  if (['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) return !(element as HTMLButtonElement).disabled;
  return element.isContentEditable;
}

function isFocusOnTrigger(target: EventTarget | null, trigger: HTMLElement, mode: FocusTrigger): boolean {
  if (mode === 'always') return true;
  if (mode === 'never') return false;
  return target === trigger || isFocusableTrigger(trigger);
}

// ── Layer/useTouchTrigger.ts isActionTrigger ────────────────────────────────
const ACTION_ROLES = new Set(['button', 'checkbox', 'combobox', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'radio', 'searchbox', 'slider', 'spinbutton', 'switch', 'tab', 'textbox']);

function isDisabledControl(el: Element): boolean {
  return el.getAttribute('aria-disabled') === 'true' || (el as HTMLButtonElement).disabled === true;
}

/** Whether activating the trigger does something other than reveal the layer. */
export function isActionTrigger(element: HTMLElement): boolean {
  if (isDisabledControl(element)) return false;
  const role = element.getAttribute('role');
  if (role) return ACTION_ROLES.has(role);
  switch (element.tagName) {
    case 'LABEL': {
      const control = (element as HTMLLabelElement).control;
      return control == null || !isDisabledControl(control);
    }
    case 'BUTTON': case 'INPUT': case 'SELECT': case 'SUMMARY': case 'TEXTAREA':
      return true;
    case 'A': case 'AREA':
      return element.hasAttribute('href');
    default:
      return element.isContentEditable;
  }
}

// ── Group handoff ───────────────────────────────────────────────────────────
let activeTooltip: HoverLayerElement | null = null;
let lastTooltipClosedAt = -Infinity;
const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now());

abstract class HoverLayerElement extends LayerElement {
  protected abstract readonly kind: 'tooltip' | 'hover-card';
  protected abstract readonly defaults: {delay: number; hideDelay: number};

  #showTimer: ReturnType<typeof setTimeout> | null = null;
  #hideTimer: ReturnType<typeof setTimeout> | null = null;
  #focusCounted = false;
  protected held = false;
  #heldFromPress = false;
  #holdInThisTask = false;
  #triggerPressed = false;
  #stopPressTracking: (() => void) | null = null;
  #announced = false;
  protected hoveringContent = false;
  protected escapeDismissing = false;
  /** The trigger the current open came from (hover, focus, press). */
  #activeTrigger: HTMLElement | null = null;

  /** The element the user interacts with (Astryx `interactionRef`). */
  get trigger(): HTMLElement | null {
    return this.#activeTrigger ?? this.triggers()[0] ?? this.anchor;
  }

  get delay(): number { return numberAttr(this, 'data-ax-delay', this.defaults.delay); }
  get hideDelay(): number { return numberAttr(this, 'data-ax-hide-delay', this.defaults.hideDelay); }
  get focusTrigger(): FocusTrigger { return (this.getAttribute('data-ax-focus-trigger') as FocusTrigger | null) ?? 'auto'; }
  get touchTrigger(): TouchTrigger { return (this.getAttribute('data-ax-touch-trigger') as TouchTrigger | null) ?? 'auto'; }
  get isEnabled(): boolean { return this.getAttribute('data-ax-enabled') !== 'false'; }
  set isEnabled(value: boolean) {
    if (value) this.removeAttribute('data-ax-enabled');
    else this.setAttribute('data-ax-enabled', 'false');
  }
  /** Controlled open state: true/false when `data-ax-controlled`, else undefined. */
  get controlledOpen(): boolean | undefined {
    if (!this.hasAttribute('data-ax-controlled')) return undefined;
    return this.getAttribute('data-ax-open') === 'true';
  }
  /** Whether the tooltip is held open by `pin()`. */
  get isPinned(): boolean { return this.held && this.isOpen; }

  /** The triggers that point at this layer. */
  triggers(): HTMLElement[] {
    if (!this.id) return [];
    const attr = this.kind === 'tooltip' ? 'data-ax-tooltip' : 'data-ax-hover-card';
    return [...this.ownerDocument.querySelectorAll<HTMLElement>(`[${attr}="${CSS.escape(this.id)}"]`)];
  }

  protected resolveAnchor(): HTMLElement | null {
    return super.resolveAnchor() ?? this.triggers()[0] ?? null;
  }

  /**
   * Where the layer positions for a trigger (Astryx `positionRef`): the `data-ax-anchor`
   * element when the layer names one, else the trigger itself.
   */
  protected anchorFor(trigger: HTMLElement | null): HTMLElement | null {
    const id = this.getAttribute('data-ax-anchor');
    const named = id ? this.ownerDocument.getElementById(id) : null;
    return named ?? trigger ?? this.resolveAnchor();
  }

  protected isInsidePress(path: ReadonlyArray<EventTarget>): boolean {
    const trigger = this.trigger;
    return super.isInsidePress(path) || (trigger != null && path.includes(trigger));
  }

  protected escapeBehavior() { return 'close' as const; }

  protected outsidePressMode(): LayerOutsidePress {
    return this.held ? 'dismiss' : 'ignore';
  }

  protected restoreFocusTarget(): HTMLElement | null {
    return this.trigger;
  }

  connectedCallback(): void {
    super.connectedCallback();
    // Sibling mode by id (`for`): wire a trigger that was rendered without the attributes. A
    // layer whose trigger already carries them names its position anchor instead.
    const anchorId = this.getAttribute('data-ax-for') ?? this.getAttribute('data-ax-anchor');
    if (!anchorId || !this.id) return;
    queueMicrotask(() => {
      const el = this.ownerDocument.getElementById(anchorId);
      const attr = this.kind === 'tooltip' ? 'data-ax-tooltip' : 'data-ax-hover-card';
      if (!el || el.hasAttribute(attr) || (!this.hasAttribute('data-ax-for') && this.triggers().length > 0)) return;
      el.setAttribute(attr, this.id);
      if (this.kind === 'tooltip' || !this.hasAttribute('aria-label')) {
        const ids = new Set((el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
        ids.add(this.id);
        el.setAttribute('aria-describedby', [...ids].join(' '));
      } else el.setAttribute('aria-haspopup', 'dialog');
    });
  }

  disconnectedCallback(): void {
    this.clearTimers();
    this.#stopPressTracking?.();
    super.disconnectedCallback();
  }

  // ── timers ────────────────────────────────────────────────────────────────
  clearTimers(): void {
    if (this.#showTimer) clearTimeout(this.#showTimer);
    if (this.#hideTimer) clearTimeout(this.#hideTimer);
    this.#showTimer = this.#hideTimer = null;
  }

  cancelHide(): void {
    if (this.#hideTimer) clearTimeout(this.#hideTimer);
    this.#hideTimer = null;
  }

  protected openFor(trigger: HTMLElement | null, reason: OpenChangeReason): void {
    if (!this.isEnabled) return;
    if (this.controlledOpen === false) return;
    const from = trigger ?? this.trigger;
    if (from) this.#activeTrigger = from;
    this.show({anchor: this.anchorFor(from), source: from, reason});
  }

  showNow(trigger: HTMLElement | null, reason: OpenChangeReason = 'api'): void {
    this.clearTimers();
    this.openFor(trigger, reason);
  }

  hideNow(reason: OpenChangeReason = 'api'): void {
    this.clearTimers();
    this.hoveringContent = false;
    this.hide(reason);
  }

  scheduleShow(trigger: HTMLElement): void {
    if (!this.isEnabled || this.controlledOpen === false) return;
    this.clearTimers();
    if (this.kind === 'tooltip' && handoffActive(this)) {
      this.openFor(trigger, 'hover');
      return;
    }
    this.#showTimer = setTimeout(() => {
      this.#showTimer = null;
      if (this.isEnabled) this.openFor(trigger, 'hover');
    }, this.delay);
  }

  scheduleHide(): void {
    if (this.controlledOpen === true || this.isPinned) return;
    this.clearTimers();
    const delay = this.kind === 'tooltip' ? (this.hideDelay > 0 ? this.hideDelay : HOVER_BRIDGE_DELAY) : this.hideDelay;
    this.#hideTimer = setTimeout(() => {
      this.#hideTimer = null;
      if (this.kind === 'hover-card' && this.hoveringContent) return;
      this.hide('hover');
    }, delay);
  }

  // ── hold (useTooltip show()/hide()) ───────────────────────────────────────
  /** Open now and hold it open until `unpin()`, Escape, a press outside or focus leaving. */
  pin(trigger?: HTMLElement | null): void {
    this.clearTimers();
    if (!this.isEnabled) return;
    this.held = true;
    this.#heldFromPress = this.#triggerPressed;
    this.#holdInThisTask = true;
    setTimeout(() => { this.#holdInThisTask = false; }, 0);
    if (this.controlledOpen !== undefined) {
      this.emitOpenChange({isOpen: true, reason: 'press', isRequest: true});
      return;
    }
    if (this.isOpen) this.didHold();
    else this.openFor(trigger ?? this.trigger ?? this.resolveAnchor(), 'press');
  }

  /** End a hold and close (useTooltip hide()). */
  unpin(reason: OpenChangeReason = 'api'): void {
    this.clearTimers();
    this.releaseHold(reason);
  }

  protected releaseHold(reason: OpenChangeReason): void {
    this.held = false;
    if (this.controlledOpen !== undefined) {
      this.emitOpenChange({isOpen: false, reason, isRequest: true});
      return;
    }
    this.hideNow(reason);
  }

  /** A hold took effect on a shown layer: only a hold announces the text. */
  protected didHold(): void {
    if (this.#announced || this.kind !== 'tooltip') return;
    this.#announced = true;
    const content = this.querySelector('.ax-tooltip-content') ?? this;
    announceText(content);
  }

  protected requestDismiss(reason: DismissReason): void {
    this.clearTimers();
    this.held = false;
    if (this.controlledOpen !== undefined) {
      this.emitOpenChange({isOpen: false, reason, isRequest: true});
      return;
    }
    if (reason === 'outside') noteOutsideDismissal(this.ownerDocument);
    if (this.kind === 'hover-card' && this.contains(this.ownerDocument.activeElement)) this.escapeDismissing = true;
    this.hideNow(reason);
  }

  protected willOpen(): void {
    // A controlled tooltip takes no part in the handoff: it is shown because its owner says so.
    // A pinned tooltip stays: only a hover/focus preview is handed off.
    if (this.kind === 'tooltip' && this.controlledOpen === undefined) {
      if (activeTooltip && activeTooltip !== this && activeTooltip.isOpen && !activeTooltip.isPinned) activeTooltip.hideNow('hover');
      activeTooltip = this;
    }
  }

  protected didOpen(): void {
    if (this.held) this.didHold();
  }

  protected willClose(): void {
    if (this.kind === 'tooltip' && activeTooltip === this) {
      activeTooltip = null;
      lastTooltipClosedAt = now();
    }
  }

  protected didClose(): void {
    this.held = false;
    this.#announced = false;
    this.hoveringContent = false;
    this.#activeTrigger = null;
    this.clearTimers();
  }

  // ── delegated input (called by the document listeners below) ──────────────
  onTriggerEnter(trigger: HTMLElement): void {
    this.scheduleShow(trigger);
  }

  onTriggerLeave(related: Node | null): void {
    // Leaving straight onto the surface: the surface's own leave schedules the hide.
    if (related && this.contains(related)) return;
    this.scheduleHide();
  }

  onSurfaceEnter(): void {
    if (this.kind === 'hover-card') {
      this.hoveringContent = true;
      this.clearTimers();
    } else this.cancelHide();
  }

  onSurfaceLeave(related: Node | null): void {
    this.hoveringContent = false;
    if (related && this.trigger?.contains(related)) return;
    this.scheduleHide();
  }

  onFocusIn(target: HTMLElement, trigger: HTMLElement): void {
    this.#focusCounted = isFocusOnTrigger(target, trigger, this.focusTrigger);
    if (!this.#focusCounted || !this.isEnabled) return;
    if (isTouchInteraction(this.ownerDocument)) return;
    if (this.kind === 'tooltip') {
      if (!target.matches(':focus-visible')) return;
    } else if (this.escapeDismissing) {
      this.escapeDismissing = false;
      return;
    }
    this.clearTimers();
    this.openFor(trigger, 'focus');
  }

  onFocusOut(target: HTMLElement, trigger: HTMLElement, related: Node | null): void {
    // A held tooltip's own focus-leave close, whatever focusTrigger is.
    if (this.isPinned && related instanceof Node && !trigger.contains(related) && !this.contains(related)) {
      noteOutsideDismissal(this.ownerDocument);
      this.releaseHold('focus');
      return;
    }
    if (!this.#focusCounted && !isFocusOnTrigger(target, trigger, this.focusTrigger)) return;
    this.#focusCounted = false;
    if (this.kind === 'hover-card' && related && this.contains(related)) return;
    this.scheduleHide();
  }

  onSurfaceFocusOut(related: Node | null): void {
    if (this.kind !== 'hover-card') return;
    if (related && (this.contains(related) || this.trigger?.contains(related))) return;
    this.scheduleHide();
  }

  onTriggerPointerDown(event: PointerEvent, trigger: HTMLElement): void {
    if (event.pointerType === 'touch') return;
    if (this.kind === 'hover-card') {
      // A pen in range starts the hover show before it lands; the press cancels it.
      if (event.pointerType === 'pen' && this.#showTimer) { clearTimeout(this.#showTimer); this.#showTimer = null; }
      return;
    }
    this.#trackPress(trigger);
    if (this.held) {
      if (this.#holdInThisTask) this.#heldFromPress = true;
      return;
    }
    if (this.controlledOpen !== undefined) return;
    // Pressing the trigger hides its own tooltip: the hint has served its purpose.
    this.hideNow('press');
  }

  /** A tap on a touch screen, where there is no hover. */
  onTriggerTap(trigger: HTMLElement): void {
    const mode = this.touchTrigger;
    if (mode === 'none' || !this.isEnabled) return;
    if (mode === 'auto' && isActionTrigger(trigger)) return;
    if (this.isOpen) this.unpin('press');
    else this.pin(trigger);
  }

  #trackPress(trigger: HTMLElement) {
    this.#stopPressTracking?.();
    const view = this.ownerDocument.defaultView ?? window;
    this.#triggerPressed = true;
    const stop = (event?: Event) => {
      // A press that ends on the trigger keeps its hold, as a click does.
      if (event?.type === 'pointerup' && event.target instanceof Node && trigger.contains(event.target)) this.#heldFromPress = false;
      else if (event && this.#heldFromPress && this.held) {
        this.#heldFromPress = false;
        this.held = false;
      }
      view.removeEventListener('pointerup', stop, true);
      view.removeEventListener('pointercancel', stop, true);
      this.#triggerPressed = false;
      this.#stopPressTracking = null;
    };
    view.addEventListener('pointerup', stop, true);
    view.addEventListener('pointercancel', stop, true);
    this.#stopPressTracking = () => stop();
  }
}

function numberAttr(el: Element, name: string, fallback: number): number {
  const raw = el.getAttribute(name);
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function handoffActive(next: HoverLayerElement): boolean {
  if (activeTooltip && activeTooltip !== next && activeTooltip.isOpen && !activeTooltip.isPinned) return true;
  return now() - lastTooltipClosedAt < SKIP_DELAY_MS;
}

/** `<ax-tooltip>` */
export class TooltipElement extends HoverLayerElement {
  protected readonly kind = 'tooltip' as const;
  protected readonly defaults = {delay: 200, hideDelay: 0};
  #infoTipCleanup: Array<() => void> = [];

  connectedCallback(): void {
    super.connectedCallback();
    // InfoTip: a click, tap, Enter or Space pins the help; the next one closes it.
    queueMicrotask(() => {
      if (!this.isConnected || !this.id) return;
      const buttons = this.ownerDocument.querySelectorAll<HTMLElement>(`[data-ax-info-tip="${CSS.escape(this.id)}"]`);
      // A press on the button pins the help, so the browser must not light-dismiss it on that
      // press (a hint closes on any press outside it that is not its invoker attribute).
      if (buttons.length && !this.isOpen) this.setAttribute('popover', 'manual');
      for (const button of buttons) this.#wireInfoTip(button);
    });
  }

  disconnectedCallback(): void {
    for (const fn of this.#infoTipCleanup.splice(0)) fn();
    super.disconnectedCallback();
  }

  #infoPinned = false;

  #wireInfoTip(button: HTMLElement) {
    // A primary mouse or pen press on a preview holds it first, so the press-to-close
    // leaves it open; the click then pins it.
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.pointerType === 'touch' || this.#infoPinned || !this.isOpen) return;
      this.pin(button);
    };
    const onClick = (event: MouseEvent) => {
      // The press stops at the button: a clickable row or card around it does nothing.
      event.preventDefault();
      event.stopPropagation();
      if (this.#infoPinned) {
        this.unpin('press');
        return;
      }
      this.pin(button);
      this.#infoPinned = true;
      this.#syncInfoTips();
    };
    button.addEventListener('pointerdown', onDown, true);
    button.addEventListener('click', onClick);
    this.#infoTipCleanup.push(() => {
      button.removeEventListener('pointerdown', onDown, true);
      button.removeEventListener('click', onClick);
    });
  }

  #syncInfoTips() {
    if (!this.id) return;
    for (const button of this.ownerDocument.querySelectorAll<HTMLElement>(`[data-ax-info-tip="${CSS.escape(this.id)}"]`)) {
      button.setAttribute('aria-expanded', String(this.#infoPinned && this.isOpen));
      if (this.isOpen) button.setAttribute('aria-controls', this.id);
      else button.removeAttribute('aria-controls');
    }
  }

  protected didOpen(): void {
    super.didOpen();
    this.#syncInfoTips();
  }

  protected didClose(): void {
    super.didClose();
    // Every close ends the pin: a second press, Escape, a press outside, focus leaving.
    this.#infoPinned = false;
    this.#syncInfoTips();
  }
}

/** `<ax-hover-card>` */
export class HoverCardElement extends HoverLayerElement {
  protected readonly kind = 'hover-card' as const;
  protected readonly defaults = {delay: 300, hideDelay: 200};

  protected willOpen(): void {
    super.willOpen();
    // A labelled card is a dialog: the trigger advertises it while it is open.
    const trigger = this.trigger;
    if (trigger?.hasAttribute('aria-haspopup')) {
      const ids = new Set((trigger.getAttribute('aria-controls') ?? '').split(/\s+/).filter(Boolean));
      ids.add(this.id);
      trigger.setAttribute('aria-controls', [...ids].join(' '));
      if (trigger.hasAttribute('aria-expanded')) trigger.setAttribute('aria-expanded', 'true');
    }
  }

  protected willClose(): void {
    super.willClose();
    const trigger = this.trigger;
    if (trigger?.hasAttribute('aria-haspopup')) {
      const ids = (trigger.getAttribute('aria-controls') ?? '').split(/\s+/).filter((id) => id && id !== this.id);
      if (ids.length) trigger.setAttribute('aria-controls', ids.join(' '));
      else trigger.removeAttribute('aria-controls');
      if (trigger.hasAttribute('aria-expanded')) trigger.setAttribute('aria-expanded', 'false');
    }
  }
}

defineElement('ax-tooltip', TooltipElement);
defineElement('ax-hover-card', HoverCardElement);

// ── Delegated document listeners (one set per document) ─────────────────────
function pairsFrom(target: EventTarget | null): Array<[HTMLElement, HoverLayerElement]> {
  const out: Array<[HTMLElement, HoverLayerElement]> = [];
  let node = target instanceof Element ? target.closest<HTMLElement>(TRIGGER_SELECTOR) : null;
  while (node) {
    for (const attr of TRIGGER_ATTRS) {
      const id = node.getAttribute(attr);
      if (!id) continue;
      const layer = node.ownerDocument.getElementById(id);
      if (layer instanceof HoverLayerElement) out.push([node, layer]);
    }
    node = node.parentElement?.closest<HTMLElement>(TRIGGER_SELECTOR) ?? null;
  }
  return out;
}

function surfacesFrom(target: EventTarget | null): HoverLayerElement[] {
  const out: HoverLayerElement[] = [];
  let node = target instanceof Element ? target.closest(LAYER_SELECTOR) : null;
  while (node) {
    if (node instanceof HoverLayerElement) out.push(node);
    node = node.parentElement?.closest(LAYER_SELECTOR) ?? null;
  }
  return out;
}

const within = (el: Element, node: EventTarget | null) => node instanceof Node && el.contains(node);
const LISTENING = Symbol.for('astryx-astro/hover-layers/v1');
let tapStart: {trigger: HTMLElement; layer: HoverLayerElement} | null = null;

function listen(doc: Document) {
  const holder = doc as Document & {[LISTENING]?: true};
  if (holder[LISTENING]) return;
  Object.defineProperty(holder, LISTENING, {value: true});
  doc.addEventListener('pointerover', (event) => {
    if (event.pointerType === 'touch') return;
    const related = event.relatedTarget as Node | null;
    for (const [trigger, layer] of pairsFrom(event.target)) if (!within(trigger, related)) layer.onTriggerEnter(trigger);
    for (const layer of surfacesFrom(event.target)) if (!within(layer, related)) layer.onSurfaceEnter();
  });
  doc.addEventListener('pointerout', (event) => {
    if (event.pointerType === 'touch') return;
    const related = event.relatedTarget as Node | null;
    for (const [trigger, layer] of pairsFrom(event.target)) if (!within(trigger, related)) layer.onTriggerLeave(related);
    for (const layer of surfacesFrom(event.target)) if (!within(layer, related)) layer.onSurfaceLeave(related);
  });
  doc.addEventListener('focusin', (event) => {
    const target = event.target as HTMLElement;
    for (const [trigger, layer] of pairsFrom(target)) layer.onFocusIn(target, trigger);
    // Focus moving into a card keeps it open.
    for (const layer of surfacesFrom(target)) if (layer instanceof HoverCardElement) layer.cancelHide();
  });
  doc.addEventListener('focusout', (event) => {
    const target = event.target as HTMLElement;
    const related = event.relatedTarget as Node | null;
    for (const [trigger, layer] of pairsFrom(target)) layer.onFocusOut(target, trigger, related);
    for (const layer of surfacesFrom(target)) layer.onSurfaceFocusOut(related);
  });
  doc.addEventListener('pointerdown', (event) => {
    const pairs = pairsFrom(event.target);
    tapStart = event.pointerType === 'touch' && pairs.length ? {trigger: pairs[0][0], layer: pairs[0][1]} : null;
    for (const [trigger, layer] of pairs) layer.onTriggerPointerDown(event, trigger);
  });
  doc.addEventListener('pointerup', (event) => {
    const start = tapStart;
    tapStart = null;
    if (!start || event.pointerType !== 'touch' || !within(start.trigger, event.target)) return;
    start.layer.onTriggerTap(start.trigger);
  });
  doc.addEventListener('pointercancel', () => { tapStart = null; });
}

if (typeof document !== 'undefined') listen(document);
