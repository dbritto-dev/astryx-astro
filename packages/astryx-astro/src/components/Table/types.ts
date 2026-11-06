/**
 * Table types — port of @astryxdesign/core Table/types.ts (0.7.9), server-side.
 *
 * Astryx's plugin pipeline transforms React render props; here it transforms the same
 * render props with `TableNode` in place of `ReactNode` (strings, trusted HTML, plain
 * elements, Astro components with props, or a slot placeholder the Table resolves) and a
 * list of class names in place of `xstyle`. Everything runs during the server render; the
 * client behaviours read what the plugins write into the DOM.
 */
import type {Translate} from '../../lib/i18n';

// =============================================================================
// Nodes (the ReactNode stand-in)
// =============================================================================

/** An Astro component (what `.astro` files export). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AstroComponent = ((...args: any[]) => unknown) & {isAstroComponentFactory?: boolean};

/** Markup a column, a plugin or a slot contributes — Astryx's `ReactNode`, rendered on the server. */
export type TableNode =
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | TableHtmlNode
  | TableElementNode
  | TableComponentNode
  | TableSlotNode
  | readonly TableNode[];

/** Trusted markup, inserted as is (never pass user input here). */
export interface TableHtmlNode {
  html: string;
}

/** A plain HTML element. `attrs.style` may be an object; `attrs.class` a string or a list. */
export interface TableElementNode {
  tag: string;
  attrs?: TableAttrs;
  children?: TableNode;
}

/**
 * An Astro component with props; `children` becomes its default slot. `table: true` passes
 * the table's render context (`TableRenderContext`) as a `table` prop — the TableContext
 * stand-in for components a plugin renders.
 */
export interface TableComponentNode {
  component: AstroComponent;
  props?: Record<string, unknown>;
  children?: TableNode;
  table?: boolean;
}

/** A placeholder the Table fills with one of its own named slots: `Astro.slots.render(slot, args)`. */
export interface TableSlotNode {
  slot: string;
  args?: unknown[];
}

export type TableStyle = Record<string, string | number | null | undefined | false>;
export type TableAttrs = Record<string, unknown> & {style?: TableStyle | string; class?: string | string[]};

// =============================================================================
// Column width
// =============================================================================

/** A proportional (fr-like) column width. Use `proportional()`. */
export interface ProportionalWidth {
  type: 'proportional';
  value: number;
  /** Minimum width in pixels. */
  minWidth?: number;
}

/** A fixed pixel column width. Use `pixel()`. */
export interface PixelWidth {
  type: 'pixel';
  value: number;
}

export type ColumnWidth = ProportionalWidth | PixelWidth;

// =============================================================================
// Columns
// =============================================================================

export interface TableSortableColumnConfig {
  /** Sort key for this column. @default column.key */
  sortKey?: string;
}

export type TableColumnAlign = 'start' | 'center' | 'end';
export type TableVerticalAlign = 'middle' | 'top' | 'bottom';

/** Filter field reference (filtering plugin — deferred; accepted and ignored). */
export interface TableFilterFieldRef {
  field: string;
  operator?: string;
}

/**
 * Column definition for data-driven rendering (Astryx `TableColumn<T>`).
 *
 * Rich cells: `renderCell` returns a `TableNode` (text, `{component, props}`, `{tag, attrs,
 * children}` or `{html}`), or pass markup as the Table's `cell:<key>` slot function:
 *   <Fragment slot="cell:status">{(row) => <Badge label={row.status} />}</Fragment>
 */
export interface TableColumn<T extends Record<string, unknown> = Record<string, unknown>> {
  /** Unique key; also the field read for the cell value. */
  key: string;
  /** Header content. @default the key (capitalized when columns are generated) */
  header?: TableNode;
  /** `proportional(n, {minWidth})` or `pixel(n)`. Omitted = proportional(1) with a 60px floor. */
  width?: ColumnWidth;
  /** Horizontal alignment of the header and body cells. @default 'start' */
  align?: TableColumnAlign;
  /** Whether the column's header border can be dragged. @default true */
  resizable?: boolean;
  /** `true`, or `{sortKey}` to sort by another field. */
  sortable?: boolean | TableSortableColumnConfig;
  /** Filtering plugin field (deferred: not rendered yet). */
  filter?: TableFilterFieldRef | string;
  /** Custom cell content (server-side; Astryx's render prop). */
  renderCell?: (item: T) => TableNode;
  /**
   * Port extension: the value this column shows, when it is not `item[key]` (nested fields,
   * derived values). Read by the default renderer and as the column's default sort value.
   */
  accessor?: (item: T) => unknown;
  /**
   * Port extension: format the value for the default renderer (currency, dates …). The
   * result is still default-rendered text, so `textOverflow="truncate"` keeps its tooltip.
   */
  format?: (value: unknown, item: T) => string;
}

// =============================================================================
// Render props (plugin transform targets)
// =============================================================================

/** Props for the `<table>` element. */
export interface TableRenderProps {
  htmlProps: TableAttrs;
  /** Class names (Astryx `xstyle`). */
  xstyle: string[];
}

/** Props for the header `<tr>`. */
export interface HeaderRowRenderProps {
  htmlProps: TableAttrs;
  xstyle: string[];
  children: TableNode;
}

/**
 * Props for each `<th>`. Named slots so several plugins can contribute without conflict:
 * `before | content | after`, `overlay` (absolutely positioned, e.g. the resize handle),
 * `below` (under the label row, e.g. inline filters).
 */
