/**
 * Screen-reader announcements through persistent live regions.
 *
 * Port of @astryxdesign/core hooks/useAnnounce.ts (shared body regions, frame join, dedupe,
 * 2s clear, withdraw handles, `hasReplace`), hooks/modalAnnounce.ts (route into the open
 * native modal, AST-086 FR14) and hooks/useAnnounceRenderedText.ts (`renderedText`).
 *
 * - Two visually hidden regions (`role=status` polite, `role=alert` assertive) are created
 *   empty on first use and stay mounted: many screen readers ignore a region created with
 *   its content.
 * - Messages written in the same frame join in order into one announcement; an identical
 *   repeat is kept once. The region is cleared first and written in the next frame, so a
 *   repeat of the previous text is still heard, and emptied 2s later.
 * - Inside an open `dialog:modal` the page outside is inert, so the message goes to the
 *   modal's own regions (direct children `[data-astryx-modal-live-region]`). The modal is the
 *   one enclosing `from`, else the topmost open modal (last presented).
 *
 * SSR-safe: nothing touches the DOM until the first call.
 */

export type AnnouncePoliteness = 'polite' | 'assertive';

export interface AnnounceOptions {
  /** @default 'polite' */
  politeness?: AnnouncePoliteness;
  /** The element the message is about: routes it into the open modal around it. */
  from?: Element | null;
}

/** Takes back a message while assistive technology has not had it yet. */
export type Withdraw = () => void;

const CLEAR_DELAY_MS = 2000;
const BODY_ATTR = 'data-astryx-live-region';
const MODAL_ATTR = 'data-astryx-modal-live-region';
// The same clip as VisuallyHidden, inline so the regions work without a stylesheet.
const VISUALLY_HIDDEN_CSS =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);' +
  'white-space:nowrap;border:0;inset-block-start:0;inset-inline-start:0;pointer-events:none;user-select:none;';

interface Pending { text: string; holders: number }
interface RegionState { pending: Pending[]; frame: number | null; timer: ReturnType<typeof setTimeout> | null }

const states = new WeakMap<HTMLElement, RegionState>();
let bodyRegions: Record<AnnouncePoliteness, HTMLElement> | null = null;

function makeRegion(politeness: AnnouncePoliteness, attr: string): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute(attr, politeness);
  el.setAttribute('aria-live', politeness);
  el.setAttribute('aria-atomic', 'true');
  el.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status');
  el.style.cssText = VISUALLY_HIDDEN_CSS;
  return el;
}

function bodyRegion(politeness: AnnouncePoliteness): HTMLElement {
  if (!bodyRegions) bodyRegions = {polite: makeRegion('polite', BODY_ATTR), assertive: makeRegion('assertive', BODY_ATTR)};
  const region = bodyRegions[politeness];
  if (!region.isConnected) document.body.appendChild(region);
  return region;
}

function modalRegion(dialog: HTMLDialogElement, politeness: AnnouncePoliteness): HTMLElement {
  let region = dialog.querySelector<HTMLElement>(`:scope > [${MODAL_ATTR}="${politeness}"]`);
  if (!region) {
    region = makeRegion(politeness, MODAL_ATTR);
    dialog.appendChild(region);
  }
  return region;
}

// ── Which modal is on top ────────────────────────────────────────────────────
// `showModal()` sets `open` as it is called, so the order of the attribute records is the
// top-layer order; the last one still open as a modal is on top.
const presented: HTMLDialogElement[] = [];
let watching = false;

function watchDialogs() {
  if (watching || typeof MutationObserver === 'undefined') return;
  watching = true;
  for (const dialog of document.querySelectorAll('dialog[open]')) presented.push(dialog as HTMLDialogElement);
  new MutationObserver((records) => {
    for (const r of records) {
      const dialog = r.target as HTMLDialogElement;
      if (dialog.tagName !== 'DIALOG') continue;
      const at = presented.indexOf(dialog);
      if (at !== -1) presented.splice(at, 1);
      if (dialog.open) presented.push(dialog);
    }
  }).observe(document.documentElement, {subtree: true, attributes: true, attributeFilter: ['open']});
}

/** Whether `dialog` is open as a native modal and exposed to assistive technology. */
export function isExposedModal(dialog: HTMLDialogElement | null | undefined): dialog is HTMLDialogElement {
  return dialog != null && dialog.open && dialog.matches(':modal') && !dialog.inert && dialog.getAttribute('aria-hidden') !== 'true';
}

/** The nearest open native modal enclosing `element`. */
export function enclosingModal(element: Element | null | undefined): HTMLDialogElement | null {
  let dialog = element?.closest('dialog') ?? null;
  while (dialog) {
    if (isExposedModal(dialog as HTMLDialogElement)) return dialog as HTMLDialogElement;
    dialog = dialog.parentElement?.closest('dialog') ?? null;
  }
  return null;
}

/** The modal on top: the last presented that is still an exposed modal, else the last in DOM order. */
export function topmostModal(): HTMLDialogElement | null {
  if (typeof document === 'undefined') return null;
  watchDialogs();
  for (let i = presented.length - 1; i >= 0; i--) if (presented[i].isConnected && isExposedModal(presented[i])) return presented[i];
  const open = [...document.querySelectorAll('dialog')].filter((d) => isExposedModal(d as HTMLDialogElement));
  return (open.at(-1) as HTMLDialogElement | undefined) ?? null;
}

