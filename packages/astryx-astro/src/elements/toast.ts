/// <reference types="astro/client" />
// Vite import.meta typing (env) for plain tsc, through astro (which depends on vite).
/**
 * Toasts: `<ax-toast>` (one card), `<ax-toast-viewport>` (the stack) and the imperative
 * `toast()` API.
 *
 * Ports @astryxdesign/core Toast/Toast.tsx (ToastSurface: auto-hide timer held by pointer,
 * focus, window blur — plus page visibility here —, dismiss button, MediaTheme auto mode),
 * Toast/ToastViewport.tsx (queue window `maxVisible`, uniqueID overwrite/ignore, entry/exit row
 * motion, announcements, focus hand-off when a focused toast leaves, F6, modal re-hosting),
 * Toast/useToast.tsx (`toast()`, fallback viewport), Layer/toastHost.tsx (`createToastQueue`,
 * `findToastNamesake`) and hooks/useAutoMediaMode.ts.
 *
 *   import {toast} from 'astryx-astro/…/elements/toast';
 *   const dismiss = toast({body: 'Saved', endContent: undoButton, uniqueID: 'save'});
 *
 * `toast()` goes to the page's first `<ax-toast-viewport>` (the one LayerProvider renders, or a
 * ToastViewport.astro in the app layout); without one a fallback viewport is created in `<body>`
 * (English strings, default position and queue), as Astryx's useToast does without a provider.
 * Toasts raised before a viewport connects wait in the queue.
 *
 * Content is vanilla: `body` / `endContent` take a string (text), a Node, or a `<template>`
 * (its content is cloned, e.g. a server-rendered Button); `renderContent(props)` returns the
 * card's whole content (no fallback close is injected).
 *
 * Top layer: the viewport is `popover="manual"` and moves into the latest open native modal
 * (modal-outlet.ts) so toasts paint above it and stay operable; a non-modal top-layer surface
 * shown later makes it re-enter the top layer in place. Moving never restarts timers or entry
 * motion and keeps focus. Toasts never take focus; F6 moves focus into the newest one.
 * Announcements go through runtime/announce.ts, which routes into the open modal's own region.
 *
 * One queue per page: the viewports, the default queue, the id counter and the live cards are a
 * `globalSingleton`, so a second copy of this module (Vite pre-bundling a consumer's
 * `import {toast}` beside the viewport's own script) reaches the same viewport.
 *
 * Deferred (touch extra): swipe-to-dismiss (useToastGesture.ts); the `--_toast-swipe-*`
 * variables are kept at rest so a later gesture port only writes them.
 */
import {announce, renderedText} from './runtime/announce';
import {focusForLastInput} from './runtime/modality';
import {isFocusDetached} from './runtime/dom';
import {getActiveModalOutlet, subscribeModalOutlets, type ModalOutletChange} from './runtime/modalOutlet';
import {brandClass, globalSingleton} from './runtime/global';

export type ToastType = 'info' | 'error';
export type ToastPosition = 'topEnd' | 'topStart' | 'bottomEnd' | 'bottomStart';
export type ToastCollisionBehavior = 'overwrite' | 'ignore';
export type ToastDismissReason = 'auto' | 'manual';
/** A string is text; a `<template>` is cloned; any other Node is inserted as is. */
export type ToastContent = string | Node | null | undefined;
export type ToastDismissFn = () => void;

export interface ToastContentRenderProps {
  body: ToastContent;
  endContent?: ToastContent;
  type: ToastType;
  isAutoHide: boolean;
  autoHideDuration: number;
  /** Dismisses this toast with reason 'manual'. */
  dismiss: ToastDismissFn;
}

export interface ToastOptions {
  /** Primary message content. */
  body: ToastContent;
  /** @default 'info' */
  type?: ToastType;
  /** Defaults to true for info, false for error. */
  isAutoHide?: boolean;
  /** @default 5000 */
  autoHideDuration?: number;
  /** Trailing content (an action such as Undo). Keep labels short. */
  endContent?: ToastContent;
  /** Replaces the card's content with your own layout. */
  renderContent?: (toast: ToastContentRenderProps) => ToastContent;
  /** Deduplication key. */
  uniqueID?: string;
  /** @default 'overwrite' */
  collisionBehavior?: ToastCollisionBehavior;
  /** Fired once when the toast is removed. */
  onHide?: (reason: ToastDismissReason) => void;
}

export interface ToastEntry {
  id: string;
  options: ToastOptions;
  createdAt: number;
  /** The row's identity; an in-place overwrite keeps the replaced toast's. */
  rowKey?: string;
}

export interface ToastContextValue {
  addToast(entry: ToastEntry): void;
  removeToast(id: string, reason: ToastDismissReason): void;
  findByUniqueID(uniqueID: string): ToastEntry | undefined;
}

export interface ToastQueue {
  readonly context: ToastContextValue;
  connect(viewport: ToastContextValue | null): void;
}

const DEFAULT_DURATION = 5000;
const MIN_REMAINING_MS = 1000;
const INTERACTIVE = 'button, a, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"], [tabindex]:not([tabindex="-1"]), [contenteditable]:not([contenteditable="false"])';

