/**
 * Icon "component mode" for SVG markup (an SVG string or slotted <svg>): Astryx renders a
 * passed icon component as the root itself, receiving the a11y props, the `astryx-icon`
 * class, the theme data attributes and the size/color styles. With markup the root <svg>
 * plays that role, so its own attributes are kept and Icon's are merged on top.
 */
import {COMMENT_NODE, ELEMENT_NODE, TEXT_NODE, parse, renderSync} from 'ultrahtml';

type Attrs = Record<string, string | number | boolean | null | undefined>;

const escapeAttr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/** The single root <svg> of the markup, or null when there is none (or several roots). */
function svgRoot(ast: any): any | null {
  const roots = (ast.children ?? []).filter(
    (n: any) => n.type !== COMMENT_NODE && !(n.type === TEXT_NODE && /^\s*$/.test(n.value)),
  );
  return roots.length === 1 && roots[0].type === ELEMENT_NODE && roots[0].name === 'svg' ? roots[0] : null;
}

/**
 * Merge Icon's attributes onto the markup's root <svg>. `class` and `style` compose (the
 * artwork's own first); `null`/`undefined` removes an attribute (e.g. a labelled icon drops
 * the artwork's own aria-hidden). Returns null when the markup is not a single <svg>.
 */
export function decorateSvg(markup: string, attrs: Attrs): string | null {
  const ast = parse(markup);
  const svg = svgRoot(ast);
  if (!svg) return null;
  const own = svg.attributes as Record<string, string>;
  for (const [key, raw] of Object.entries(attrs)) {
    if (raw == null || raw === false) {
      if (key !== 'class' && key !== 'style') delete own[key];
      continue;
    }
    const value = raw === true ? '' : String(raw);
    if (key === 'class') own.class = [...new Set(`${own.class ?? ''} ${escapeAttr(value)}`.split(/\s+/).filter(Boolean))].join(' ');
    else if (key === 'style') own.style = [own.style?.replace(/;\s*$/, ''), escapeAttr(value)].filter(Boolean).join(';');
    else own[key] = escapeAttr(value);
  }
  return renderSync(ast);
}
