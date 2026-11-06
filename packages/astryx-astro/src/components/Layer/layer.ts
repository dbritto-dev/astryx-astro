/**
 * Server-side helpers shared by the layer components (Layer, Tooltip, HoverCard, InfoTip,
 * Popover) and by other components that render a layer for a trigger they own.
 * Nothing here runs in the browser.
 */
import {COMMENT_NODE, ELEMENT_NODE, TEXT_NODE, parse, render, type Node} from 'ultrahtml';
import type {LayerAlignment, LayerPlacement} from '../../lib/types';
import {cssSize} from '../../lib/style';

export type {LayerAlignment, LayerPlacement};

let counter = 0;

/**
 * A page-unique id for a layer (`ax-tooltip-1a` …). Ids are per server render: two
 * components in one page never collide. Pass an explicit `id` prop where stable ids matter.
 */
export function layerId(prefix = 'ax-layer'): string {
  counter = (counter + 1) % Number.MAX_SAFE_INTEGER;
  return `${prefix}-${counter.toString(36)}`;
}

/** `--_astryx-layer-clearance` for an `offset` (a number is px); undefined = flush. */
export function clearance(offset: number | string | undefined | null): string | undefined {
  if (offset == null || offset === '' || offset === 0) return undefined;
  return `--_astryx-layer-clearance:${cssSize(offset)}`;
}

export interface PlacementOptions {
  placement?: LayerPlacement;
  alignment?: LayerAlignment;
  /** `custom`: the caller writes its own position styles; no placement attributes. */
  positioning?: 'anchor' | 'custom';
  /** The layer never settles over its anchor (Tooltip, spec:AST-059 FR4). */
  keepsAnchorClear?: boolean;
}

/** The geometry attributes Layer.css reads. */
export function placementAttrs({placement = 'above', alignment = 'center', positioning = 'anchor', keepsAnchorClear = false}: PlacementOptions): Record<string, string | undefined> {
  if (positioning === 'custom') return {};
  return {
    'data-placement': placement,
    'data-align': alignment,
    'data-astryx-keep-clear': keepsAnchorClear ? '' : undefined,
  };
}

/** Merge whitespace-separated id lists (aria-describedby, aria-controls). */
export function mergeIds(...lists: Array<string | null | undefined>): string | undefined {
  const ids = [...new Set(lists.flatMap((l) => (l ?? '').split(/\s+/)).filter(Boolean))];
  return ids.length ? ids.join(' ') : undefined;
}

const SKIP = new Set(['script', 'style', 'template']);
const escapeAttr = (v: string) => v.replace(/&(?!(?:[a-z]+|#\d+|#x[\da-f]+);)/gi, '&amp;').replace(/"/g, '&quot;');

export interface StampedTrigger {
  /** The slot HTML with the trigger's attributes written. */
  html: string;
  /** No element in the slot: plain text (the component renders its own focusable wrapper). */
  textOnly: boolean;
  /** Whether a trigger element was found and stamped. */
  found: boolean;
  /** The trigger's tag name, lower case. */
  tag?: string;
  /** The trigger's attributes before stamping (raw, entity-encoded values). */
  attributes?: Record<string, string>;
}

type Stamp = Record<string, string | undefined> | ((attrs: Record<string, string>, tag: string) => Record<string, string | undefined>);

/**
 * Write attributes onto the trigger a component wraps: the first element of its rendered slot
 * (`match` narrows it, e.g. to the first `button, [role=button]`, searching descendants).
 * This is how Tooltip/HoverCard/Popover give their trigger SSR `aria-describedby` /
 * `popovertarget` without a wrapper element. `undefined` values are left alone.
 */
export async function stampTrigger(html: string, stamp: Stamp, match?: (tag: string, attrs: Record<string, string>) => boolean): Promise<StampedTrigger> {
  const ast = parse(html ?? '');
  let target: (Node & {name: string; attributes: Record<string, string>}) | null = null;
  let hasText = false;
  const visit = (node: Node, depth: number): boolean => {
    if (node.type === TEXT_NODE) {
      if (depth === 0 && String(node.value ?? '').trim()) hasText = true;
      return false;
    }
    if (node.type === COMMENT_NODE) return false;
    if (node.type === ELEMENT_NODE) {
      const name = String(node.name).toLowerCase();
      if (SKIP.has(name)) return false;
      if (!match || match(name, node.attributes as Record<string, string>)) {
        target = node as typeof target;
        return true;
      }
      // With a matcher, search descendants (Astryx findTriggerButton).
      for (const child of node.children ?? []) if (visit(child as Node, depth + 1)) return true;
      return false;
    }
    return false;
  };
  for (const child of ast.children ?? []) if (visit(child as Node, 0)) break;
  if (!target) return {html, textOnly: hasText && !hasElement(ast), found: false};
  const t = target as Node & {name: string; attributes: Record<string, string>};
  const before = {...t.attributes};
  const values = typeof stamp === 'function' ? stamp(before, String(t.name).toLowerCase()) : stamp;
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    t.attributes[key] = escapeAttr(value);
  }
  return {html: await render(ast), textOnly: false, found: true, tag: String(t.name).toLowerCase(), attributes: before};
}

function hasElement(ast: Node): boolean {
  return (ast.children ?? []).some((c: Node) => c.type === ELEMENT_NODE && !SKIP.has(String(c.name).toLowerCase()));
}

/** Whether rendered slot HTML is plain text (Astryx `isTextOnly`). */
export function isTextOnly(html: string): boolean {
  const ast = parse(html ?? '');
  return !hasElement(ast) && (ast.children ?? []).some((c: Node) => c.type === TEXT_NODE && String(c.value ?? '').trim());
}

/** LayerProvider `inset` → the custom properties the gutter reads. */
export interface LayerInset {
  blockStart?: number | string;
  blockEnd?: number | string;
  inlineStart?: number | string;
  inlineEnd?: number | string;
}

export function insetVars(inset: LayerInset | undefined): string | undefined {
  if (!inset) return undefined;
  const map: Array<[keyof LayerInset, string]> = [
    ['blockStart', '--astryx-layer-inset-block-start'],
    ['blockEnd', '--astryx-layer-inset-block-end'],
    ['inlineStart', '--astryx-layer-inset-inline-start'],
    ['inlineEnd', '--astryx-layer-inset-inline-end'],
  ];
  const out = map.filter(([k]) => inset[k] != null && inset[k] !== '').map(([k, p]) => `${p}:${cssSize(inset[k] as number | string)}`);
  return out.length ? out.join(';') : undefined;
}