/** The toast a new one meets by uniqueID, and whether the new one is dropped (toastHost.tsx). */
export function findToastNamesake<T extends ToastEntry>(held: ReadonlyArray<T>, entry: ToastEntry): {namesake: T | undefined; isDropped: boolean} {
  const {uniqueID, collisionBehavior = 'overwrite'} = entry.options;
  const namesake = uniqueID ? held.find((c) => c.options.uniqueID === uniqueID) : undefined;
  return {namesake, isDropped: namesake != null && collisionBehavior === 'ignore'};
}

/** A toast context that holds toasts until a viewport's own context takes them (toastHost.tsx). */
export function createToastQueue(): ToastQueue {
  let viewport: ToastContextValue | null = null;
  let waiting: ToastEntry[] = [];
  return {
    context: {
      addToast(entry) {
        if (viewport) return viewport.addToast(entry);
        const {namesake, isDropped} = findToastNamesake(waiting, entry);
        if (isDropped) return;
        waiting = namesake == null ? [...waiting, entry] : waiting.map((c) => (c === namesake ? entry : c));
      },
      removeToast(id, reason) {
        if (viewport) return viewport.removeToast(id, reason);
        const entry = waiting.find((c) => c.id === id);
        if (!entry) return;
        waiting = waiting.filter((c) => c !== entry);
        entry.options.onHide?.(reason);
      },
      findByUniqueID(uniqueID) {
        return viewport ? viewport.findByUniqueID(uniqueID) : waiting.find((e) => e.options.uniqueID === uniqueID);
      },
    },
    connect(next) {
      viewport = next;
      if (!next) return;
      const entries = waiting;
      waiting = [];
      for (const entry of entries) next.addToast(entry);
    },
  };
}

const Base: typeof HTMLElement = typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement;

function define(tag: string, ctor: CustomElementConstructor) {
  if (typeof customElements === 'undefined' || customElements.get(tag)) return;
  customElements.define(tag, ctor);
}

function appendContent(parent: ParentNode, content: ToastContent, doc: Document) {
  if (content == null || content === '') return;
  if (typeof content === 'string') parent.append(doc.createTextNode(content));
  else if (content instanceof HTMLTemplateElement) parent.append(doc.importNode(content.content, true));
  else parent.append(content);
}

function textOf(content: ToastContent): string {
  if (content == null) return '';
  if (typeof content === 'string') return content.trim();
  if (content instanceof HTMLTemplateElement) return (content.content.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (content instanceof Element && content.isConnected) return renderedText(content);
  return (content.textContent ?? '').replace(/\s+/g, ' ').trim();
}

// ── MediaTheme mode="auto" (hooks/useAutoMediaMode.ts) ─────────────────────────
type RGBA = [number, number, number, number];
let probeCtx: CanvasRenderingContext2D | null | undefined;

/** Any CSS color → sRGB 0–255 (+ alpha 0–1), through a 1×1 canvas. */
function parseColor(value: string): RGBA | null {
  if (!value || value === 'transparent') return null;
  if (probeCtx === undefined) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    probeCtx = canvas.getContext('2d', {willReadFrequently: true});
  }
  const ctx = probeCtx;
  if (!ctx) return null;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = '#000';
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b, a / 255];
}

function luminance([r, g, b]: RGBA): number {
  const c = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}

function contrast(a: RGBA, b: RGBA): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

function over(top: RGBA, below: RGBA): RGBA {
  const a = top[3];
  return [top[0] * a + below[0] * (1 - a), top[1] * a + below[1] * (1 - a), top[2] * a + below[2] * (1 - a), 1];
}

/** The opaque color painted behind `el` (null when an image is involved). */
function backdropOf(el: Element): RGBA | null {
  const layers: RGBA[] = [];
  for (let node: Element | null = el; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.backgroundImage !== 'none') return null;
    const color = parseColor(style.backgroundColor);
    if (color && color[3] > 0) {
      layers.push(color);
      if (color[3] >= 1) break;
    }
  }
  const base = layers.pop();
  if (!base || base[3] < 1) return null;
  return layers.reduceRight((acc, layer) => over(layer, acc), base);
}

function pickMediaMode(surface: HTMLElement): 'dark' | 'light' | 'off' | null {
  const background = backdropOf(surface);
  if (!background) return null;
  const probe = document.createElement('span');
  probe.style.display = 'none';
  surface.appendChild(probe);
  const read = (token: string) => {
    probe.style.color = `var(${token})`;
    return parseColor(getComputedStyle(probe).color);
  };
  const ambient = read('--color-text-primary');
  const onDark = read('--color-on-dark');
  const onLight = read('--color-on-light');
  probe.remove();
  if (!onDark || !onLight) return null;
  if (ambient && contrast(ambient, background) >= 3) return 'off';
  return contrast(onDark, background) >= contrast(onLight, background) ? 'dark' : 'light';
}

