/**
 * data-ax-announce-rendered-text — port of @astryxdesign/core hooks/AnnounceRenderedText.tsx
 * + useAnnounceRenderedText.ts with `skipFirstRender` (EmptyState's message).
 *
 * Text present while the document loads is silent (it is part of the page). Text that
 * appears after load (the element is inserted later) or changes later is announced once,
 * politely, each child read as a block. Skipped inside a live container (which speaks its
 * own content) and while hidden from assistive tech.
 */
import {defineBehavior} from '../elements/behavior';
import {announce, blockText, insideLiveContainer, isHiddenFromAT} from './liveAnnounce';

defineBehavior('announce-rendered-text', (el) => {
  const renderedWithPage = document.readyState !== 'complete';
  let spoken: string | null = null;
  let first = true;
  const run = () => {
    const isFirst = first;
    first = false;
    if (isHiddenFromAT(el)) { spoken = null; return; }
    if (insideLiveContainer(el)) return;
    const text = blockText(el);
    if (text === '') return;
    if (isFirst && renderedWithPage) { spoken = text; return; }
    if (text === spoken) return;
    spoken = text;
    announce(text, 'polite', el);
  };
  run();
  const observer = new MutationObserver(run);
  observer.observe(el, {subtree: true, childList: true, characterData: true});
  return () => observer.disconnect();
});
