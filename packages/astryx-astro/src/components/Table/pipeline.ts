/**
 * The table render pipeline — port of @astryxdesign/core Table/BaseTable.tsx,
 * Table/Table.tsx (TableScrollWrapper) and Table/useBaseTablePlugins.ts (0.7.9).
 *
 * `buildTable()` resolves columns, runs every plugin transform in Astryx's order and returns
 * one TableNode tree (scroll wrapper → content box → `<table>` → sections → rows → cells),
 * which Table.astro renders with `_TableNode.astro` after filling slot placeholders. It is
 * synchronous: plugins may keep per-render state in closures between transforms.
 */
import {devError, devWarn} from '../../lib/devWarning';
import {styleToString, type StyleValue} from '../../lib/style';
import EmptyState from '../EmptyState/EmptyState.astro';
import Text from '../Text/Text.astro';
import {defaultCellText, generateColumns, resolveColumnWidths, resolveTableMinWidth} from './columnUtils';
import {comp, el, isRenderable} from './node';
import type {
  BodyCellRenderProps,
  BodyRowRenderProps,
  HeaderCellRenderProps,
  HeaderRowRenderProps,
  ScrollWrapperRenderProps,
  TableAttrs,
  TableColumn,
  TableDensity,
  TableIdKey,
  TableNode,
  TablePlugin,
  TablePluginContext,
  TableRenderProps,
} from './types';

// =============================================================================
// Shared attribute builders (also used by the children-mode components)
// =============================================================================

/** `<td>` hooks: `astryx-table-cell` + `data-density` (TableCell themeProps). */
export function cellHooks(density: TableDensity | undefined, inherit: boolean): Record<string, string | undefined> {
  return {'data-density': density, 'data-ax-inherit': inherit && density === undefined ? 'table-density' : undefined};
}

/** Append a feature name to a scroll wrapper's `data-ax-features` list. */
export function withFeature(htmlProps: TableAttrs, feature: string): TableAttrs {
  const current = typeof htmlProps['data-ax-features'] === 'string' ? (htmlProps['data-ax-features'] as string).split(/\s+/) : [];
  if (!current.includes(feature)) current.push(feature);
  return {...htmlProps, 'data-ax-features': current.filter(Boolean).join(' ')};
}

/** Merge two style values (object or string), later wins. */
export function mergeStyle(a: TableAttrs['style'], b: TableAttrs['style']): string | undefined {
  const out = [styleToString(a as StyleValue), styleToString(b as StyleValue)].filter(Boolean).join(';');
  return out || undefined;
}

// =============================================================================
// Plugin ordering (useBaseTablePlugins)
// =============================================================================

const PLUGIN_ORDER: ReadonlyArray<string> = ['columnSettings', 'sort', 'tree', 'selection', 'pagination'];
const PLUGIN_ORDER_MAP = new Map(PLUGIN_ORDER.map((name, index) => [name, index]));
const VALID_TRANSFORM_KEYS = new Set([
  'transformColumns',
  'transformTable',
  'transformHeaderRow',
  'transformHeaderCell',
  'transformBodyRow',
  'transformBodyCell',
  'transformScrollWrapper',
  'transformTableContext',
]);

function validatePlugin(name: string, plugin: Record<string, unknown>): void {
  const keys = Object.keys(plugin);
  for (const key of keys) {
    if (!VALID_TRANSFORM_KEYS.has(key)) {
      devWarn('Table', `Plugin "${name}" has unknown key "${key}". Valid keys: ${[...VALID_TRANSFORM_KEYS].join(', ')}. This key will be ignored.`);
    } else if (plugin[key] != null && typeof plugin[key] !== 'function') {
      devWarn('Table', `Plugin "${name}" has non-function value for "${key}" (got ${typeof plugin[key]}). Transform will be skipped.`);
    }
  }
  if (!keys.some((k) => VALID_TRANSFORM_KEYS.has(k) && typeof plugin[k] === 'function')) {
    devWarn('Table', `Plugin "${name}" has no transform methods. It will be included in the pipeline but won't do anything.`);
  }
}