// ── Page-wide state (shared by every copy of this module) ───────────────────────
interface ToastState {
  /** Connected viewports in connection order (the first connected one is the primary). */
  viewports: ToastViewportElement[];
  /** The queue `toast()` uses: it forwards to the primary viewport once one connects. */
  defaultQueue: ToastQueue;
  /** Toast ids (`astryx-toast-<n>`). */
  counter: number;
  fallbackScheduled: boolean;
  /** Connected cards, re-measured when the page theme changes. */
  liveToasts: Set<ToastElement>;
  themeWatch: boolean;
}
const shared: ToastState = globalSingleton('toast', () => ({
  viewports: [],
  defaultQueue: createToastQueue(),
  counter: 0,
  fallbackScheduled: false,
  liveToasts: new Set(),
  themeWatch: false,
}));
const {liveToasts, viewports, defaultQueue} = shared;

function watchTheme() {
  if (shared.themeWatch) return;
  shared.themeWatch = true;
  const remeasure = () => { for (const t of liveToasts) t.measureMedia(); };
  new MutationObserver(remeasure).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme', 'data-astryx-theme', 'class', 'style']});
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', remeasure);
}

// ── <ax-toast> ─────────────────────────────────────────────────────────────────
type PauseSource = 'pointer' | 'focus' | 'window' | 'hidden';

/**
 * One toast card (Astryx ToastSurface). Reads `data-type`, `data-ax-auto-hide`
 * ("true"/"false"; default true for info, false for error) and `data-ax-duration` (ms).
 * Dispatches `astryx-dismiss` `{reason: 'auto' | 'manual'}` (bubbles; Astryx `onDismiss`) when
 * its timer ends or its dismiss button is pressed. A card the viewport owns is then removed by
 * the viewport; a static card (Toast.astro) only reports it.
 */
export class ToastElement extends Base {
  #pause = new Set<PauseSource>();
  #timer: ReturnType<typeof setTimeout> | null = null;
  #remaining = DEFAULT_DURATION;
  #startedAt: number | null = null;
  #active = false;
  #dismissed = false;

  get type(): ToastType {
    return this.getAttribute('data-type') === 'error' ? 'error' : 'info';
  }

  get isAutoHide(): boolean {
    const value = this.getAttribute('data-ax-auto-hide');
    return value == null ? this.type !== 'error' : value !== 'false';
  }

  get autoHideDuration(): number {
    const value = Number(this.getAttribute('data-ax-duration'));
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_DURATION;
  }

  /** Whether a condition (pointer, focus, a blurred window, a hidden page) holds the timer. */
  get isPaused(): boolean {
    return this.#pause.size > 0;
  }

