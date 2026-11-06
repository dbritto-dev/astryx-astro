/**
 * Server-side processing of a dialog-family layer's slot HTML (Dialog, AlertDialog, Drawer).
 * Nothing here runs in the browser.
 *
 * - Seals the content: cascades end at a layer root (lib/cascade.ts `seal`, same rule).
 * - Finds the DialogHeader title (`[data-ax-dialog-title]`) and gives it an id, so the dialog can
 *   name itself with aria-labelledby (Astryx publishes a titleId through DialogContext and checks
 *   the title rendered before emitting the attribute).
 * - Points close controls (`[data-ax-dialog-close]`: the header close button, AlertDialog's
 *   Cancel) at the dialog as native invokers (`commandfor` + `command`), so they close with
 *   zero JS. Controls that already name a target are left alone.
 * Nested `<dialog>` subtrees belong to their own layer and are skipped.
 */
import {ELEMENT_NODE, parse, render, type Node} from 'ultrahtml';

type Element = Node & {name: string; attributes: Record<string, string>; children?: Node[]};

export interface PreparedContent {
  html: string;
  /** Id of the DialogHeader title, when one rendered. */
  titleId?: string;
}

export async function prepareLayerContent(
  html: string,
  options: {id: string; closeCommand?: string | null},
): Promise<PreparedContent> {
  if (!html) return {html: ''};
  const needsWork = html.includes('data-ax-inherit') || html.includes('data-ax-dialog-title') || html.includes('data-ax-dialog-close');
  if (!needsWork) return {html};
  const ast = parse(html);
  let titleId: string | undefined;
  const visit = (node: Node, root: boolean) => {
    if (node.type !== ELEMENT_NODE) {
      for (const child of (node as Element).children ?? []) visit(child, root);
      return;
    }
    const el = node as Element;
    const attrs = el.attributes;
    delete attrs['data-ax-inherit'];
    const isNestedLayer = String(el.name).toLowerCase() === 'dialog';
    if (root && !isNestedLayer) {
      if (titleId === undefined && 'data-ax-dialog-title' in attrs) {
        if (!attrs.id) attrs.id = `${options.id}-title`;
        titleId = attrs.id;
      }
      if (options.closeCommand && 'data-ax-dialog-close' in attrs && !attrs.commandfor) {
        attrs.commandfor = options.id;
        attrs.command = options.closeCommand;
      }
    }
    for (const child of el.children ?? []) visit(child, root && !isNestedLayer);
  };
  for (const child of (ast as Element).children ?? []) visit(child, true);
  return {html: await render(ast), titleId};
}
