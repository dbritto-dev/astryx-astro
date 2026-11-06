/**
 * Server-side helpers of the Breadcrumbs family. Port of @astryxdesign/core
 * Breadcrumbs/Breadcrumbs.tsx (BreadcrumbContext: variant + separator → the subtree locals key
 * below) and the auto-current effect of Breadcrumbs/BreadcrumbItem.tsx (done once on the
 * server over the rendered trail instead of per item after mount).
 */
import {ELEMENT_NODE, parse, render, type Node} from 'ultrahtml';

export type BreadcrumbsVariant = 'default' | 'supporting';

/** Subtree locals key Breadcrumbs provides to its items (BreadcrumbContext). */
export const BREADCRUMBS_LOCAL = 'astryxBreadcrumbs';

export interface BreadcrumbsContextValue {
  variant: BreadcrumbsVariant;
  /** Rendered separator markup (the default slash already wrapped for RTL mirroring). */
  separatorHtml: string;
}

/** Outside a Breadcrumbs: the default variant and slash. */
export const DEFAULT_SEPARATOR_HTML = '<span class="ax-mirror-rtl ax-breadcrumb-slash">/</span>';

type El = Node & {name: string; attributes: Record<string, string>; children?: Node[]};

function* elements(node: Node): Generator<El> {
  for (const child of (node as El).children ?? []) {
    if (child.type !== ELEMENT_NODE) continue;
    yield child as El;
    yield* elements(child);
  }
}

/**
 * Auto-current (BreadcrumbItem's effect): when no item is explicitly current
 * (`aria-current="page"` anywhere in the trail), the last item — if it left `isCurrent` unset —
 * marks its content element (the link, button, span or menu trigger after the separator)
 * `aria-current="page"`. Items opt in with `data-ax-auto-current` on the `<li>` and mark the
 * content with `data-ax-crumb-content`; both markers are removed.
 */
export async function markAutoCurrent(html: string): Promise<string> {
  if (!html.includes('data-ax-auto-current') && !html.includes('data-ax-crumb-content')) return html;
  const ast = parse(html);
  const items = (ast.children ?? []).filter((n: Node) => n.type === ELEMENT_NODE && (n as El).name === 'li') as El[];
  const hasExplicit = [...elements(ast)].some((el) => el.attributes['aria-current'] === 'page');
  const last = items.at(-1);
  if (!hasExplicit && last && 'data-ax-auto-current' in last.attributes) {
    const content = [...elements(last)].find((el) => 'data-ax-crumb-content' in el.attributes);
    (content ?? last).attributes['aria-current'] = 'page';
  }
  for (const el of elements(ast)) {
    delete el.attributes['data-ax-auto-current'];
    delete el.attributes['data-ax-crumb-content'];
  }
  return render(ast);
}
