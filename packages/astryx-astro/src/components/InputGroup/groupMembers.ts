/**
 * InputGroup's member transform — the Astro stand-in for InputGroupContext /
 * InputGroupInternalContext (Astryx 0.7.9 InputGroup/InputGroup.tsx, groupStyles.ts,
 * utils/inputAria.ts getInputARIA). InputGroup renders its slot to HTML, then:
 *
 * 1. Field-composed members (a Field root enrolled in the `input-group` cascade key, see
 *    Field/fieldProps.ts) lose their Field shell, as Astryx renders no Field inside a group:
 *    the root is replaced by its control box (`[data-ax-group-control]`) plus the layer roots
 *    that follow it (e.g. the disabled-message tooltip). Inside the box, `[data-ax-group-drop]`
 *    nodes go (the on-field status icon: the group owns status), the hidden
 *    `[data-ax-group-label]` span becomes visually hidden, and the input
 *    (`[data-ax-group-input]`) is named `aria-labelledby="<group label> <own label> <caller …>"`
 *    and described by the group's description/status ids before its own — references into
 *    the removed shell (field label, description, status box, status tooltip) are dropped.
 *    The box gets the member marker `data-astryx-input-group-item`.
 * 2. Direct-child Buttons (`.astryx-button`) get the member marker (connected corners).
 * 3. A disabled group disables its members (InputGroupInternalContext): inputs become
 *    `aria-disabled` + `readonly`, lose `name`, their box gets `data-disabled`; nodes marked
 *    `[data-ax-group-drop-disabled]` (clear buttons, a hidden form value) go, nodes marked
 *    `[data-ax-group-disable]` (steppers) become aria-disabled. Button members get native
 *    `disabled` + `data-ax-disabled` (`aria-disabled` when they are tooltip triggers).
 * Nested groups were transformed by their own InputGroup first (their markers are consumed);
 * layer roots end the walk, as contexts end at layer boundaries.
 */
import {ELEMENT_NODE, parse, render, type Node} from 'ultrahtml';
import {
  GROUP_CONTROL,
  GROUP_DISABLE,
  GROUP_DROP,
  GROUP_DROP_DISABLED,
  GROUP_INPUT,
  GROUP_KEY,
  GROUP_LABEL,
  joinAriaIDs,
} from '../Field/fieldProps';

type Attrs = Record<string, string>;
type El = Node & {name: string; attributes: Attrs; children: Node[]; parent?: Node};

const isEl = (n: Node | undefined): n is El => !!n && n.type === ELEMENT_NODE;
const attrsOf = (n: El) => n.attributes as Attrs;
const classes = (n: El) => (attrsOf(n).class ?? '').split(/\s+/);
const markers = (n: El) => (attrsOf(n)['data-ax-inherit'] ?? '').split(/\s+/).filter(Boolean);
const isLayerRoot = (n: El) => 'data-astryx-layer-root' in attrsOf(n);

function find(root: El, pred: (n: El) => boolean): El | null {
  for (const child of root.children ?? []) {
    if (!isEl(child)) continue;
    if (pred(child)) return child;
    const hit = find(child, pred);
    if (hit) return hit;
  }
  return null;
}

function findAll(root: El, pred: (n: El) => boolean, out: El[] = []): El[] {
  for (const child of root.children ?? []) {
    if (!isEl(child)) continue;
    if (pred(child)) out.push(child);
    findAll(child, pred, out);
  }
  return out;
}

function collectIds(root: El, out = new Set<string>()): Set<string> {
  const id = attrsOf(root).id;
  if (id) out.add(id);
  for (const child of root.children ?? []) if (isEl(child)) collectIds(child, out);
  return out;
}

function removeWhere(root: El, pred: (n: El) => boolean) {
  root.children = (root.children ?? []).filter((c) => !(isEl(c) && pred(c)));
  for (const child of root.children) if (isEl(child)) removeWhere(child, pred);
}

function parentOf(root: El, target: El): El | null {
  for (const child of root.children ?? []) {
    if (child === target) return root;
    if (isEl(child)) {
      const hit = parentOf(child, target);
      if (hit) return hit;
    }
  }
  return null;
}

export interface GroupContext {
  labelID: string;
  describedByIDs?: string;
  isDisabled: boolean;
}

