/**
 * The adaptive presentation contract — Astryx `useAdaptivePresentation`
 * (@astryxdesign/core 0.7.9 hooks/useAdaptivePresentation.ts, Popover/Popover.tsx
 * `usePresentationSurface`, theme/themeAdaptations.ts `compactDefinition`).
 *
 * Vocabulary (the `presentation` prop of Popover, DropdownMenu (data `items`), Selector and
 * MultiSelector; ContextMenu, Tokenizer, PowerSearch later):
 *
 *   'popover'       the anchored surface (default)
 *   'bottom-sheet'  always the sheet
 *   'adaptive'      the sheet on a compact screen with a coarse primary pointer, the anchored
 *                   surface everywhere else
 *
 * The date pickers' vocabulary (utils/inputPresentation.ts `resolvePickerPresentation`, the
 * DateInput `presentation` prop) adds one adaptive value, resolved here too:
 *
 *   'adaptive-bottom-sheet'  the sheet under a coarse primary pointer (any size), else the
 *                            popover (`COARSE_POINTER_QUERY`)
 * (`native` / `adaptive-native` — the OS picker — are deferred; DateInput maps them to the
 * popover, or to `adaptive-bottom-sheet` in a non-Gregorian calendar, as Astryx does.)
 *
 * Compact has ONE definition (contract #26): narrower than the theme's `md` width point
 * (768px by default) or shorter than 500px — so a phone in either orientation is compact,
 * a tablet or a touch laptop is not. `COMPACT_TOUCH_QUERY` is that, ANDed with
 * `(pointer: coarse)`. The caller can always keep the fine-pointer surface: `'popover'` never
 * resolves to the sheet (contract #26), and a fixed presentation never reads the query.
 *
 * How an overlay adopts it (minimal DOM — one element, restyled; no second copy of the
 * content):
 *
 * 1. Server: render `data-ax-presentation="<prop>"` on the layer root and, for a fixed
 *    presentation, the resolved `data-ax-surface` (`popover` | `bottom-sheet`) plus the
 *    surface's theme class (`astryx-<component>` or `astryx-bottom-sheet`). `adaptive`
 *    renders the anchored surface; nothing paints until it opens.
 * 2. Client, as the layer opens (before its first frame: `beforetoggle`, or before
 *    `showModal()`): `resolvePresentation(prop, view)` → write `data-ax-surface`, swap the
 *    surface's theme class (a sheet is themed through the `bottom-sheet` target, as Astryx's
 *    "Touch sheet" anatomy says), force the sheet's semantics (role="dialog", aria-modal,
 *    a label: `label` else the trigger's text) and skip anchoring (no `anchor-name`, no rect
 *    positioner). The surface is chosen when the layer opens and kept until it closes:
 *    rotating a phone past the breakpoint while open keeps the sheet.
 * 3. CSS keys the sheet look on `[data-ax-surface="bottom-sheet"]`, never on the media query
 *    (so the latch holds): the layer root becomes the full-viewport press catcher (a tap
 *    beside or above the panel is a backdrop press), its `::backdrop` the scrim, the surface
 *    the panel (`astryx-bottom-sheet` styles from BottomSheet/BottomSheet.css: radius, border,
 *    reserve below the screen, safe-area inset, entry from below, no travel under reduced
 *    motion, drawn grab band).
 * 4. Behaviour while it is a sheet: `createSheetGestures()` (./gestures.ts) on the surface
 *    (swipe down dismisses, whatever light dismiss says), a backdrop press dismisses
 *    (start and end on the layer root), Escape follows the component's Escape setting, the
 *    page scroll is locked (`data-ax-scroll-lock` with the reflected `data-ax-open`), Tab is
 *    contained (aria-modal), toast hosts re-enter the top layer above it.
 * 5. Triggers keep `aria-haspopup="dialog"` while the sheet is the surface an opening would
 *    choose (`watchCompactTouch()` keeps closed adaptive triggers current).
 *
 * Shared implementation: `createSheetSurface()` (./surface.ts) runs steps 2–5 for a layer element
 * (Popover, DropdownMenu, Selector, MultiSelector, DateInput's picker); the generic sheet CSS is
 * components/BottomSheet/presentation.css (`.ax-sheet-layer` / `.ax-sheet-surface`).
 * Reference: elements/runtime/popover.ts (`<ax-popover>`).
 */

/** The one compact-touch definition at the default width points (Astryx COMPACT_TOUCH_QUERY). */
export const COMPACT_TOUCH_QUERY = '(width < 768px) and (pointer: coarse), (height < 500px) and (pointer: coarse)';
/** Compact alone (layout behaviours). */
export const COMPACT_QUERY = '(width < 768px), (height < 500px)';
/** A coarse primary pointer (the date pickers' `adaptive-bottom-sheet`, Astryx TOUCH_POINTER_QUERY). */
export const COARSE_POINTER_QUERY = '(pointer: coarse)';

export type AdaptivePresentation = 'popover' | 'bottom-sheet' | 'adaptive';
export type ResolvedPresentation = 'popover' | 'bottom-sheet';

export function isAdaptivePresentation(value: string | null | undefined): value is AdaptivePresentation {
  return value === 'popover' || value === 'bottom-sheet' || value === 'adaptive';
}

/** Whether a presentation can resolve to the sheet (renders the sheet-capable markup). */
export function canPresentSheet(presentation: string | null | undefined): boolean {
  return presentation === 'bottom-sheet' || adaptiveQuery(presentation) != null;
}

/** The media query an adaptive presentation follows (null for a fixed one). */
export function adaptiveQuery(presentation: string | null | undefined): string | null {
  if (presentation === 'adaptive') return COMPACT_TOUCH_QUERY;
  if (presentation === 'adaptive-bottom-sheet') return COARSE_POINTER_QUERY;
  return null;
}

/** Whether `view` is a compact screen with a coarse primary pointer now. */
export function isCompactTouch(view: Window | null | undefined = typeof window === 'undefined' ? null : window): boolean {
  return view?.matchMedia(COMPACT_TOUCH_QUERY).matches ?? false;
}

/** Resolve a presentation now. Only the adaptive values read their query. */
export function resolvePresentation(presentation: string | null | undefined, view?: Window | null): ResolvedPresentation {
  if (presentation === 'bottom-sheet') return 'bottom-sheet';
  if (presentation === 'adaptive') return isCompactTouch(view) ? 'bottom-sheet' : 'popover';
  if (presentation === 'adaptive-bottom-sheet') {
    const v = view === undefined ? (typeof window === 'undefined' ? null : window) : view;
    return v?.matchMedia(COARSE_POINTER_QUERY).matches ? 'bottom-sheet' : 'popover';
  }
  return 'popover';
}

/**
 * Call `listener` whenever the compact-touch answer changes in `view`. One MediaQueryList
 * listener per call; adaptive components share one (subscribe once per module).
 */
export function watchCompactTouch(view: Window | null | undefined, listener: (isCompactTouch: boolean) => void): () => void {
  return watchQuery(view, COMPACT_TOUCH_QUERY, listener);
}

/** `watchCompactTouch` for any query (an adaptive presentation's `adaptiveQuery()`). */
export function watchQuery(view: Window | null | undefined, query: string, listener: (matches: boolean) => void): () => void {
  if (!view) return () => {};
  const list = view.matchMedia(query);
  const onChange = () => listener(list.matches);
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}
