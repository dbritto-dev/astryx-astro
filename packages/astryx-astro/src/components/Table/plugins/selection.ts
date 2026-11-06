/**
 * Row selection — port of @astryxdesign/core Table/plugins/selection/useTableSelection.tsx and
 * useTableSelectionState.tsx (0.7.9).
 *
 * `useTableSelection(config)` prepends the synthetic `__xds_selection` column (`pixel(36)`, not
 * resizable): a select-all CheckboxInput in its header ("Select all rows": checked / indeterminate
 * / unchecked) and a CheckboxInput per selectable row ("Select <getRowLabel(item)>", else
 * "Select row"; disabled when `getIsItemEnabled` says so; nothing for non-selectable rows), all
 * size sm and centered. Every selected row gets `aria-selected="true"` and, unless
 * `hasRowHighlight` is false, the accent-muted wash as an inline style, republished as
 * `--table-row-overlay` so pinned cells replay it. Rows carry their key
 * (`data-ax-selection-key`: `getRowKey`, else the Table's `idKey`).
 *
 * Client (elements/table-features/selection.ts): a row checkbox toggles its key, the header
 * selects every actionable row (selectable and enabled) or clears them, keeping disabled-but-
 * selected rows and keys outside the rendered rows (useTableSelectionState's frozen set).
 * Events on the `<ax-table>` (bubbling): `astryx-select-item` (cancelable) `{key, isSelected}`
 * (Astryx onSelectItem — the row's key instead of the item), `astryx-select-all` (cancelable)
 * `{isAllSelected}` (onSelectAll), then `astryx-selection-change`
 * `{selectedKeys, selectedCount, hasSelection}` (useTableSelectionState's state after
 * setSelectedKeys). `preventDefault()` on the first two keeps the current selection.
 * Element API: `table.selectedKeys` (get/set, no event), `table.clearSelection()`.
 *
 * Astryx has no Shift-range selection and no row-click selection; neither is added. Keyboard is
 * the checkboxes' own (Tab, Space).
 */
import {mergeStyle, withFeature} from '../pipeline';
import {comp, el} from '../node';
import {pixel} from '../columnUtils';
import SelectionCheckbox from '../_SelectionCheckbox.astro';
import type {TableColumn, TablePlugin} from '../types';

export interface UseTableSelectionConfig<T extends Record<string, unknown>> {
  /** Is this item currently selected? (server render) */
  getIsItemSelected: (item: T) => boolean;
  /** Astryx callback; not called in Astro — listen for `astryx-select-item` on the table. */
  onSelectItem?: (event: {item: T; isSelected: boolean}) => void;
  /** Astryx callback; not called in Astro — listen for `astryx-select-all` on the table. */
  onSelectAll?: (event: {isAllSelected: boolean}) => void;
  /** Are all selectable items selected? (the header's server state) */
  getIsAllSelected: () => boolean;
  /** Is the selection partial? Renders the header checkbox indeterminate. */
  getIsIndeterminate?: () => boolean;
  /** Should this row show a checkbox? @default () => true */
  getIsItemSelectable?: (item: T) => boolean;
  /** Is this row's checkbox interactive? @default () => true */
  getIsItemEnabled?: (item: T) => boolean;
  /** Row identity for the checkbox name: "Select <label>" instead of "Select row". */
  getRowLabel?: (item: T) => string;
  /** Paint selected rows with the accent wash (inline style). @default true */
  hasRowHighlight?: boolean;
  /** Port extension: the row's selection key. @default the Table's `idKey` (else the row index) */
  getRowKey?: (item: T) => string;
  /** Port extension: the complete selection, keys outside the rendered rows included. */
  selectedKeys?: Iterable<string>;
}

export const SELECTION_COLUMN_KEY = '__xds_selection';
const SELECTION_COLUMN_WIDTH = pixel(36);
const WASH = 'var(--color-accent-muted)';