/** Named plugin record → ordered array (canonical first-party order, then record order). */
export function orderPlugins<T extends Record<string, unknown>>(plugins: Record<string, TablePlugin<T> | null | undefined> | undefined): TablePlugin<T>[] {
  if (!plugins) return [];
  const entries = Object.entries(plugins).filter((e): e is [string, TablePlugin<T>] => e[1] != null);
  for (const [name, plugin] of entries) validatePlugin(name, plugin as unknown as Record<string, unknown>);
  const unknownBase = PLUGIN_ORDER.length;
  return entries
    .sort(([a], [b]) => (PLUGIN_ORDER_MAP.get(a) ?? unknownBase) - (PLUGIN_ORDER_MAP.get(b) ?? unknownBase))
    .map(([, plugin]) => plugin);
}

function applyPlugins<TProps>(
  plugins: TablePlugin<never>[],
  key: keyof TablePlugin,
  initial: TProps,
  ...args: unknown[]
): TProps {
  return plugins.reduce<TProps>((acc, plugin, index) => {
    const transform = plugin[key] as ((props: TProps, ...rest: unknown[]) => TProps) | undefined;
    if (typeof transform !== 'function') return acc;
    try {
      return transform(acc, ...args);
    } catch (error) {
      devError('Table', `Plugin at index ${index} threw in transform:`, error);
      return acc;
    }
  }, initial);
}

// =============================================================================
// Build
// =============================================================================

export interface BuildTableInput<T extends Record<string, unknown>> {
  data: readonly T[] | undefined;
  columns: TableColumn<T>[] | undefined;
  idKey?: TableIdKey<T>;
  plugins: TablePlugin<T>[];
  /** Children mode: the (stamped) default slot markup. */
  children?: TableNode;
  caption?: {id: string; node: TableNode};
  /** `undefined` = the default compact EmptyState, `false` = none. */
  emptyState?: TableNode | false;
  rowIndexStart?: number;
  rowCount?: number;
  /** The consumer's remaining `<table>` attributes (class, style, aria-*, data-* …). */
  tableAttrs: Record<string, unknown>;
  context: TablePluginContext<T>;
}

export interface BuiltTable {
  root: TableNode;
}

