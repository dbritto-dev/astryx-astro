/**
 * The one dismissal stack per document: Escape, outside presses, gesture identity.
 *
 * Port of @astryxdesign/core Layer/layerStack.ts (registration, top-most ordering, the one
 * bubble-phase Escape listener per document, IME guard), Layer/useLayerDismissal.ts
 * (`shouldDismissOnCloseRequest`), Layer/outsidePress.ts (start AND end outside,
 * `noteOutsideDismissal` / `outsideDismissalCount`) and Layer/gestureCounter.ts.
 * Contract #17 (overlay-dismissal FR1–11).
 *
 * Rules:
 * - One Escape press dismisses exactly one layer: the top-most present layer of the document
 *   the press happened in. `'block'` consumes the press without dismissing.
 * - Content inside a layer may claim Escape first: a press already `defaultPrevented` (or
 *   stopped) is left alone. A handled press is `preventDefault()`ed, which also suppresses
 *   the browser's own close watcher (popover="auto" / dialog cancel), so one code path decides.
 * - An Escape that cancels an IME composition dismisses nothing, but is claimed while a layer
 *   is open so the browser raises no close request either.
 * - Order: DOM containment (a layer inside another is above it), then registration order
 *   (layers register when they open, so later-opened is above). Depth from React context has
 *   no equivalent here; containment covers nesting because layers render inline.
 * - Outside press: the top-most layer that takes outside presses owns the press; it is
 *   dismissed only when the press starts AND ends outside it, and no layer below sees it
 *   ("the topmost layer consumes the outside press"). `'native'` layers (popover="auto") are
 *   light-dismissed by the browser; the stack only records and consumes the press.
 *
 * SSR-safe; listeners attach to a document with its first layer and leave with its last. One
 * stack per page: the state (and the listener functions) is a `globalSingleton`, so a second
 * copy of this module shares it instead of adding a second Escape listener.
 */
import {isImeKeyEvent} from './dom';
import {globalSingleton} from './global';

export type LayerEscapeBehavior = 'close' | 'block';
/** How a layer answers a press outside it. `ignore` layers are transparent to outside presses. */
export type LayerOutsidePress = 'dismiss' | 'native' | 'ignore';
export type DismissReason = 'escape' | 'outside';

export interface LayerEntry {
  /** The layer's root element (containment, document, default inside test). */
  element: HTMLElement;
  /** @default 'close' */
  escape?: LayerEscapeBehavior | (() => LayerEscapeBehavior | null);
  /** @default 'ignore' */
  outsidePress?: LayerOutsidePress | (() => LayerOutsidePress);
  /** Whether a press with this composed path is inside the layer (default: inside `element`). */
  isInside?: (path: ReadonlyArray<EventTarget>) => boolean;
  /** Asked at press time; a layer that is registered but not on screen is skipped. */
  isPresent?: () => boolean;
  /** Called with the reason for an Escape the layer owns or an outside press that dismissed it. */
  dismiss: (reason: DismissReason) => void;
}

interface Entry extends LayerEntry {
  seq: number;
  doc: Document;
}

interface Listeners {
  keydown: (event: KeyboardEvent) => void;
  compositionStart: (event: Event) => void;
  compositionEnd: (event: Event) => void;
  pointerDown: (event: PointerEvent) => void;
  pointerUp: (event: PointerEvent) => void;
  pointerCancel: () => void;
}

interface StackState {
  entries: Entry[];
  nextSeq: number;
  countByDoc: Map<Document, number>;
  composing: Set<Document>;
  outsideDismissals: WeakMap<Document, number>;
  /** The layer that owns the press in flight (it started outside it). */
  pressOwner: Entry | null;
  /** The first copy's listener functions: every copy adds and removes these. */
  listeners: Listeners;
  gesture: number;
  clickedGesture: number | null;
  counting: boolean;
}

