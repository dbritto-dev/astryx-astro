/**
 * Server-side context of the TopNav family. Port of @astryxdesign/core TopNav/TopNavContext.ts
 * (TopNavSlotContext: the slot an item renders in, which aligns its menu) as subtree locals,
 * plus the nav root's id (TopNavMegaMenu anchors its panel to the whole bar, Astryx
 * `closest('nav')`). The render mode comes from AppShell (AppShell/appShellContext.ts).
 */
export type TopNavSlot = 'start' | 'center' | 'end';

export const TOP_NAV_SLOT_LOCAL = 'astryxTopNavSlot';
export const TOP_NAV_ID_LOCAL = 'astryxTopNavId';

type Locals = Record<string, unknown>;

export function topNavSlot(astro: {locals?: object}): TopNavSlot {
  return ((astro.locals as Locals | undefined)?.[TOP_NAV_SLOT_LOCAL] as TopNavSlot | undefined) ?? 'start';
}

export function topNavId(astro: {locals?: object}): string | undefined {
  return (astro.locals as Locals | undefined)?.[TOP_NAV_ID_LOCAL] as string | undefined;
}

/** A label-derived id fragment (DrawerMegaMenu `mega-menu-<label>`), kept unique by uid(). */
export function slugify(label: string): string {
  return label.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '') || 'menu';
}
