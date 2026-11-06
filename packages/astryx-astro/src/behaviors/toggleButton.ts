/**
 * data-ax-toggle-button — ToggleButton's pressed state (@astryxdesign/core
 * ToggleButton/ToggleButton.tsx handleClick, family:buttons FR5–FR6, FR11).
 *
 * The server renders the initial state (`aria-pressed` + the `data-is-pressed` theme
 * state); afterwards the element owns it. A click on an enabled standalone toggle:
 *   1. is decided after every other click listener has run (Astryx calls the caller's
 *      onClick first) and is skipped when one of them called preventDefault();
 *   2. dispatches `astryx-pressed-change` (bubbles, composed, cancelable) with
 *      `detail: {isPressed, event}` — Astryx onPressedChange(isPressed, event);
 *   3. unless that event is cancelled, reflects the new state. The toggle is reversible.
 * A ToggleButtonGroup member with a value is left to its group (behaviors/
 * toggleButtonGroup.ts): member callbacks are ignored, as in Astryx.
 * Disabled toggles never get here: native `disabled` dispatches no click and an
 * aria-disabled one is stopped by behaviors/disabledInteraction.ts.
 *
 * Imperative API on the element: `isPressed` (get / set; setting does not dispatch).
 */
import {defineBehavior} from '../elements/behavior';
import './disabledInteraction';

export interface PressedChangeDetail {
  isPressed: boolean;
  event: MouseEvent;
}

export const isPressedButton = (el: Element) => el.getAttribute('aria-pressed') === 'true';

/** Reflect a pressed state: ARIA, the theme state, and the CSS-driven icon/weight swap. */
export function setPressed(el: Element, pressed: boolean) {
  el.setAttribute('aria-pressed', String(pressed));
  el.setAttribute('data-is-pressed', String(pressed));
}

/** The group a member belongs to: the nearest ToggleButtonGroup inside the same layer. */
export function ownerGroup(el: Element): HTMLElement | null {
  const scope = el.parentElement?.closest<HTMLElement>('.astryx-toggle-button-group, [data-astryx-layer-root]');
  return scope?.classList.contains('astryx-toggle-button-group') ? scope : null;
}

defineBehavior('toggle-button', (el) => {
  const toggle = (event: MouseEvent) => {
    if (event.defaultPrevented) return;
    const next = !isPressedButton(el);
    const change = new CustomEvent<PressedChangeDetail>('astryx-pressed-change', {
      bubbles: true,
      composed: true,
      cancelable: true,
      detail: {isPressed: next, event},
    });
    if (el.dispatchEvent(change)) setPressed(el, next);
  };
  const onClick = (event: MouseEvent) => {
    if (el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true') return;
    if (el.hasAttribute('data-ax-value') && ownerGroup(el)) return;
    // Astryx runs the caller's onClick first. Every other click listener (on the button,
    // in any registration order, and on its ancestors) runs before the toggle: it is
    // decided at the end of this dispatch (window, bubble phase), or on the next task if
    // propagation was stopped on the way.
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('click', finish);
      clearTimeout(timer);
      toggle(event);
    };
    window.addEventListener('click', finish);
    const timer = setTimeout(finish, 0);
  };
  el.addEventListener('click', onClick);
  Object.defineProperty(el, 'isPressed', {
    configurable: true,
    get: () => isPressedButton(el),
    set: (value: boolean) => setPressed(el, Boolean(value)),
  });
  return () => {
    el.removeEventListener('click', onClick);
    delete (el as unknown as Record<string, unknown>).isPressed;
  };
});