function write(target: HTMLElement, message: string): Withdraw {
  let state = states.get(target);
  if (!state) { state = {pending: [], frame: null, timer: null}; states.set(target, state); }
  const s = state;
  let entry = s.pending.find((p) => p.text === message);
  if (entry) entry.holders += 1;
  else {
    entry = {text: message, holders: 1};
    s.pending.push(entry);
  }
  if (s.frame == null) {
    // Clear first, so the change is seen when the new text equals the old text.
    target.textContent = '';
    s.frame = requestAnimationFrame(() => {
      s.frame = null;
      target.textContent = s.pending.map((p) => p.text).join(' ');
      s.pending = [];
    });
  }
  if (s.timer != null) clearTimeout(s.timer);
  s.timer = setTimeout(() => { s.timer = null; target.textContent = ''; }, CLEAR_DELAY_MS);
  const held = entry;
  let withdrawn = false;
  return () => {
    if (withdrawn) return;
    withdrawn = true;
    const at = s.pending.indexOf(held);
    if (at === -1) return; // already exposed: it stays
    held.holders -= 1;
    if (held.holders <= 0) s.pending.splice(at, 1);
  };
}

function normalize(options?: AnnounceOptions | AnnouncePoliteness): Required<Pick<AnnounceOptions, 'politeness'>> & AnnounceOptions {
  if (typeof options === 'string') return {politeness: options};
  return {politeness: options?.politeness ?? 'polite', from: options?.from};
}

/**
 * Speak `message`. Returns a handle that withdraws it while it is not yet exposed (a busy
 * start overtaken by its own outcome). An empty message clears the region instead.
 */
export function announce(message: string, options?: AnnounceOptions | AnnouncePoliteness): Withdraw {
  if (typeof document === 'undefined') return () => {};
  const {politeness, from} = normalize(options);
  const modal = enclosingModal(from) ?? topmostModal();
  const target = modal ? modalRegion(modal, politeness) : bodyRegion(politeness);
  if (!message) {
    clearRegion(target);
    return () => {};
  }
  return write(target, message);
}

function clearRegion(target: HTMLElement) {
  const s = states.get(target);
  if (s) {
    if (s.frame != null) cancelAnimationFrame(s.frame);
    if (s.timer != null) clearTimeout(s.timer);
    states.delete(target);
  }
  target.textContent = '';
}

/** Withdraw whatever the page regions (and the top modal's) hold or are about to hold. */
export function clearAnnouncements(politeness: AnnouncePoliteness = 'polite'): void {
  if (typeof document === 'undefined') return;
  if (bodyRegions) clearRegion(bodyRegions[politeness]);
  const modal = topmostModal();
  const region = modal?.querySelector<HTMLElement>(`:scope > [${MODAL_ATTR}="${politeness}"]`);
  if (region) clearRegion(region);
}

/**
 * One announcer that states one current value (useAnnounce `hasReplace`): each message
 * withdraws its previous one while that one is not yet exposed.
 */
export function createAnnouncer({hasReplace = false}: {hasReplace?: boolean} = {}) {
  let previous: Withdraw | null = null;
  return (message: string, options?: AnnounceOptions | AnnouncePoliteness): Withdraw => {
    if (hasReplace) { previous?.(); previous = null; }
    const withdraw = announce(message, options);
    if (hasReplace) previous = withdraw;
    return withdraw;
  };
}

const HIDDEN = '[aria-hidden="true"], [hidden]';
const BLOCKS = 'p, div, li, br, h1, h2, h3, h4, h5, h6';

/**
 * The rendered text assistive technology would read from `element`: hidden parts skipped,
 * block boxes (block tags, non-inline display, flex/grid children) read apart.
 */
export function renderedText(element: Element): string {
  const view = element.ownerDocument.defaultView;
  const displayOf = (node: Element) => view?.getComputedStyle(node).display ?? '';
  const parts: string[] = [];
  const walk = (node: Node, parentDisplay: string) => {
    if (node.nodeType === Node.TEXT_NODE) { parts.push(node.textContent ?? ''); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const part = node as Element;
    if (part.matches(HIDDEN)) return;
    const display = displayOf(part);
    const isBlock = part.matches(BLOCKS) || (display !== '' && display !== 'contents' && !display.startsWith('inline')) || /\b(flex|grid)\b/.test(parentDisplay);
    if (isBlock) parts.push(' ');
    part.childNodes.forEach((child) => walk(child, display));
    if (isBlock) parts.push(' ');
  };
  const own = displayOf(element);
  element.childNodes.forEach((child) => walk(child, own));
  return parts.join('').replace(/\s+/g, ' ').trim();
}

/**
 * Announce an element's rendered text (useAnnounceRenderedText / `data-astryx-announce`).
 * `fallbackText` is spoken when the element renders no text. Routed from the element itself.
 */
export function announceText(element: Element, options: {politeness?: AnnouncePoliteness; fallbackText?: string} = {}): Withdraw {
  const text = renderedText(element) || options.fallbackText || '';
  if (!text) return () => {};
  return announce(text, {politeness: options.politeness ?? 'polite', from: element});
}
