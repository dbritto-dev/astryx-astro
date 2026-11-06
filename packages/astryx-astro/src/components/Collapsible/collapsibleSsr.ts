/**
 * Server helpers for Collapsible / CollapsibleGroup (no client code).
 *
 * - `uid()` stands in for React's useId: a per-request counter on `Astro.locals`, so ids are
 *   unique on the page and the markup stays deterministic for a given page.
 * - `stampGroupState()` is CollapsibleGroupContext's `isOpen(value)` for SSR: items that carry
 *   a `value` opt in on their root with `data-ax-inherit="collapsible-group"`; the nearest
 *   group (inner groups render first and consume the marker) writes the open state onto the
 *   item's own trigger (`aria-expanded`, `data-open`) and content (`data-open`, `hidden`).
 *   It walks the slot HTML itself because the state lands on the item's children, which
 *   lib/cascade.ts `stamp()` (attributes of the marked element only) cannot reach.
 * Presentation (density, dividers, chevron position) uses `stamp()` from lib/cascade.ts.
 */
import {ELEMENT_NODE, parse, render, walk, type ElementNode} from 'ultrahtml';

const ATTR = 'data-ax-inherit';

/** Logical position of the disclosure chevron (CollapsibleGroupContext.tsx). */
export type CollapsibleChevronPosition = 'start' | 'end';
/** Row density of a group's items (repo-wide density vocabulary). */
export type CollapsibleGroupDensity = 'compact' | 'balanced' | 'spacious';

/** Cascade keys (lib/cascade.ts) introduced by Collapsible. */
export const GROUP_KEY = 'collapsible-group';
export const DENSITY_KEY = 'collapsible-density';
export const DIVIDED_KEY = 'collapsible-divided';
export const CHEVRON_KEY = 'collapsible-chevron-position';

export {uid} from '../../lib/uid';

const hasClass = (node: ElementNode, name: string) => ` ${node.attributes.class ?? ''} `.includes(` ${name} `);

/** Write the group's open set onto the enrolled items (nearest group wins). */
export async function stampGroupState(html: string, openValues: readonly string[]): Promise<string> {
  if (!html || !html.includes(GROUP_KEY)) return html;
  const ast = parse(html);
  await walk(ast, (node) => {
    if (node.type !== ELEMENT_NODE) return;
    const el = node as ElementNode;
    const marker = el.attributes[ATTR];
    if (!marker) return;
    const keys = marker.split(/\s+/);
    if (!keys.includes(GROUP_KEY)) return;
    const remaining = keys.filter((k) => k !== GROUP_KEY);
    if (remaining.length) el.attributes[ATTR] = remaining.join(' ');
    else delete el.attributes[ATTR];

    const isOpen = openValues.includes(el.attributes['data-value']);
    const children = (el.children ?? []).filter((c): c is ElementNode => c.type === ELEMENT_NODE);
    const trigger = children.find((c) => hasClass(c, 'astryx-collapsible-trigger'));
    const content = children.find((c) => hasClass(c, 'astryx-collapsible-content'));
    const isDisabled = trigger?.attributes['aria-disabled'] === 'true';
    for (const part of [trigger, content]) {
      if (!part) continue;
      if (isOpen) part.attributes['data-open'] = 'open';
      else delete part.attributes['data-open'];
    }
    if (trigger) trigger.attributes['aria-expanded'] = String(isOpen);
    if (content) {
      if (isOpen) delete content.attributes.hidden;
      else content.attributes.hidden = isDisabled ? '' : 'until-found';
    }
  });
  return render(ast);
}

/** CollapsibleGroup `normalizeToArray`. */
export function normalizeToArray(value: string | string[] | undefined | null): string[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}
