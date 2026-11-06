/**
 * The link seam shared by Link, Button (href), IconButton and Token (href).
 * Ports @astryxdesign/core Link/useLinkComponent.ts, Link/LinkProvider.tsx,
 * Link/computeTargetAndRel.ts and hooks/useInteractiveRole.ts.
 *
 * Link component resolution, first match wins (Astryx: `as` → LinkProvider → 'a'):
 *   1. the component's `as` prop (an Astro component or a tag name);
 *   2. `Astro.locals.astryxLinkComponent` — the LinkProvider equivalent. Astro has no
 *      subtree context, so the provider is request-global (set it in middleware):
 *        export const onRequest = (ctx, next) => { ctx.locals.astryxLinkComponent = MyLink; return next(); };
 *   3. a native `<a>`.
 * A custom component receives the checked `href` plus every attribute the native anchor
 * would get, and must spread them onto an `<a>`. Astryx also hands React routers `to`;
 * Astro routers navigate plain anchors, so `to` is not passed.
 *
 * Every destination goes through `safeHref()` (lib/safeUrl.ts). A rejected destination
 * renders a plain `<a>` without `href` — inert, not disabled — and never reaches a custom
 * component (Astryx SafeLink).
 */
export type LinkComponentType = string | ((...args: any[]) => unknown);

interface AstroLike {
  locals?: Record<string, unknown>;
}

export function resolveLinkComponent(as: LinkComponentType | undefined, astro?: AstroLike): LinkComponentType {
  return as ?? (astro?.locals?.astryxLinkComponent as LinkComponentType | undefined) ?? 'a';
}

const BLANK_TARGET_REL_TOKENS = ['noopener', 'noreferrer'] as const;

/** `target="_blank"` always carries `noopener noreferrer` (merged into the caller's rel). */
export function computeTargetAndRel(
  target: string | undefined,
  rel: string | undefined,
): {target: string | undefined; rel: string | undefined} {
  if (target !== '_blank') return {target, rel};
  const tokens = rel?.split(/\s+/).filter(Boolean) ?? [];
  for (const token of BLANK_TARGET_REL_TOKENS) if (!tokens.includes(token)) tokens.push(token);
  return {target, rel: tokens.join(' ')};
}

/**
 * Astryx useInteractiveRole. React decides "button" from an `onClick` prop or an
 * InteractiveRoleContext (Popover/DropdownMenu triggers); Astro has neither, so callers
 * pass `interactiveRole="button"` instead.
 *   href (and not disabled) → 'link'; interactiveRole 'button' → 'button'; else 'inert'.
 */
export type InteractiveRole = 'link' | 'button' | 'inert';

export function interactiveRole(options: {href?: unknown; isDisabled?: boolean; role?: 'button'}): InteractiveRole {
  if (options.href != null && !options.isDisabled) return 'link';
  if (options.role === 'button') return 'button';
  return 'inert';
}
