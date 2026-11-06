/**
 * Browser-only: keeps a live element's children in step with successive renders of the shared
 * Markdown render function — the React commit `<ax-markdown-stream>` stands in for.
 *
 * Each render is parsed into an inert fragment (the *virtual* tree) and diffed against the
 * previous render's virtual tree, not against the live DOM: only what changed between the two
 * renders is written to the live nodes they map to. Attributes and children that runtime code
 * owns (ScrollableArea's overflow flags, the copy button's tooltip wiring, a checkbox element's
 * state, a tooltip the runtime inserted) are never touched unless the render itself changes
 * them. Kept nodes keep focus, selection, scroll position and a finished fade.
 *
 * Top-level blocks are diffed as groups: a block whose HTML string did not change is skipped
 * without parsing, so a growing stream diffs only its last block.
 *
 * Keys (React's): tag + `data-ax-segment` (the streaming fade spans' React keys), else tag + the
 * first class token. Matching walks forward (appends and in-place growth are the common case);
 * unmatched old nodes are removed, unmatched new ones inserted (and, being new, fade in).
 */

interface Group {
  html: string;
  nodes: Node[];
}

const keyOf = (node: Node): string => {
  if (node.nodeType !== 1) return `#${node.nodeType}`;
  const el = node as Element;
  const segment = el.getAttribute('data-ax-segment');
  return `${el.tagName}|${segment ?? (el.getAttribute('class') ?? '').split(/\s+/)[0]}`;
};

export class MarkdownMorph {
  readonly #root: Element;
  readonly #live = new WeakMap<Node, Node>();
  #groups: Group[] = [];

  constructor(root: Element) {
    this.#root = root;
  }

  #parse(html: string): Node[] {
    const t = this.#root.ownerDocument.createElement('template');
    t.innerHTML = html;
    return [...t.content.childNodes];
  }

  /** Map a fresh virtual subtree onto a live subtree of the same shape. */
  #mapTree(v: Node, live: Node): void {
    this.#live.set(v, live);
    if (v.nodeType !== 1 || (v as Element).tagName === 'TEMPLATE') return;
    const liveKids = [...live.childNodes];
    let j = 0;
    for (const child of v.childNodes) {
      const key = keyOf(child);
      while (j < liveKids.length && keyOf(liveKids[j]) !== key) j++;
      if (j >= liveKids.length) return;
      this.#mapTree(child, liveKids[j++]);
    }
  }

  /** Insert a virtual node's copy into the live DOM and map it. */
  #insert(v: Node, parent: Node, ref: Node | null): void {
    const live = this.#root.ownerDocument.importNode(v, true);
    parent.insertBefore(live, ref);
    this.#mapTree(v, live);
  }

  #patch(prev: Node, next: Node, live: Node): void {
    this.#live.set(next, live);
    if (next.nodeType !== 1) {
      if (prev.nodeValue !== next.nodeValue) live.nodeValue = next.nodeValue;
      return;
    }
    const p = prev as Element;
    const n = next as Element;
    const l = live as Element;
    for (const {name, value} of [...n.attributes]) if (p.getAttribute(name) !== value) l.setAttribute(name, value);
    for (const {name} of [...p.attributes]) if (!n.hasAttribute(name)) l.removeAttribute(name);
    if (n.tagName === 'TEMPLATE') {
      if ((p as HTMLTemplateElement).innerHTML !== (n as HTMLTemplateElement).innerHTML) (l as HTMLTemplateElement).innerHTML = (n as HTMLTemplateElement).innerHTML;
      return;
    }
    this.#diffList([...p.childNodes], [...n.childNodes], l, null);
  }

  /** Diff sibling lists; `endRef` bounds the range (null = parent's end). */
  #diffList(prev: Node[], next: Node[], parent: Node, endRef: Node | null): void {
    let i = 0;
    for (const n of next) {
      const key = keyOf(n);
      let j = i;
      while (j < prev.length && keyOf(prev[j]) !== key) j++;
      const match = j < prev.length ? prev[j] : null;
      if (match && this.#live.get(match)?.parentNode === parent) {
        for (let k = i; k < j; k++) this.#remove(prev[k]);
        this.#patch(match, n, this.#live.get(match)!);
        i = j + 1;
      } else {
        // Insert before the next surviving old node's live node, else at the range end.
        let ref: Node | null = endRef;
        for (let k = i; k < prev.length; k++) {
          const l = this.#live.get(prev[k]);
          if (l?.parentNode === parent) {
            ref = l;
            break;
          }
        }
        this.#insert(n, parent, ref);
      }
    }
    for (let k = i; k < prev.length; k++) this.#remove(prev[k]);
  }

  #remove(v: Node): void {
    const live = this.#live.get(v);
    live?.parentNode?.removeChild(live);
  }

  /**
   * Take over the live children as the rendering of `blocks` (the server's markup). Falls back
   * to replacing them when they do not have the rendered shape.
   */
  adopt(blocks: string[]): void {
    const groups = blocks.map((html) => ({html, nodes: this.#parse(html)}));
    const liveKids = [...this.#root.childNodes];
    const flat = groups.flatMap((g) => g.nodes);
    const ok = flat.length === liveKids.length && flat.every((v, i) => keyOf(v) === keyOf(liveKids[i]));
    if (ok) flat.forEach((v, i) => this.#mapTree(v, liveKids[i]));
    else {
      this.#root.replaceChildren();
      for (const v of flat) this.#insert(v, this.#root, null);
    }
    this.#groups = groups;
  }

  /** Bring the live children to `blocks` (one HTML string per top-level block). */
  update(blocks: string[]): void {
    const prev = this.#groups;
    const next: Group[] = [];
    const firstLive = (from: number): Node | null => {
      for (let g = from; g < prev.length; g++) {
        for (const v of prev[g].nodes) {
          const l = this.#live.get(v);
          if (l?.parentNode === this.#root) return l;
        }
      }
      return null;
    };
    blocks.forEach((html, i) => {
      const old = prev[i];
      if (old && old.html === html) {
        next.push(old);
        return;
      }
      const nodes = this.#parse(html);
      this.#diffList(old?.nodes ?? [], nodes, this.#root, firstLive(i + 1));
      next.push({html, nodes});
    });
    for (let g = blocks.length; g < prev.length; g++) prev[g].nodes.forEach((v) => this.#remove(v));
    this.#groups = next;
  }
}
