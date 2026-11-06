/**
 * Server-side context of the SideNav family. Ports @astryxdesign/core
 * SideNav/SideNavCollapseContext.ts (isCollapsible + the initial isCollapsed), the private
 * SideNavItemDepthContext of SideNavItem.tsx, and the flyout's EXPANDED_COLLAPSE_STATE, as
 * subtree locals.
 *
 * Collapsing happens in the browser (elements/side-nav.ts), so a collapsible SideNav renders both
 * presentations of the parts that change shape — CSS keyed on the nav's `data-ax-collapsed`
 * shows one: rail-kept leaves reuse their control (icon only, the label in a tooltip); a parent
 * or a row with actions renders its rail button separately (a parent's opens a flyout listing
 * its children); a heading renders its icon-only form. Rows without an icon, and nested rows,
 * leave the rail.
 */
export const SIDE_NAV_LOCAL = 'astryxSideNav';
export const SIDE_NAV_DEPTH_LOCAL = 'astryxSideNavDepth';

export interface SideNavContextValue {
  /** The nav can collapse to the rail (both presentations render). */
  isCollapsible: boolean;
  /** Initial state (server render). */
  isCollapsed: boolean;
}

type Locals = Record<string, unknown>;

export const NOT_COLLAPSIBLE: SideNavContextValue = {isCollapsible: false, isCollapsed: false};

export function sideNavContext(astro: {locals?: object}): SideNavContextValue {
  return ((astro.locals as Locals | undefined)?.[SIDE_NAV_LOCAL] as SideNavContextValue | undefined) ?? NOT_COLLAPSIBLE;
}

export function sideNavDepth(astro: {locals?: object}): number {
  return ((astro.locals as Locals | undefined)?.[SIDE_NAV_DEPTH_LOCAL] as number | undefined) ?? 0;
}

/** Storage key of a SideNav's collapse state (`resizable.autoSaveId`). */
export const SIDE_NAV_STORAGE_PREFIX = 'astryx-side-nav:';

/** SideNav's footer icon rows and SideNavItem's actions cascade this control size (SizeProvider). */
export const FOOTER_ICON_SIZE = 'sm';
export const ROW_CONTROL_SIZE = 'sm';
