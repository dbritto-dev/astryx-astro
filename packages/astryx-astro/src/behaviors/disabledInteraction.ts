/**
 * data-ax-disabled-interaction — port of @astryxdesign/core utils/disabledInteraction.ts
 * (disabledInteractionProps) and Button's aria-disabled click/keydown guards
 * (spec:AST-085 FR1–FR2, family:buttons FR3).
 *
 * A control that is disabled but must stay focusable renders `aria-disabled="true"`
 * instead of native `disabled` and carries this attribute. While `aria-disabled` is
 * "true" (read at event time, so a runtime busy state is covered too):
 *   - a click is cancelled (preventDefault) and goes no further: no listener on the
 *     control or its ancestors runs, as with a natively disabled control;
 *   - Enter and Space keydown are cancelled, so they never synthesize a click. Other keys
 *     (Escape, arrows, Tab) pass through untouched.
 * The listeners are capture-phase on the control itself, so they run before any listener
 * registered on it or below it, whatever the registration order.
 *
 * Shared candidate: the architecture map puts this in src/elements/runtime/
 * (disabled-interaction) as one document capture listener; this module can delegate to
 * it once that runtime exists.
 */
import {defineBehavior} from '../elements/behavior';

const isOff = (el: Element) => el.getAttribute('aria-disabled') === 'true';

defineBehavior('disabled-interaction', (el) => {
  const onClick = (event: MouseEvent) => {
    if (!isOff(el)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (!isOff(el)) return;
    if (event.key === 'Enter' || event.key === ' ') event.preventDefault();
  };
  el.addEventListener('click', onClick, {capture: true});
  el.addEventListener('keydown', onKeyDown, {capture: true});
  return () => {
    el.removeEventListener('click', onClick, {capture: true});
    el.removeEventListener('keydown', onKeyDown, {capture: true});
  };
});
