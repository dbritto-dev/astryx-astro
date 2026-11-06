/**
 * Screen-reader announcements through persistent live regions — a minimal stand-in for
 * the shared `src/elements/runtime/announce` singleton (not in this tree yet), following
 * @astryxdesign/core hooks/useAnnounce.ts:
 *
 *  - two regions (polite → role="status", assertive → role="alert"), created once, empty,
 *    visually hidden and kept mounted: many screen readers ignore a live region created
 *    together with its content;
 *  - a message goes to the region inside the open native modal that encloses the caller,
 *    else to the page-body regions (a modal makes everything outside it inert);
 *  - messages written in the same frame are exposed together, an identical repeat once;
 *  - the region is cleared 2s later so stale status text leaves the accessibility tree.
 *
 * Regions are marked `data-astryx-live-region="polite|assertive"` (Astryx's attribute), and
 * existing ones are reused, so this coexists with the runtime when it lands. Replace the
 * import with the runtime's `announce()` then; the call signature is the same.
 */
export type AnnouncePoliteness = 'polite' | 'assertive';

const ATTR = 'data-astryx-live-region';
const HIDDEN_CSS =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);' +
  'white-space:nowrap;border:0;inset-block-start:0;inset-inline-start:0;pointer-events:none;user-select:none;';
const CLEAR_DELAY_MS = 2000;

interface RegionState {
  pending: string[];
  frame: number | null;
  clear: ReturnType<typeof setTimeout> | null;
}
const states = new WeakMap<HTMLElement, RegionState>();

function region(host: HTMLElement, politeness: AnnouncePoliteness): HTMLElement {
  let el = Array.from(host.children).find(
    (child): child is HTMLElement => child instanceof HTMLElement && child.getAttribute(ATTR) === politeness,
  );
  if (!el) {
    el = document.createElement('div');
    el.setAttribute(ATTR, politeness);
    el.setAttribute('aria-live', politeness);
    el.setAttribute('aria-atomic', 'true');
    el.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status');
    el.style.cssText = HIDDEN_CSS;
    host.appendChild(el);
  }
  return el;
}

/** The open modal <dialog> around `from`, whose own region AT can still reach. */
function enclosingModal(from: Element | null | undefined): HTMLElement | null {
  const dialog = from?.closest('dialog');
  return dialog instanceof HTMLDialogElement && dialog.matches(':modal') ? dialog : null;
}

/** Announce `message` politely (default) or assertively, from the element `from`. */
export function announce(message: string, politeness: AnnouncePoliteness = 'polite', from?: Element | null): void {
  if (typeof document === 'undefined' || !message) return;
  const target = region(enclosingModal(from) ?? document.body, politeness);
  let state = states.get(target);
  if (!state) {
    state = {pending: [], frame: null, clear: null};
    states.set(target, state);
  }
  if (!state.pending.includes(message)) state.pending.push(message);
  if (state.frame != null) return;
  const s = state;
  s.frame = requestAnimationFrame(() => {
    s.frame = null;
    target.textContent = s.pending.join(' ');
    s.pending = [];
    if (s.clear != null) clearTimeout(s.clear);
    s.clear = setTimeout(() => { s.clear = null; target.textContent = ''; }, CLEAR_DELAY_MS);
  });
}

const LIVE_CONTAINER = '[role="log"], [role="status"], [role="alert"], [aria-live="polite"], [aria-live="assertive"]';
const HIDDEN = '[aria-hidden="true"], [hidden]';

/** Text of an element's children joined as blocks (Astryx useAnnounceRenderedText blockText). */
export function blockText(element: Element): string {
  return Array.from(element.childNodes)
    .map((child) => {
      if (child.nodeType === Node.TEXT_NODE) return (child.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (child instanceof Element) return child.matches(HIDDEN) ? '' : renderedText(child);
      return '';
    })
    .filter((part) => part !== '')
    .join(' ');
}

/** Rendered text with block boundaries as spaces, skipping hidden subtrees. */
export function renderedText(element: Element): string {
  const parts: string[] = [];
  const walk = (node: Node, parentDisplay: string) => {
    if (node.nodeType === Node.TEXT_NODE) { parts.push(node.textContent ?? ''); return; }
    if (!(node instanceof Element) || node.matches(HIDDEN)) return;
    const display = getComputedStyle(node).display;
    const isBlock = node.matches('p, div, li, br, h1, h2, h3, h4, h5, h6')
      || (display !== '' && display !== 'contents' && !display.startsWith('inline'))
      || /\b(flex|grid)\b/.test(parentDisplay);
    if (isBlock) parts.push(' ');
    node.childNodes.forEach((child) => walk(child, display));
    if (isBlock) parts.push(' ');
  };
  const own = getComputedStyle(element).display;
  element.childNodes.forEach((child) => walk(child, own));
  return parts.join('').replace(/\s+/g, ' ').trim();
}

/** True when `el` sits inside a live container that speaks its own content. */
export function insideLiveContainer(el: Element): boolean {
  return el.parentElement?.closest(LIVE_CONTAINER) != null;
}

/** True when `el` is hidden from AT or not rendered. */
export function isHiddenFromAT(el: Element): boolean {
  return el.closest(HIDDEN) != null || (el as HTMLElement).checkVisibility?.() === false;
}
