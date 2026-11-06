/**
 * data-ax-click-event — Astryx's `onClick(e)` callback prop for server-rendered controls
 * (Avatar `isClickable` / `href`, AvatarGroupOverflow `isClickable`): a click on the element
 * dispatches `astryx-click` on it (bubbles, composed) with `detail: {event}`, the native
 * MouseEvent Astryx hands its `onClick`. The native click itself still bubbles as usual.
 *
 * A click an aria-disabled control swallows never reaches this listener
 * (elements/runtime/disabledInteraction.ts), as a disabled control runs no callback.
 */
import {defineBehavior} from '../elements/behavior';

export interface ClickEventDetail {
  event: MouseEvent;
}

defineBehavior('click-event', (el) => {
  const onClick = (event: MouseEvent) => {
    el.dispatchEvent(new CustomEvent<ClickEventDetail>('astryx-click', {bubbles: true, composed: true, detail: {event}}));
  };
  el.addEventListener('click', onClick);
  return () => el.removeEventListener('click', onClick);
});
