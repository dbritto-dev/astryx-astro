/**
 * `morphChildren(target, html, {preserve})` — update `target`'s children in place to match
 * `html` (the same render the server used), keeping every node whose key still matches.
 *
 * The Calendar re-renders its months on every state change (selection, range preview, month
 * navigation) from one pure render function. Replacing the markup outright would destroy the
 * focused or hovered day button (losing focus, re-firing hover); morphing keeps those nodes and
 * only rewrites what changed, the way a React commit does.
 *
 * Keys: tag name + `data-date` (day buttons, so a day survives only as itself), else the first
 * class token. Matching is greedy in document order. Unmatched old children are removed first,
 * so a kept node is never moved past a removed sibling (a move would blur it).
 * `preserve` lists attributes a kept element keeps from its live DOM (the roving `tabindex`,
 * owned by the grid focus manager after the first render).
 */
export interface MorphOptions {
  preserve?: ReadonlyArray<string>;
}

const keyOf = (node: Node): string => {
  if (node.nodeType !== Node.ELEMENT_NODE) return `#${node.nodeType}`;
  const el = node as Element;
  const date = el.getAttribute('data-date');
  return `${el.tagName}|${date ?? (el.getAttribute('class') ?? '').split(/\s+/)[0]}`;
};

function syncAttributes(from: Element, to: Element, preserve: ReadonlyArray<string>) {
  for (const {name} of [...to.attributes]) {
    if (!from.hasAttribute(name) && !preserve.includes(name)) to.removeAttribute(name);
  }
  for (const {name, value} of [...from.attributes]) {
    if (preserve.includes(name) && to.hasAttribute(name)) continue;
    if (to.getAttribute(name) !== value) to.setAttribute(name, value);
  }
}

function morphNode(from: Node, to: Node, preserve: ReadonlyArray<string>) {
  if (from.nodeType === Node.ELEMENT_NODE) {
    syncAttributes(from as Element, to as Element, preserve);
    morphList(to as Element, [...from.childNodes], preserve);
  } else if (to.nodeValue !== from.nodeValue) to.nodeValue = from.nodeValue;
}

function morphList(parent: Element, next: Node[], preserve: ReadonlyArray<string>) {
  const old = [...parent.childNodes];
  const used = new Set<Node>();
  const matches = next.map((node) => {
    const key = keyOf(node);
    const match = old.find((o) => !used.has(o) && keyOf(o) === key) ?? null;
    if (match) used.add(match);
    return match;
  });
  for (const o of old) if (!used.has(o)) parent.removeChild(o);
  let cursor: ChildNode | null = parent.firstChild;
  next.forEach((node, i) => {
    const match = matches[i];
    if (match) {
      if (match !== cursor) parent.insertBefore(match, cursor);
      else cursor = cursor.nextSibling;
      morphNode(node, match, preserve);
    } else {
      parent.insertBefore(node, cursor);
    }
  });
}

export function morphChildren(target: Element, html: string, options: MorphOptions = {}): void {
  const template = target.ownerDocument.createElement('template');
  template.innerHTML = html;
  morphList(target, [...template.content.childNodes], options.preserve ?? []);
}
