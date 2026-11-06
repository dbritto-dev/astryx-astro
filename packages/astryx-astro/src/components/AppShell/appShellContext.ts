/**
 * The AppShell mobile contract — port of @astryxdesign/core AppShell/AppShellMobileContext.tsx,
 * AppShell/useCloseMobileDrawerOnActivate.ts, SideNav/SideNavRenderContext.ts and
 * TopNav/TopNavRenderContext.ts / TopNavMobileContentContext.ts.
 *
 * React context becomes subtree locals (lib/subtreeLocals.ts) on the server and an attribute +
 * event contract in the browser:
 *
 *  - `astryxAppShell` (AppShell → everything inside it): the drawer id the toggle's
 *    `aria-controls` / `commandfor` point at, whether a mobile drawer exists, whether auto
 *    toggles render. MobileNavToggle renders nothing outside an AppShell (Astryx: not mobile).
 *  - `astryxSideNavMode` / `astryxTopNavMode` (AppShell → the nav slot it renders): which
 *    presentation a SideNav / TopNav renders. AppShell renders its nav slots once per
 *    presentation (the inline rail, the phone top bar, the drawer); CSS shows the one the
 *    breakpoint calls for, so `main` is never re-rendered or moved.
 *  - `astryxTopNavMobileContent`: the SideNav's drawer-content HTML a TopNav drawer appends.
 *
 * Browser: `<ax-app-shell>` writes `data-astryx-shell-mobile="true|false"` on `.astryx-app-shell`
 * (below the breakpoint: `(width < Npx)`), mirrors `data-mode` onto the nav roots it shows, and
 * dispatches `astryx-mobile-change` {isMobile}. Rows in the drawer carry `data-ax-navigate`; the
 * MobileNav turns their activation into a bubbling `astryx-navigate` {href, event} and closes on
 * any `astryx-navigate` that reaches it.
 */
export const APP_SHELL_LOCAL = 'astryxAppShell';
export const SIDE_NAV_MODE_LOCAL = 'astryxSideNavMode';
export const TOP_NAV_MODE_LOCAL = 'astryxTopNavMode';
export const TOP_NAV_MOBILE_CONTENT_LOCAL = 'astryxTopNavMobileContent';
/** Set while AppShell renders the slot that holds its drawer: that MobileNav takes the shell's id. */
export const SHELL_DRAWER_LOCAL = 'astryxAppShellDrawer';
/** Set by every MobileNav around its content: rows there close the drawer when they act. */
export const IN_MOBILE_NAV_LOCAL = 'astryxInMobileNav';

export type SideNavRenderMode = 'default' | 'topbar' | 'drawer' | 'drawer-content';
export type TopNavRenderMode = 'default' | 'mobile-bar' | 'drawer';

export interface AppShellContextValue {
  /** Id of the shell's mobile drawer (the `<dialog>`). */
  mobileNavId: string;
  /** A drawer the auto toggle opens exists (not disabled, not a custom drawer, nav content present). */
  isMobileNavEnabled: boolean;
  /** Auto-placed toggles render (false with `mobileNav={{hasToggle: false}}`). */
  hasAutoToggle: boolean;
  /** Whether the shell server-renders mobile (`defaultIsMobile`). */
  isMobile: boolean;
}

/** Astryx DEFAULT_WIDTH_BREAKPOINTS (theme/themeAdaptations.ts). */
export const DEFAULT_WIDTH_BREAKPOINTS = {sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536} as const;
export type WidthBreakpointName = keyof typeof DEFAULT_WIDTH_BREAKPOINTS;
export type AppShellBreakpoint = WidthBreakpointName | 'none';

type Locals = Record<string, unknown>;
const locals = (astro: {locals?: object}) => (astro.locals ?? {}) as Locals;

export function appShellContext(astro: {locals?: object}): AppShellContextValue | null {
  return (locals(astro)[APP_SHELL_LOCAL] as AppShellContextValue | undefined) ?? null;
}

export function sideNavMode(astro: {locals?: object}): SideNavRenderMode {
  return (locals(astro)[SIDE_NAV_MODE_LOCAL] as SideNavRenderMode | undefined) ?? 'default';
}

export function topNavMode(astro: {locals?: object}): TopNavRenderMode {
  return (locals(astro)[TOP_NAV_MODE_LOCAL] as TopNavRenderMode | undefined) ?? 'default';
}

/** Whether a MobileNav rendering now is the shell's own drawer (it takes `mobileNavId`). */
export function isShellDrawer(astro: {locals?: object}): boolean {
  return locals(astro)[SHELL_DRAWER_LOCAL] === true;
}

/** useIsInAppShellMobileDrawer: rows here close the drawer when they act. */
export function isInMobileDrawer(astro: {locals?: object}): boolean {
  const side = sideNavMode(astro);
  return locals(astro)[IN_MOBILE_NAV_LOCAL] === true || topNavMode(astro) === 'drawer' || side === 'drawer' || side === 'drawer-content';
}
