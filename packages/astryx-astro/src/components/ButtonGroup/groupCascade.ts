/**
 * ButtonGroup's and Toolbar's context replacements (lib/cascade.ts semantics), with the
 * boundary Astryx gives every group context: layer-scoped contexts (createLayerScopedContext,
 * contract #23 "all of them end at layer boundaries") do not reach into a layer rendered
 * inside the group — a member's Tooltip, a Popover's own fallback-close Button.
 *
 * `stampOutsideLayers(html, map)` is `stamp(html, map)` that never enters an element carrying
 * `data-astryx-layer-root` (overlays already `seal()` their slot content; this also covers the
 * Buttons a layer component renders itself). Appliers receive the ultrahtml node, so they can
 * also change the tag (a group-disabled link member becomes a `<button>`).
 *
 * `groupMemberStamper({orientation, isDisabled})` is ButtonGroupContext for Button
 * (Button.tsx `useButtonGroup()`), stamped on every Button root (cascade key `button-group`):
 *  - `data-ax-group="<orientation>"`: connected geometry (Button.css groupStyles), no press
 *    scale, and the group owns the elevation, so the member reflects `data-elevation="none"`;
 *  - group-disabled (`isTrueDisabled`): `data-ax-disabled` (50% opacity); native `disabled`, or
 *    `aria-disabled="true"` + `data-ax-disabled-interaction` for a tooltip trigger (it must
 *    stay hoverable/focusable); a busy-only member's own aria-disabled gives way to native
 *    `disabled`; a link member renders `<button type="button">` (disabled links are an
 *    anti-pattern: Button's `renderAsLink = href != null && !isTrueDisabled`).
 */
import {ELEMENT_NODE, parse, render, type ElementNode} from 'ultrahtml';

const ATTR = 'data-ax-inherit';
const LAYER_ROOT = 'data-astryx-layer-root';

type Attrs = Record<string, string>;
export type NodeApply = ((attrs: Attrs, node: ElementNode) => void) | null;

/** `stamp()` (lib/cascade.ts) that stops at layer roots. `null` appliers consume the key. */
export async function stampOutsideLayers(html: string, map: Record<string, NodeApply>): Promise<string> {
  if (!html || !html.includes(ATTR)) return html;
  const ast = parse(html);
  const visit = (node: ElementNode) => {
    for (const child of (node.children ?? []) as ElementNode[]) {
      if (child.type !== ELEMENT_NODE) continue;
      const attrs = child.attributes as Attrs;
      if (LAYER_ROOT in attrs) continue;
      const marker = attrs[ATTR];
      if (marker) {
        const remaining: string[] = [];
        for (const key of marker.split(/\s+/)) {
          if (key in map) map[key]?.(attrs, child);
          else remaining.push(key);
        }
        if (remaining.length) attrs[ATTR] = remaining.join(' ');
        else delete attrs[ATTR];
      }
      visit(child);
    }
  };
  visit(ast as ElementNode);
  return render(ast);
}

/** Adapt `(attrs, tag)` stampers (e.g. `buttonSizeStampers()`) to node appliers. */
export function fromAttrStampers(map: Record<string, ((attrs: Attrs, tag: string) => void) | null>): Record<string, NodeApply> {
  return Object.fromEntries(Object.entries(map).map(([key, fn]) => [key, fn ? (attrs: Attrs, node: ElementNode) => fn(attrs, node.name) : null]));
}

export type GroupOrientation = 'horizontal' | 'vertical';

/** ButtonGroupContext → the member Button root (key `button-group`). */
export function groupMemberStamper({orientation, isDisabled}: {orientation: GroupOrientation; isDisabled: boolean}): NodeApply {
  return (attrs, node) => {
    attrs['data-ax-group'] = orientation;
    // Inside a group the group owns the surface's elevation.
    attrs['data-elevation'] = 'none';
    if (!isDisabled) return;
    attrs['data-ax-disabled'] = '';
    if (String(node.name).toLowerCase() === 'a') {
      node.name = 'button';
      // Button hands href / target / rel to the link only; everything else passes through.
      for (const name of ['href', 'target', 'rel']) delete attrs[name];
      attrs.type = 'button';
    }
    if ('data-ax-tooltip' in attrs) {
      // useAriaDisabled: a tooltip trigger stays focusable and hoverable, but inert.
      delete attrs.disabled;
      attrs['aria-disabled'] = 'true';
      attrs['data-ax-disabled-interaction'] = '';
    } else {
      // Truly disabled wins over busy-only: native disabled, no aria-disabled of its own.
      if (attrs['aria-busy'] === 'true' && attrs['aria-disabled'] === 'true') delete attrs['aria-disabled'];
      attrs.disabled = '';
    }
  };
}
