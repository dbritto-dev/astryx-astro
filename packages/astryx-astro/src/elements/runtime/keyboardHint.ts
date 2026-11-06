/**
 * Keyboard hint — port of @astryxdesign/core hooks/useKeyboardHint.tsx: an ephemeral
 * "← → to navigate" badge that teaches sighted keyboard users that arrows move inside a roving
 * composite (Toolbar, SegmentedControl, TabList).
 *
 * The hint is a `popover="manual"` `<ax-layer>` (layer.ts) the component renders inside the
 * composite, anchored below the focused item. It shows on the first keyboard focus
 * (`:focus-visible`) that enters the composite from outside, follows focus moving within, and
 * is spent — hidden, never shown again for that composite — by the first arrow key, after
 * `dismissAfterMs`, or when focus leaves the composite. Focus inside one of the composite's own
 * layers (`[popover]`) neither shows nor spends it. The hint is aria-hidden: the composite's
 * role already tells assistive technology how it works.
 *
 * Arrow keys are seen in the delegated roving pass (roving.ts `onRovingKeyDown`) when the
 * composite is a `[data-astryx-roving]` container: after nested lists had their turn, only
 * while nothing prevented the key, and before the composite moves focus. Astryx calls
 * `hint.onKeyDown` in the composite's onKeyDown that way, so an arrow a nested ButtonGroup
 * consumed does not spend a Toolbar's hint. Other containers get a plain keydown listener.
 *
 * Two ways in:
 *  - Attribute: `data-ax-keyboard-hint="<layer id>"` on the composite (optional
 *    `data-ax-keyboard-hint-ms`, default 3000). Importing this module wires every such element,
 *    including ones added later. An empty value is not a composite (SegmentedControl marks its
 *    hint layer that way and drives it itself).
 *  - Imperative: `createKeyboardHint(container, {layer, dismissAfterMs?, isEnabled?})` returns a
 *    controller; `attach()` adds its listeners and returns `detach`, or call its handlers from
 *    your own listeners. The controller's state (spent or not) outlives detach/attach, so an
 *    element that is moved keeps it.
 */
import {defineBehavior} from '../behavior';
import {onRovingKeyDown} from './roving';
import './layer';

/** The hint layer: an `<ax-layer>` (any `LayerElement`). */
export interface KeyboardHintLayer extends HTMLElement {
  show(options?: {anchor?: HTMLElement | null; reason?: 'focus' | 'api'}): boolean;
  hide(reason?: 'api'): void;
  readonly isOpen: boolean;
}

export interface KeyboardHintOptions {
  /** The hint layer, or a function that finds it (called on every use). */
  layer: HTMLElement | null | (() => HTMLElement | null);
  /** Milliseconds the hint stays before it dismisses itself. @default 3000 */
  dismissAfterMs?: number;
  /** Read on every focus entry; false neither shows nor spends the hint. @default always enabled */
  isEnabled?: () => boolean;
}

export interface KeyboardHint {
  /** The hint is showing. */
  readonly isVisible: boolean;
  /** The hint was spent (arrow key, timeout, focus left, `dismiss()`); it never shows again. */
  readonly isDismissed: boolean;
  /** For the container's `focusin`: show on the first keyboard entry from outside. */
  handleFocusIn(event: FocusEvent): void;
  /** For the container's `focusout`: follow focus within; dismiss when it leaves. */
  handleFocusOut(event: FocusEvent): void;
  /** For the container's `keydown`, before arrows move focus: an arrow dismisses. */
  handleKeyDown(event: KeyboardEvent): void;
  /** Hide and spend the hint. */
  dismiss(): void;
  /** Add the container listeners. Returns `detach`, which removes them and hides the hint. */
  attach(): () => void;
}

const ARROW_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
const DEFAULT_DISMISS_MS = 3000;

