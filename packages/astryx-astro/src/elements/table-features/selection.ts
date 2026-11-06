/**
 * Table row-selection behaviour — the client half of @astryxdesign/core
 * Table/plugins/selection/useTableSelection.tsx (applyRowSelectionStyle, the checkbox onChange
 * handlers) and useTableSelectionState.tsx (onSelectItem, onSelectAll with the frozen set,
 * getIsAllSelected, getIsIndeterminate, clearSelection).
 *
 * State: the selected keys (`data-ax-selected-keys` on the scroll wrapper — the complete
 * selection, keys outside the rendered rows included). Actionable rows have an enabled row
 * checkbox; select-all adds every actionable key, deselect-all removes them, and every other key
 * (disabled-but-selected rows, keys outside the rendered rows) stays.
 *
 *  - row checkbox: `astryx-select-item` (cancelable) `{key, isSelected}`;
 *  - header checkbox: `astryx-select-all` (cancelable) `{isAllSelected}` — `!allSelected`, so an
 *    indeterminate header selects all;
 *  - then rows (`aria-selected`, the inline accent wash republished as `--table-row-overlay`
 *    unless `data-ax-selection-highlight="false"`), checkboxes and the header (checked /
 *    indeterminate / unchecked) follow, and `astryx-selection-change`
 *    `{selectedKeys, selectedCount, hasSelection}` fires. A prevented event restores the box.
 *  - The checkboxes' own `astryx-change` stays inside the table.
 *  - Every state change (also `table.selectedKeys = …`) dispatches the internal, non-bubbling
 *    `ax-selection-sync` {selectedKeys, selectedCount, hasSelection} that TableSelectionToolbar
 *    follows.
 * API: `table.selectedKeys` (get/set, no astryx event), `table.clearSelection()` (the toolbar's
 * Clear: empties the complete selection and dispatches `astryx-selection-change`).
 */
import {registerTableBehavior, type AxTable} from '../table';
import '../checkbox-input';
import type {CheckboxInputElement} from '../checkbox-input';
import {setIndicatorState} from '../indicator-state';

const WASH = 'var(--color-accent-muted)';
const ROW_OVERLAY_VAR = '--table-row-overlay';

export interface TableSelectionSnapshot {
  selectedKeys: string[];
  selectedCount: number;
  hasSelection: boolean;
}

