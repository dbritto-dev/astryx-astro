/**
 * MetadataList's replacement for MetadataListContext + Children.toArray/slice: a pass over
 * the rendered slot HTML (ultrahtml) that
 *  - unwraps each MetadataListItem into a bare <dt>/<dd> pair when labels sit at the start
 *    (the wrapper's target class, attributes, class and style move to the <dt>; a
 *    data-testid becomes `<id>-label` / `<id>-value`), and
 *  - hides the items past `maxNumOfItems` (`hidden` + `data-ax-metadata-overflow`) so the
 *    "Show more" toggle can reveal them in the browser.
 * Children are counted as Astryx counts them: each top-level element is one item.
 */
import {COMMENT_NODE, ELEMENT_NODE, TEXT_NODE, parse, renderSync} from 'ultrahtml';

type Node = {type: number; name?: string; value?: string; attributes?: Record<string, string>; children?: Node[]; parent?: Node};

const ITEM = 'data-ax-metadata-list-item';

function isElement(node: Node, name?: string): boolean {
  return node.type === ELEMENT_NODE && (name == null || node.name === name);
}

function unwrap(item: Node): Node[] {
  const attrs = {...item.attributes!};
  delete attrs[ITEM];
  const testId = attrs['data-testid'];
  delete attrs['data-testid'];
  const parts = (item.children ?? []).filter((c) => isElement(c));
  const dt = parts.find((c) => c.name === 'dt');
  const dd = parts.find((c) => c.name === 'dd');
  if (!dt || !dd) return [item];
  const wrapperClass = (attrs.class ?? '').split(/\s+/).filter((c) => c && c !== 'ax-metadata-list-stack');
  const ownClass = (dt.attributes!.class ?? '').split(/\s+/).filter(Boolean);
  // Caller attributes and the target go on the <dt>, after its own.
  dt.attributes = {
    ...dt.attributes,
    ...attrs,
    class: [...wrapperClass, ...ownClass].join(' '),
    'data-ax-inline': '',
    ...(testId != null ? {'data-testid': `${testId}-label`} : {}),
  };
  dd.attributes = {
    ...dd.attributes,
    'data-ax-inline': '',
    ...(testId != null ? {'data-testid': `${testId}-value`} : {}),
  };
  return [dt, dd];
}

export interface ItemsResult {
  html: string;
  count: number;
  hasOverflow: boolean;
}

export function layoutItems(html: string, {inline, max}: {inline: boolean; max: number | undefined}): ItemsResult {
  if (!html.trim()) return {html, count: 0, hasOverflow: false};
  const doc = parse(html) as Node;
  const out: Node[] = [];
  let count = 0;
  for (const node of doc.children ?? []) {
    if (node.type === COMMENT_NODE || (node.type === TEXT_NODE && /^\s*$/.test(node.value ?? ''))) {
      out.push(node);
      continue;
    }
    const isItem = isElement(node) && node.attributes![ITEM] !== undefined;
    const nodes = isItem && inline ? unwrap(node) : isItem ? [stripMarker(node)] : [node];
    if (max != null && count >= max) {
      for (const n of nodes) {
        if (isElement(n)) n.attributes = {...n.attributes, hidden: '', 'data-ax-metadata-overflow': ''};
      }
    }
    count++;
    for (const n of nodes) n.parent = doc;
    out.push(...nodes);
  }
  doc.children = out;
  return {html: renderSync(doc as any), count, hasOverflow: max != null && count > max};
}

function stripMarker(node: Node): Node {
  const attrs = {...node.attributes!};
  delete attrs[ITEM];
  node.attributes = attrs;
  return node;
}
