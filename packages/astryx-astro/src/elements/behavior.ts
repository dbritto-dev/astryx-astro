/**
 * Attribute behaviors — progressive enhancement without wrapper elements.
 *
 * Use when an element must stay a native element in its layout position (a flex child,
 * a <button>, a <td>) but needs a little JS. Stateful widgets use custom elements
 * (`<ax-*>`, see element.ts) instead.
 *
 *   defineBehavior('scroll-region', (el) => { …; return () => cleanup(); });
 *   <div data-ax-scroll-region>…</div>
 *
 * Elements are connected when they appear (including later DOM insertions, view
 * transitions and client-side swaps) and cleaned up when removed or when the attribute
 * is removed.
 */
type Cleanup = void | (() => void);
type Setup = (el: HTMLElement) => Cleanup;

const registry = new Map<string, Setup>();
const active = new Map<string, WeakMap<HTMLElement, Cleanup>>();
let observer: MutationObserver | null = null;

const attr = (name: string) => `data-ax-${name}`;

function connect(name: string, el: HTMLElement) {
  const map = active.get(name)!;
  if (map.has(el)) return;
  map.set(el, registry.get(name)!(el));
}

function disconnect(name: string, el: HTMLElement) {
  const map = active.get(name)!;
  if (!map.has(el)) return;
  const cleanup = map.get(el);
  map.delete(el);
  if (typeof cleanup === 'function') cleanup();
}

function scan(root: ParentNode, name: string) {
  const selector = `[${attr(name)}]`;
  if (root instanceof HTMLElement && root.matches(selector)) connect(name, root);
  root.querySelectorAll<HTMLElement>(selector).forEach((el) => connect(name, el));
}

function sweep(root: Node, name: string) {
  const selector = `[${attr(name)}]`;
  if (root instanceof HTMLElement) {
    if (root.matches(selector)) disconnect(name, root);
    root.querySelectorAll<HTMLElement>(selector).forEach((el) => disconnect(name, el));
  }
}

function ensureObserver() {
  if (observer || typeof MutationObserver === 'undefined') return;
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes') {
        const name = r.attributeName!.slice('data-ax-'.length);
        if (!registry.has(name)) continue;
        const el = r.target as HTMLElement;
        if (el.hasAttribute(r.attributeName!)) connect(name, el);
        else disconnect(name, el);
        continue;
      }
      for (const name of registry.keys()) {
        r.removedNodes.forEach((n) => { if (!n.isConnected) sweep(n, name); });
        r.addedNodes.forEach((n) => { if (n instanceof HTMLElement) scan(n, name); });
      }
    }
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [...registry.keys()].map(attr),
  });
}

export function defineBehavior(name: string, setup: Setup): void {
  if (typeof document === 'undefined' || registry.has(name)) return;
  registry.set(name, setup);
  active.set(name, new WeakMap());
  // Re-observe so the attribute filter includes the new behavior.
  observer?.disconnect();
  observer = null;
  const start = () => { scan(document, name); ensureObserver(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
}
