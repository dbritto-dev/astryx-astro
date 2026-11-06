/**
 * <ax-table> — the Table's scroll region and behaviour host (light DOM). Port of the
 * scroll wrapper in @astryxdesign/core Table/Table.tsx (useScrollableArea, inline axis,
 * overscroll contained) — it extends <ax-scrollable-area>, so it measures overflow, enters the
 * tab order only while the columns overflow and keeps `data-scroll-inline-start|end` current
 * (the sticky-column shadows read those flags in CSS).
 *
 * Plugin behaviours register by name and attach to every table whose `data-ax-features`
 * lists them (a plugin's component loads its module; registration after connect attaches
 * to tables already on the page):
 *
 *   import {registerTableBehavior} from '../table';
 *   registerTableBehavior('selection', (table) => { …; return () => cleanup(); });
 *
 * Shared helpers for behaviours: `bodyRows()`, `owns(node)`, `emit(type, detail, cancelable)`,
 * `reorderBody(compare)` (sorts rows within group sections and tree sibling sets, keeping
 * detail panels after their row), `updateVisibility()` (collapsed groups, collapsed tree
 * ancestors, closed panels → `hidden`) and `renumber()` (row-index cells, aria-rowindex).
 * Feature APIs: `sort`, `columnWidths`, `expandedKeys`, `collapsedGroups`, `expandedIds`.
 */
import {AxScrollableArea} from './scrollable-area';

export type TableBehavior = (table: AxTable) => void | (() => void);

const behaviors = new Map<string, TableBehavior>();
const live = new Set<AxTable>();

/** Register a behaviour for tables whose `data-ax-features` contains `name` (first registration wins). */
export function registerTableBehavior(name: string, setup: TableBehavior): void {
  if (behaviors.has(name)) return;
  behaviors.set(name, setup);
  for (const table of live) table.attachBehavior(name);
}

/** Feature APIs a behaviour exposes on its table (`table.api.sort` …). */
export interface TableFeatureApi {
  get(): unknown;
  set(value: unknown): void;
}

/** Elements a click on which belongs to something else (Astryx INTERACTIVE_SELECTORS + layer roots). */
const INTERACTIVE = [
  'button', 'a', 'input', 'select', 'textarea', '[role="button"]', '[role="link"]', '[role="checkbox"]',
  '[role="radio"]', '[role="switch"]', '[role="tab"]', '[role="menuitem"]', '[role="option"]',
  '[role="combobox"]', '[role="listbox"]', '[role="slider"]', '[role="spinbutton"]', '[data-pressable-container]',
  '[data-astryx-layer-root]',
].join(',');

export class AxTable extends AxScrollableArea {
  #cleanups = new Map<string, () => void>();
  readonly api = new Map<string, TableFeatureApi>();