function disableButton(btn: El) {
  const a = attrsOf(btn);
  if (btn.name === 'a') {
    // A disabled link is an anti-pattern (Button): it falls back to a <button>.
    btn.name = 'button';
    for (const k of ['href', 'target', 'rel', 'download', 'hreflang', 'ping', 'referrerpolicy']) delete a[k];
    a.type = 'button';
  }
  if ('data-ax-tooltip' in a) {
    a['aria-disabled'] = 'true';
    a['data-ax-disabled-interaction'] = '';
  } else {
    a.disabled = '';
  }
  a['data-ax-disabled'] = '';
}

/** Unwrap one Field-composed member; returns the nodes that replace its Field root. */
function unwrapMember(field: El, ctx: GroupContext): Node[] {
  const control = find(field, (n) => GROUP_CONTROL in attrsOf(n));
  if (!control) return [field];
  const allIds = collectIds(field);

  // The control and the layer roots right after it (e.g. a disabled-message tooltip) stay.
  const holder = parentOf(field, control) ?? field;
  const siblings = holder.children ?? [];
  const keep: El[] = [control];
  for (let i = siblings.indexOf(control) + 1; i < siblings.length; i++) {
    const sib = siblings[i];
    if (isEl(sib) && isLayerRoot(sib)) keep.push(sib);
  }

  removeWhere(control, (n) => GROUP_DROP in attrsOf(n) || (ctx.isDisabled && GROUP_DROP_DISABLED in attrsOf(n)));
  const keptIds = new Set<string>();
  for (const k of keep) collectIds(k, keptIds);
  const removedIds = allIds.difference(keptIds);
  const keepToken = (list: string | undefined) => (list ?? '').split(/\s+/).filter((id) => id && !removedIds.has(id)).join(' ');

  const label = find(control, (n) => GROUP_LABEL in attrsOf(n));
  if (label) {
    const a = attrsOf(label);
    delete a.hidden;
    delete a[GROUP_LABEL];
    a.class = 'ax-visually-hidden';
  }

  const ca = attrsOf(control);
  ca['data-astryx-input-group-item'] = '';

  for (const input of findAll(control, (n) => GROUP_INPUT in attrsOf(n))) {
    const a = attrsOf(input);
    a['aria-labelledby'] = joinAriaIDs(ctx.labelID, label ? attrsOf(label).id : undefined, keepToken(a['aria-labelledby'])) ?? '';
    const describedBy = joinAriaIDs(ctx.describedByIDs, keepToken(a['aria-describedby']));
    if (describedBy) a['aria-describedby'] = describedBy;
    else delete a['aria-describedby'];
    if (ctx.isDisabled) {
      a['aria-disabled'] = 'true';
      a.readonly = '';
      delete a.name;
    }
  }
  if (ctx.isDisabled) {
    ca['data-disabled'] = 'disabled';
    for (const n of findAll(control, (x) => GROUP_DISABLE in attrsOf(x))) attrsOf(n)['aria-disabled'] = 'true';
  }
  return keep;
}

function walk(parent: El, ctx: GroupContext, depth: number) {
  const next: Node[] = [];
  for (const child of parent.children ?? []) {
    if (!isEl(child)) { next.push(child); continue; }
    if (isLayerRoot(child)) { next.push(child); continue; }
    const keys = markers(child);
    if (keys.includes(GROUP_KEY)) {
      const rest = keys.filter((k) => k !== GROUP_KEY);
      if (rest.length) attrsOf(child)['data-ax-inherit'] = rest.join(' ');
      else delete attrsOf(child)['data-ax-inherit'];
      next.push(...unwrapMember(child, ctx));
      continue;
    }
    if (classes(child).includes('astryx-button')) {
      if (depth === 0) attrsOf(child)['data-astryx-input-group-item'] = '';
      if (ctx.isDisabled) disableButton(child);
      next.push(child);
      continue;
    }
    // A nested InputGroup already applied its own context.
    if (!classes(child).includes('astryx-input-group')) walk(child, ctx, depth + 1);
    next.push(child);
  }
  parent.children = next;
}

/** Apply the group context to the slot HTML of an InputGroup. */
export async function adoptGroupMembers(html: string, ctx: GroupContext): Promise<string> {
  if (!html) return html;
  const ast = parse(html) as El;
  walk(ast, ctx, 0);
  return render(ast);
}
