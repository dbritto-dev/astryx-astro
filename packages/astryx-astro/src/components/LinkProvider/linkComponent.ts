/**
 * The link-component seam — port of @astryxdesign/core Link/useLinkComponent.ts (resolution
 * order and the destination rule; the React SafeLink wrapper becomes the consumer's branch).
 *
 *   ---
 *   import {resolveLinkComponent, linkDestination} from '../LinkProvider/linkComponent';
 *   const Tag = resolveLinkComponent(Astro, as);          // `as` → LinkProvider → 'a'
 *   const dest = linkDestination(href, to);               // null = blocked: render inert
 *   ---
 *   {dest === null
 *     ? <a {...rest}><slot /></a>
 *     : Tag === 'a'
 *       ? <a {...rest} href={dest.href}><slot /></a>
 *       : <Tag {...rest} href={dest.href} to={dest.to}><slot /></Tag>}
 */
import {sanitizeUrl} from '../../lib/safeUrl';

/** An Astro component (or a tag name) that renders one anchor-like element. */
export type LinkComponentType = string | (((...args: any[]) => unknown) & {isAstroComponentFactory?: boolean});

/** The request / LinkProvider key the link consumers read. */
export const LINK_COMPONENT_LOCAL = 'astryxLinkComponent';

/** `as` → nearest LinkProvider (or middleware's `Astro.locals.astryxLinkComponent`) → `'a'`. */
export function resolveLinkComponent(astro: {locals?: object}, as?: LinkComponentType | null): LinkComponentType {
  if (as != null) return as;
  const fromLocals = (astro.locals as Record<string, unknown> | undefined)?.[LINK_COMPONENT_LOCAL];
  return (fromLocals as LinkComponentType | undefined) ?? 'a';
}

/**
 * Both destination props are checked before anything renders (Astryx createSafeLink): a
 * blocked `href` or `to` rejects the whole hand-off (`null`); otherwise a custom component
 * gets `to = to ?? href`.
 */
export function linkDestination(href: string | URL | null | undefined, to?: string | URL | null): {href: string | undefined; to: string | undefined} | null {
  // Inspected, not rewritten: the accepted value goes to the sink unchanged (Astryx isSafeDestination).
  const safe = (v: string | URL | null | undefined) => v == null || sanitizeUrl(String(v)) !== null;
  if (!safe(href) || !safe(to)) return null;
  const h = href == null ? undefined : String(href);
  return {href: h, to: to == null ? h : String(to)};
}
