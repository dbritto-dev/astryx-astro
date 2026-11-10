/**
 * Tree rows — port of @astryxdesign/core Table/plugins/tree/useTableTreeState.tsx and
 * useTableTreeData.tsx (0.7.9).
 *
 * `useTableTreeState()` flattens nested data depth-first (cycle-safe, siblings optionally
 * sorted) and returns the rows plus a config for `useTableTreeData()`, which decorates the
 * tree column's cells in place (per-level indent + chevron, or a spacer on leaves) and marks
 * the rows' level and expansion (`data-ax-tree-level` / `data-ax-tree-expanded`).
 * Deviation from Astryx (accessibility, docs/accessibility.md): Astryx puts `aria-level` /
 * `aria-expanded` on the rows, which ARIA defines for rows only inside a treegrid, and this
 * is a table (no grid keyboard model). Expansion is exposed on each row's expander button
 * (`aria-expanded`, "Expand <row>"); nesting is shown by indent. Deviation by necessity: Astryx unmounts
 * collapsed subtrees; here every row is rendered and descendants of a collapsed row are
 * `hidden`, so the client expands without a round trip (`visibleData` therefore holds every
 * row in tree order). Lazy children (`isItemExpandable` without children) are the caller's:
 * listen for the event and re-render.
 *
 * Event: `astryx-expanded-ids-change` (cancelable) `{ids, id, isExpanded}` on the `<ax-table>`
 * — Astryx `onExpandedIdsChange(ids)` plus the toggled row (`id` is null for expand/collapse
 * all). Element API: `table.expandedIds` (get/set).
 */
import {withFeature} from '../pipeline';
import {comp, el} from '../node';
import TreeCell from '../_TreeCell.astro';
import TreeExpandAll from '../_TreeExpandAll.astro';
import type {TableColumn, TableIdKey, TableNode, TablePlugin} from '../types';

export interface TableTreeRowMeta {
  id: string;
  /** 0-based depth. */
  level: number;
  hasChildren: boolean;
  isExpanded: boolean;
  /** Port extension: an ancestor is collapsed (the row renders hidden). */
  isHidden?: boolean;
}

export interface UseTableTreeDataConfig<T extends Record<string, unknown>> {
  getRowMeta: (item: T) => TableTreeRowMeta | undefined;
  /** Row identity for the expander's name ("Expand Docs"). */
  getRowLabel?: (item: T) => string;
  /** False = no-op plugin (flat data renders as without it). */
  hasExpandableRows: boolean;
  isAllExpanded?: boolean | 'indeterminate';
  /** Show the expand-all toggle in the tree column header. @default false */
  hasExpandAllControl?: boolean;
  /** Indent step per level: spacing-3 / -4 / -6. @default 'md' */
  indent?: 'sm' | 'md' | 'lg';
  /** Column carrying the indent + expander. @default the first non-synthetic column */
  treeColumnKey?: string;
  /** Click anywhere on an expandable row toggles it. @default false */
  hasRowClickExpansion?: boolean;
}

export interface UseTableTreeStateConfig<T extends Record<string, unknown>> {
  data: T[];
  idKey: TableIdKey<T>;
  /** @default 'children' */
  childrenKey?: string;
  /** Rows expanded on first render (uncontrolled). */
  defaultExpandedIds?: Iterable<string>;
  /** Expanded rows (controlled). */
  expandedIds?: ReadonlySet<string> | Iterable<string>;
  /** Override "has a non-empty children array" (lazy loading). */
  isItemExpandable?: (item: T) => boolean;
  /** Sort each sibling group (pass `applySort` from useTableSortableState). */
  sortSiblings?: (siblings: T[]) => T[];
  indent?: 'sm' | 'md' | 'lg';
  treeColumnKey?: string;
}

export interface UseTableTreeStateResult<T extends Record<string, unknown>> {
  /** Every row in tree order (descendants of collapsed rows render hidden). */
  visibleData: T[];
  treeConfig: UseTableTreeDataConfig<T>;
  expandedIds: ReadonlySet<string>;
  isAllExpanded: boolean | 'indeterminate';
}

