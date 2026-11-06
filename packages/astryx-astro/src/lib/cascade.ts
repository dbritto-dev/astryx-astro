/**
 * Context-free cascades — Astro has no React context, so Astryx providers (SizeContext,
 * ButtonGroup, Toolbar, IconDefaultSize, FormLayout optionality, RadioList name …) become
 * "stamping": a provider renders its slot to HTML and writes the effective value onto the
 * enrolled descendants that did not set it explicitly.
 *
 * Consumer (opts in only when the prop is not explicit):
 *   <button data-size={size ?? 'md'} data-ax-inherit={inherits({size: size === undefined})}>
 *
 * Provider:
 *   const html = await stamp(await Astro.slots.render('default'), 'size', (a) => { a['data-size'] = size; });
 *   <Fragment set:html={html} />
 *
 * Semantics match Astryx (component-size-cascade INV1–9):
 *   - explicit prop > nearest provider > component default: inner providers stamp first
 *     (their slots render before the outer provider sees the HTML) and consume the marker;
 *   - `apply = null` is a null provider: it consumes markers without stamping (reset);
 *   - layer roots end every cascade: stamping never enters `[data-astryx-layer-root]`, and
 *     overlays also call `seal(html)` on their content.
 * Rendering a slot to a string buffers that subtree (no streaming inside it), so only
 * providers use this.
 *
 * Followers — a component that hands its own resolved value to content it renders in its own
 * layer (Astryx: `const size = useSize(sizeProp)` passed as a prop to the listbox rows). The
 * enrolled element has an `id`; each follower names it:
 *   <ax-selector id="box" data-ax-inherit="size">…</ax-selector>
 *   <div popover data-astryx-layer-root>
 *     <div role="option" data-size="md" data-ax-inherit-from="box">…</div>
 *   </div>
 * When a provider stamps the element, the same pass runs the same appliers on every follower
 * (layer roots included: the owner passes its own value into its own layer), then drops the
 * follower attributes. Options on the follower: `data-ax-inherit-map="lg=md"` rewrites the
 * values it receives; `data-ax-inherit-deep` hands each changed attribute to the descendants
 * that carry it (and to the follower itself only if it had it). A null provider settles the
 * element without stamping: its followers keep their values.
 */
import {ELEMENT_NODE, parse, render, walk, type ElementNode, type Node} from 'ultrahtml';

const ATTR = 'data-ax-inherit';
const FROM = 'data-ax-inherit-from';
const MAP = 'data-ax-inherit-map';
const DEEP = 'data-ax-inherit-deep';

/** Build the data-ax-inherit value from a map of cascade key → "inherits?". */
export function inherits(keys: Record<string, boolean | undefined>): string | undefined {
  const list = Object.entries(keys).filter(([, on]) => on).map(([k]) => k);
  return list.length ? list.join(' ') : undefined;
}

type Attrs = Record<string, string>;
type Apply = ((attrs: Attrs, tag: string, node: ElementNode) => void) | null;

const LAYER_ROOT = 'data-astryx-layer-root';

/**
 * Visit enrolled elements, never descending into a layer root: every Astryx group context is
 * layer-scoped (contract #23), so a cascade stops at an overlay rendered inside the provider
 * (a member's Tooltip, a Popover's own Buttons) even when that overlay wasn't sealed.
 */
function visitEnrolled(node: Node, fn: (el: ElementNode) => void): void {
  for (const child of (node as ElementNode).children ?? []) {
    if (child.type !== ELEMENT_NODE) continue;
    const el = child as ElementNode;
    if (LAYER_ROOT in (el.attributes as Attrs)) continue;
    if ((el.attributes as Attrs)[ATTR]) fn(el);
    visitEnrolled(el, fn);
  }
}

/** Stamp one cascade key onto enrolled descendants and consume their marker. */
export async function stamp(html: string, key: string, apply: Apply): Promise<string>;
/** Stamp several keys in one parse. */
export async function stamp(html: string, keys: Record<string, Apply>): Promise<string>;
export async function stamp(html: string, keyOrMap: string | Record<string, Apply>, apply?: Apply): Promise<string> {
  const map: Record<string, Apply> = typeof keyOrMap === 'string' ? {[keyOrMap]: apply ?? null} : keyOrMap;
  if (!html || !html.includes(ATTR)) return html;
  const ast = parse(html);
  /** Enrolled elements with an id → the keys this pass settled on them. */
  const settled = new Map<string, string[]>();
  visitEnrolled(ast, (node) => {
    const attrs = node.attributes as Attrs;
    const remaining: string[] = [];
    const consumed: string[] = [];
    for (const key of attrs[ATTR].split(/\s+/)) {
      if (key in map) {
        map[key]?.(attrs, node.name, node);
        consumed.push(key);
      } else remaining.push(key);
    }
    if (remaining.length) attrs[ATTR] = remaining.join(' ');
    else delete attrs[ATTR];
    if (consumed.length && attrs.id) settled.set(attrs.id, consumed);
  });
  if (settled.size > 0 && html.includes(FROM)) followSettled(ast, settled, map);
  return render(ast);
}

function elementsOf(node: Node, fn: (el: ElementNode) => void): void {
  for (const child of (node as ElementNode).children ?? []) {
    if (child.type !== ELEMENT_NODE) continue;
    fn(child as ElementNode);
    elementsOf(child, fn);
  }
}

/** Run the settled elements' appliers on their followers (see the header). */
function followSettled(ast: Node, settled: Map<string, string[]>, map: Record<string, Apply>): void {
  elementsOf(ast, (node) => {
    const attrs = node.attributes as Attrs;
    const keys = attrs[FROM] ? settled.get(attrs[FROM]) : undefined;
    if (!keys) return;
    const pairs = new Map((attrs[MAP] ?? '').split(/\s+/).filter(Boolean).map((pair) => pair.split('=') as [string, string]));
    const isDeep = DEEP in attrs;
    for (const name of [FROM, MAP, DEEP]) delete attrs[name];
    const before: Attrs = {...attrs};
    for (const key of keys) map[key]?.(attrs, node.name, node);
    for (const name of Object.keys(attrs)) {
      if (attrs[name] === before[name]) continue;
      const value = pairs.get(attrs[name]) ?? attrs[name];
      if (!isDeep) {
        attrs[name] = value;
        continue;
      }
      // Deep: the follower keeps what it had; its descendants that carry the attribute take it.
      if (name in before) attrs[name] = value;
      else delete attrs[name];
      elementsOf(node, (el) => {
        if (name in (el.attributes as Attrs)) (el.attributes as Attrs)[name] = value;
      });
    }
  });
}

/** End every cascade at a layer boundary (Popover, Dialog, Tooltip content …). Followers of a sealed element keep their values. */
export async function seal(html: string): Promise<string> {
  if (!html || !html.includes(ATTR)) return html;
  const ast = parse(html);
  await walk(ast, (node) => {
    if (node.type !== ELEMENT_NODE) return;
    const attrs = node.attributes as Attrs;
    for (const name of [ATTR, FROM, MAP, DEEP]) delete attrs[name];
  });
  return render(ast);
}

/** Shorthand provider: set `data-<key>` (or a given attribute) to `value` on enrolled descendants. */
export function stampAttr(html: string, key: string, value: string | number | null | undefined, attr = `data-${key}`) {
  return stamp(html, key, value == null ? null : (a) => { a[attr] = String(value); });
}
