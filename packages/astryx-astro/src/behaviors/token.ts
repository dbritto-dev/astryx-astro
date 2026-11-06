/**
 * data-ax-token — Token's interactive pieces (@astryxdesign/core Token/Token.tsx,
 * Token/TokenLink.tsx, hooks/useClickableContainer.ts).
 *
 *  - Remove button (`[data-ax-token-remove]`): its click goes no further than the button
 *    (Astryx stopPropagation: it never reaches the token's own action), and the token root
 *    dispatches `astryx-remove` (bubbles, composed) with `detail: {event}` — Astryx
 *    onRemove(e). Removing the token is the caller's job, as in Astryx.
 *  - Clickable token (`data-ax-token="button"`): a click on the surface outside any
 *    button/link is retargeted to the inner action button (`.ax-token-action`), so every
 *    activation is exactly one click on that button (listen there or on the token).
 *  - Link + remove (`data-ax-token="link"`, useClickableContainer): a click on the surface
 *    outside nested controls is retargeted to the inner link; Ctrl/Cmd-click or a middle
 *    click on the surface opens the destination in a new tab (noopener); a click that ends
 *    a text selection does nothing.
 * Disabled tokens (`data-disabled`) do none of this; their controls are aria-disabled and
 * inert (elements/runtime/disabledInteraction.ts). Not ported: the touch press controller.
 */
import {defineBehavior} from '../elements/behavior';
import '../elements/runtime/disabledInteraction';

const INTERACTIVE = [
  'button', 'a', 'input', 'select', 'textarea', '[role="button"]', '[role="link"]', '[role="checkbox"]',
  '[role="radio"]', '[role="switch"]', '[role="tab"]', '[role="menuitem"]', '[role="option"]',
  '[role="combobox"]', '[role="listbox"]', '[role="slider"]', '[role="spinbutton"]', '[data-pressable-container]',
].join(',');

/** Astryx hasInteractiveAncestor: an interactive element (or layer surface) between target and container. */
function hasInteractiveAncestor(target: Element, container: Element): boolean {
  for (let el: Element | null = target; el && el !== container && el !== document.body; el = el.parentElement) {
    if (el.matches(INTERACTIVE) && !el.matches('[aria-readonly="true"]')) return true;
    if (el.hasAttribute('data-astryx-layer-root') || el.hasAttribute('popover')) return true;
  }
  return false;
}

function hasTextSelection(node: Element): boolean {
  const selection = document.getSelection();
  return selection != null && !selection.isCollapsed && node.contains(selection.anchorNode);
}

export interface TokenRemoveDetail {
  event: MouseEvent;
}

defineBehavior('token', (token) => {
  const mode = token.getAttribute('data-ax-token');
  const isDisabled = () => token.hasAttribute('data-disabled');
  const remove = token.querySelector<HTMLElement>(':scope > [data-ax-token-remove]');
  const action = token.querySelector<HTMLElement>(':scope > .ax-token-action');
  const cleanups: Array<() => void> = [];

  if (remove) {
    const onRemoveClick = (event: MouseEvent) => {
      event.stopPropagation();
      token.dispatchEvent(new CustomEvent<TokenRemoveDetail>('astryx-remove', {bubbles: true, composed: true, detail: {event}}));
    };
    remove.addEventListener('click', onRemoveClick);
    cleanups.push(() => remove.removeEventListener('click', onRemoveClick));
  }

  const isSurface = (target: Element) => target === token || !hasInteractiveAncestor(target, token);

  if (action && (mode === 'button' || mode === 'link')) {
    const onSurfaceClick = (event: MouseEvent) => {
      if (isDisabled() || !(event.target instanceof Element) || !isSurface(event.target)) return;
      if (mode === 'link' && hasTextSelection(token)) return;
      // Retarget: the surface click itself goes no further.
      event.stopPropagation();
      if (mode === 'link' && (event.ctrlKey || event.metaKey) && action instanceof HTMLAnchorElement) {
        window.open(action.href, '_blank', 'noopener');
        return;
      }
      action.click();
    };
    token.addEventListener('click', onSurfaceClick, {capture: true});
    cleanups.push(() => token.removeEventListener('click', onSurfaceClick, {capture: true}));
  }

  if (action instanceof HTMLAnchorElement && mode === 'link') {
    const onMouseUp = (event: MouseEvent) => {
      if (isDisabled() || event.button !== 1 || !(event.target instanceof Element) || !isSurface(event.target)) return;
      window.open(action.href, '_blank', 'noopener');
    };
    token.addEventListener('mouseup', onMouseUp);
    token.setAttribute('data-pressable-container', 'true');
    cleanups.push(() => token.removeEventListener('mouseup', onMouseUp));
  }

  return () => cleanups.forEach((fn) => fn());
});
