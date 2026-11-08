/**
 * Table column filtering — the client half of @astryxdesign/core
 * Table/plugins/filtering/useTableFiltering.tsx (the controls' onChange → onFilterChange,
 * useLiveNumberFilter, PopoverFilterTrigger's draft / Apply / Reset) and useTableFilterState.
 *
 * State: the filter map (`data-ax-filters` on the scroll wrapper). A change dispatches
 * `astryx-filter-change` (cancelable) `{columnKey, value, filters}` on the `<ax-table>`
 * (`value: null` clears; `filters` is the state after it); `preventDefault()` keeps the old
 * value (an inline control is put back). Then the funnel's active state follows and, with
 * client filtering, the rows are filtered again (`table.addRowFilter`, PowerSearch's matcher
 * on the values the server wrote per row).
 *  - inline controls commit as they change (text per keystroke, numbers live while the draft
 *    parses — a rejected draft puts the value back on blur / Enter — lists on each toggle);
 *  - popover controls edit a draft seeded when the popover opens; Apply commits it, Reset
 *    commits `null`, both close the popover.
 * The controls' own `astryx-change` events stay inside the table.
 * API: `table.filters` (get/set; setting dispatches nothing), `table.clearFilters()`
 * (useTableFilterState clearAll: empties the state, no event).
 */
import {registerTableBehavior, type AxTable} from '../table';
// The matcher module, not powerSearchModel: it never loads Temporal (a table without date
// columns must not wait on the polyfill).
import {createPowerSearchConfig} from '../../components/PowerSearch/powerSearchFilters';
import type {PowerSearchFilter} from '../../components/PowerSearch/powerSearchModel';
import {parseNumberInput, resolveNumberInputCommit} from '../../components/NumberInput/numberParser';
import {tableValueToFilterValue} from '../../components/Table/plugins/filterModel';

type Value = string | number | string[];
interface ColumnConfig {
  key: string;
  field: string;
  operator: string;
  type: string;
}
interface Config {
  variant?: string;
  isClient?: boolean;
  columns?: ColumnConfig[];
}
type Control = HTMLElement & {value?: unknown; values?: string[]; searchSource?: unknown};

const CONTROL = 'ax-text-input, ax-number-input, ax-selector, ax-multi-selector, ax-date-input, ax-time-input, ax-tokenizer';

