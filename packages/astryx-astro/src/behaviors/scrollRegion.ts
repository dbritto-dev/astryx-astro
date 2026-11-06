/**
 * data-ax-scroll-region — Astryx useScrollRegionProps: while a scrollable element
 * actually overflows (and has no author role), expose it as role="group" with a label
 * so screen-reader users know it scrolls. The label is rendered server-side into the
 * attribute value (translated), e.g. data-ax-scroll-region="Content".
 */
import {defineBehavior} from '../elements/behavior';

defineBehavior('scroll-region', (el) => {
  if (el.hasAttribute('role') && !el.hasAttribute('data-ax-scroll-region-role')) return;
  const label = el.getAttribute('data-ax-scroll-region') || 'Content';
  const authorLabel = el.getAttribute('aria-label');
  const update = () => {
    const overflows = el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
    if (overflows) {
      el.setAttribute('role', 'group');
      el.setAttribute('data-ax-scroll-region-role', '');
      el.setAttribute('aria-label', authorLabel ?? label);
    } else if (el.hasAttribute('data-ax-scroll-region-role')) {
      el.removeAttribute('role');
      el.removeAttribute('data-ax-scroll-region-role');
      if (authorLabel == null) el.removeAttribute('aria-label');
    }
  };
  const ro = new ResizeObserver(update);
  ro.observe(el);
  const mo = new MutationObserver(update);
  mo.observe(el, {childList: true, subtree: true, characterData: true});
  update();
  return () => { ro.disconnect(); mo.disconnect(); };
});
