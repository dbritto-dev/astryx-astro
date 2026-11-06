/**
 * TableNode helpers — the server-side stand-in for building ReactNodes in the plugin
 * pipeline (Astryx BaseTable.tsx / utils/isRenderable.ts / utils/getNodeText.ts).
 */
import {styleToString, type StyleValue} from '../../lib/style';
import type {
  AstroComponent,
  TableAttrs,
  TableComponentNode,
  TableElementNode,
  TableHtmlNode,
  TableNode,
  TableSlotNode,
} from './types';

/** A plain element node. */
export function el(tag: string, attrs?: TableAttrs, children?: TableNode): TableElementNode {
  return {tag, attrs, children};
}

/** An Astro component node; `table` passes the render context as the `table` prop. */
export function comp(
  component: AstroComponent,
  props?: Record<string, unknown>,
  children?: TableNode,
  options?: {table?: boolean},
): TableComponentNode {
  return {component, props, children, table: options?.table};
}

/** Trusted markup. */
export function html(markup: string): TableHtmlNode {
  return {html: markup};
}

/** A placeholder for one of the Table's named slots, rendered with `args`. */
export function slot(name: string, ...args: unknown[]): TableSlotNode {
  return {slot: name, args};
}

export function isHtmlNode(node: unknown): node is TableHtmlNode {
  return typeof node === 'object' && node != null && 'html' in node;
}
export function isElementNode(node: unknown): node is TableElementNode {
  return typeof node === 'object' && node != null && 'tag' in node;
}
export function isComponentNode(node: unknown): node is TableComponentNode {
  return typeof node === 'object' && node != null && 'component' in node;
}
export function isSlotNode(node: unknown): node is TableSlotNode {
  return typeof node === 'object' && node != null && 'slot' in node && !('tag' in node) && !('component' in node);
}

/** Whether a node renders anything (Astryx isRenderable). */
export function isRenderable(node: TableNode): boolean {
  if (node == null || node === false || node === true || node === '') return false;
  if (Array.isArray(node)) return node.some((n) => isRenderable(n as TableNode));
  return true;
}

/**
 * Visible text of a node where it is knowable on the server (Astryx getNodeText): strings,
 * numbers, element and component children. Component props are not text.
 */
export function nodeText(node: TableNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number' || typeof node === 'bigint') return String(node);
  if (Array.isArray(node)) return node.map((n) => nodeText(n as TableNode)).join('');
  if (isHtmlNode(node)) return node.html.replace(/<[^>]*>/g, '');
  if (isElementNode(node) || isComponentNode(node)) return nodeText(node.children);
  return '';
}

/** Attributes ready to spread onto an element: `class` lists joined, `style` objects serialized. */
export function domAttrs(attrs: TableAttrs | undefined, extraClass?: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || key === 'class' || key === 'style') continue;
      out[key] = value;
    }
  }
  const classes = [
    ...(Array.isArray(attrs?.class) ? attrs.class : attrs?.class ? [attrs.class] : []),
    ...(extraClass ?? []),
  ].filter(Boolean);
  if (classes.length) out.class = [...new Set(classes)].join(' ');
  const style = attrs?.style ? styleToString(attrs.style as StyleValue) : '';
  if (style) out.style = style;
  return out;
}

/** Every slot placeholder in a node tree (depth first). */
export function collectSlotNodes(node: TableNode, out: TableSlotNode[] = []): TableSlotNode[] {
  if (node == null || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const n of node) collectSlotNodes(n as TableNode, out);
    return out;
  }
  if (isSlotNode(node)) out.push(node);
  else if (isElementNode(node) || isComponentNode(node)) collectSlotNodes(node.children, out);
  return out;
}