const state: StackState = globalSingleton('layer-stack', () => ({
  entries: [],
  nextSeq: 0,
  countByDoc: new Map(),
  composing: new Set(),
  outsideDismissals: new WeakMap(),
  pressOwner: null,
  listeners: {
    keydown: dispatchLayerEscapeKeyDown,
    compositionStart: onCompositionStart,
    compositionEnd: onCompositionEnd,
    pointerDown: onPointerDown,
    pointerUp: onPointerUp,
    pointerCancel: onPointerCancel,
  },
  gesture: 0,
  clickedGesture: null,
  counting: false,
}));

const valueOf = <T>(v: T | (() => T)): T => (typeof v === 'function' ? (v as () => T)() : v);

function isPresent(e: Entry) {
  return e.element.isConnected && (e.isPresent?.() ?? true);
}

/** Positive when `a` is above `b`. Partial order: resolve with a max scan, never sort. */
function compare(a: Entry, b: Entry): number {
  if (a.element !== b.element) {
    if (b.element.contains(a.element)) return 1;
    if (a.element.contains(b.element)) return -1;
  }
  return a.seq - b.seq;
}

function topmost(doc: Document | null, filter?: (e: Entry) => boolean): Entry | null {
  let top: Entry | null = null;
  for (const e of state.entries) {
    if (e.doc !== doc || !isPresent(e) || (filter && !filter(e))) continue;
    if (!top || compare(e, top) > 0) top = e;
  }
  return top;
}

function documentOf(event: Event): Document | null {
  const target = event.target as Node | null;
  if (!target) return typeof document === 'undefined' ? null : document;
  return target.nodeType === 9 ? (target as Document) : target.ownerDocument;
}

/** Resolve an Escape keydown against the stack (the document listener calls this). */
export function dispatchLayerEscapeKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  const doc = documentOf(event);
  if (isImeKeyEvent(event)) {
    if (topmost(doc)) event.preventDefault();
    return;
  }
  if (event.defaultPrevented) return;
  const top = topmost(doc, (e) => valueOf(e.escape ?? 'close') != null);
  if (!top) return;
  const behavior = valueOf(top.escape ?? 'close');
  event.preventDefault();
  if (behavior === 'close') top.dismiss('escape');
}

// ── Outside press ───────────────────────────────────────────────────────────

function takesOutside(e: Entry) {
  return valueOf(e.outsidePress ?? 'ignore') !== 'ignore';
}

function inside(e: Entry, path: ReadonlyArray<EventTarget>): boolean {
  if (e.isInside) return e.isInside(path);
  return path.includes(e.element);
}

function onPointerDown(event: PointerEvent) {
  const owner = topmost(documentOf(event), takesOutside);
  state.pressOwner = owner && !inside(owner, event.composedPath()) ? owner : null;
}

function onPointerUp(event: PointerEvent) {
  const owner = state.pressOwner;
  state.pressOwner = null;
  if (!owner || !isPresent(owner) || inside(owner, event.composedPath())) return;
  // The owner must still be the one on top: a layer that opened during the press owns it now.
  if (topmost(owner.doc, takesOutside) !== owner) return;
  const mode = valueOf(owner.outsidePress ?? 'ignore');
  noteOutsideDismissal(owner.doc);
  if (mode === 'dismiss') owner.dismiss('outside');
}

function onPointerCancel() {
  state.pressOwner = null;
}

/** Record that a layer in `doc` is closing because a press or focus went outside it. */
export function noteOutsideDismissal(doc: Document): void {
  state.outsideDismissals.set(doc, (state.outsideDismissals.get(doc) ?? 0) + 1);
}

/** How many layers an outside press has closed in `doc`: a modal backdrop compares it across a press. */
export function outsideDismissalCount(doc: Document): number {
  return state.outsideDismissals.get(doc) ?? 0;
}

