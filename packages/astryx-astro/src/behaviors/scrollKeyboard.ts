/**
 * data-ax-scroll-keyboard — keyboard access to a region that scrolls.
 *
 * Deviation from Astryx (accessibility, docs/accessibility.md): Astryx leaves it to the browser
 * to make a scroll container a Tab stop. Chrome and Firefox do; Safari does not, so a keyboard
 * user there cannot scroll a region that holds no focusable element. While the region overflows
 * and holds nothing focusable, it joins the Tab order (tabindex="0", marked
 * `data-ax-scroll-keyboard-stop`) so arrow keys and Page Up/Down scroll it. It leaves again when
 * its content fits or gains a focusable element (keeping tabindex="-1" while it holds focus).
 * A region with focusable content needs nothing: focus inside it scrolls it.
 *
 * An explicit tabindex wins (an author's, AppShell's main): the behaviour stays out of the way.
 * The ring is drawn inset (shared.css), so the region's own clip and its container's keep it.
 */
import {defineBehavior} from '../elements/behavior';

const STOP = 'data-ax-scroll-keyboard-stop';
const FOCUSABLE =
  'a[href], button, input:not([type="hidden"]), select, textarea, summary, iframe, [contenteditable]:not([contenteditable="false"]), [tabindex]';

/** Whether `el` holds an element a Tab press can reach. */
function holdsFocusable(el: Element): boolean {
  for (const node of el.querySelectorAll<HTMLElement>(FOCUSABLE)) {
    if (node.getAttribute('tabindex') === '-1' || node.matches(':disabled') || node.closest('[inert]')) continue;
    if (node.checkVisibility()) return true;
  }
  return false;
}

defineBehavior('scroll-keyboard', (el) => {
  if (el.hasAttribute('tabindex') && !el.hasAttribute(STOP)) return;
  const update = () => {
    const overflows = el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
    if (overflows && !el.closest('[inert]') && !holdsFocusable(el)) {
      if (el.getAttribute('tabindex') !== '0') el.setAttribute('tabindex', '0');
      el.setAttribute(STOP, '');
    } else if (el.hasAttribute(STOP)) {
      // Attribute writes are observed (tabindex): write only on a change, or this loops.
      if (el.ownerDocument.activeElement === el) {
        if (el.getAttribute('tabindex') !== '-1') el.setAttribute('tabindex', '-1');
      } else {
        el.removeAttribute('tabindex');
        el.removeAttribute(STOP);
      }
    }
  };
  const onBlur = () => update();
  const ro = new ResizeObserver(update);
  ro.observe(el);
  for (const child of el.children) ro.observe(child);
  const mo = new MutationObserver(update);
  mo.observe(el, {childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'disabled', 'tabindex', 'href', 'inert']});
  el.addEventListener('blur', onBlur);
  update();
  return () => {
    ro.disconnect();
    mo.disconnect();
    el.removeEventListener('blur', onBlur);
    if (el.hasAttribute(STOP)) {
      el.removeAttribute('tabindex');
      el.removeAttribute(STOP);
    }
  };
});
