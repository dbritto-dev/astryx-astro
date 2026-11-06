/**
 * data-ax-field-status — port of @astryxdesign/core FieldStatus/useFieldStatusAnnouncement.ts
 * and hooks/useEntryAnimation.ts for the server-rendered FieldStatus.
 *
 *  - Speaks the message through the persistent live regions (errors assertively, warnings
 *    and successes politely) when it is first present — including a status the server
 *    rendered with the page — and again whenever its text or `data-type` changes. The
 *    element itself is not a live region (one mounted with its content is not reliably
 *    announced).
 *  - Entry animation only for a status inserted after the first page paint: it gets
 *    `data-ax-entering` before its first style resolution (MutationObserver callbacks run
 *    before rendering), which enables the @starting-style transition in FieldStatus.css.
 *    Server-rendered statuses never play it (Astryx AST-013 FR13).
 */
import {defineBehavior} from '../elements/behavior';
import {announce} from './liveAnnounce';

let initialPaintComplete = false;
if (typeof window !== 'undefined') {
  const markPainted = () => requestAnimationFrame(() => { initialPaintComplete = true; });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', markPainted, {once: true});
  else markPainted();
}

defineBehavior('field-status', (el) => {
  if (initialPaintComplete) el.setAttribute('data-ax-entering', '');
  let spoken: string | null = null;
  const speak = () => {
    const message = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    const type = el.getAttribute('data-type');
    const key = `${type}\u0000${message}`;
    if (!message || key === spoken) return;
    spoken = key;
    announce(message, type === 'error' ? 'assertive' : 'polite', el);
  };
  speak();
  const observer = new MutationObserver(speak);
  observer.observe(el, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-type']});
  return () => observer.disconnect();
});
