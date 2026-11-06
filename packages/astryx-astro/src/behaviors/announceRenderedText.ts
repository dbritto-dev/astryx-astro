/**
 * data-ax-announce-rendered-text — port of @astryxdesign/core hooks/AnnounceRenderedText.tsx
 * + useAnnounceRenderedText.ts with `skipFirstRender` (EmptyState's message, a standalone
 * Spinner), on the runtime announcer (elements/runtime/announce.ts createRenderedTextAnnouncer).
 *
 * Text present while the document loads is silent (it is part of the page). Text that
 * appears after load (the element is inserted later) or changes later is announced once,
 * each child read as a block. Skipped inside a live container (which speaks its own
 * content) and while hidden from assistive tech.
 *
 * Optional attributes: `data-ax-announce-fallback="<text>"` is spoken when the element renders
 * no text (after its aria-labelledby targets; Spinner's accessible name), and
 * `data-ax-announce-politeness="assertive"` (default polite).
 */
import {defineBehavior} from '../elements/behavior';
import {createRenderedTextAnnouncer} from '../elements/runtime/announce';

defineBehavior('announce-rendered-text', (el) => {
  const announcer = createRenderedTextAnnouncer(el, {
    skipFirstRender: true,
    politeness: el.getAttribute('data-ax-announce-politeness') === 'assertive' ? 'assertive' : 'polite',
    fallbackText: el.getAttribute('data-ax-announce-fallback') ?? undefined,
  });
  announcer.sync();
  const observer = new MutationObserver(() => announcer.sync());
  observer.observe(el, {subtree: true, childList: true, characterData: true});
  return () => observer.disconnect();
});
