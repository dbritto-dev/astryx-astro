/**
 * Browser-side DOM normalizer for the Markdown tests: serializes an element tree with sorted
 * attributes and class tokens, generated ids replaced by their order of first appearance
 * (also inside references such as `for`, `aria-*`, `data-ax-*-from`, `#id` selectors), style
 * declarations normalized, `<script>` elements and comments skipped. Two renders that differ
 * only in generated ids or attribute order normalize to the same string.
 *
 *   await context.addInitScript(installNormalize);
 *   await page.evaluate(() => window.__axNormalize(document.querySelector('…')));
 */
export function installNormalize() {
  window.__axNormalize = function normalize(root, options = {}) {
    const skipAttrs = options.skipAttrs ?? [];
    const ids = new Map();
    const idOf = (v) => {
      if (!ids.has(v)) ids.set(v, `ID${ids.size}`);
      return ids.get(v);
    };
    const defined = new Set();
    const collect = (scope) => {
      scope.querySelectorAll('[id]').forEach((e) => defined.add(e.id));
      scope.querySelectorAll('template').forEach((t) => collect(t.content));
    };
    if (root.id) defined.add(root.id);
    collect(root);
    const sortedIds = [...defined].sort((a, b) => b.length - a.length);
    const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mapValue = (value) => {
      let out = value;
      for (const id of sortedIds) {
        if (!out.includes(id)) continue;
        out = out.replace(new RegExp(`(?<![\\w-])${escapeRe(id)}(?![\\w])`, 'g'), () => idOf(id));
      }
      return out;
    };
    const style = (v) =>
      v
        .split(';')
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => d.replace(/\s*:\s*/, ':'))
        .join(';');
    const ser = (node) => {
      if (node.nodeType === 3) return node.data;
      if (node.nodeType !== 1) return '';
      const el = node;
      const tag = el.tagName.toLowerCase();
      if (tag === 'script') return '';
      const attrs = [...el.attributes]
        .filter((a) => !skipAttrs.includes(a.name))
        .map((a) => {
          let v = a.value;
          if (a.name === 'class') v = v.split(/\s+/).filter(Boolean).sort().join(' ');
          else if (a.name === 'style') v = style(v);
          else v = mapValue(v);
          return `${a.name}="${v}"`;
        })
        .sort();
      const kids = tag === 'template' ? [...el.content.childNodes] : [...el.childNodes];
      return `<${tag}${attrs.length ? ` ${attrs.join(' ')}` : ''}>${kids.map(ser).join('')}</${tag}>`;
    };
    return ser(root);
  };
}

/** First differing region of two strings, for failure messages. */
export function firstDiff(a, b, context = 160) {
  if (a === b) return '';
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return `at ${i}:\n      got:      …${a.slice(Math.max(0, i - context), i + context)}…\n      expected: …${b.slice(Math.max(0, i - context), i + context)}…`;
}
