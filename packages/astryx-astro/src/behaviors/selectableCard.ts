/**
 * `data-ax-selectable-card` — SelectableCard's whole-surface toggle. Port of the click /
 * keyboard parts of @astryxdesign/core SelectableCard/SelectableCard.tsx and
 * hooks/useClickableContainer.ts (INTERACTIVE_SELECTORS, hasTextSelection).
 *
 * - A click on the card surface clicks the hidden input (which toggles natively and fires
 *   `input` / `change`), unless it lands in a nested interactive element or ends a text
 *   selection; the surface click itself stops there, as Astryx's does.
 * - Enter toggles (a native checkbox only knows Space).
 * - `change` → `data-selected="true|false"` on every card of the input's radio set, and
 *   `astryx-change` `{isSelected}` on this card.
 * Disabled cards (aria-disabled input) are guarded by runtime/disabledInteraction.ts.
 */
import {defineBehavior} from '../elements/behavior';
import {isImeKeyEvent} from '../elements/runtime/dom';

const INTERACTIVE = [
  'button', 'a', 'input', 'select', 'textarea', '[role="button"]', '[role="link"]', '[role="checkbox"]',
  '[role="radio"]', '[role="switch"]', '[role="tab"]', '[role="menuitem"]', '[role="option"]',
  '[role="combobox"]', '[role="listbox"]', '[role="slider"]', '[role="spinbutton"]', '[data-pressable-container]',
].join(',');

function belongsToSomethingElse(el: Element): boolean {
  return (el.matches(INTERACTIVE) && !el.matches('[aria-readonly="true"]')) || el.hasAttribute('data-astryx-layer-root');
}

function hasInteractiveAncestor(el: Element, root: Element): boolean {
  for (let node: Element | null = el; node && node !== root && node !== document.body; node = node.parentElement) {
    if (belongsToSomethingElse(node)) return true;
  }
  return false;
}

function hasTextSelection(node: Element): boolean {
  const selection = document.getSelection();
  return selection != null && !selection.isCollapsed && node.contains(selection.anchorNode);
}

const inputOf = (card: Element) => card.querySelector<HTMLInputElement>(':scope > .ax-selectable-card-input');

function syncCard(card: Element): void {
  const input = inputOf(card);
  if (input) card.setAttribute('data-selected', String(input.checked));
}

defineBehavior('selectable-card', (card) => {
  const input = inputOf(card);
  if (!input) return;
  const isDisabled = () => input.getAttribute('aria-disabled') === 'true';

  const onClick = (e: MouseEvent) => {
    if (isDisabled() || hasTextSelection(card)) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target !== card && hasInteractiveAncestor(target, card)) return;
    e.stopPropagation();
    input.click();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target !== input || e.key !== 'Enter' || e.defaultPrevented || isImeKeyEvent(e)) return;
    e.preventDefault();
    if (!isDisabled()) input.click();
  };
  const onChange = (e: Event) => {
    if (e.target !== input) return;
    if (input.type === 'radio' && input.name) {
      const root = input.form ?? input.getRootNode();
      const peers = (root as ParentNode).querySelectorAll<HTMLInputElement>(`.ax-selectable-card-input[type="radio"][name="${CSS.escape(input.name)}"]`);
      for (const peer of peers) if (peer.parentElement) syncCard(peer.parentElement);
    } else syncCard(card);
    card.dispatchEvent(new CustomEvent('astryx-change', {detail: {isSelected: input.checked}, bubbles: true, composed: true}));
  };
  card.addEventListener('click', onClick);
  card.addEventListener('keydown', onKeyDown);
  card.addEventListener('change', onChange);
  syncCard(card);
  return () => {
    card.removeEventListener('click', onClick);
    card.removeEventListener('keydown', onKeyDown);
    card.removeEventListener('change', onChange);
  };
});
