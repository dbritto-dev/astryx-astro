/**
 * TabListContext (Astryx TabList/TabListContext.ts) as a subtree-scoped `Astro.locals` key
 * (lib/subtreeLocals.ts): TabList renders its children with `renderWithLocals()`, so every
 * Tab / TabMenu inside reads the strip's value, layout and resolved ARIA pattern, and nothing
 * outside does. Size is not part of it: the strip publishes it as CSS custom properties
 * (`--_ax-tab-height`, `--_ax-tab-icon-size`) so a size provider that restamps the TabList
 * root's `data-size` (cascade key `size`) resizes every tab without touching them.
 * Layer-scoped (`layerScopedLocal()`): overlays inside the strip render their content without it.
 */
import {layerScopedLocal} from '../../lib/subtreeLocals';

export type TabListSize = 'sm' | 'md' | 'lg';
export type TabListLayout = 'hug' | 'fill';
/**
 * - `'nav'`: a navigation landmark of links or buttons, the current item marked with
 *   `aria-current`.
 * - `'tabs'`: the WAI-ARIA tabs pattern — `role="tablist"` / `role="tab"`, `aria-selected`,
 *   and `aria-controls` for the panel each tab owns.
 */
export type TabListPattern = 'nav' | 'tabs';

export interface TabListContextValue {
  value: string;
  layout: TabListLayout;
  pattern: TabListPattern;
}

export const TAB_LIST_LOCAL = layerScopedLocal('astryxTabList');

export function readTabListContext(astro: {locals?: object}): TabListContextValue | null {
  const value = (astro.locals as Record<string, unknown> | undefined)?.[TAB_LIST_LOCAL];
  return (value as TabListContextValue | undefined) ?? null;
}

/** Selector matching the strip's focusable stops: every Tab and every TabMenu trigger. */
export const TAB_STOP_SELECTOR = '[data-tab-value],[data-tab-menu]';