/** A keyboard hint for the composite `container` (see the module comment). */
export function createKeyboardHint(container: HTMLElement, options: KeyboardHintOptions): KeyboardHint {
  const {dismissAfterMs = DEFAULT_DISMISS_MS, isEnabled = () => true} = options;
  let dismissed = false;
  let visible = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const layer = (): KeyboardHintLayer | null => {
    const el = typeof options.layer === 'function' ? options.layer() : options.layer;
    // Not upgraded yet (its element definition has not run): nothing to show.
    return el && typeof (el as KeyboardHintLayer).show === 'function' ? (el as KeyboardHintLayer) : null;
  };
  /** Shown by us and still open (another script may have hidden the layer). */
  const showing = () => visible && layer()?.isOpen === true;
  const clearTimer = () => {
    if (timer != null) clearTimeout(timer);
    timer = null;
  };
  const dismiss = () => {
    dismissed = true;
    clearTimer();
    visible = false;
    const hint = layer();
    if (hint?.isOpen) hint.hide('api');
  };
  /** Inside the composite proper, not inside one of its layers. */
  const inRow = (node: EventTarget | null): node is HTMLElement => {
    if (!(node instanceof HTMLElement) || !container.contains(node)) return false;
    const layerRoot = node.closest('[popover]');
    return layerRoot == null || !container.contains(layerRoot);
  };

  const handleFocusIn = (event: FocusEvent) => {
    if (dismissed || !isEnabled()) return;
    const target = event.target;
    if (!inRow(target) || !target.matches(':focus-visible')) return;
    // Only when focus enters from outside the composite.
    if (event.relatedTarget instanceof Node && container.contains(event.relatedTarget)) return;
    const hint = layer();
    if (!hint) return;
    hint.show({anchor: target, reason: 'focus'});
    visible = hint.isOpen;
    clearTimer();
    timer = setTimeout(dismiss, dismissAfterMs);
  };

  const handleFocusOut = (event: FocusEvent) => {
    if (!showing()) return;
    const next = event.relatedTarget;
    if (next instanceof Node && container.contains(next)) {
      // Focus moved within: re-anchor to the new item.
      if (!dismissed && inRow(next)) layer()?.show({anchor: next, reason: 'focus'});
      return;
    }
    dismiss();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (showing() && ARROW_KEYS.has(event.key)) dismiss();
  };

  /** The layer hid without us (useKeyboardHint's onHide): stop tracking it, keep the hint. */
  const onOpenChange = (event: Event) => {
    if (event.target !== layer() || (event as CustomEvent<{isOpen?: boolean}>).detail?.isOpen) return;
    visible = false;
    clearTimer();
  };

  const attach = () => {
    container.addEventListener('focusin', handleFocusIn);
    container.addEventListener('focusout', handleFocusOut);
    container.addEventListener('astryx-open-change', onOpenChange);
    let offKey: () => void;
    if (container.hasAttribute('data-astryx-roving')) offKey = onRovingKeyDown(container, handleKeyDown);
    else {
      container.addEventListener('keydown', handleKeyDown);
      offKey = () => container.removeEventListener('keydown', handleKeyDown);
    }
    return () => {
      container.removeEventListener('focusin', handleFocusIn);
      container.removeEventListener('focusout', handleFocusOut);
      container.removeEventListener('astryx-open-change', onOpenChange);
      offKey();
      clearTimer();
      if (visible) layer()?.hide('api');
      visible = false;
    };
  };

  return {
    get isVisible() { return showing(); },
    get isDismissed() { return dismissed; },
    handleFocusIn,
    handleFocusOut,
    handleKeyDown,
    dismiss,
    attach,
  };
}

defineBehavior('keyboard-hint', (container) => {
  const id = container.getAttribute('data-ax-keyboard-hint');
  if (!id) return;
  const ms = Number(container.getAttribute('data-ax-keyboard-hint-ms'));
  return createKeyboardHint(container, {
    layer: () => container.ownerDocument.getElementById(container.getAttribute('data-ax-keyboard-hint') || id),
    dismissAfterMs: Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_DISMISS_MS,
  }).attach();
});
