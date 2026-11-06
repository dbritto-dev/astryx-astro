/**
 * data-ax-kbd-platform — Kbd's platform-aware `mod` key. Astryx renders the non-Apple form
 * on the server and switches after hydration (useSyncExternalStore + isApplePlatform); this
 * swaps in the Apple strings the server pre-translated into data attributes:
 *   [data-ax-kbd-apple-label] → the group's aria-label, [data-ax-kbd-apple] → a key's glyph.
 */
import {defineBehavior} from '../elements/behavior';

/** Port of @astryxdesign/core utils/isApplePlatform.ts. */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uaData = 'userAgentData' in navigator ? (navigator as {userAgentData?: unknown}).userAgentData : null;
  if (uaData && typeof uaData === 'object' && 'platform' in uaData) {
    const uaPlatform = (uaData as {platform?: unknown}).platform;
    const named = typeof uaPlatform === 'string' ? uaPlatform.trim() : '';
    // '' and 'Unknown' name nothing: fall through rather than reading as "not Apple".
    if (named !== '' && named.toLowerCase() !== 'unknown') return /mac/i.test(named);
  }
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? '');
}

defineBehavior('kbd-platform', (el) => {
  if (!isApplePlatform()) return;
  const label = el.getAttribute('data-ax-kbd-apple-label');
  if (label != null) el.setAttribute('aria-label', label);
  el.querySelectorAll<HTMLElement>('[data-ax-kbd-apple]').forEach((key) => {
    key.textContent = key.getAttribute('data-ax-kbd-apple');
  });
});