  connectedCallback(): void {
    liveToasts.add(this);
    watchTheme();
    this.measureMedia();
    // A move between modal outlets disconnects and reconnects the card: keep its timer.
    if (this.#active) return;
    this.#active = true;
    this.addEventListener('mouseenter', this);
    this.addEventListener('mouseleave', this);
    this.addEventListener('focusin', this);
    this.addEventListener('focusout', this);
    this.addEventListener('click', this);
    const view = this.ownerDocument.defaultView;
    view?.addEventListener('blur', this);
    view?.addEventListener('focus', this);
    this.ownerDocument.addEventListener('visibilitychange', this);
    this.restartTimer();
  }

  disconnectedCallback(): void {
    liveToasts.delete(this);
    queueMicrotask(() => {
      if (this.isConnected || !this.#active) return;
      this.#active = false;
      this.#clear();
      this.removeEventListener('mouseenter', this);
      this.removeEventListener('mouseleave', this);
      this.removeEventListener('focusin', this);
      this.removeEventListener('focusout', this);
      this.removeEventListener('click', this);
      const view = this.ownerDocument.defaultView;
      view?.removeEventListener('blur', this);
      view?.removeEventListener('focus', this);
      this.ownerDocument.removeEventListener('visibilitychange', this);
    });
  }

  /** Start the auto-hide timer over (mount, or a uniqueID overwrite updating the card). */
  restartTimer(): void {
    this.#dismissed = false;
    this.#remaining = this.autoHideDuration;
    this.#startedAt = null;
    // An update in place can remove the focused control, which fires no blur.
    if (this.#pause.has('focus') && !this.contains(this.ownerDocument.activeElement)) this.#pause.delete('focus');
    if (!this.ownerDocument.hasFocus()) this.#pause.add('window');
    else this.#pause.delete('window');
    if (this.ownerDocument.visibilityState === 'hidden') this.#pause.add('hidden');
    else this.#pause.delete('hidden');
    this.#start();
  }

  /** Report a dismissal (Astryx onDismiss). */
  dismiss(reason: ToastDismissReason = 'manual'): void {
    if (this.#dismissed) return;
    this.#dismissed = true;
    this.#clear();
    this.dispatchEvent(new CustomEvent('astryx-dismiss', {detail: {reason}, bubbles: true, composed: true}));
  }

  /** Re-pick `data-astryx-media` from the painted surface (MediaTheme mode="auto"). */
  measureMedia(): void {
    const media = this.querySelector<HTMLElement>(':scope > .ax-toast-media');
    if (!media || !this.isConnected) return;
    const mode = pickMediaMode(this);
    if (mode == null) return;
    if (mode === 'off') media.removeAttribute('data-astryx-media');
    else media.setAttribute('data-astryx-media', mode);
  }

  #clear() {
    if (this.#timer != null) clearTimeout(this.#timer);
    this.#timer = null;
  }

  #start() {
    if (!this.isAutoHide || this.#pause.size > 0 || this.#dismissed || !this.isConnected) return;
    this.#clear();
    this.#startedAt = Date.now();
    this.#timer = setTimeout(() => this.dismiss('auto'), this.#remaining);
  }

  #pauseFor(source: PauseSource) {
    const wasRunning = this.#pause.size === 0;
    this.#pause.add(source);
    if (!wasRunning) return;
    this.#clear();
    if (this.#startedAt != null) {
      this.#remaining = Math.max(this.#remaining - (Date.now() - this.#startedAt), MIN_REMAINING_MS);
      this.#startedAt = null;
    }
  }

  #resumeFor(source: PauseSource) {
    if (!this.#pause.delete(source)) return;
    if (this.#pause.has('focus') && !this.contains(this.ownerDocument.activeElement)) this.#pause.delete('focus');
    if (this.#pause.size > 0) return;
    this.#start();
  }

  handleEvent(event: Event): void {
    switch (event.type) {
      case 'mouseenter':
        this.#pauseFor('pointer');
        return;
      case 'mouseleave':
        this.#resumeFor('pointer');
        return;
      case 'focusin':
        this.#pauseFor('focus');
        return;
      case 'focusout': {
        // Focus moving between controls inside the card keeps it held.
        const next = (event as FocusEvent).relatedTarget;
        if (next instanceof Node && this.contains(next)) return;
        this.#resumeFor('focus');
        return;
      }
      case 'blur':
        if (event.target === this.ownerDocument.defaultView) this.#pauseFor('window');
        return;
      case 'focus':
        if (event.target === this.ownerDocument.defaultView) this.#resumeFor('window');
        return;
      case 'visibilitychange':
        if (this.ownerDocument.visibilityState === 'hidden') this.#pauseFor('hidden');
        else this.#resumeFor('hidden');
        return;
      case 'click': {
        const button = (event.target as Element | null)?.closest?.('[data-ax-toast-dismiss]');
        if (button && this.contains(button) && button.closest('ax-toast') === this) this.dismiss('manual');
        return;
      }
    }
  }
}

brandClass(ToastElement, 'toast-element');
define('ax-toast', ToastElement);

// ── The fallback card (no ToastViewport on the page: English, as Astryx without a provider) ──
// Mirrors the server output of _ToastCard.astro (IconButton ghost sm + the default close icon).
const CLOSE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em" aria-hidden="true"><path d="M6 6l12 12M6 18L18 6"></path></svg>';
const FALLBACK_TEMPLATE = `<ax-toast class="astryx-toast" data-type="info"><div class="ax-toast-media" data-astryx-media="dark"><div class="ax-toast-inner"><div class="ax-toast-content"></div><div class="ax-toast-end"><button type="button" data-ax-toast-dismiss="" data-variant="ghost" data-size="sm" data-elevation="none" class="astryx-button ax-focus-visible ax-overlay-image" data-ax-icon-only="" aria-label="Dismiss notification" data-astryx-edge-comp=""><span class="ax-button-content"><span class="ax-button-icon"><span aria-hidden="true" data-size="sm" data-color="inherit" class="astryx-icon">${CLOSE_SVG}</span></span></span><span role="status" aria-live="polite" class="ax-visually-hidden"></span></button></div></div></div></ax-toast>`;

// ── <ax-toast-viewport> ────────────────────────────────────────────────────────

function primaryViewport(): ToastViewportElement | null {
  return viewports.find((v) => v.isConnected) ?? null;
}

function connectDefaultQueue() {
  defaultQueue.connect(primaryViewport()?.context ?? null);
}

interface FocusNote {
  element: Element;
  container: Element;
}

/**
 * The toast stack (Astryx ToastViewport). Reads `data-position` (bottomEnd | bottomStart |
 * topEnd | topStart), `data-max-visible` (default 5; 0 shows all), `popover="manual"` (top
 * layer + modal re-hosting; without it the viewport renders in place), `data-ax-label` (the
 * region name), and its `<template data-ax-toast-template>` card.
 * API: `toast(options)` → dismiss function, `context` (addToast/removeToast/findByUniqueID),
 * `toasts` (current entries).
 */
export class ToastViewportElement extends Base {
  #template: HTMLTemplateElement | null = null;
  #home: Element | null = null;
  #toasts: ToastEntry[] = [];
  #exiting = new Set<string>();
  #rows = new Map<string, HTMLElement>();
  #pending = new Map<string, ToastEntry>();
  #unsubscribe: (() => void) | null = null;
  #moving = false;
  #initialized = false;
  #prevFocus: HTMLElement | null = null;
  #lastFocusedWithin: EventTarget | null = null;
  #keyListening = false;

  readonly context: ToastContextValue = {
    addToast: (entry) => this.#add(entry),
    removeToast: (id, reason) => this.#remove(id, reason),
    findByUniqueID: (uid) => this.#toasts.find((t) => t.options.uniqueID === uid),
  };

  get toasts(): ReadonlyArray<ToastEntry> {
    return this.#toasts;
  }

  get maxVisible(): number {
    const value = Number(this.getAttribute('data-max-visible') ?? 5);
    return Number.isFinite(value) && value >= 0 ? value : 5;
  }

  get isTopLayer(): boolean {
    return this.hasAttribute('popover');
  }

  get isReversed(): boolean {
    return (this.getAttribute('data-position') ?? '').startsWith('top');
  }

  /** Show a toast in this viewport; returns its dismiss function. */
  toast(options: ToastOptions): ToastDismissFn {
    const id = `astryx-toast-${++shared.counter}`;
    this.#add({id, options, createdAt: Date.now()});
    return () => this.#remove(id, 'manual');
  }

  connectedCallback(): void {
    if (this.#moving) return;
    if (!this.#initialized) {
      this.#initialized = true;
      const template = this.querySelector<HTMLTemplateElement>(':scope > template[data-ax-toast-template]');
      if (template) {
        this.#template = template;
        template.remove();
      }
      this.#home = this.parentElement;
      this.#pinInsets();
    }
    this.addEventListener('focusin', this);
    this.addEventListener('astryx-dismiss', this);
    if (!viewports.includes(this)) viewports.push(this);
    connectDefaultQueue();
    if (this.isTopLayer) {
      this.#unsubscribe?.();
      this.#unsubscribe = subscribeModalOutlets((change) => this.#place(change));
      this.#place('outlet');
    }
    this.#syncRegion();
  }

  disconnectedCallback(): void {
    if (this.#moving) return;
    const wasHosted = this.#home != null && this.parentNode !== this.#home && this.parentNode != null;
    queueMicrotask(() => {
      if (this.isConnected) return;
      // A modal holding the viewport left the document: go home with every toast intact.
      const home = this.#home;
      if (this.isTopLayer && wasHosted && home?.isConnected) {
        this.#moving = true;
        try {
          home.append(this);
        } finally {
          this.#moving = false;
        }
        this.#place('outlet');
        return;
      }
      this.removeEventListener('focusin', this);
      this.removeEventListener('astryx-dismiss', this);
      this.#unsubscribe?.();
      this.#unsubscribe = null;
      const at = viewports.indexOf(this);
      if (at !== -1) viewports.splice(at, 1);
      this.#setKeyListening(false);
      connectDefaultQueue();
    });
  }

  handleEvent(event: Event): void {
    if (event.type === 'astryx-dismiss') {
      const card = event.target as Element;
      const row = card.closest<HTMLElement>('[data-toast-id]');
      if (!row || !this.contains(row)) return;
      this.#remove(row.getAttribute('data-toast-id')!, (event as CustomEvent<{reason: ToastDismissReason}>).detail.reason);
    } else if (event.type === 'focusin') {
      // Focus entering from outside, however it came, is where focus returns once the last
      // toast it was in leaves.
      const from = (event as FocusEvent).relatedTarget;
      const fromWithin = from === this.#lastFocusedWithin || (from instanceof Node && this.contains(from));
      this.#lastFocusedWithin = event.target;
      if (from instanceof HTMLElement && !fromWithin) this.#prevFocus = from;
    } else if (event.type === 'keydown') {
      this.#onF6(event as KeyboardEvent);
    }
  }

  // ── Placement (modal outlets) ────────────────────────────────────────────

  /** Hold the app-level inset where it was declared, so a move into a dialog keeps it. */
  #pinInsets() {
    const style = getComputedStyle(this);
    for (const edge of ['block-start', 'block-end', 'inline-start', 'inline-end']) {
      const name = `--astryx-layer-inset-${edge}`;
      if (this.style.getPropertyValue(name)) continue;
      const value = style.getPropertyValue(name).trim();
      if (value) this.style.setProperty(name, value);
    }
  }

  #place(change: ModalOutletChange) {
    if (!this.isTopLayer) return;
    const parent = getActiveModalOutlet() ?? this.#home;
    if (!parent) return;
    const doc = this.ownerDocument;
    if (this.parentNode !== parent) {
      const active = doc.activeElement;
      const hadFocus = active instanceof HTMLElement && this.contains(active);
      this.#moving = true;
      try {
        parent.appendChild(this);
      } finally {
        this.#moving = false;
      }
      if (hadFocus) (active as HTMLElement).focus({preventScroll: true});
    }
    let showing = this.matches(':popover-open');
    if (showing && change === 'entry') {
      // A non-modal surface entered above: leave and re-enter the top layer in place.
      const active = doc.activeElement;
      const hadFocus = active instanceof HTMLElement && this.contains(active);
      try {
        this.hidePopover();
        showing = false;
      } catch {
        /* not showing */
      }
      if (showing) return;
      try {
        this.showPopover();
      } catch {
        /* already showing */
      }
      if (hadFocus) (active as HTMLElement).focus({preventScroll: true});
      return;
    }
    if (!showing) {
      try {
        this.showPopover();
      } catch {
        /* already showing */
      }
    }
  }

  // ── Queue (ToastViewport addToast / removeToast) ──────────────────────────

  #add(entry: ToastEntry) {
    const {namesake, isDropped} = findToastNamesake(this.#toasts, entry);
    if (isDropped) return;
    // Only text is announced; interactive endContent is reachable with F6. Routed into the
    // modal that hosts the viewport (or the topmost modal), else the page regions.
    const text = textOf(entry.options.body);
    if (text) announce(text, {politeness: entry.options.type === 'error' ? 'assertive' : 'polite', from: this});
    const keepsRow = namesake != null && !this.#exiting.has(namesake.id);
    const placed: ToastEntry = keepsRow ? {...entry, rowKey: namesake!.rowKey ?? namesake!.id} : entry;
    let focusNote: FocusNote | null = null;
    if (keepsRow) focusNote = this.#noteFocusWithin(this.#rows.get(placed.rowKey!) ?? null);
    const projected = namesake ? this.#toasts.map((t) => (t === namesake ? placed : t)) : [...this.#toasts, placed];
    const max = this.maxVisible;
    const firstVisible = max > 0 ? projected.length - max : 0;
    // A leaving toast pushed out of the window can no longer finish its exit on screen.
    const cut = new Set(projected.filter((t, i) => i < firstVisible && this.#exiting.has(t.id)).map((t) => t.id));
    for (const id of cut) {
      this.#exiting.delete(id);
      this.#pending.delete(id);
    }
    if (entry.options.uniqueID) {
      for (const [pid, p] of this.#pending) if (p.options.uniqueID === entry.options.uniqueID) this.#pending.delete(pid);
    }
    this.#pending.set(entry.id, placed);
    this.#toasts = projected.filter((t) => !cut.has(t.id));
    this.#render();
    if (focusNote) this.#handOff(focusNote, placed.id);
  }

  #remove(id: string, reason: ToastDismissReason) {
    if (this.#exiting.has(id)) return;
    const entry = this.#toasts.find((t) => t.id === id) ?? this.#pending.get(id);
    if (!entry) return;
    this.#exiting.add(id);
    entry.options.onHide?.(reason);
    const rowKey = entry.rowKey ?? entry.id;
    const isReplaced = !this.#toasts.some((t) => t.id === id);
    const row = isReplaced ? null : (this.#rows.get(rowKey) ?? null);
    const note = this.#noteFocusWithin(row);
    let nextFocus: string | 'restore' | null = null;
    if (note) {
      // The nearest toast after it, then before it, that shows once it is gone.
      const list = this.#toasts;
      const own = list.findIndex((t) => t.id === id);
      const remaining = list.filter((t) => t.id !== id);
      const max = this.maxVisible;
      const shown = new Set(max > 0 ? remaining.slice(-max) : remaining);
      const next = own < 0 ? undefined : (list.slice(own + 1).find((t) => shown.has(t)) ?? list.slice(0, own).reverse().find((t) => shown.has(t)));
      nextFocus = next ? next.id : 'restore';
    }
    const index = this.#toasts.findIndex((t) => t.id === id);
    const max = this.maxVisible;
    const isPushedOut = max > 0 && index >= 0 && index < this.#toasts.length - max;
    if (!row || isPushedOut) {
      // No row is mounted (hidden past maxVisible, or replaced): it leaves at once.
      this.#exiting.delete(id);
      this.#pending.delete(id);
      this.#toasts = this.#toasts.filter((t) => t.id !== id);
      this.#render();
      return;
    }
    const card = row.querySelector<HTMLElement>('ax-toast');
    row.setAttribute('data-ax-exiting', '');
    card?.setAttribute('data-ax-exiting', '');
    this.#waitForRow(row, () => {
      this.#exiting.delete(id);
      this.#pending.delete(id);
      this.#toasts = this.#toasts.filter((t) => t.id !== id);
      this.#render();
      if (note && nextFocus) this.#handOff(note, nextFocus === 'restore' ? null : nextFocus);
    });
  }

  #noteFocusWithin(container: Element | null): FocusNote | null {
    const active = this.ownerDocument.activeElement;
    return container && active && container.contains(active) ? {element: active, container} : null;
  }

  /** Focus a control in the target toast, else another shown toast (newest first), else
   *  the element focused before focus entered the viewport, else the viewport — never <body>. */
  #handOff(_note: FocusNote, targetId: string | null) {
    // moveFocusLeftBehind: only focus the removal (or an in-place update) actually lost.
    if (!isFocusDetached(this.ownerDocument)) return;
    const max = this.maxVisible;
    const shownIds = (max > 0 ? this.#toasts.slice(-max) : this.#toasts).map((t) => t.rowKey ?? t.id).reverse();
    const target = targetId == null ? null : (this.#toasts.find((t) => t.id === targetId) ?? null);
    const candidates = target ? [target.rowKey ?? target.id, ...shownIds.filter((k) => k !== (target.rowKey ?? target.id))] : [];
    let to: HTMLElement | null = null;
    for (const key of candidates) {
      to = this.#focusableIn(this.#rows.get(key) ?? null);
      if (to) break;
    }
    if (!to) {
      const prev = this.#prevFocus;
      if (prev && prev.isConnected) {
        to = prev;
        this.#prevFocus = null;
      } else {
        to = this;
      }
    }
    focusForLastInput(to, {preventScroll: true});
  }

  #focusableIn(container: Element | null): HTMLElement | null {
    if (!container) return null;
    for (const el of container.querySelectorAll<HTMLElement>(INTERACTIVE)) {
      if (el.getAttribute('tabindex') === '-1' || el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') continue;
      return el;
    }
    return null;
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  #render() {
    const max = this.maxVisible;
    const visible = max > 0 ? this.#toasts.slice(-max) : this.#toasts;
    const keep = new Set(visible.map((t) => t.rowKey ?? t.id));
    for (const [key, row] of this.#rows) {
      if (keep.has(key)) continue;
      row.remove();
      this.#rows.delete(key);
    }
    let previous: HTMLElement | null = null;
    for (const entry of visible) {
      const key = entry.rowKey ?? entry.id;
      let row = this.#rows.get(key);
      if (!row) {
        row = this.#createRow(entry);
        this.#rows.set(key, row);
      } else if (row.getAttribute('data-toast-id') !== entry.id) {
        this.#updateRow(row, entry);
      }
      const expected: ChildNode | null = previous ? previous.nextSibling : this.firstChild;
      if (expected !== row) this.insertBefore(row, expected);
      previous = row;
    }
    this.#syncRegion();
  }

  #syncRegion() {
    const has = this.#toasts.length > 0;
    if (has) {
      this.setAttribute('role', 'region');
      this.setAttribute('aria-label', this.getAttribute('data-ax-label') ?? 'Notifications');
      this.setAttribute('tabindex', '-1');
    } else {
      this.removeAttribute('role');
      this.removeAttribute('aria-label');
      this.removeAttribute('tabindex');
    }
    this.#setKeyListening(has);
  }

  #setKeyListening(on: boolean) {
    if (on === this.#keyListening) return;
    this.#keyListening = on;
    if (on) this.ownerDocument.addEventListener('keydown', this);
    else this.ownerDocument.removeEventListener('keydown', this);
  }

  /** F6 moves focus into the newest toast (first control, else the card, else the viewport). */
  #onF6(event: KeyboardEvent) {
    if (event.key !== 'F6' || this.#toasts.length === 0) return;
    const doc = this.ownerDocument;
    const active = doc.activeElement;
    if (active && this.contains(active)) return;
    event.preventDefault();
    if (active instanceof HTMLElement && active !== doc.body) this.#prevFocus = active;
    const rows = this.querySelectorAll<HTMLElement>('[data-toast-id]');
    const newest = rows[rows.length - 1] ?? null;
    const target = this.#focusableIn(newest) ?? newest?.querySelector<HTMLElement>('ax-toast') ?? this;
    if (!target.hasAttribute('tabindex') && target === newest?.querySelector('ax-toast')) target.setAttribute('tabindex', '-1');
    target.focus();
  }

  #card(): ToastElement {
    const doc = this.ownerDocument;
    let fragment: DocumentFragment;
    if (this.#template) fragment = doc.importNode(this.#template.content, true);
    else {
      const t = doc.createElement('template');
      t.innerHTML = FALLBACK_TEMPLATE;
      fragment = doc.importNode(t.content, true);
    }
    const card = fragment.querySelector('ax-toast') as ToastElement;
    return card;
  }

  #fillCard(card: HTMLElement, entry: ToastEntry) {
    const o = entry.options;
    const type: ToastType = o.type ?? 'info';
    const isAutoHide = o.isAutoHide ?? type !== 'error';
    const duration = o.autoHideDuration ?? DEFAULT_DURATION;
    const doc = this.ownerDocument;
    card.setAttribute('data-type', type);
    card.setAttribute('data-ax-auto-hide', String(isAutoHide));
    card.setAttribute('data-ax-duration', String(duration));
    // The viewport announces; the card carries no live region of its own.
    for (const a of ['role', 'aria-live', 'aria-atomic']) card.removeAttribute(a);
    const media = card.querySelector<HTMLElement>('.ax-toast-media');
    if (o.renderContent && media) {
      media.replaceChildren();
      const rendered = o.renderContent({
        body: o.body,
        endContent: o.endContent,
        type,
        isAutoHide,
        autoHideDuration: duration,
        dismiss: () => this.#remove(entry.id, 'manual'),
      });
      appendContent(media, rendered, doc);
      return;
    }
    const content = card.querySelector('.ax-toast-content');
    const end = card.querySelector('.ax-toast-end');
    if (content) {
      content.replaceChildren();
      appendContent(content, o.body, doc);
    }
    if (end) {
      for (const child of [...end.children]) if (!child.hasAttribute('data-ax-toast-dismiss')) child.remove();
      const holder = doc.createElement('template');
      appendContent(holder.content, o.endContent, doc);
      end.prepend(...holder.content.childNodes);
    }
  }

  #createRow(entry: ToastEntry): HTMLElement {
    const doc = this.ownerDocument;
    const row = doc.createElement('div');
    row.className = 'ax-toast-row';
    row.setAttribute('data-toast-id', entry.id);
    const inner = doc.createElement('div');
    inner.className = 'ax-toast-row-inner';
    const card = this.#card();
    this.#fillCard(card, entry);
    inner.append(card);
    row.append(inner);
    this.#watchEntry(row);
    return row;
  }

  /** A uniqueID overwrite: the card updates in place and its timer starts over. */
  #updateRow(row: HTMLElement, entry: ToastEntry) {
    row.setAttribute('data-toast-id', entry.id);
    const card = row.querySelector<ToastElement>('ax-toast');
    if (!card) return;
    this.#fillCard(card, entry);
    card.removeAttribute('data-ax-exiting');
    if (card instanceof ToastElement) {
      card.restartTimer();
      card.measureMedia();
    }
  }

  /** The row opens from a closed track once; a move must not open it again. */
  #watchEntry(row: HTMLElement) {
    const view = this.ownerDocument.defaultView ?? window;
    const settle = () => {
      row.setAttribute('data-ax-entered', '');
      row.setAttribute('data-ax-settled', '');
    };
    const onRun = (event: TransitionEvent) => {
      if (event.target !== row || event.propertyName !== 'grid-template-rows') return;
      row.setAttribute('data-ax-entered', '');
      if (event.type === 'transitioncancel') row.setAttribute('data-ax-settled', '');
    };
    const onEnd = (event: TransitionEvent) => {
      if (event.target !== row || event.propertyName !== 'grid-template-rows' || row.hasAttribute('data-ax-exiting')) return;
      settle();
    };
    row.addEventListener('transitionrun', onRun);
    row.addEventListener('transitioncancel', onRun);
    row.addEventListener('transitionend', onEnd);
    // No transition at all (0s durations): settle once it has rendered.
    view.setTimeout(() => {
      if (!row.hasAttribute('data-ax-settled') && row.isConnected) {
        const ms = transitionMs(row, 'grid-template-rows');
        view.setTimeout(() => { if (!row.hasAttribute('data-ax-exiting')) settle(); }, ms + 50);
      }
    }, 0);
  }

  #waitForRow(row: HTMLElement, done: () => void) {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      row.removeEventListener('transitionend', onEnd);
      done();
    };
    const onEnd = (event: TransitionEvent) => {
      if (event.target === row && event.propertyName === 'grid-template-rows') finish();
    };
    row.addEventListener('transitionend', onEnd);
    setTimeout(finish, transitionMs(row, 'grid-template-rows') + 50);
  }
}