  connectedCallback() {
    super.connectedCallback();
    live.add(this);
    for (const name of this.features) this.attachBehavior(name);
    if (this.#managesVisibility()) this.updateVisibility();
    else this.renumber();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    live.delete(this);
    for (const cleanup of this.#cleanups.values()) cleanup();
    this.#cleanups.clear();
  }

  get features(): string[] {
    return (this.getAttribute('data-ax-features') ?? '').split(/\s+/).filter(Boolean);
  }

  attachBehavior(name: string) {
    if (!this.isConnected || this.#cleanups.has(name) || !this.features.includes(name)) return;
    const setup = behaviors.get(name);
    if (!setup) return;
    const cleanup = setup(this);
    this.#cleanups.set(name, typeof cleanup === 'function' ? cleanup : () => {});
  }

  /** This table's `<table>` (not a nested one). */
  get table(): HTMLTableElement | null {
    return this.querySelector<HTMLTableElement>(':scope > [data-scroll-content] > table');
  }

  get body(): HTMLTableSectionElement | null {
    return this.table?.tBodies[0] ?? null;
  }

  /** The `<template>`s and other chrome plugins put after the table. */
  template(selector: string): HTMLTemplateElement | null {
    return this.querySelector<HTMLTemplateElement>(`:scope > [data-scroll-content] > template${selector}`);
  }

  bodyRows(): HTMLTableRowElement[] {
    const body = this.body;
    return body ? (Array.from(body.rows) as HTMLTableRowElement[]) : [];
  }

  headerCells(): HTMLTableCellElement[] {
    const head = this.table?.tHead;
    return head?.rows[0] ? (Array.from(head.rows[0].cells) as HTMLTableCellElement[]) : [];
  }

  /** Whether a node belongs to this table rather than a table nested in it. */
  owns(node: Node | null): boolean {
    const el = node instanceof Element ? node : node?.parentElement;
    return el?.closest('ax-table') === this;
  }

  /** Dispatch `type` (bubbling, composed); returns false when a listener prevented it. */
  emit(type: string, detail: unknown, cancelable = false): boolean {
    return this.dispatchEvent(new CustomEvent(type, {detail, bubbles: true, composed: true, cancelable}));
  }

  /**
   * Whether a row click should toggle (Astryx row-click guards): not from interactive cell
   * content, not inside an editable region, not ending a text selection.
   */
  isPlainRowClick(event: MouseEvent, row: HTMLElement): boolean {
    const target = event.target;
    if (!(target instanceof Element)) return false;
    for (let el: Element | null = target; el && el !== row; el = el.parentElement) {
      if (el.matches(INTERACTIVE) && !el.matches('[aria-readonly="true"]')) return false;
    }
    if (target !== row && target.closest('[contenteditable]:not([contenteditable="false"])')) return false;
    const selection = document.getSelection();
    if (selection && !selection.isCollapsed && row.contains(selection.anchorNode)) return false;
    return true;
  }

  #rowFilters = new Set<(row: HTMLTableRowElement) => boolean>();
  #hasFiltered = false;

  /**
   * Hook for client-side filtering (deferred filtering plugin): a data row any filter rejects
   * is hidden by `updateVisibility()` (its panel with it). Returns the remover.
   */
  addRowFilter(filter: (row: HTMLTableRowElement) => boolean): () => void {
    this.#rowFilters.add(filter);
    this.#hasFiltered = true;
    this.updateVisibility();
    return () => {
      this.#rowFilters.delete(filter);
      this.updateVisibility();
    };
  }

  #managesVisibility() {
    const f = this.features;
    return this.#hasFiltered || f.includes('grouped') || f.includes('tree') || f.includes('expansion');
  }

  /**
   * Re-derive `hidden` for plugin-managed rows: a group's rows follow its header, a tree row
   * needs every ancestor expanded, a detail panel needs its row visible and expanded.
   */
  updateVisibility() {
    if (!this.#managesVisibility()) return;
    let groupCollapsed = false;
    const ancestors: {level: number; expanded: boolean}[] = [];
    let ownerVisible = true;
    let ownerExpanded = false;
    for (const row of this.bodyRows()) {
      if (row.hasAttribute('data-expansion-panel')) {
        row.hidden = !(ownerVisible && ownerExpanded);
        continue;
      }
      if (row.hasAttribute('data-ax-group-key')) {
        groupCollapsed = row.hasAttribute('data-ax-collapsed');
        ancestors.length = 0;
        ownerVisible = true;
        ownerExpanded = false;
        row.hidden = false;
        continue;
      }
      const filtered = this.#rowFilters.size > 0 && [...this.#rowFilters].some((accept) => !accept(row));
      const managed = row.hasAttribute('data-ax-tree-id') || row.hasAttribute('data-expansion-key') || groupCollapsed || row.hidden || this.#hasFiltered;
      let visible = !groupCollapsed && !filtered;
      if (row.hasAttribute('data-ax-tree-id')) {
        const level = Number(row.getAttribute('aria-level') ?? '1');
        while (ancestors.length > 0 && ancestors[ancestors.length - 1].level >= level) ancestors.pop();
        if (ancestors.some((a) => !a.expanded)) visible = false;
        ancestors.push({level, expanded: row.getAttribute('aria-expanded') === 'true'});
      }
      if (managed) row.hidden = !visible;
      ownerVisible = visible;
      ownerExpanded = row.hasAttribute('data-ax-expanded');
    }
    this.renumber();
  }

  /** Renumber row-index cells and aria-rowindex in the rendered (visible) order. */
  renumber() {
    const rows = this.bodyRows().filter((r) => !r.hidden && !r.hasAttribute('data-expansion-panel'));
    if (this.features.includes('row-index')) {
      let n = Number(this.getAttribute('data-ax-row-index-start') ?? '1');
      for (const row of rows) {
        const cell = row.querySelector<HTMLElement>(':scope > td > [data-ax-row-index]');
        if (cell) cell.textContent = String(n++);
      }
    }
    const table = this.table;
    if (table?.hasAttribute('aria-rowcount')) {
      let n = Number(table.getAttribute('data-ax-rowindex-start') ?? '1');
      for (const row of rows) if (row.hasAttribute('aria-rowindex')) row.setAttribute('aria-rowindex', String(n++));
    }
  }

  /**
   * Reorder body rows by `compare` without breaking structure: group header rows are fixed
   * section boundaries, a detail panel stays after its row, tree rows sort among their
   * siblings with their subtree.
   */
  reorderBody(compare: (a: HTMLTableRowElement, b: HTMLTableRowElement) => number) {
    const body = this.body;
    if (!body) return;
    interface Unit {
      row: HTMLTableRowElement;
      rest: HTMLTableRowElement[];
      level: number;
      children: Unit[];
    }
    const out: HTMLTableRowElement[] = [];
    const flush = (units: Unit[]) => {
      // Forest by aria-level (flat rows are all level 1).
      const roots: Unit[] = [];
      const stack: Unit[] = [];
      for (const unit of units) {
        while (stack.length > 0 && stack[stack.length - 1].level >= unit.level) stack.pop();
        (stack.length > 0 ? stack[stack.length - 1].children : roots).push(unit);
        stack.push(unit);
      }
      const emit = (list: Unit[]) => {
        const sorted = [...list].sort((a, b) => compare(a.row, b.row));
        for (const u of sorted) {
          out.push(u.row, ...u.rest);
          emit(u.children);
        }
      };
      emit(roots);
    };
    let units: Unit[] = [];
    for (const row of this.bodyRows()) {
      if (row.hasAttribute('data-ax-group-key')) {
        flush(units);
        units = [];
        out.push(row);
      } else if (row.hasAttribute('data-expansion-panel') && units.length > 0) {
        units[units.length - 1].rest.push(row);
      } else {
        units.push({row, rest: [], level: Number(row.getAttribute('aria-level') ?? '1'), children: []});
      }
    }
    flush(units);
    const current = this.bodyRows();
    if (out.length === current.length && out.every((r, i) => r === current[i])) return;
    // Focus survives a move of its row only if we put it back.
    const active = document.activeElement instanceof HTMLElement && body.contains(document.activeElement) ? document.activeElement : null;
    body.append(...out);
    active?.focus({preventScroll: true});
  }

  // Feature APIs (present while the feature's behaviour is attached).
  get sort() { return this.api.get('sort')?.get(); }
  set sort(value) { this.api.get('sort')?.set(value); }
  get columnWidths() { return this.api.get('resize')?.get(); }
  set columnWidths(value) { this.api.get('resize')?.set(value); }
  get expandedKeys() { return this.api.get('expansion')?.get(); }
  set expandedKeys(value) { this.api.get('expansion')?.set(value); }
  get collapsedGroups() { return this.api.get('grouped')?.get(); }
  set collapsedGroups(value) { this.api.get('grouped')?.set(value); }
  get expandedIds() { return this.api.get('tree')?.get(); }
  set expandedIds(value) { this.api.get('tree')?.set(value); }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-table')) {
  customElements.define('ax-table', AxTable);
}

declare global {
  interface HTMLElementTagNameMap {
    'ax-table': AxTable;
  }
}
