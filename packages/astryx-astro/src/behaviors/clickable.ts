/**
 * data-ax-clickable — whole-surface activation that leaves nested controls alone. Port of
 * @astryxdesign/core hooks/useClickableContainer.ts (useClickableContainer,
 * useClickableContainerProxy, hasInteractiveAncestor, hasTextSelection) and utils/safeUrl.ts,
 * shared by Item and ClickableCard (TreeList runs the same rules inside <ax-tree-list>).
 *
 * The container carries `data-ax-clickable="<mode>"` and its own action is the descendant
 * `[data-ax-clickable-action]` (or, for `delegate`, the element matched by
 * `data-ax-clickable-target="<selector>"`). A click on the surface — the container itself or
 * anything that is not inside a nested interactive element (INTERACTIVE_SELECTORS, a layer
 * surface) and does not end a text selection — activates the action, and the surface click
 * itself goes no further (stopped in the capture phase), so listeners on the container, its
 * ancestors and the action see exactly one click per press:
 *
 *   button    the action is a <button>: `action.click()` (ClickableCard onClick, Item onClick).
 *   link      the action is an <a href>: Ctrl/Cmd-click or target="_blank" opens the
 *             destination in a new tab (`noopener`), otherwise `action.click()` so a router's
 *             link component sees the navigation (ClickableCard href).
 *   proxy     the action is an <a>: a click with the same modifier keys and button is
 *             dispatched on it, so the browser keeps same-tab / new-tab / new-window
 *             (Item link rows, useClickableContainerProxy).
 *   delegate  the action is a nested control (Item `interactiveRef`): the click, modifiers
 *             included, is dispatched on it. The container is marked `data-pressable-container`
 *             so an enclosing clickable surface treats it as a control of its own.
 * A middle click on the surface of a `link` / `proxy` container opens the action's
 * destination in a new tab. Destinations were checked on the server (safeHref); an action
 * without an href never navigates. A disabled container (`aria-disabled="true"` or
 * `data-ax-clickable-disabled`) does nothing.
 *
 * Not ported: the touch press controller (`cancelNestedTouchPress`); coarse pointers keep
 * the native :active paint.
 */
import {defineBehavior} from '../elements/behavior';

export const PRESSABLE_CONTAINER_ATTRIBUTE = 'data-pressable-container';

export const INTERACTIVE_SELECTORS = [
  'button', 'a', 'input', 'select', 'textarea', '[role="button"]', '[role="link"]', '[role="checkbox"]',
  '[role="radio"]', '[role="switch"]', '[role="tab"]', '[role="menuitem"]', '[role="option"]',
  '[role="combobox"]', '[role="listbox"]', '[role="slider"]', '[role="spinbutton"]', `[${PRESSABLE_CONTAINER_ATTRIBUTE}]`,
].join(',');

/** Astryx hasInteractiveAncestor: an interactive element or a layer surface between target and root. */
export function hasInteractiveAncestor(target: Element, root: Element): boolean {
  for (let el: Element | null = target; el && el !== root && el !== el.ownerDocument.body; el = el.parentElement) {
    if (el.matches(INTERACTIVE_SELECTORS) && !el.matches('[aria-readonly="true"]')) return true;
    if (el.hasAttribute('data-astryx-layer-root') || el.hasAttribute('popover')) return true;
  }
  return false;
}

/** A click that ends a text drag inside the node is not a click on the container. */
export function hasTextSelection(node: Element): boolean {
  const selection = node.ownerDocument.getSelection();
  return selection != null && !selection.isCollapsed && node.contains(selection.anchorNode);
}

/** Re-dispatch a click on `target` with the original modifier keys and button. */
export function proxyClick(target: Element, event: MouseEvent): void {
  target.dispatchEvent(new MouseEvent('click', {
    bubbles: event.bubbles,
    cancelable: event.cancelable,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    button: event.button,
  }));
}

function hrefOf(action: Element | null): string | null {
  return action instanceof HTMLAnchorElement && action.hasAttribute('href') ? action.href : null;
}

defineBehavior('clickable', (container) => {
  const mode = container.getAttribute('data-ax-clickable') ?? 'button';
  const isDisabled = () => container.getAttribute('aria-disabled') === 'true' || container.hasAttribute('data-ax-clickable-disabled');
  const action = (): HTMLElement | null => {
    const selector = container.getAttribute('data-ax-clickable-target');
    if (selector) {
      try { return container.querySelector<HTMLElement>(selector); } catch { return null; }
    }
    return container.querySelector<HTMLElement>('[data-ax-clickable-action]');
  };
  const isSurface = (target: EventTarget | null): target is Element =>
    target instanceof Element && (target === container || !hasInteractiveAncestor(target, container));

  if (mode === 'delegate') container.setAttribute(PRESSABLE_CONTAINER_ATTRIBUTE, 'true');

  const onClick = (event: MouseEvent) => {
    if (isDisabled() || !isSurface(event.target)) return;
    if (hasTextSelection(container)) return;
    const el = action();
    if (!el) return;
    event.stopPropagation();
    if (mode === 'link') {
      const href = hrefOf(el);
      if (href == null) return;
      const opensNewTab = el.getAttribute('target') === '_blank' || event.ctrlKey || event.metaKey;
      if (opensNewTab) window.open(href, '_blank', 'noopener');
      else el.click();
      return;
    }
    if (mode === 'proxy' || mode === 'delegate') {
      proxyClick(el, event);
      return;
    }
    el.click();
  };

  const onMouseUp = (event: MouseEvent) => {
    if (event.button !== 1 || isDisabled() || !isSurface(event.target)) return;
    const href = hrefOf(action());
    if (href != null) window.open(href, '_blank', 'noopener');
  };

  // Capture phase: the surface click is stopped before any listener on or below the
  // container runs, so every listener sees exactly the one (retargeted) activation.
  container.addEventListener('click', onClick, {capture: true});
  const tracksMiddle = mode === 'link' || mode === 'proxy';
  if (tracksMiddle) container.addEventListener('mouseup', onMouseUp);
  return () => {
    container.removeEventListener('click', onClick, {capture: true});
    if (tracksMiddle) container.removeEventListener('mouseup', onMouseUp);
    if (mode === 'delegate') container.removeAttribute(PRESSABLE_CONTAINER_ATTRIBUTE);
  };
});
