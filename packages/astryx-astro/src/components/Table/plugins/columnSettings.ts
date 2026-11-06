/**
 * Column settings — port of @astryxdesign/core Table/plugins/columnSettings/
 * useTableColumnSettings.tsx and useTableColumnSettingsState.tsx (0.7.9), as server functions.
 *
 * `useTableColumnSettings(config)` shows the columns of `activeColumnKeys`, in that order
 * (`transformColumns`, first in the canonical plugin order, so plugin columns — selection,
 * expansion — stay where their plugins put them). Columns outside both `activeColumnKeys` and
 * the settings universe (`config.columns`) are dropped, as in Astryx.
 *
 * Port extension: universe columns that are not active still render, hidden (`hidden` on the
 * header and body cells, placed after the active ones), so the browser can show, hide and
 * reorder columns without a round trip: `table.activeColumnKeys = [...]` (silent) or the
 * TableColumnSettings picker, which dispatches `astryx-columns-change` (cancelable)
 * `{activeColumnKeys}` on the `<ax-table>` — Astryx `onChangeActiveColumnKeys(keys)` — before
 * applying. The client re-resolves the column widths for the visible columns (columnUtils).
 *
 * `useTableColumnSettingsState(config)` is Astryx's headless helper; with no React state its
 * operations return the next key list (toggle appends a re-shown column at the end; always-
 * visible columns never leave).
 */
import {withFeature} from '../pipeline';
import {comp} from '../node';
import ColumnSettingsScript from '../_ColumnSettingsScript.astro';
import type {TableColumn, TablePlugin} from '../types';

/** A column as the settings UI lists it (Astryx ColumnSettingsOption). */
export interface ColumnSettingsOption<TColumnKey extends string = string> {
  /** Column key — matches TableColumn.key. */
  key: TColumnKey;
  /** Label in the settings UI. */
  label: string;
  /** Cannot be hidden (its checkbox is disabled). @default false */
  isAlwaysVisible?: boolean;
  /** Group heading in the settings UI. */
  group?: string;
}

export interface UseTableColumnSettingsStateConfig<TColumnKey extends string = string> {
  /** Every column the user can toggle (the settings universe). */
  columns: ReadonlyArray<ColumnSettingsOption<TColumnKey>>;
  /** Visible column keys, in display order. */
  activeColumnKeys: ReadonlyArray<TColumnKey>;
  /** Astryx callback; not called in Astro — listen for `astryx-columns-change` on the table. */
  onChangeActiveColumnKeys?: (keys: ReadonlyArray<TColumnKey>) => void;
  /** The set "Reset to default" restores. @default every column */
  defaultColumnKeys?: ReadonlyArray<TColumnKey>;
}

export type UseTableColumnSettingsConfig<TColumnKey extends string = string> = UseTableColumnSettingsStateConfig<TColumnKey>;

export interface UseTableColumnSettingsStateReturn<TColumnKey extends string = string> {
  /** Pass to useTableColumnSettings (and TableColumnSettings). */
  columnSettingsConfig: UseTableColumnSettingsStateConfig<TColumnKey>;
  activeColumnKeys: ReadonlyArray<TColumnKey>;
  /** The keys after toggling `key` (removed, or appended at the end); always-visible keys stay. */
  toggleColumn: (key: TColumnKey) => ReadonlyArray<TColumnKey>;
  isColumnActive: (key: TColumnKey) => boolean;
  isColumnToggleable: (key: TColumnKey) => boolean;
  /** Every column's key. */
  showAllColumns: () => ReadonlyArray<TColumnKey>;
  /** `defaultColumnKeys`, else every column. */
  resetToDefault: () => ReadonlyArray<TColumnKey>;
  /** The keys of a list-based picker, with the always-visible columns kept in. */
  setActiveColumnKeys: (keys: string[]) => ReadonlyArray<TColumnKey>;
}

/** Astryx useTableColumnSettingsState, as pure operations — see the file header. */
export function useTableColumnSettingsState<TColumnKey extends string = string>(
  config: UseTableColumnSettingsStateConfig<TColumnKey>,
): UseTableColumnSettingsStateReturn<TColumnKey> {
  const {columns, activeColumnKeys} = config;
  const activeSet = new Set(activeColumnKeys);
  const alwaysVisible = new Set(columns.filter((c) => c.isAlwaysVisible).map((c) => c.key));
  return {
    columnSettingsConfig: config,
    activeColumnKeys,
    toggleColumn: (key) => {
      if (alwaysVisible.has(key)) return activeColumnKeys;
      return activeSet.has(key) ? activeColumnKeys.filter((k) => k !== key) : [...activeColumnKeys, key];
    },
    isColumnActive: (key) => activeSet.has(key),
    isColumnToggleable: (key) => !alwaysVisible.has(key),
    showAllColumns: () => columns.map((c) => c.key),
    resetToDefault: () => (config.defaultColumnKeys ? [...config.defaultColumnKeys] : columns.map((c) => c.key)),
    setActiveColumnKeys: (value) => {
      const next = new Set(value as TColumnKey[]);
      for (const key of alwaysVisible) next.add(key);
      return Array.from(next);
    },
  };
}

/** Marks a column the settings hide (rendered hidden; left out of the width resolution). */
export const HIDDEN_COLUMN = '__hiddenBySettings';

/** Show and order columns by `activeColumnKeys` (Astryx useTableColumnSettings) — see the file header. */
export function useTableColumnSettings<T extends Record<string, unknown>, TColumnKey extends string = string>(
  config: UseTableColumnSettingsConfig<TColumnKey>,
): TablePlugin<T> {
  const active = [...config.activeColumnKeys] as string[];
  const order = new Map(active.map((key, index) => [key, index]));
  const universe = config.columns.map((c) => c.key as string);
  const universeSet = new Set(universe);
  const alwaysVisible = config.columns.filter((c) => c.isAlwaysVisible).map((c) => c.key as string);

  return {
    transformColumns(columns) {
      const shown = columns
        .filter((col) => order.has(col.key))
        .sort((a, b) => (order.get(a.key) ?? Infinity) - (order.get(b.key) ?? Infinity));
      const hidden = columns
        .filter((col) => !order.has(col.key) && universeSet.has(col.key))
        .map((col) => ({...col, [HIDDEN_COLUMN]: true}) as TableColumn<T>);
      return [...shown, ...hidden];
    },

    transformHeaderCell(props, column) {
      // Every header carries its width spec: the client re-resolves widths over the visible columns.
      const isHidden = (column as unknown as Record<string, unknown>)[HIDDEN_COLUMN] === true;
      return {
        ...props,
        htmlProps: {
          ...props.htmlProps,
          hidden: isHidden ? true : props.htmlProps.hidden,
          'data-ax-column-width': JSON.stringify(column.width ?? null),
        },
      };
    },

    transformBodyCell(props, column) {
      if (!universeSet.has(column.key) && !order.has(column.key)) return props;
      const isHidden = (column as unknown as Record<string, unknown>)[HIDDEN_COLUMN] === true;
      return {...props, htmlProps: {...props.htmlProps, 'data-column-key': column.key, hidden: isHidden ? true : props.htmlProps.hidden}};
    },

    transformScrollWrapper(props) {
      return {
        ...props,
        htmlProps: {
          ...withFeature(props.htmlProps, 'column-settings'),
          'data-ax-column-settings': JSON.stringify({activeColumnKeys: active, universe, alwaysVisible}),
        },
        afterTable: [props.afterTable, comp(ColumnSettingsScript)],
      };
    },
  };
}