export function useTableTreeState<T extends Record<string, unknown>>(config: UseTableTreeStateConfig<T>): UseTableTreeStateResult<T> {
  const {data, idKey, childrenKey = 'children', isItemExpandable, sortSiblings, indent, treeColumnKey} = config;
  const getId = (item: T) => (typeof idKey === 'function' ? String(idKey(item)) : String(item[idKey]));
  const getChildren = (item: T): T[] => {
    const c = item[childrenKey];
    return Array.isArray(c) ? (c as T[]) : [];
  };
  const getIsExpandable = (item: T) => (isItemExpandable ? isItemExpandable(item) : getChildren(item).length > 0);
  const expandedIds: ReadonlySet<string> = new Set(config.expandedIds ?? config.defaultExpandedIds ?? []);

  const rows: T[] = [];
  const meta = new Map<string, TableTreeRowMeta>();
  const allExpandable: string[] = [];
  const path = new Set<string>();
  const walk = (items: T[], level: number, hidden: boolean) => {
    const siblings = sortSiblings ? sortSiblings([...items]) : items;
    for (const item of siblings) {
      const id = getId(item);
      if (path.has(id)) continue;
      const hasChildren = getIsExpandable(item);
      if (hasChildren) allExpandable.push(id);
      const isExpanded = hasChildren && expandedIds.has(id);
      rows.push(item);
      meta.set(id, {id, level, hasChildren, isExpanded, isHidden: hidden});
      path.add(id);
      walk(getChildren(item), level + 1, hidden || !isExpanded);
      path.delete(id);
    }
  };
  walk(data, 0, false);

  const hasExpandableRows = allExpandable.length > 0;
  const expandedCount = allExpandable.filter((id) => expandedIds.has(id)).length;
  const isAllExpanded: boolean | 'indeterminate' =
    !hasExpandableRows || expandedCount === 0 ? false : expandedCount === allExpandable.length ? true : 'indeterminate';

  return {
    visibleData: rows,
    expandedIds,
    isAllExpanded,
    treeConfig: {getRowMeta: (item) => meta.get(getId(item)), hasExpandableRows, isAllExpanded, indent, treeColumnKey},
  };
}

export function useTableTreeData<T extends Record<string, unknown>>(config: UseTableTreeDataConfig<T>): TablePlugin<T> {
  let treeKey: string | undefined;
  return {
    transformColumns(columns) {
      const {hasExpandableRows, treeColumnKey} = config;
      const configuredExists = treeColumnKey != null && columns.some((c) => c.key === treeColumnKey);
      treeKey = configuredExists ? treeColumnKey : (columns.find((c) => !c.key.startsWith('__'))?.key ?? columns[0]?.key);
      if (!hasExpandableRows) return columns;
      return columns.map((col): TableColumn<T> => {
        if (col.key !== treeKey) return col;
        const original = col.renderCell;
        return {
          ...col,
          renderCell: (item: T): TableNode => {
            const content: TableNode = original ? original(item) : String((item[col.key] as string | number | null | undefined) ?? '');
            const meta = config.getRowMeta(item);
            if (!meta) return content;
            return comp(
              TreeCell,
              {level: meta.level, hasChildren: meta.hasChildren, isExpanded: meta.isExpanded, rowLabel: config.getRowLabel?.(item), indent: config.indent ?? 'md'},
              content,
              {table: true},
            );
          },
        };
      });
    },

    transformHeaderCell(props, column) {
      const {hasExpandableRows, hasExpandAllControl, isAllExpanded} = config;
      if (!hasExpandAllControl || !hasExpandableRows || column.key !== treeKey || isAllExpanded === undefined) return props;
      return {
        ...props,
        content: el('span', {class: 'ax-table-tree-header'}, [comp(TreeExpandAll, {isAllExpanded}, undefined, {table: true}), props.content]),
      };
    },

    transformBodyRow(props, item) {
      if (!config.hasExpandableRows) return props;
      const meta = config.getRowMeta(item);
      if (!meta) return props;
      const rowClick = config.hasRowClickExpansion === true && meta.hasChildren;
      return {
        ...props,
        htmlProps: {
          ...props.htmlProps,
          'data-ax-tree-id': meta.id,
          'data-ax-tree-level': meta.level + 1,
          'data-ax-tree-expanded': meta.hasChildren ? String(meta.isExpanded) : undefined,
          hidden: meta.isHidden ? true : props.htmlProps.hidden,
          'data-ax-row-click-expansion': rowClick ? 'tree' : props.htmlProps['data-ax-row-click-expansion'],
        },
        xstyle: rowClick ? [...props.xstyle, 'ax-table-clickable-row'] : props.xstyle,
      };
    },

    transformScrollWrapper(props) {
      return config.hasExpandableRows ? {...props, htmlProps: withFeature(props.htmlProps, 'tree')} : props;
    },
  };
}
