/**
 * `createSheetSurface()` — steps 2–5 of the presentation contract (./presentation.ts) for one
 * layer element: Popover, DropdownMenu, Selector / MultiSelector and DateInput's picker restyle
 * their one layer as a bottom sheet through it (Astryx useAdaptivePresentation +
 * Popover.tsx usePresentationSurface + the BottomSheet each component's sheet path renders).
 *
 * The host calls, from its LayerElement hooks:
 *   latch()        the first hook of every open (`show()` and `resolveAnchor()`: a native
 *                  invoker's open reaches only the latter) — resolves the surface, writes
 *                  `data-ax-surface`, swaps the surface's theme class (`anchoredClass` ↔
 *                  `astryx-bottom-sheet`), gives a sheet its modal-dialog semantics (role,
 *                  aria-modal, aria-label: `data-ax-sheet-label` on the layer, else
 *                  `label()`), the scroll lock and the reserve, and the triggers'
 *                  `aria-haspopup`. A `popover` presentation never touches anything.
 *   isSheet        while latched as the sheet: skip anchoring (return no anchor), take Escape
 *                  per component, answer outside presses with 'ignore' (the layer covers the
 *                  viewport: `start()` dismisses on a press beside the panel instead)
 *   start()        didOpen of a sheet: the drag gestures (swipe down dismisses), the
 *                  backdrop press, toast hosts re-entering the top layer
 *   stop()         willClose (and disconnect)
 *   closed()       didClose: unlatch (the markup stays latched through the exit) and bring
 *                  closed adaptive triggers up to date
 *   connect() / disconnect()   adaptive presentations follow their query while closed (one
 *                  MediaQueryList listener per query for every host)
 */
import {notifyTopLayerEntry} from '../runtime/modalOutlet';
import {createSheetGestures, type SheetGestures} from './gestures';
import {adaptiveQuery, resolvePresentation, watchQuery, type ResolvedPresentation} from './presentation';
import {globalSingleton} from '../runtime/global';

const MIN_RESERVE = 48;
const SHEET_CLASS = 'astryx-bottom-sheet';

export interface SheetSurfaceOptions {
  /** The layer root (a popover element). */
  layer: HTMLElement & {readonly isOpen: boolean; hide(reason?: string): void};
  /** The painted surface (the panel while it is a sheet). */
  surface: () => HTMLElement | null;
  /** The surface's anchored theme class(es), space-separated (`astryx-popover`). */
  anchoredClass: string;
  /** The controls whose `aria-haspopup` follows the surface. */
  triggers: () => HTMLElement[];
  /** `aria-haspopup` for the anchored surface (`dialog`, `menu`, `listbox`, `true`), given the
   *  surface's server-rendered role. */
  anchoredHaspopup: (anchoredRole: string | null) => string;
  /** The sheet's name when the layer has no `data-ax-sheet-label`. @default the first trigger's text */
  label?: () => string;
  /** The grab handle (the drag's handle). @default `:scope > .ax-sheet-handle` of the surface */
  handle?: () => HTMLElement | null;
  /** After a latch restyled the surface (component theme attributes). */
  onLatch?: (mode: ResolvedPresentation) => void;
}

export interface SheetSurface {
  /** The `presentation` prop (`data-ax-presentation`, `popover` when absent). */
  readonly presentation: string;
  /** The surface this opening uses (or would use now, while closed). */
  readonly mode: ResolvedPresentation;
  /** Latched as the sheet for the current opening. */
  readonly isSheet: boolean;
  latch(): void;
  start(): void;
  stop(): void;
  closed(): void;
  syncClosedTriggers(): void;
  connect(): void;
  disconnect(): void;
}

/** Hosts following each adaptive query, and that query's one listener (page-wide). */
const watchers = globalSingleton('sheet-query-watchers', () => new Map<string, {hosts: Set<SheetSurface>; stop: () => void}>());

function triggerText(trigger: HTMLElement | undefined): string {
  return trigger?.getAttribute('aria-label')?.trim() || trigger?.textContent?.trim() || '';
}