function readKeys(value: string | null): Set<string> {
  try {
    const parsed = JSON.parse(value ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

const isEnabled = (input: HTMLInputElement) => input.getAttribute('aria-disabled') !== 'true' && !input.disabled;

function setBox(input: HTMLInputElement, state: boolean | 'indeterminate'): void {
  const box = input.closest<CheckboxInputElement>('ax-checkbox-input');
  if (box && box.input === input) {
    box.value = state;
    return;
  }
  input.indeterminate = state === 'indeterminate';
  input.checked = state === true;
  setIndicatorState(input.parentElement?.querySelector<HTMLElement>(':scope > [data-ax-indicator-slot]') ?? null, state === 'indeterminate' ? 'indeterminate' : state ? 'checked' : 'unchecked');
}

/** Astryx applyRowSelectionStyle: aria-selected always; the wash only with the highlight. */
function applyRow(row: HTMLTableRowElement, isSelected: boolean, hasHighlight: boolean): void {
  if (isSelected) row.setAttribute('aria-selected', 'true');
  else row.removeAttribute('aria-selected');
  const wash = isSelected && hasHighlight ? WASH : '';
  if (row.style.backgroundColor !== wash) row.style.backgroundColor = wash;
  if (wash === '') row.style.removeProperty(ROW_OVERLAY_VAR);
  else if (row.style.getPropertyValue(ROW_OVERLAY_VAR) !== wash) row.style.setProperty(ROW_OVERLAY_VAR, wash);
}

registerTableBehavior('selection', (table: AxTable) => {
  let selected = readKeys(table.getAttribute('data-ax-selected-keys'));
  const hasHighlight = () => table.getAttribute('data-ax-selection-highlight') !== 'false';

  const own = (input: Element) => table.owns(input);
  const headerInput = () =>
    table.headerCells().map((cell) => cell.querySelector<HTMLInputElement>('input[data-ax-table-select="all"]')).find((i): i is HTMLInputElement => i != null && own(i)) ?? null;
  const entries = () =>
    table.bodyRows()
      .filter((row) => row.hasAttribute('data-ax-selection-key'))
      .map((row) => {
        const input = [...row.querySelectorAll<HTMLInputElement>('input[data-ax-table-select="row"]')].find((i) => i.closest('tr') === row) ?? null;
        return {row, key: row.getAttribute('data-ax-selection-key') ?? '', input};
      });
  const actionable = () => entries().filter((e) => e.input != null && isEnabled(e.input));

  const headerState = (): boolean | 'indeterminate' => {
    const keys = actionable().map((e) => e.key);
    const count = keys.filter((k) => selected.has(k)).length;
    if (keys.length > 0 && count === keys.length) return true;
    return count > 0 ? 'indeterminate' : false;
  };
  const snapshot = (): TableSelectionSnapshot => ({selectedKeys: [...selected], selectedCount: selected.size, hasSelection: selected.size > 0});

  const sync = () => {
    const highlight = hasHighlight();
    for (const {row, key, input} of entries()) {
      const isSelected = selected.has(key);
      if (input && (input.checked !== isSelected || input.indeterminate)) setBox(input, isSelected);
      applyRow(row, isSelected, highlight);
    }
    const header = headerInput();
    if (header) setBox(header, headerState());
    table.dispatchEvent(new CustomEvent('ax-selection-sync', {detail: snapshot()}));
  };
  const changed = () => {
    sync();
    table.emit('astryx-selection-change', snapshot());
  };

  const onChange = (event: Event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.hasAttribute('data-ax-table-select') || !own(input)) return;
    if (!isEnabled(input)) return;
    const kind = input.getAttribute('data-ax-table-select');
    if (kind === 'row') {
      const row = input.closest('tr');
      const key = row?.getAttribute('data-ax-selection-key');
      if (key == null) return;
      const isSelected = input.checked;
      if (!table.emit('astryx-select-item', {key, isSelected}, true)) {
        setBox(input, !isSelected);
        return;
      }
      if (isSelected) selected.add(key);
      else selected.delete(key);
      changed();
      return;
    }
    if (kind === 'all') {
      const before = headerState();
      const isAllSelected = before !== true;
      if (!table.emit('astryx-select-all', {isAllSelected}, true)) {
        setBox(input, before);
        return;
      }
      // useTableSelectionState.onSelectAll: actionable rows join or leave; the frozen set stays.
      for (const {key} of actionable()) {
        if (isAllSelected) selected.add(key);
        else selected.delete(key);
      }
      changed();
    }
  };

  // The selection checkboxes' own astryx-change ({isChecked}) is internal to the table.
  const onInnerChange = (event: Event) => {
    const box = event.target;
    if (!(box instanceof Element) || box.tagName !== 'AX-CHECKBOX-INPUT' || !own(box)) return;
    if (box.querySelector('input[data-ax-table-select]')) event.stopPropagation();
  };

  table.addEventListener('change', onChange);
  table.addEventListener('astryx-change', onInnerChange, {capture: true});
  table.api.set('selection', {
    get: () => [...selected],
    set: (value) => {
      selected = new Set([...((value as Iterable<string>) ?? [])].map(String));
      sync();
    },
    clear: () => {
      selected = new Set();
      changed();
    },
  } as {get(): unknown; set(value: unknown): void; clear(): void});
  sync();
  return () => {
    table.removeEventListener('change', onChange);
    table.removeEventListener('astryx-change', onInnerChange, {capture: true});
    table.api.delete('selection');
  };
});