// ── IME ─────────────────────────────────────────────────────────────────────
function onCompositionStart(event: Event) { state.composing.add(event.currentTarget as Document); }
function onCompositionEnd(event: Event) { state.composing.delete(event.currentTarget as Document); }

/** Whether an IME composition is running in a document that holds a layer. */
export function isTextComposing(): boolean {
  return state.composing.size > 0;
}

function start(doc: Document) {
  const l = state.listeners;
  doc.addEventListener('keydown', l.keydown);
  doc.addEventListener('compositionstart', l.compositionStart, true);
  doc.addEventListener('compositionend', l.compositionEnd, true);
  doc.addEventListener('blur', l.compositionEnd, true);
  doc.addEventListener('pointerdown', l.pointerDown, true);
  doc.addEventListener('pointerup', l.pointerUp, true);
  doc.addEventListener('pointercancel', l.pointerCancel, true);
}

function stop(doc: Document) {
  const l = state.listeners;
  doc.removeEventListener('keydown', l.keydown);
  doc.removeEventListener('compositionstart', l.compositionStart, true);
  doc.removeEventListener('compositionend', l.compositionEnd, true);
  doc.removeEventListener('blur', l.compositionEnd, true);
  doc.removeEventListener('pointerdown', l.pointerDown, true);
  doc.removeEventListener('pointerup', l.pointerUp, true);
  doc.removeEventListener('pointercancel', l.pointerCancel, true);
  state.composing.delete(doc);
}

/**
 * Add a layer to the stack while it is open. Returns the unregister function (idempotent).
 * Register when the layer opens, so registration order is open order.
 */
export function registerLayer(entry: LayerEntry): () => void {
  const doc = entry.element.ownerDocument;
  const full: Entry = {...entry, seq: state.nextSeq++, doc};
  state.entries.push(full);
  const count = state.countByDoc.get(doc) ?? 0;
  state.countByDoc.set(doc, count + 1);
  if (count === 0) start(doc);
  return () => {
    const at = state.entries.indexOf(full);
    if (at === -1) return;
    state.entries.splice(at, 1);
    if (state.pressOwner === full) state.pressOwner = null;
    const left = (state.countByDoc.get(doc) ?? 1) - 1;
    if (left > 0) state.countByDoc.set(doc, left);
    else { state.countByDoc.delete(doc); stop(doc); }
  };
}

/** Whether `element`'s registered layer is the top-most present layer of its document. */
export function isTopmostLayer(element: HTMLElement): boolean {
  const top = topmost(element.ownerDocument);
  return top != null && top.element === element;
}

/** The top-most present layer element of a document, or null. */
export function topmostLayer(doc: Document = document): HTMLElement | null {
  return topmost(doc)?.element ?? null;
}

/**
 * For close requests that arrive without a keydown (a dialog's `cancel`, the Android back
 * gesture): dismiss only when the layer is top-most and no IME composition is running.
 */
export function shouldDismissOnCloseRequest(element: HTMLElement): boolean {
  return !isTextComposing() && isTopmostLayer(element);
}

// ── Gesture identity (gestureCounter.ts) ─────────────────────────────────────
// A light dismiss and the trigger's own click come from one press; counting gestures (not
// timestamps) tells "the click of the press that dismissed the layer" from a fresh one.
function count() {
  if (state.counting || typeof document === 'undefined') return;
  state.counting = true;
  document.addEventListener('pointerdown', () => { state.gesture += 1; }, true);
  document.addEventListener('keydown', () => { state.gesture += 1; }, true);
  document.addEventListener('click', () => { state.clickedGesture = state.gesture; }, true);
}

/** Identifies the user gesture in flight: two reads that agree happened within one press. */
export function currentGesture(): number {
  count();
  return state.gesture;
}

/** Whether the click of the current gesture already ran. */
export function currentGestureHasClicked(): boolean {
  count();
  return state.clickedGesture === state.gesture;
}

if (typeof document !== 'undefined') count();
