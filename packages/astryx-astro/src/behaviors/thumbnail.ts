/**
 * data-ax-thumbnail — Thumbnail's callbacks as DOM events (@astryxdesign/core
 * Thumbnail/Thumbnail.tsx `onClick` / `onRemove`), dispatched on the thumbnail root
 * (bubbles, composed) with `detail: {event}`, the native click Astryx hands its callback:
 *
 *  - Open (`.ax-thumbnail-open`, `isClickable`): `astryx-click` while the action can act (not
 *    disabled, not loading). An inert Open's click is cancelled and stopped before it gets
 *    here (elements/runtime/disabledInteraction.ts), as Astryx's stopInertPress does.
 *  - Remove (`[data-ax-thumbnail-remove]`, `isRemovable`): the click goes no further than the
 *    button (Astryx `e.stopPropagation()`: it never reaches Open or an ancestor's handler), then
 *    `astryx-remove`. A disabled Remove is aria-disabled and inert the same way.
 * Removing the thumbnail is the caller's job, as in Astryx.
 */
import {defineBehavior} from '../elements/behavior';
import '../elements/runtime/disabledInteraction';

export interface ThumbnailEventDetail {
  event: MouseEvent;
}

const isInert = (el: Element) => el.getAttribute('aria-disabled') === 'true';

defineBehavior('thumbnail', (root) => {
  const media = root.querySelector<HTMLElement>(':scope > .ax-thumbnail-media');
  const open = media?.querySelector<HTMLElement>(':scope > .ax-thumbnail-open') ?? null;
  const remove = media?.querySelector<HTMLElement>('[data-ax-thumbnail-remove]') ?? null;
  const dispatch = (name: 'astryx-click' | 'astryx-remove', event: MouseEvent) => {
    root.dispatchEvent(new CustomEvent<ThumbnailEventDetail>(name, {bubbles: true, composed: true, detail: {event}}));
  };
  const onOpenClick = (event: MouseEvent) => {
    if (isInert(open!)) return;
    dispatch('astryx-click', event);
  };
  const onRemoveClick = (event: MouseEvent) => {
    event.stopPropagation();
    if (isInert(remove!)) return;
    dispatch('astryx-remove', event);
  };
  open?.addEventListener('click', onOpenClick);
  remove?.addEventListener('click', onRemoveClick);
  return () => {
    open?.removeEventListener('click', onOpenClick);
    remove?.removeEventListener('click', onRemoveClick);
  };
});
