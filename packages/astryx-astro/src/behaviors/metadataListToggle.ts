/**
 * data-ax-metadata-list-toggle — the "Show more" / "Show less" button of a collapsed
 * MetadataList (Astryx MetadataList.tsx `isShowAll` state). The server renders every item
 * and hides the ones past `maxNumOfItems` (`data-ax-metadata-overflow`); the button
 * (aria-controls → the <dl>, aria-expanded) reveals or re-hides them and swaps its label
 * between the pre-translated `data-ax-show-more` / `data-ax-show-less` strings.
 */
import {defineBehavior} from '../elements/behavior';

defineBehavior('metadata-list-toggle', (button) => {
  const onClick = () => {
    const list = document.getElementById(button.getAttribute('aria-controls') ?? '');
    if (!list) return;
    const expand = button.getAttribute('aria-expanded') !== 'true';
    list.querySelectorAll<HTMLElement>('[data-ax-metadata-overflow]').forEach((el) => { el.hidden = !expand; });
    button.setAttribute('aria-expanded', String(expand));
    button.textContent = button.getAttribute(expand ? 'data-ax-show-less' : 'data-ax-show-more') ?? button.textContent;
  };
  button.addEventListener('click', onClick);
  return () => button.removeEventListener('click', onClick);
});
