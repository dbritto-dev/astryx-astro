/**
 * data-ax-keyboard-hint="<layer id>" — port of @astryxdesign/core hooks/useKeyboardHint.tsx:
 * an ephemeral "← → to navigate" badge that teaches sighted keyboard users that arrows move
 * inside a roving composite (Toolbar).
 *
 * The container carries the attribute; the hint is a `popover="manual"` `<ax-layer>`
 * (elements/runtime/layer.ts) rendered inside it, anchored with CSS anchor positioning below
 * the focused item. It shows on the first keyboard focus (`:focus-visible`) that enters the
 * container from outside, follows focus moving within, and is dismissed for good on the first
 * arrow key, after `data-ax-keyboard-hint-ms` (default 3000 ms), or when focus leaves the
 * container; it never shows again for that container. Focus inside one of the container's own
 * layers (`[popover]`) neither shows nor spends it. The hint is `aria-hidden` (the roving
 * pattern itself is announced by the toolbar role).
 */
import {defineBehavior} from '../elements/behavior';
import type {LayerElement} from '../elements/runtime/layer';
import '../elements/runtime/layer';

const ARROW_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

defineBehavior('keyboard-hint', (container) => {
  const layer = () => {
    const id = container.getAttribute('data-ax-keyboard-hint');
    return (id ? container.ownerDocument.getElementById(id) : null) as LayerElement | null;
  };
  const dismissAfter = Number(container.getAttribute('data-ax-keyboard-hint-ms') ?? 3000);
  let dismissed = false;
  let visible = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timer != null) clearTimeout(timer);
    timer = null;
  };
  const dismiss = () => {
    dismissed = true;
    clearTimer();
    visible = false;
    layer()?.hide('api');
  };
  /** Focus inside the composite proper, not inside one of its layers. */
  const inRow = (node: EventTarget | null): node is HTMLElement => {
    if (!(node instanceof HTMLElement) || !container.contains(node)) return false;
    const layerRoot = node.closest('[popover]');
    return layerRoot == null || !container.contains(layerRoot);
  };

  const onFocusIn = (event: FocusEvent) => {
    if (dismissed) return;
    const target = event.target as HTMLElement;
    if (!inRow(target) || !target.matches(':focus-visible')) return;
    // Only when focus enters from outside the container.
    if (event.relatedTarget instanceof Node && container.contains(event.relatedTarget)) return;
    const hint = layer();
    if (!hint) return;
    hint.show({anchor: target, reason: 'focus'});
    visible = hint.isOpen;
    clearTimer();
    timer = setTimeout(dismiss, dismissAfter);
  };
  const onFocusOut = (event: FocusEvent) => {
    if (!visible) return;
    const next = event.relatedTarget;
    if (next instanceof HTMLElement && container.contains(next)) {
      // Focus moved within: re-anchor to the new item.
      if (!dismissed && inRow(next)) layer()?.show({anchor: next, reason: 'focus'});
      return;
    }
    dismiss();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (visible && ARROW_KEYS.has(event.key)) dismiss();
  };

  container.addEventListener('focusin', onFocusIn);
  container.addEventListener('focusout', onFocusOut);
  // Capture: the roving handler below may move focus (and re-anchor) in the same keydown.
  container.addEventListener('keydown', onKeyDown, {capture: true});
  return () => {
    clearTimer();
    container.removeEventListener('focusin', onFocusIn);
    container.removeEventListener('focusout', onFocusOut);
    container.removeEventListener('keydown', onKeyDown, {capture: true});
  };
});
