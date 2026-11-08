/**
 * data-ax-kbd-platform — Kbd's platform-aware `mod` key. Astryx renders the non-Apple form
 * on the server and switches after hydration (useSyncExternalStore + isApplePlatform); this
 * swaps in the Apple strings the server pre-translated into data attributes:
 *   [data-ax-kbd-apple-label] → the group's aria-label, [data-ax-kbd-apple] → a key's glyph.
 */
import {defineBehavior} from '../elements/behavior';
import {isApplePlatform} from '../elements/runtime/platform';

defineBehavior('kbd-platform', (el) => {
  if (!isApplePlatform()) return;
  const label = el.getAttribute('data-ax-kbd-apple-label');
  if (label != null) el.setAttribute('aria-label', label);
  el.querySelectorAll<HTMLElement>('[data-ax-kbd-apple]').forEach((key) => {
    key.textContent = key.getAttribute('data-ax-kbd-apple');
  });
});
