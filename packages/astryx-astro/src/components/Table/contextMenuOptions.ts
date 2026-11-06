/**
 * Table context-menu actions as ContextMenu data items. Port of @astryxdesign/core
 * Table/tableContextMenu.tsx (`resolveContextActions`, `toContextMenuOptions`) for the
 * children-mode cells (TableCell / TableHeaderCell `contextMenuActions`), which wrap their
 * content in a ContextMenu as Astryx's `wrapInTableContextMenu` does. Data-mode tables build
 * their menus in pipeline.ts (row templates + `astryx-context-action` on `<ax-table>`).
 */
import type {DropdownMenuOption, MenuIcon} from '../DropdownMenu/menuShared';
import type {TableContextAction, TableContextActions} from './types';

/**
 * Resolve a `contextMenuActions` value (array or getter) to a plain array — compose a prior
 * plugin's actions with `[...resolveContextActions(props.contextMenuActions), ...mine]`.
 */
export function resolveContextActions(actions: TableContextActions | undefined): TableContextAction[] {
  if (typeof actions === 'function') return actions();
  return actions ?? [];
}

/**
 * The flat action list as ContextMenu items: a divider between groups (first-seen group
 * order, ungrouped actions as their own group), a checked action shows a check mark instead
 * of its icon, a non-string label shows the id. Each row carries the action's `id` as
 * `data-id` (`astryx-select` listeners tell rows apart by it).
 */
export function toContextMenuOptions(actions: readonly TableContextAction[]): DropdownMenuOption[] {
  const order: string[] = [];
  const buckets = new Map<string, TableContextAction[]>();
  for (const action of actions) {
    const key = action.group ?? '__ungrouped__';
    let bucket = buckets.get(key);
    if (!bucket) {
      buckets.set(key, (bucket = []));
      order.push(key);
    }
    bucket.push(action);
  }
  const options: DropdownMenuOption[] = [];
  order.forEach((key, groupIndex) => {
    if (groupIndex > 0) options.push({type: 'divider'});
    for (const action of buckets.get(key) ?? []) {
      const icon = action.checked ? 'check' : typeof action.icon === 'string' || typeof action.icon === 'function' ? (action.icon as MenuIcon) : undefined;
      options.push({
        id: action.id,
        label: typeof action.label === 'string' ? action.label : typeof action.label === 'number' ? String(action.label) : action.id,
        icon,
        isDisabled: action.disabled || undefined,
        variant: action.variant === 'destructive' ? 'destructive' : undefined,
      });
    }
  });
  return options;
}

/** A cell's ContextMenu items, or null when it has no actions (the native menu passes through). */
export function contextMenuItems(actions: TableContextActions | undefined): DropdownMenuOption[] | null {
  const resolved = resolveContextActions(actions);
  return resolved.length > 0 ? toContextMenuOptions(resolved) : null;
}