export function buildTable<T extends Record<string, unknown>>(input: BuildTableInput<T>): BuiltTable {
  const {data, columns: columnsProp, plugins: typedPlugins, children, context: ctx, rowIndexStart, rowCount} = input;
  const plugins = typedPlugins as unknown as TablePlugin<never>[];
  const t = ctx.t;
  const isChildrenMode = children !== undefined;

  // ARIA row indexing (data-driven mode only).
  const ariaRowIndexingEnabled = !isChildrenMode && (rowIndexStart != null || rowCount != null);
  const firstRowAriaIndex = rowIndexStart ?? 1;
  const ariaRowCount = ariaRowIndexingEnabled ? (rowCount ?? -1) : undefined;

  const baseColumns: TableColumn<T>[] = isChildrenMode ? [] : (columnsProp ?? (data ? generateColumns(data) : []));
  const resolvedColumns = applyPlugins<TableColumn<T>[]>(plugins, 'transformColumns', baseColumns, ctx);
  const resolvedWidths = resolveColumnWidths(resolvedColumns);
  const columnsForPlugins = resolvedColumns as unknown as ReadonlyArray<TableColumn<Record<string, unknown>>>;

  // --- table ---
  const tableRenderProps = applyPlugins<TableRenderProps>(plugins, 'transformTable', {htmlProps: {}, xstyle: []}, ctx);

  // --- header cells ---
  const headerCells: TableNode[] = resolvedColumns.map((col, columnIndex) => {
    const headerContent: TableNode = col.header ?? col.key;
    const initialStyle: Record<string, string> = {};
    if (col.align) initialStyle.textAlign = col.align;
    const initial: HeaderCellRenderProps = {
      htmlProps: {'data-column-key': col.key, scope: 'col', ...(col.align ? {style: initialStyle} : {})},
      xstyle: [],
      content: headerContent,
      columnIndex,
      columns: columnsForPlugins,
    };
    const cell = applyPlugins<HeaderCellRenderProps>(plugins, 'transformHeaderCell', initial, col, columnIndex, resolvedColumns, ctx);
    const widthStyle = resolvedWidths.columns.get(col.key)?.style ?? {};
    const style = mergeStyle(widthStyle, cell.htmlProps.style);

    const resolvedContent = cell.content ?? headerContent;
    const title = typeof resolvedContent === 'string' && resolvedContent.length > 0 ? resolvedContent : undefined;
    const {before, after, overlay, below} = cell;
    const hasSlots = before != null || after != null || overlay != null || below != null;
    const labelRow: TableNode = isRenderable(after ?? null)
      ? el('div', {class: 'ax-table-header-label-row'}, [resolvedContent, after])
      : resolvedContent;
    const namesOwnHeader = isRenderable(overlay ?? null) && cell.htmlProps['aria-label'] == null && cell.htmlProps['aria-labelledby'] == null;
    const labelId = `${ctx.idBase}-label-${columnIndex}`;
    const belowId = `${ctx.idBase}-below-${columnIndex}`;
    const hasBelow = isRenderable(below ?? null);
    const inner: TableNode = !hasSlots
      ? resolvedContent
      : namesOwnHeader
        ? [el('span', {id: labelId}, [before, labelRow]), overlay, hasBelow ? el('div', {id: belowId}, below) : null]
        : [before, labelRow, overlay, below];
    const nameProps = namesOwnHeader ? {'aria-labelledby': hasBelow ? `${labelId} ${belowId}` : labelId} : {};
    return el(
      'th',
      {
        ...cell.htmlProps,
        ...nameProps,
        title,
        ...cellHooks(ctx.density, false),
        class: ['astryx-table-header-cell', ...cell.xstyle, ...classList(cell.htmlProps.class)],
        style,
      },
      inner,
    );
  });

  const headerRow = applyPlugins<HeaderRowRenderProps>(plugins, 'transformHeaderRow', {htmlProps: {}, xstyle: [], children: headerCells}, ctx);

  // --- body ---
  const hasData = data != null && data.length > 0;
  const hasColumns = resolvedColumns.length > 0;
  const bodyRows: TableNode[] = [];
  if (!isChildrenMode && hasData) {
    data.forEach((item, rowIndex) => {
      const cells: TableNode[] = resolvedColumns.map((col, columnIndex) => {
        const initial: BodyCellRenderProps = {
          htmlProps: col.align ? {style: {textAlign: col.align}} : {},
          xstyle: [],
          columnIndex,
          columns: columnsForPlugins,
        };
        const cell = applyPlugins<BodyCellRenderProps>(plugins, 'transformBodyCell', initial, col, item, columnIndex, resolvedColumns, ctx);
        const isDefaultRenderer = !col.renderCell;
        let content: TableNode = null;
        if (!cell.isContentSuppressed) {
          if (isDefaultRenderer) {
            const value = col.accessor ? col.accessor(item) : item[col.key];
            const text = col.format ? col.format(value, item) : defaultCellText(value);
            content = ctx.textOverflow === 'truncate' && text.length > 0 ? comp(Text, {type: 'body', maxLines: 1}, text) : text;
          } else {
            content = col.renderCell?.(item) ?? null;
          }
        }
        return el(
          'td',
          {...cell.htmlProps, ...cellHooks(ctx.density, false), class: ['astryx-table-cell', ...cell.xstyle, ...classList(cell.htmlProps.class)]},
          content,
        );
      });
      const row = applyPlugins<BodyRowRenderProps>(
        plugins,
        'transformBodyRow',
        {htmlProps: ariaRowIndexingEnabled ? {'aria-rowindex': firstRowAriaIndex + rowIndex} : {}, xstyle: [], children: cells},
        item,
        rowIndex,
        ctx,
      );
      bodyRows.push(el('tr', {...row.htmlProps, class: ['astryx-table-row', ...row.xstyle, ...classList(row.htmlProps.class)]}, row.children));
      if (row.afterRow != null) bodyRows.push(row.afterRow);
    });
  } else if (!isChildrenMode && data != null && input.emptyState !== false) {
    bodyRows.push(
      el('tr', undefined, el('td', {colspan: resolvedColumns.length || undefined}, input.emptyState ?? comp(EmptyState, {title: t('@astryx.table.noData'), isCompact: true}))),
    );
  }

  // --- <table> ---
  const {class: consumerClass, style: consumerStyle, ...rest} = input.tableAttrs as {class?: string; style?: StyleValue} & Record<string, unknown>;
  const mergedStyle = [styleToString(tableRenderProps.htmlProps.style as StyleValue), styleToString(consumerStyle ?? null)].filter(Boolean).join(';');
  let tableStyle = mergedStyle;
  if (resolvedWidths.tableMinWidth > 0) {
    const declarations = mergedStyle.split(';').filter(Boolean);
    let consumerMin: string | undefined;
    const others = declarations.filter((d) => {
      const m = /^\s*min-width\s*:\s*(.+?)\s*$/i.exec(d);
      if (m) consumerMin = m[1];
      return !m;
    });
    tableStyle = [...others, `min-width:${resolveTableMinWidth(consumerMin, resolvedWidths.tableMinWidth)}`].join(';');
  }
  const {class: pluginTableClass, style: _pluginTableStyle, ...pluginTableAttrs} = tableRenderProps.htmlProps;
  const sections: TableNode[] = [];
  if (input.caption) sections.push(el('caption', {id: input.caption.id, class: 'ax-table-caption'}, input.caption.node));
  if (isChildrenMode) {
    sections.push(children);
  } else {
    if (hasColumns) {
      sections.push(
        el('thead', {class: 'astryx-table-header'}, el('tr', {...headerRow.htmlProps, 'data-ax-header-row': '', class: ['astryx-table-row', ...headerRow.xstyle, ...classList(headerRow.htmlProps.class)]}, headerRow.children)),
      );
    }
    sections.push(el('tbody', {class: 'astryx-table-body'}, bodyRows));
  }
  const tableEl = el(
    'table',
    {
      'aria-rowcount': ariaRowCount,
      'data-ax-rowindex-start': ariaRowIndexingEnabled ? firstRowAriaIndex : undefined,
      ...pluginTableAttrs,
      'data-density': ctx.density,
      'data-dividers': ctx.dividers,
      'data-striped': ctx.isStriped ? '' : undefined,
      'data-hover': ctx.hasHover ? '' : undefined,
      'data-vertical-align': ctx.verticalAlign,
      'data-text-overflow': ctx.textOverflow,
      'data-ax-layout': isChildrenMode ? 'auto' : undefined,
      ...rest,
      class: ['astryx-table', ...tableRenderProps.xstyle, ...classList(pluginTableClass), ...classList(consumerClass)],
      style: tableStyle || undefined,
    },
    sections,
  );

  // --- scroll wrapper (Table.tsx TableScrollWrapper) ---
  const wrapper = applyPlugins<ScrollWrapperRenderProps>(plugins, 'transformScrollWrapper', {htmlProps: {}, xstyle: []}, ctx);
  const tableLabel = rest['aria-label'] as string | undefined;
  const tableLabelledBy = (rest['aria-labelledby'] as string | undefined) ?? (tableLabel == null && input.caption ? input.caption.id : undefined);
  const label = tableLabelledBy != null ? undefined : (tableLabel ?? t('@astryx.table.label'));
  const {class: wrapperClass, style: wrapperStyle, ...wrapperAttrs} = wrapper.htmlProps;
  let root: TableNode = el(
    'ax-table',
    {
      role: 'group',
      'aria-label': label,
      'aria-labelledby': wrapperAttrs['aria-label'] == null ? tableLabelledBy : undefined,
      ...wrapperAttrs,
      'data-scroll-axis': wrapperAttrs['data-scroll-axis'] ?? 'inline',
      'data-overscroll': wrapperAttrs['data-overscroll'] ?? 'contain',
      'data-scroll-inline-start': 'true',
      'data-scroll-inline-end': 'true',
      'data-scroll-block-start': 'true',
      'data-scroll-block-end': 'true',
      class: ['astryx-table-scroll-wrapper', ...wrapper.xstyle, ...classList(wrapperClass)],
      style: wrapperStyle,
    },
    el('div', {'data-scroll-content': ''}, [wrapper.beforeTable, tableEl, wrapper.afterTable]),
  );

  for (let i = plugins.length - 1; i >= 0; i--) {
    const transform = plugins[i].transformTableContext;
    if (!transform) continue;
    try {
      root = transform(root, ctx as never);
    } catch (error) {
      devError('Table', 'Plugin threw in transformTableContext:', error);
    }
  }
  return {root};
}

function classList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string' && v !== '');
  return typeof value === 'string' && value !== '' ? [value] : [];
}

/** The row key Astryx would use (`idKey`), as a string. */
export function rowKeyOf<T extends Record<string, unknown>>(item: T, index: number, idKey: TableIdKey<T> | undefined): string {
  if (idKey == null) return String(index);
  return typeof idKey === 'function' ? String(idKey(item)) : String(item[idKey]);
}
