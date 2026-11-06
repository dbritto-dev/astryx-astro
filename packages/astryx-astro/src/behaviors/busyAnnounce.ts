/**
 * data-ax-busy-announce="<message>" — port of @astryxdesign/core hooks/useBusyAnnouncement.ts
 * for server-rendered busy surfaces (Thumbnail's upload overlay): announce the busy start
 * once, politely, a frame after the element appears (also when it is in the initial
 * page), through the runtime announcer (elements/runtime/announce.ts: the enclosing open
 * modal's region, else the page regions). The decorative
 * spinner inside stays aria-hidden; this is what assistive tech hears.
 */
import {defineBehavior} from '../elements/behavior';
import {announce} from '../elements/runtime/announce';

defineBehavior('busy-announce', (el) => {
  const frame = requestAnimationFrame(() => {
    const message = el.getAttribute('data-ax-busy-announce');
    if (message) announce(message, {politeness: 'polite', from: el});
  });
  return () => cancelAnimationFrame(frame);
});