export function createSheetSurface(options: SheetSurfaceOptions): SheetSurface {
  const {layer} = options;
  const view = () => layer.ownerDocument.defaultView;
  let latched: ResolvedPresentation | null = null;
  let original: {role: string | null; modal: string | null; label: string | null; tabindex: string | null} | null = null;
  let gestures: SheetGestures | null = null;
  const cleanup: Array<() => void> = [];

  const reserve = () => {
    const v = view() ?? window;
    return v.matchMedia('(any-pointer: coarse)').matches ? Math.max(MIN_RESERVE, Math.ceil(v.innerHeight * 0.4)) : MIN_RESERVE;
  };
  const presentation = () => layer.getAttribute('data-ax-presentation') ?? 'popover';
  const haspopup = (isSheet: boolean) => (isSheet ? 'dialog' : options.anchoredHaspopup(original ? original.role : (options.surface()?.getAttribute('role') ?? null)));

  const api: SheetSurface = {
    get presentation() { return presentation(); },
    get mode() { return latched ?? resolvePresentation(presentation(), view()); },
    get isSheet() { return latched === 'bottom-sheet'; },

    latch() {
      if (latched && layer.isOpen) return;
      const surface = options.surface();
      if (!surface) return;
      if (original === null) {
        original = {role: surface.getAttribute('role'), modal: surface.getAttribute('aria-modal'), label: surface.getAttribute('aria-label'), tabindex: surface.getAttribute('tabindex')};
      }
      const mode = resolvePresentation(presentation(), view());
      latched = mode;
      if (presentation() === 'popover') return;
      layer.setAttribute('data-ax-surface', mode);
      const isSheet = mode === 'bottom-sheet';
      surface.classList.toggle(SHEET_CLASS, isSheet);
      for (const name of options.anchoredClass.split(/\s+/).filter(Boolean)) surface.classList.toggle(name, !isSheet);
      layer.toggleAttribute('data-ax-scroll-lock', isSheet);
      const set = (name: string, value: string | null) => (value == null ? surface.removeAttribute(name) : surface.setAttribute(name, value));
      if (isSheet) {
        set('role', 'dialog');
        set('aria-modal', 'true');
        set('aria-label', layer.getAttribute('data-ax-sheet-label') || (options.label ? options.label() : triggerText(options.triggers()[0])) || null);
        surface.tabIndex = -1;
        surface.style.setProperty('--_sheet-reserve', `${reserve()}px`);
        layer.style.removeProperty('--_sheet-scrim-opacity');
      } else {
        const o = original;
        set('role', o?.role ?? null);
        set('aria-modal', o?.modal ?? null);
        set('aria-label', o?.label ?? null);
        set('tabindex', o?.tabindex ?? null);
      }
      for (const t of options.triggers()) t.setAttribute('aria-haspopup', haspopup(isSheet));
      options.onLatch?.(mode);
    },

    start() {
      api.stop();
      const surface = options.surface();
      if (!surface) return;
      if (!gestures) {
        gestures = createSheetGestures({
          panel: surface,
          handle: options.handle ? options.handle() : surface.querySelector<HTMLElement>(':scope > .ax-sheet-handle'),
          body: surface,
          // A sheet always light-dismisses (a swipe down), whatever the anchored surface does.
          canDismiss: () => true,
          reserve,
          onDismiss: () => layer.hide('outside'),
          onScrimOpacity: (opacity) => layer.style.setProperty('--_sheet-scrim-opacity', String(opacity)),
        });
      }
      gestures.reset();
      gestures.attach();
      // A press that starts and ends on the layer itself (beside or above the panel).
      let started = false;
      const onDown = (e: Event) => { started = e.target === layer; };
      const onUp = (e: Event) => {
        const ended = started && e.target === layer;
        started = false;
        if (ended) queueMicrotask(() => { if (layer.isOpen && api.isSheet) layer.hide('outside'); });
      };
      const onCancel = () => { started = false; };
      layer.addEventListener('pointerdown', onDown);
      layer.addEventListener('pointerup', onUp);
      layer.addEventListener('pointercancel', onCancel);
      cleanup.push(() => {
        layer.removeEventListener('pointerdown', onDown);
        layer.removeEventListener('pointerup', onUp);
        layer.removeEventListener('pointercancel', onCancel);
      });
      // Toast hosts re-enter the top layer above the sheet (it is a top-layer surface).
      notifyTopLayerEntry();
    },

    stop() {
      for (const fn of cleanup.splice(0)) fn();
      if (gestures) {
        gestures.detach();
        // The panel leaves from where it rests: its CSS exit pose takes over.
        gestures.release();
      }
      layer.style.removeProperty('--_sheet-scrim-opacity');
    },

    closed() {
      latched = null;
      api.syncClosedTriggers();
    },

    syncClosedTriggers() {
      if (layer.isOpen || adaptiveQuery(presentation()) == null) return;
      const isSheet = resolvePresentation(presentation(), view()) === 'bottom-sheet';
      for (const t of options.triggers()) t.setAttribute('aria-haspopup', haspopup(isSheet));
    },

    connect() {
      const query = adaptiveQuery(presentation());
      if (query == null) return;
      let entry = watchers.get(query);
      if (!entry) {
        const hosts = new Set<SheetSurface>();
        entry = {hosts, stop: watchQuery(view(), query, () => { for (const h of hosts) h.syncClosedTriggers(); })};
        watchers.set(query, entry);
      }
      entry.hosts.add(api);
      queueMicrotask(() => api.syncClosedTriggers());
    },

    disconnect() {
      api.stop();
      for (const [query, entry] of watchers) {
        if (!entry.hosts.delete(api) || entry.hosts.size > 0) continue;
        entry.stop();
        watchers.delete(query);
      }
    },
  };
  return api;
}