export function useTableSelection<T extends Record<string, unknown>>(config: UseTableSelectionConfig<T>): TablePlugin<T> {
  const {getIsItemSelected, getIsItemSelectable, getIsItemEnabled, getRowLabel, getRowKey, hasRowHighlight = true} = config;
  const selectable = (item: T) => (getIsItemSelectable ? getIsItemSelectable(item) : true);
  const enabled = (item: T) => (getIsItemEnabled ? getIsItemEnabled(item) : true);
  // Keys the rendered rows report as selected (when the config gives no complete set).
  const renderedSelected: string[] = [];

  const headerState = (): boolean | 'indeterminate' =>
    config.getIsAllSelected() ? true : (config.getIsIndeterminate?.() ?? false) ? 'indeterminate' : false;

  const selectionColumn: TableColumn<T> = {
    key: SELECTION_COLUMN_KEY,
    header: comp(SelectionCheckbox, {kind: 'all', value: headerState()}, undefined, {table: true}),
    width: SELECTION_COLUMN_WIDTH,
    resizable: false,
    renderCell: (item: T) =>
      selectable(item)
        ? comp(SelectionCheckbox, {kind: 'row', value: getIsItemSelected(item), rowLabel: getRowLabel?.(item), isDisabled: !enabled(item)}, undefined, {table: true})
        : null,
  };

  return {
    transformColumns(columns) {
      // The header state is read once per render, after the caller's state is final.
      renderedSelected.length = 0;
      selectionColumn.header = comp(SelectionCheckbox, {kind: 'all', value: headerState()}, undefined, {table: true});
      return [selectionColumn, ...columns];
    },

    transformBodyRow(props, item, index, ctx) {
      const key = getRowKey ? getRowKey(item) : ctx.rowKey(item, index);
      const isSelected = getIsItemSelected(item);
      if (isSelected) renderedSelected.push(key);
      const wash = isSelected && hasRowHighlight ? {backgroundColor: WASH, '--table-row-overlay': WASH} : null;
      return {
        ...props,
        htmlProps: {
          ...props.htmlProps,
          'data-ax-selection-key': key,
          'aria-selected': isSelected ? 'true' : undefined,
          style: wash ? mergeStyle(props.htmlProps.style, wash) : props.htmlProps.style,
        },
      };
    },

    transformScrollWrapper(props) {
      const keys = config.selectedKeys != null ? [...config.selectedKeys] : renderedSelected;
      return {
        ...props,
        htmlProps: {
          ...withFeature(props.htmlProps, 'selection'),
          'data-ax-selected-keys': JSON.stringify([...new Set(keys)]),
          'data-ax-selection-highlight': hasRowHighlight ? undefined : 'false',
        },
      };
    },
  };
}

// =============================================================================
// useTableSelectionState
// =============================================================================

export interface UseTableSelectionStateConfig<T extends Record<string, unknown>> {
  /** The rows rendered in the table (select-all acts on these). */
  data: readonly T[];
  /** Key extractor: a property name or a function returning a unique string. */
  idKey: (keyof T & string) | ((item: T) => string);
  /** The selected keys — the initial state; the table owns it after load. */
  selectedKeys?: Iterable<string>;
  /** Astryx setter; not called in Astro — listen for `astryx-selection-change`. */
  setSelectedKeys?: unknown;
  /** Should this row show a checkbox? Non-selectable rows are left out of select-all. @default () => true */
  getIsItemSelectable?: (item: T) => boolean;
  /** Is this row's checkbox interactive? Disabled rows keep their state across select-all. @default () => true */
  getIsItemEnabled?: (item: T) => boolean;
}

export interface TableSelectionState {
  /** The complete selection, keys outside the current view included. */
  readonly selectedKeys: ReadonlySet<string>;
  readonly selectedCount: number;
  readonly hasSelection: boolean;
  /** Astryx's clear command; a no-op on the server — the toolbar clears through the table. */
  clearSelection: () => void;
}

export interface UseTableSelectionStateResult<T extends Record<string, unknown>> {
  /** Ready-to-use config for useTableSelection. */
  selectionConfig: UseTableSelectionConfig<T>;
  /** Shared state for selection-aware UI (TableSelectionToolbar). */
  selectionState: TableSelectionState;
}

const stableTrue = () => true;

export function useTableSelectionState<T extends Record<string, unknown>>(config: UseTableSelectionStateConfig<T>): UseTableSelectionStateResult<T> {
  const {data, idKey, getIsItemSelectable = stableTrue, getIsItemEnabled = stableTrue} = config;
  const selectedKeys = new Set([...(config.selectedKeys ?? [])].map(String));
  const getId = (item: T): string => (typeof idKey === 'function' ? idKey(item) : String(item[idKey]));
  const actionable = (item: T) => getIsItemSelectable(item) && getIsItemEnabled(item);
  const selectableIDs = new Set(data.filter(actionable).map(getId));
  const allSelectableIDs = new Set([...selectedKeys, ...selectableIDs]);

  const getIsAllSelected = () => selectableIDs.size > 0 && allSelectableIDs.size === selectedKeys.size;
  const getIsIndeterminate = () => {
    const count = data.filter((item) => actionable(item) && selectedKeys.has(getId(item))).length;
    return count > 0 && count < selectableIDs.size;
  };

  return {
    selectionConfig: {
      getIsItemSelected: (item) => selectedKeys.has(getId(item)),
      getIsAllSelected,
      getIsIndeterminate,
      getIsItemSelectable,
      getIsItemEnabled,
      getRowKey: getId,
      selectedKeys,
    },
    selectionState: {
      selectedKeys,
      selectedCount: selectedKeys.size,
      hasSelection: selectedKeys.size > 0,
      clearSelection: () => {},
    },
  };
}
