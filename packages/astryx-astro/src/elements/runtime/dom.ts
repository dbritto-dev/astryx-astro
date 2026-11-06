/**
 * Small DOM helpers shared by the runtime modules.
 * Ports of @astryxdesign/core utils/ime.ts, hooks/focusableSelector.ts,
 * hooks/isRtlElement.ts, utils/isFocusDetached.ts and utils/focusReturn.ts `isFocusLost`.
 */

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
    (el.checkVisibility?.({visibilityProperty: true} as CheckVisibilityOptions) ?? el.getClientRects().length > 0),
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

/** A safe CSS identifier fragment from an id. */
export function identFrom(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

let counter = 0;
/** A document-unique id for an element that has none. */
export function ensureId(el: Element, prefix = 'ax'): string {
  if (!el.id) {
    do { el.id = `${prefix}-${(++counter).toString(36)}`; } while (el.ownerDocument.querySelectorAll(`#${CSS.escape(el.id)}`).length > 1);
  }
  return el.id;
}