function parse<T>(raw: string | null, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** The filter value a control's `astryx-change` reports (Astryx: '' / [] → null). */
function valueFrom(type: string, detail: Record<string, unknown>): Value | null {
  switch (type) {
    case 'string':
      return typeof detail.value === 'string' && detail.value !== '' ? detail.value : null;
    case 'integer':
    case 'float':
      return typeof detail.value === 'number' && Number.isFinite(detail.value) ? detail.value : null;
    case 'enum':
      return typeof detail.value === 'string' && detail.value !== '' ? detail.value : null;
    case 'enum_list': {
      const values = Array.isArray(detail.values) ? (detail.values as unknown[]).map(String) : [];
      return values.length > 0 ? values : null;
    }
    case 'date_absolute':
    case 'time':
      return typeof detail.value === 'string' && detail.value !== '' ? detail.value : null;
    case 'string_list':
    case 'entity_list': {
      const items = Array.isArray(detail.values) ? (detail.values as unknown[]) : [];
      const ids = items.map((item) => (item != null && typeof item === 'object' ? String((item as {id?: unknown}).id ?? '') : String(item))).filter(Boolean);
      return ids.length > 0 ? ids : null;
    }
    default:
      return null;
  }
}

const same = (a: Value | null | undefined, b: Value | null | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Put a value into a control without its events. */
function writeControl(control: Control | null, type: string, value: Value | null | undefined): void {
  if (!control) return;
  switch (type) {
    case 'string':
      control.value = typeof value === 'string' ? value : '';
      break;
    case 'integer':
    case 'float':
      control.value = typeof value === 'number' ? value : null;
      break;
    case 'enum':
      control.value = typeof value === 'string' ? value : null;
      break;
    case 'enum_list':
      control.values = Array.isArray(value) ? [...value] : [];
      break;
    case 'date_absolute':
    case 'time':
      control.value = typeof value === 'string' ? value : undefined;
      break;
    case 'string_list':
    case 'entity_list':
      control.value = (Array.isArray(value) ? value : []).map((id) => ({id, label: id}));
      break;
  }
}

const matcher = createPowerSearchConfig([]);

registerTableBehavior('filter', (table: AxTable) => {
  const config = parse<Config>(table.getAttribute('data-ax-filter-config'), {});
  const columns = new Map((config.columns ?? []).map((c) => [c.key, c]));
  let filters = parse<Record<string, Value>>(table.getAttribute('data-ax-filters'), {});
  const drafts = new Map<string, Value | null>();
  const numberStart = new Map<string, Value | null>();
  const cleanups: Array<() => void> = [];
  const on = <K extends string>(el: EventTarget, type: K, fn: (e: Event) => void, opts?: AddEventListenerOptions) => {
    el.addEventListener(type, fn, opts);
    cleanups.push(() => el.removeEventListener(type, fn, opts));
  };

  const slots = () => Array.from(table.querySelectorAll<HTMLElement>('[data-ax-filter-column]')).filter((s) => table.owns(s));
  const slotOf = (node: EventTarget | null) => {
    const slot = (node as Element | null)?.closest?.<HTMLElement>('[data-ax-filter-column]') ?? null;
    return slot && table.owns(slot) ? slot : null;
  };
  const isPopover = (slot: HTMLElement) => slot.getAttribute('data-variant') === 'popover';
  const controlOf = (slot: HTMLElement) => slot.querySelector<Control>(CONTROL);
  const typeOf = (slot: HTMLElement) => slot.getAttribute('data-ax-filter-type') ?? '';
  const keyOf = (slot: HTMLElement) => slot.getAttribute('data-ax-filter-column') ?? '';
  const popoverOf = (slot: HTMLElement) => slot.querySelector<HTMLElement & {hide?: (r?: string) => void; isOpen?: boolean}>('ax-popover');

  // ── Client filtering ──
  const rowValues = new WeakMap<HTMLTableRowElement, Record<string, unknown> | null>();
  let searchFilters: PowerSearchFilter[] = [];
  const buildSearchFilters = () => {
    searchFilters = [];
    for (const [key, value] of Object.entries(filters)) {
      const col = columns.get(key);
      if (!col || value == null) continue;
      const filterValue = tableValueToFilterValue(value, {type: col.type} as never);
      if (filterValue) searchFilters.push({field: col.field, operator: col.operator, value: filterValue});
    }
  };
  const accept = (row: HTMLTableRowElement) => {
    if (searchFilters.length === 0 || !row.hasAttribute('data-ax-filter-values')) return true;
    let values = rowValues.get(row);
    if (values === undefined) rowValues.set(row, (values = parse<Record<string, unknown> | null>(row.getAttribute('data-ax-filter-values'), null)));
    return values == null || matcher.applyFilters(searchFilters, [values]).length > 0;
  };
  buildSearchFilters();
  if (config.isClient) cleanups.push(table.addRowFilter(accept));

  const syncTrigger = (slot: HTMLElement) => {
    if (!isPopover(slot)) return;
    const hasValue = filters[keyOf(slot)] != null;
    const button = slot.querySelector<HTMLElement>(':scope > .ax-table-filter-trigger');
    button?.toggleAttribute('data-active', hasValue);
    button?.querySelector('.astryx-icon')?.setAttribute('data-color', hasValue ? 'accent' : 'secondary');
  };
  const applyState = () => {
    table.setAttribute('data-ax-filters', JSON.stringify(filters));
    for (const slot of slots()) syncTrigger(slot);
    buildSearchFilters();
    if (config.isClient) table.updateVisibility();
  };

  /** onFilterChange(columnKey, value): event first, then the state. */
  const commit = (key: string, value: Value | null, force = false): boolean => {
    const current = filters[key] ?? null;
    if (!force && same(current, value)) return true;
    const next = {...filters};
    if (value == null) delete next[key];
    else next[key] = value;
    if (!table.emit('astryx-filter-change', {columnKey: key, value, filters: {...next}}, true)) return false;
    filters = next;
    applyState();
    return true;
  };

  // ── Control changes ──
  on(table, 'astryx-change', (event) => {
    const slot = slotOf(event.target);
    if (!slot) return;
    const control = (event.target as Element).closest<Control>(CONTROL);
    if (!control || controlOf(slot) !== control) return;
    event.stopPropagation();
    const key = keyOf(slot);
    const type = typeOf(slot);
    const value = valueFrom(type, ((event as CustomEvent).detail ?? {}) as Record<string, unknown>);
    if (isPopover(slot)) {
      drafts.set(key, value);
      return;
    }
    if (!commit(key, value)) writeControl(control, type, filters[key]);
  });

  // useLiveNumberFilter: a draft that parses within the bounds applies as it is typed; a
  // rejected draft puts the value from the start of the edit back on blur / Enter.
  const numberContext = (event: Event) => {
    const slot = slotOf(event.target);
    if (!slot || !(event.target instanceof HTMLInputElement)) return null;
    const type = typeOf(slot);
    if (type !== 'integer' && type !== 'float') return null;
    const num = (name: string) => {
      const raw = slot.getAttribute(name);
      return raw == null || raw === '' ? null : Number(raw);
    };
    return {slot, input: event.target, key: keyOf(slot), min: num('data-ax-filter-min'), max: num('data-ax-filter-max'), hasClear: !isPopover(slot), locale: document.documentElement.lang || undefined};
  };
  const currentOf = (key: string, slot: HTMLElement) => (isPopover(slot) ? (drafts.get(key) ?? null) : (filters[key] ?? null));
  const setLive = (key: string, slot: HTMLElement, value: Value | null) => {
    if (isPopover(slot)) drafts.set(key, value);
    else if (!commit(key, value)) writeControl(controlOf(slot), typeOf(slot), filters[key]);
  };
  on(table, 'focusin', (event) => {
    const c = numberContext(event);
    if (c) numberStart.set(c.key, currentOf(c.key, c.slot));
  });
  on(table, 'input', (event) => {
    const c = numberContext(event);
    if (!c) return;
    const next = parseNumberInput(c.input.value, {min: c.min, max: c.max, locale: c.locale});
    if (next !== null && next !== currentOf(c.key, c.slot)) setLive(c.key, c.slot, next);
  });
  const restoreRejectedDraft = (event: Event) => {
    const c = numberContext(event);
    if (!c) return;
    const decision = resolveNumberInputCommit(c.input.value, {min: c.min, max: c.max, locale: c.locale, hasClear: c.hasClear});
    const start = numberStart.get(c.key) ?? null;
    if (decision.type === 'revert' && !same(currentOf(c.key, c.slot), start)) setLive(c.key, c.slot, start);
  };
  on(table, 'focusout', restoreRejectedDraft);
  on(table, 'keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Enter') restoreRejectedDraft(event);
  });

  // ── Popover: seed the draft on open; Apply / Reset ──
  on(table, 'astryx-open-change', (event) => {
    const target = event.target as Element | null;
    if (!target || target.tagName !== 'AX-POPOVER') return;
    const slot = slotOf(target);
    if (!slot || !isPopover(slot) || !(event as CustomEvent).detail?.isOpen) return;
    const key = keyOf(slot);
    drafts.set(key, filters[key] ?? null);
    writeControl(controlOf(slot), typeOf(slot), filters[key]);
  });
  on(table, 'click', (event) => {
    const button = (event.target as Element | null)?.closest?.<HTMLElement>('[data-ax-filter-action]');
    const slot = button ? slotOf(button) : null;
    if (!button || !slot) return;
    const key = keyOf(slot);
    if (button.getAttribute('data-ax-filter-action') === 'apply') commit(key, drafts.has(key) ? (drafts.get(key) ?? null) : (filters[key] ?? null), true);
    else commit(key, null, true);
    popoverOf(slot)?.hide?.('api');
  });

  // Tokenizers without a source: any typed text becomes a token (Astryx fallbackSource).
  for (const slot of slots()) {
    if (!slot.hasAttribute('data-ax-filter-free-tokens')) continue;
    const control = controlOf(slot);
    if (!control) continue;
    void customElements.whenDefined('ax-tokenizer').then(() => {
      control.searchSource = {
        search: (query: string) => (query.trim() ? [{id: query.trim(), label: query.trim()}] : []),
        bootstrap: () => [],
      };
    });
  }

  table.api.set('filter', {
    get: () => ({...filters}),
    set: (value) => {
      const next: Record<string, Value> = {};
      for (const [key, v] of Object.entries((value ?? {}) as Record<string, Value | null | undefined>)) if (v != null) next[key] = v;
      filters = next;
      for (const slot of slots()) writeControl(controlOf(slot), typeOf(slot), filters[keyOf(slot)]);
      applyState();
    },
    clear: () => {
      filters = {};
      for (const slot of slots()) writeControl(controlOf(slot), typeOf(slot), undefined);
      applyState();
    },
  } as {get(): unknown; set(value: unknown): void; clear(): void});

  return () => {
    for (const off of cleanups.splice(0)) off();
    table.api.delete('filter');
  };
});
