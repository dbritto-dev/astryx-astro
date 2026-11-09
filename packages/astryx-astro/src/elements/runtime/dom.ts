/**
 * Small DOM helpers shared by the runtime modules.
 * Ports of @astryxdesign/core utils/ime.ts, hooks/focusableSelector.ts,
 * hooks/isRtlElement.ts, utils/isFocusDetached.ts and utils/focusReturn.ts `isFocusLost`.
 */
import {globalSingleton} from './global';

/**
 * Whether a keydown is part of an IME composition and must not act as a command. Both signals
 * are needed: `isComposing`, and the legacy keyCode 229 some IMEs and older Safari send first.
 */
export function isImeKeyEvent(event: {isComposing?: boolean; keyCode?: number}): boolean {
  return event.isComposing === true || event.keyCode === 229;
}

/** The canonical focusable selector (tabbable natives plus editable and media elements). */
export const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), ' +
  '[tabindex]:not([tabindex="-1"]):not([disabled]), [contenteditable]:not([contenteditable="false"]), audio[controls], ' +
  'video[controls], iframe, details > summary:first-child';

/** Tabbable descendants in DOM order: not hidden, not inert, not under aria-hidden. */
export function tabbables(container: Element): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((el) =>
    el.tabIndex >= 0 &&
    !el.closest('[inert], [aria-hidden="true"]') &&
    el.checkVisibility({visibilityProperty: true}),
  );
}

/** Whether `el` renders right-to-left (computed direction; call lazily). */
export function isRtl(el: Element | null): boolean {
  if (!el || typeof window === 'undefined') return false;
  return getComputedStyle(el).direction === 'rtl';
}

/** Nothing has focus: the active element is missing, the body or the root. */
export function isFocusDetached(doc: Document = document): boolean {
  const active = doc.activeElement;
  return active == null || active === doc.body || active === doc.documentElement;
}

/** Focus would be lost if `surface` hid now: nothing is focused, or focus is inside it. */
export function isFocusLost(surface: Element | null, doc: Document = surface?.ownerDocument ?? document): boolean {
  return isFocusDetached(doc) || (surface != null && surface.contains(doc.activeElement));
}

/**
 * `el`, upgraded now when its element is defined but this instance is not upgraded yet.
 *
 * On page load a part's element is defined before the host that imports it, so the part is
 * already upgraded when the host connects. Markup inserted after both are defined (innerHTML,
 * a client router swapping the page, Storybook switching stories) upgrades in tree order
 * instead: a host connects while a later sibling or a descendant is still a plain element, so
 * `instanceof` fails, its API is missing, and properties set on it would be lost when it
 * upgrades. A host that reaches for another element while connecting passes it through here.
 * Upgrading also connects it, as on page load; `el` itself is returned either way.
 */
export function upgradeNow<T extends Element>(el: T | null): T | null {
  if (el && !el.matches(':defined')) el.ownerDocument.defaultView?.customElements.upgrade(el);
  return el;
}

/** A safe CSS identifier fragment from an id. */
export function identFrom(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

/** The id counter, one per page (shared by every copy of this module). */
const ids = globalSingleton('ensure-id', () => ({counter: 0}));
/** A document-unique id for an element that has none. */
export function ensureId(el: Element, prefix = 'ax'): string {
  if (!el.id) {
    do { el.id = `${prefix}-${(++ids.counter).toString(36)}`; } while (el.ownerDocument.querySelectorAll(`#${CSS.escape(el.id)}`).length > 1);
  }
  return el.id;
}