function transitionMs(el: HTMLElement, property: string): number {
  const cs = getComputedStyle(el);
  const props = cs.transitionProperty.split(',').map((p) => p.trim());
  const parse = (v: string) => v.split(',').map((p) => {
    const t = p.trim();
    const n = Number.parseFloat(t);
    return !Number.isFinite(n) ? 0 : t.endsWith('ms') ? n : n * 1000;
  });
  const durations = parse(cs.transitionDuration);
  const delays = parse(cs.transitionDelay);
  let longest = 0;
  props.forEach((p, i) => {
    if (p === property || p === 'all') longest = Math.max(longest, durations[i % durations.length] + delays[i % delays.length]);
  });
  return longest;
}

brandClass(ToastViewportElement, 'toast-viewport-element');
define('ax-toast-viewport', ToastViewportElement);

// ── The global API (useToast) ──────────────────────────────────────────────────
function ensureFallbackViewport() {
  if (shared.fallbackScheduled || typeof document === 'undefined') return;
  shared.fallbackScheduled = true;
  queueMicrotask(() => {
    shared.fallbackScheduled = false;
    if (primaryViewport()) return connectDefaultQueue();
    if (import.meta.env?.DEV) console.warn('[astryx] toast(): no <ToastViewport> on the page; using a fallback viewport.');
    const home = document.createElement('div');
    home.className = 'ax-toast-home';
    home.setAttribute('data-astryx-toast-fallback', '');
    const viewport = document.createElement('ax-toast-viewport');
    viewport.className = 'ax-toast-viewport ax-overlay-root';
    viewport.setAttribute('popover', 'manual');
    viewport.setAttribute('data-astryx-layer-root', '');
    viewport.setAttribute('data-position', 'bottomEnd');
    viewport.setAttribute('data-max-visible', '5');
    home.append(viewport);
    document.body.append(home);
  });
}

/**
 * Show a toast (Astryx `useToast()`'s show function). Returns its dismiss function.
 * Goes to the page's first ToastViewport, else a fallback viewport created on demand.
 */
export function toast(options: ToastOptions): ToastDismissFn {
  const id = `astryx-toast-${++shared.counter}`;
  const ctx = defaultQueue.context;
  ctx.addToast({id, options, createdAt: Date.now()});
  if (!primaryViewport()) ensureFallbackViewport();
  return () => ctx.removeToast(id, 'manual');
}

/** The context `toast()` uses: forwards to the primary viewport once one is connected. */
export function getToastContext(): ToastContextValue {
  return defaultQueue.context;
}