export interface HeaderCellRenderProps {
  htmlProps: TableAttrs;
  xstyle: string[];
  before?: TableNode;
  content?: TableNode;
  after?: TableNode;
  overlay?: TableNode;
  below?: TableNode;
  /** Context-menu actions (ContextMenu not ported yet: collected, not rendered). */
  contextMenuActions?: TableContextActions;
  columnIndex?: number;
  columns?: ReadonlyArray<TableColumn<Record<string, unknown>>>;
}

/** Props for each body `<tr>`. */
export interface BodyRowRenderProps {
  htmlProps: TableAttrs;
  xstyle: string[];
  children: TableNode;
  /** Rows rendered right after this one (e.g. an expansion panel). */
  afterRow?: TableNode;
}

/** Props for each body `<td>`. */
export interface BodyCellRenderProps {
  htmlProps: TableAttrs;
  xstyle: string[];
  contextMenuActions?: TableContextActions;
  columnIndex?: number;
  columns?: ReadonlyArray<TableColumn<Record<string, unknown>>>;
  /** Render the cell empty (neither renderCell nor the default renderer runs). */
  isContentSuppressed?: boolean;
}

/** Props for the scroll wrapper (`<ax-table>`, the horizontal scroll region). */
export interface ScrollWrapperRenderProps {
  htmlProps: TableAttrs;
  xstyle: string[];
  /** Inside the scroll region, before the `<table>`. */
  beforeTable?: TableNode;
  /** Inside the scroll region, after the `<table>`. */
  afterTable?: TableNode;
}

export interface TableContextAction {
  id: string;
  label: TableNode;
  icon?: TableNode;
  /** Not callable across the server/client boundary; kept for type parity. */
  onSelect?: () => void;
  disabled?: boolean;
  group?: string;
  checked?: boolean;
  variant?: 'default' | 'destructive';
}
export type TableContextActions = TableContextAction[] | (() => TableContextAction[]);

// =============================================================================
// Plugin interface
// =============================================================================

export type TableDensity = 'compact' | 'balanced' | 'spacious';
export type TableDividers = 'rows' | 'columns' | 'grid' | 'none';
export type TableTextOverflow = 'wrap' | 'truncate';

/** What Table's context holds (Astryx TableContextValue) plus the render's locale. */
export interface TableRenderContext {
  density: TableDensity;
  dividers: TableDividers;
  isStriped: boolean;
  hasHover: boolean;
  verticalAlign: TableVerticalAlign;
  textOverflow: TableTextOverflow;
  /** Resolved locale of this render. */
  locale: string;
}

/** Passed as the last argument of every transform. */
export interface TablePluginContext<T extends Record<string, unknown> = Record<string, unknown>> extends TableRenderContext {
  /** Translator bound to the table's locale. */
  t: Translate;
  /** Unique per table render (ids for plugin elements: `${idBase}-…`). */
  idBase: string;
  /** The `data` prop (undefined in children mode). */
  data: readonly T[] | undefined;
  /** Whether the Table received this named slot (for `slot()` placeholders). */
  hasSlot: (name: string) => boolean;
}

/**
 * Table plugin — Astryx's transform pipeline, run on the server. Order:
 * transformColumns → transformTable → transformHeaderCell → transformHeaderRow →
 * transformBodyCell → transformBodyRow → transformScrollWrapper → transformTableContext.
 * Every transform receives the render context as its last argument.
 *
 * Client behaviour: a plugin writes `data-ax-features="<name>"` onto the scroll wrapper
 * (transformScrollWrapper) and loads a module that calls `registerTableBehavior(name, …)`
 * from `elements/table.ts` (see README "Plugin hook points").
 */
export interface TablePlugin<T extends Record<string, unknown> = Record<string, unknown>> {
  transformColumns?: (columns: TableColumn<T>[], context: TablePluginContext<T>) => TableColumn<T>[];
  transformTable?: (props: TableRenderProps, context: TablePluginContext<T>) => TableRenderProps;
  transformHeaderRow?: (props: HeaderRowRenderProps, context: TablePluginContext<T>) => HeaderRowRenderProps;
  transformHeaderCell?: (
    props: HeaderCellRenderProps,
    column: TableColumn<T>,
    columnIndex: number,
    columns: ReadonlyArray<TableColumn<T>>,
    context: TablePluginContext<T>,
  ) => HeaderCellRenderProps;
  transformBodyRow?: (props: BodyRowRenderProps, item: T, index: number, context: TablePluginContext<T>) => BodyRowRenderProps;
  transformBodyCell?: (
    props: BodyCellRenderProps,
    column: TableColumn<T>,
    item: T,
    columnIndex: number,
    columns: ReadonlyArray<TableColumn<T>>,
    context: TablePluginContext<T>,
  ) => BodyCellRenderProps;
  transformScrollWrapper?: (props: ScrollWrapperRenderProps, context: TablePluginContext<T>) => ScrollWrapperRenderProps;
  /** Wrap (or surround) the whole table output, e.g. pagination chrome above and below. */
  transformTableContext?: (children: TableNode, context: TablePluginContext<T>) => TableNode;
}

/** Row key: a property name or an extractor (Astryx `idKey`). */
export type TableIdKey<T> = (keyof T & string) | ((item: T) => string | number);
