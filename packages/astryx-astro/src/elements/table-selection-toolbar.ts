/**
 * `<ax-table-selection-toolbar for="<table id>">` — the client half of
 * @astryxdesign/core Table/TableSelectionToolbar.tsx (light DOM around the server-rendered
 * Toolbar). It follows the `<ax-table>` around the element with that id:
 *  - shows (removes `hidden`) only while the table has a selection, as Astryx renders nothing
 *    without one;
 *  - keeps the count current: the default label is rebuilt from the server's plural templates
 *    (`data-ax-count-templates`, locale `data-ax-locale`); in a custom `selectionLabel` only the
 *    `[data-selected-count]` elements get the number;
 *  - its Clear button (`[data-ax-selection-clear]`) calls `table.clearSelection()`.
 * It listens to the table's internal `ax-selection-sync` (every state change, programmatic ones
 * included) and reads `table.selectedKeys` when it connects.
 */
import {fillPlural, formatNumber} from './field';
import type {AxTable} from './table';
import type {TableSelectionSnapshot} from './table-features/selection';

export class TableSelectionToolbarElement extends HTMLElement {
  #table: AxTable | null = null;
  #cleanup: Array<() => void> = [];

  /** The `<ax-table>` this toolbar follows. */
  get table(): AxTable | null {
    return this.#table;
  }

  connectedCallback() {
    const onClick = (event: MouseEvent) => {
      const clear = (event.target as Element | null)?.closest('[data-ax-selection-clear]');
      if (!clear || !this.contains(clear) || clear.getAttribute('aria-disabled') === 'true') return;
      this.#resolve()?.clearSelection();
    };
    this.addEventListener('click', onClick);
    this.#cleanup.push(() => this.removeEventListener('click', onClick));
    // The table may come later in the document or upgrade after the toolbar.
    if (!this.#attach()) {
      queueMicrotask(() => this.#attach());
      customElements.whenDefined('ax-table').then(() => this.#attach());
    }
  }

  disconnectedCallback() {
    for (const fn of this.#cleanup.splice(0)) fn();
    this.#table = null;
  }

  #resolve(): AxTable | null {
    const id = this.getAttribute('for');
    const target = id ? this.ownerDocument.getElementById(id) : null;
    if (!target) return null;
    return (target.tagName === 'AX-TABLE' ? target : target.closest('ax-table')) as AxTable | null;
  }

  #attach(): boolean {
    if (this.#table || !this.isConnected) return this.#table != null;
    const table = this.#resolve();
    if (!table) return false;
    this.#table = table;
    const onSync = (event: Event) => this.#render((event as CustomEvent<TableSelectionSnapshot>).detail);
    table.addEventListener('ax-selection-sync', onSync);
    this.#cleanup.push(() => table.removeEventListener('ax-selection-sync', onSync));
    const keys = (table as unknown as {selectedKeys?: unknown}).selectedKeys;
    if (Array.isArray(keys)) this.#render({selectedKeys: keys as string[], selectedCount: keys.length, hasSelection: keys.length > 0});
    return true;
  }

  #render(state: TableSelectionSnapshot) {
    this.hidden = !state.hasSelection;
    const label = this.querySelector<HTMLElement>('[data-ax-selection-label]');
    if (!label) return;
    const locale = this.getAttribute('data-ax-locale') ?? 'en';
    const count = formatNumber(state.selectedCount, locale);
    if (label.hasAttribute('data-ax-custom')) {
      for (const el of label.querySelectorAll<HTMLElement>('[data-selected-count]')) el.textContent = count;
      return;
    }
    const text = fillPlural(this.getAttribute('data-ax-count-templates'), locale, state.selectedCount, {count});
    if (text && label.textContent !== text) label.textContent = text;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-table-selection-toolbar')) {
  customElements.define('ax-table-selection-toolbar', TableSelectionToolbarElement);
}

declare global {
  interface HTMLElementTagNameMap { 'ax-table-selection-toolbar': TableSelectionToolbarElement }
}
