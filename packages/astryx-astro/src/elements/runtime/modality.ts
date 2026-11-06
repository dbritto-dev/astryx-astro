/**
 * Last input modality — one shared state per document, reflected as
 * `<html data-astryx-modality="keyboard|pointer|virtual">`.
 *
 * Port of @astryxdesign/core utils/interactionModality.ts and the focus helpers of
 * utils/focusReturn.ts (focusForLastInput, returnFocusForLastInput). Contract #19
 * (interaction-modality INV1–9): one shared last-input state; programmatic focus shows the
 * ring only after keyboard input.
 *
 * - `keyboard` (the default before any input: focus that arrived programmatically or from a
 *   browser restore shows a ring, the safe error), set by any keydown that is not a chord.
 * - `pointer`, set by pointerdown (any pointer type; `getLastPointerType()` tells them apart).
 * - `virtual`, set by a click no key or pointer started (a screen reader's virtual click).
 *   Astryx has no such value; it is treated like `pointer` for the ring.
 *
 * SSR-safe to import; listeners attach once per document on first import in a browser and
 * stay for the document's lifetime (duplicate bundles share the store through a global symbol).
 */

export type InteractionModality = 'keyboard' | 'pointer' | 'virtual';

type Listener = (modality: InteractionModality) => void;

interface Store {
  modality: InteractionModality;
  pointerType: string | null;
  /** The gesture a key or pointer started, so a click it causes is not "virtual". */
  pressedAt: number;
  listeners: Set<Listener>;
}

const STORE_KEY = Symbol.for('astryx-astro/modality/v1');
const ATTRIBUTE = 'data-astryx-modality';

function storeOf(doc: Document): Store {
  const holder = doc as Document & {[STORE_KEY]?: Store};
  const existing = holder[STORE_KEY];
  if (existing) return existing;
  const store: Store = {modality: 'keyboard', pointerType: null, pressedAt: -Infinity, listeners: new Set()};
  Object.defineProperty(holder, STORE_KEY, {value: store});
  listen(doc, store);
  return store;
}

function write(doc: Document, store: Store, next: InteractionModality) {
  if (store.modality === next && doc.documentElement.getAttribute(ATTRIBUTE) === next) return;
  const changed = store.modality !== next;
  store.modality = next;
  doc.documentElement.setAttribute(ATTRIBUTE, next);
  if (changed) for (const fn of [...store.listeners]) fn(next);
}

function listen(doc: Document, store: Store) {
  const view = doc.defaultView;
  const now = () => view?.performance.now() ?? Date.now();
  doc.addEventListener('pointerdown', (event) => {
    store.pointerType = event.pointerType || null;
    store.pressedAt = now();
    write(doc, store, 'pointer');
  }, {capture: true, passive: true});
  doc.addEventListener('keydown', (event) => {
    // Modifier chords are not navigation: Shift held before a click must not make it "keyboard".
    if (event.metaKey || event.altKey || event.ctrlKey) return;
    store.pressedAt = now();
    write(doc, store, 'keyboard');
  }, {capture: true, passive: true});
  doc.addEventListener('click', (event) => {
    const pointerType = (event as PointerEvent).pointerType;
    // A click with no detail, no pointer type and no key or pointer press in the last
    // moment came from assistive technology.
    // A script's own `.click()` is untrusted and says nothing about the user.
    if (event.isTrusted && event.detail === 0 && !pointerType && now() - store.pressedAt > 1000) write(doc, store, 'virtual');
  }, {capture: true, passive: true});
  const mark = () => { if (!doc.documentElement.hasAttribute(ATTRIBUTE)) doc.documentElement.setAttribute(ATTRIBUTE, store.modality); };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', mark, {once: true});
  else mark();
}

/** Start tracking a document (idempotent; the page's own document starts on import). */
export function trackModality(doc: Document = document): void {
  if (typeof document === 'undefined') return;
  storeOf(doc);
}

/** How the user last interacted in `target`'s document (the page's by default). */
export function getModality(target?: Document | Node | null): InteractionModality {
  if (typeof document === 'undefined') return 'keyboard';
  const doc = target == null ? document : target.nodeType === 9 ? (target as Document) : (target.ownerDocument ?? document);
  return storeOf(doc).modality;
}

/** The pointer type of the latest pointerdown (`mouse`, `pen`, `touch`), or null. */
export function getLastPointerType(doc: Document = document): string | null {
  if (typeof document === 'undefined') return null;
  return storeOf(doc).pointerType;
}

/** Whether the current interaction is a finger: the last input was a touch press. */
export function isTouchInteraction(doc: Document = document): boolean {
  if (typeof document === 'undefined') return false;
  const store = storeOf(doc);
  return store.modality === 'pointer' && store.pointerType === 'touch';
}

/** Subscribe to modality changes; returns the unsubscribe. */
export function onModalityChange(listener: Listener, doc: Document = document): () => void {
  if (typeof document === 'undefined') return () => {};
  const store = storeOf(doc);
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

function isTextEntry(element: HTMLElement): boolean {
  const view = element.ownerDocument.defaultView ?? window;
  return element instanceof view.HTMLInputElement || element instanceof view.HTMLTextAreaElement ||
    element instanceof view.HTMLSelectElement || element.isContentEditable;
}

/**
 * Move focus programmatically so its ring follows the last input (focusForLastInput): after
 * pointer (or virtual) input the element is focused with `focusVisible: false`; after keyboard
 * input, or for a text-entry control (which paints its own focus treatment), plainly.
 */
export function focusForLastInput(element: HTMLElement, options?: FocusOptions, modality: InteractionModality = getModality(element)): void {
  if (isTextEntry(element) || modality === 'keyboard') {
    element.focus(options);
    return;
  }
  // Focusing the already-focused element does nothing, so a ring the browser drew stays.
  if (element.matches(':focus-visible')) element.blur();
  element.focus({...options, focusVisible: false} as FocusOptions);
}

/** Return focus to an overlay's opener without scrolling, with the ring the last input calls for. */
export function returnFocusForLastInput(opener: HTMLElement, modality?: InteractionModality): void {
  focusForLastInput(opener, {preventScroll: true}, modality);
}

if (typeof document !== 'undefined') trackModality(document);
