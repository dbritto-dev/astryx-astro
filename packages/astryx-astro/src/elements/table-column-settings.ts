/**
 * `<ax-table-column-settings for="<table id>">` — the column picker of TableColumnSettings
 * (light DOM around a server-rendered MultiSelector): a port extension, the "list-based column
 * picker" Astryx's useTableColumnSettingsState is designed for (`toggleColumn`).
 *
 * A change of the MultiSelector toggles columns: keys it no longer lists leave
 * `activeColumnKeys`, keys it newly lists join at the end (toggleColumn), always-visible keys
 * never leave. The table then dispatches `astryx-columns-change` (cancelable)
 * `{activeColumnKeys}` and applies the change; a prevented change puts the picker back. The
 * picker follows programmatic changes (`table.activeColumnKeys = …`) through the table's
 * internal `ax-columns-sync`. The MultiSelector's own `astryx-change` stays inside.
 */
import type {AxTable} from './table';

type ColumnSettingsApi = {get(): string[]; request(keys: readonly string[]): boolean; alwaysVisible(): string[]};
type MultiSelectorEl = HTMLElement & {values: string[]};

export class TableColumnSettingsElement extends HTMLElement {
  #table: AxTable | null = null;
  #cleanup: Array<() => void> = [];

  get table(): AxTable | null {
    return this.#table;
  }

  connectedCallback() {
    const onChange = (event: Event) => {
      const selector = (event.target as Element | null)?.closest?.('ax-multi-selector');
      if (!selector || !this.contains(selector)) return;
      event.stopPropagation();
      const api = this.#api();
      if (!api) return;
      const current = api.get();
      const values = ((event as CustomEvent<{values?: string[]}>).detail?.values ?? []).map(String);
      const chosen = new Set(values);
      for (const key of api.alwaysVisible()) chosen.add(key);
      const next = [...current.filter((k) => chosen.has(k)), ...values.filter((k) => !current.includes(k))];
      for (const key of api.alwaysVisible()) if (!next.includes(key)) next.push(key);
      if (!api.request(next)) this.#render(current);
    };
    this.addEventListener('astryx-change', onChange);
    this.#cleanup.push(() => this.removeEventListener('astryx-change', onChange));
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

  #api(): ColumnSettingsApi | null {
    return (this.#table?.api.get('column-settings') as unknown as ColumnSettingsApi | undefined) ?? null;
  }

  #attach(): boolean {
    if (this.#table || !this.isConnected) return this.#table != null;
    const table = this.#resolve();
    if (!table) return false;
    this.#table = table;
    const onSync = (event: Event) => this.#render((event as CustomEvent<{activeColumnKeys: string[]}>).detail.activeColumnKeys);
    table.addEventListener('ax-columns-sync', onSync);
    this.#cleanup.push(() => table.removeEventListener('ax-columns-sync', onSync));
    return true;
  }

  #render(keys: string[]) {
    const selector = this.querySelector<MultiSelectorEl>('ax-multi-selector');
    if (!selector) return;
    void customElements.whenDefined('ax-multi-selector').then(() => {
      const order = [...keys];
      if (JSON.stringify([...selector.values].sort()) !== JSON.stringify([...order].sort())) selector.values = order;
    });
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-table-column-settings')) {
  customElements.define('ax-table-column-settings', TableColumnSettingsElement);
}

declare global {
  interface HTMLElementTagNameMap {
    'ax-table-column-settings': TableColumnSettingsElement;
  }
}
