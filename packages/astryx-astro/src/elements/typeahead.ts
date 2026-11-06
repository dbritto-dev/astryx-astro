/**
 * `<ax-typeahead>` — the engine of Typeahead and BaseTypeahead (light DOM, wraps the server
 * markup). Typeahead's host is the bordered field box; BaseTypeahead's (`data-ax-base`) is a
 * `display: contents` wrapper around the bare input.
 *
 * Port of the behaviour in @astryxdesign/core Typeahead/BaseTypeahead.tsx (debounced search,
 * minQueryLength by grapheme, bootstrap on focus, generations that drop stale answers,
 * partial lists through `context.update` that later lists only append to, maxMenuItems,
 * grouping, the busy state and its one announcement, result-count and rendered empty-message
 * announcements, outside-press and blur dismissal, keyboard map, IME guard) and
 * Typeahead/Typeahead.tsx (the value token, edit mode, the end lane, clear).
 * Keyboard, highlight and activedescendant come from runtime/combobox.ts; the popup is an
 * `<ax-combobox-layer popover="manual" data-ax-outside-press="dismiss">`.
 *
 * Sources, in order: `el.searchSource` (Astryx SearchSource) → an `astryx-query` listener that
 * claims the query (`preventDefault()`) and answers `respond(items)` → the static items the
 * server rendered (createStaticSource semantics). See components/Typeahead/Typeahead.astro.
 */
import './runtime/disabledInteraction';
import {announce, createRenderedTextAnnouncer, type Withdraw} from './runtime/announce';
import {comboboxLayer, createCombobox, handleComboboxKey, type Combobox, type ComboboxLayerElement} from './runtime/combobox';
import {isImeKeyEvent} from './runtime/dom';
import {noteOutsideDismissal} from './runtime/layerStack';
import {groupItems} from '../lib/groupItems';
import {emit, fillPlural, formatNumber, onFormReset} from './field';

export interface TypeaheadItemData {
  id: string;
  label: string;
  auxiliaryData?: unknown;
}

export interface TypeaheadSearchContext<T extends TypeaheadItemData = TypeaheadItemData> {
  update(items: T[]): void;
}

export interface TypeaheadSearchSource<T extends TypeaheadItemData = TypeaheadItemData> {
  search(query: string, context?: TypeaheadSearchContext<T>): Promise<T[]> | T[];
  bootstrap(): Promise<T[]> | T[];
  cancel?(): void;
}

/** `astryx-query` detail: claim it with `preventDefault()`, then answer. */
export interface TypeaheadQueryDetail<T extends TypeaheadItemData = TypeaheadItemData> {
  query: string;
  kind: 'search' | 'bootstrap';
  /** Aborts when a newer query supersedes this one or the list closes. */
  signal: AbortSignal;
  /** The final, complete list for the query. */
  respond(items: T[]): void;
  /** A partial list shown before `respond` (later lists keep the shown rows first). */
  update(items: T[]): void;
  /** The request failed (the shown rows stay, else the list empties). */
  reject(error?: unknown): void;
}

const OPTION = '[role="option"]:not([data-ax-empty])';
const Base: typeof HTMLElement = typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement;

// One CSS highlight shared by every typeahead (port extension hasMatchHighlight).
const matchRanges = new Map<Element, Range[]>();
function syncMatchHighlight() {
  const registry = (globalThis as {CSS?: {highlights?: Map<string, unknown>}}).CSS?.highlights;
  const Ctor = (globalThis as {Highlight?: new (...r: Range[]) => unknown}).Highlight;
  if (!registry || !Ctor) return;
  const all = [...matchRanges.values()].flat();
  if (all.length) registry.set('astryx-typeahead-match', new Ctor(...all));
  else registry.delete('astryx-typeahead-match');
}

function graphemes(text: string): number {
  const Segmenter = (Intl as {Segmenter?: new (l?: string, o?: {granularity: string}) => {segment(t: string): Iterable<unknown>}}).Segmenter;
  if (!Segmenter) return [...text].length;
  let n = 0;
  for (const _ of new Segmenter(undefined, {granularity: 'grapheme'}).segment(text)) n++;
  return n;
}

function parseItem(raw: string | null): TypeaheadItemData | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as TypeaheadItemData; } catch { return null; }
}

/** Ungrouped rows first, then each group (displayed order, BaseTypeahead displayOrder). */
function displayOrder<T extends TypeaheadItemData>(list: T[]): T[] {
  return groupItems(list as never[], {ungroupedFirst: true}).flatMap((g) => g.items as T[]);
}

export class TypeaheadElement extends Base {
  #input: HTMLInputElement | null = null;
  #layer: ComboboxLayerElement | null = null;
  #listbox: HTMLElement | null = null;
  #combo: Combobox | null = null;
  #cleanup: Array<() => void> = [];
  #staticItems: TypeaheadItemData[] = [];
  #staticKeywords = new Map<string, string[]>();
  #query = '';
  #results: TypeaheadItemData[] = [];
  #shownFromStatic = true;
  #gen = 0;
  #resultsGen = 0;
  #sourceGen = 0;
  #closedGen = -1;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #isLoading = false;
  #hasSearched = false;
  #lastSearchedQuery = '';
  #controller: AbortController | null = null;
  #busyFrame = 0;
  #busyAnnounced = false;
  #busyWithdraw: Withdraw | null = null;
  #emptyAnnouncer: ReturnType<typeof createRenderedTextAnnouncer> | null = null;
  #value: TypeaheadItemData | null = null;
  #defaultValue: TypeaheadItemData | null = null;
  #isEditing = false;
  #wasAlreadyFocused = false;
  #searchSource: TypeaheadSearchSource | null = null;
  /** Client rows: return a Node or an HTML string for an item (server rows use `renderItem`). */
  renderItem: ((item: TypeaheadItemData) => Node | string) | null = null;

  // ── Public API ────────────────────────────────────────────────────────────

  /** The client search source (Astryx SearchSource). Replacing it starts a new generation. */
  get searchSource(): TypeaheadSearchSource | null { return this.#searchSource; }
  set searchSource(next: TypeaheadSearchSource | null) {
    if (next === this.#searchSource) return;
    this.#searchSource?.cancel?.();
    this.#searchSource = next;
    this.#sourceGen = ++this.#gen;
    this.#setLoading(false);
  }

  get value(): TypeaheadItemData | null { return this.#value; }
  set value(next: TypeaheadItemData | null) { this.#setValue(next ?? null); }

  get query(): string { return this.#query; }
  get isOpen(): boolean { return this.#layer?.isOpen ?? false; }
  get isBase(): boolean { return this.hasAttribute('data-ax-base'); }
  get isDisabled(): boolean {
    const input = this.#input;
    return !!input && (input.disabled || input.getAttribute('aria-disabled') === 'true');
  }

  open(): void { this.#openIfEligible(true); }
  close(): void { this.#hide(); }

  /** Clear the selection (Typeahead's clear button). */
  clear(): void {
    if (this.isDisabled) return;
    const input = this.#input;
    if (input && input.value !== '') {
      input.value = '';
      this.#queryChange('');
    }
    this.#isEditing = false;
    this.#setValue(null);
    emit(this, 'astryx-change', {value: null});
    input?.focus();
  }

  // ── Wiring ────────────────────────────────────────────────────────────────

  #num(name: string, fallback: number): number {
    const v = Number(this.getAttribute(name));
    return Number.isFinite(v) && this.hasAttribute(name) ? v : fallback;
  }
  get #debounceMs() { return this.#num('data-ax-debounce', 150); }
  get #minQuery() { return this.#num('data-ax-min-query', 1); }
  get #maxItems() { return this.#num('data-ax-max-items', 10); }
  get #entriesOnFocus() { return this.hasAttribute('data-ax-entries-on-focus'); }
  get #locale() { return this.getAttribute('data-ax-locale') ?? 'en'; }
  get #anchor(): HTMLElement | null {
    const id = this.#layer?.getAttribute('data-ax-anchor');
    return (id ? this.ownerDocument.getElementById(id) : null) ?? this.#input;
  }

  connectedCallback(): void {
    const input = this.querySelector<HTMLInputElement>('[data-ax-typeahead-input]');
    const layer = comboboxLayer(this, this.getAttribute('data-ax-layer'));
    const listboxId = this.getAttribute('data-ax-listbox');
    const listbox = listboxId ? this.ownerDocument.getElementById(listboxId) : null;
    if (!input || !layer || !listbox) return;
    this.#input = input;
    this.#layer = layer;
    this.#listbox = listbox;
    this.#value = parseItem(this.getAttribute('data-ax-value'));
    this.#defaultValue = this.#value;
    // The static source the server rendered (createStaticSource), in source order.
    const rows = [...listbox.querySelectorAll<HTMLElement>('[data-ax-static]')]
      .sort((a, b) => Number(a.getAttribute('data-ax-order')) - Number(b.getAttribute('data-ax-order')));
    this.#staticItems = rows.map((row) => parseItem(row.getAttribute('data-ax-item'))).filter((i): i is TypeaheadItemData => i != null);
    for (const row of rows) {
      const kw = row.getAttribute('data-ax-keywords');
      if (kw) try { this.#staticKeywords.set(row.getAttribute('data-id') ?? '', JSON.parse(kw)); } catch { /* ignore */ }
    }
    const empty = listbox.querySelector<HTMLElement>('[data-ax-empty]');
    if (empty) this.#emptyAnnouncer = createRenderedTextAnnouncer(empty);

    const combo = createCombobox({
      listbox,
      fields: () => [this.#input],
      isOpen: () => this.isOpen,
      onActivate: (option) => this.#selectOption(option),
      optionSelector: OPTION,
    });
    this.#combo = combo;
    const cleanup: Array<() => void> = [combo.attach()];

    const onOpenChange = (event: Event) => {
      if (event.target !== layer) return;
      const {isOpen} = (event as CustomEvent<{isOpen: boolean}>).detail;
      input.setAttribute('aria-expanded', String(isOpen));
      if (isOpen) {
        combo.sync();
        this.#syncEmpty();
      } else {
        // handleLayerHide: drop the highlight, and the search the close cancelled settles silently.
        combo.highlight(null);
        this.#closedGen = this.#gen;
        this.#cancelSource();
        listbox.removeAttribute('data-ax-held');
        matchRanges.delete(this);
        syncMatchHighlight();
      }
    };
    layer.addEventListener('astryx-open-change', onOpenChange);
    cleanup.push(() => layer.removeEventListener('astryx-open-change', onOpenChange));

    const on = <K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      target.addEventListener(type, fn as EventListener);
      cleanup.push(() => target.removeEventListener(type, fn as EventListener));
    };
    on(input, 'input', () => { if (!this.isDisabled) this.#queryChange(input.value); });
    on(input, 'keydown', (e) => this.#onKeyDown(e));
    on(input, 'focus', () => this.#openIfEligible());
    on(input, 'pointerdown', () => { this.#wasAlreadyFocused = this.ownerDocument.activeElement === input; });
    on(input, 'click', () => this.#onInputClick());
    on(input, 'blur', (e) => this.#onBlur(e));

    if (!this.isBase) {
      on(this, 'click', (e) => this.#onBoxClick(e));
      on(this, 'mousedown', (e) => {
        if ((e.target as Element | null)?.closest('[data-ax-input-clear]')) e.preventDefault();
      });
      on(this, 'focusout', (e) => {
        if (e.relatedTarget instanceof Node && this.contains(e.relatedTarget)) return;
        // Blurring without a pick restores the token.
        if (this.#isEditing) {
          this.#isEditing = false;
          this.#syncToken();
        }
      });
      cleanup.push(onFormReset(input, () => this.#setValue(this.#defaultValue)));
    }
    this.#cleanup = cleanup;
    this.#syncToken();
  }

  disconnectedCallback(): void {
    for (const fn of this.#cleanup) fn();
    this.#cleanup = [];
    if (this.#timer) clearTimeout(this.#timer);
    cancelAnimationFrame(this.#busyFrame);
    this.#cancelSource();
    matchRanges.delete(this);
    syncMatchHighlight();
  }

  // ── Query → search ────────────────────────────────────────────────────────

  #isBelowMin(query: string) {
    const n = graphemes(query);
    return n > 0 && n < this.#minQuery;
  }

  #queryChange(query: string) {
    this.#query = query;
    emit(this, 'astryx-change-query', {query});
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    if ((query.length === 0 && !this.#entriesOnFocus) || this.#isBelowMin(query)) {
      // Nothing to search: drop stale results and close (no "no results" nobody asked for).
      this.#gen++;
      this.#cancelSource();
      this.#results = [];
      this.#render([]);
      this.#hasSearched = false;
      this.#setLoading(false);
      announce('', {from: this});
      this.#hide();
      return;
    }
    const run = () => {
      if (query.length > 0) void this.#performSearch(query);
      else if (this.#entriesOnFocus) void this.#performBootstrap();
    };
    if (this.#debounceMs <= 0) run();
    else this.#timer = setTimeout(() => { this.#timer = null; run(); }, this.#debounceMs);
    this.#syncEmpty();
  }

  #cancelSource() {
    this.#searchSource?.cancel?.();
    this.#controller?.abort();
    this.#controller = null;
  }

  #staticSearch(query: string): TypeaheadItemData[] {
    const lower = query.toLowerCase().trim();
    if (lower === '') return this.#staticItems;
    return this.#staticItems.filter((item) => item.label.toLowerCase().includes(lower)
      || (this.#staticKeywords.get(item.id) ?? []).some((k) => k.includes(lower)));
  }

  /** Ask the current source; an array is a synchronous answer. */
  #request(kind: 'search' | 'bootstrap', query: string, update: (items: TypeaheadItemData[]) => void): TypeaheadItemData[] | Promise<TypeaheadItemData[]> {
    const source = this.#searchSource;
    if (source) {
      this.#shownFromStatic = false;
      return kind === 'search' ? source.search(query, {update}) : source.bootstrap();
    }
    const controller = new AbortController();
    this.#controller = controller;
    let resolve!: (items: TypeaheadItemData[]) => void;
    let reject!: (error?: unknown) => void;
    const answer = new Promise<TypeaheadItemData[]>((res, rej) => { resolve = res; reject = rej; });
    const detail: TypeaheadQueryDetail = {
      query,
      kind,
      signal: controller.signal,
      respond: (items) => resolve(items ?? []),
      update: (items) => update(items ?? []),
      reject: (error) => reject(error ?? new Error('rejected')),
    };
    const event = new CustomEvent<TypeaheadQueryDetail>('astryx-query', {detail, bubbles: true, composed: true, cancelable: true});
    this.dispatchEvent(event);
    if (event.defaultPrevented) {
      this.#shownFromStatic = false;
      return answer;
    }
    this.#controller = null;
    this.#shownFromStatic = true;
    return kind === 'search' ? this.#staticSearch(query) : this.#staticItems;
  }

  async #performSearch(query: string) {
    this.#cancelSource();
    const gen = ++this.#gen;
    this.#lastSearchedQuery = query;
    this.#setLoading(true);
    this.#hasSearched = true;
    let isSettled = false;
    let shown: TypeaheadItemData[] | null = null;
    const showList = (list: TypeaheadItemData[], isFirstWins: boolean): TypeaheadItemData[] => {
      const fetched = list.slice(0, this.#maxItems);
      const isFirst = shown == null;
      const keepId = this.#combo?.highlighted()?.getAttribute('data-id') ?? null;
      if (!isFirst && !isFirstWins) this.#holdHeight();
      this.#resultsGen = gen;
      this.#results = fetched;
      this.#render(fetched);
      // The first list highlights its first row; a later list keeps the highlighted item.
      const rows = this.#combo?.options() ?? [];
      const kept = !isFirst && keepId != null ? rows.find((r) => r.getAttribute('data-id') === keepId) : null;
      this.#combo?.highlight(kept ?? rows[0] ?? null, 'program');
      if (fetched.length > 0) shown = fetched;
      return fetched;
    };
    const update = (items: TypeaheadItemData[]) => {
      if (isSettled || this.#gen !== gen || items.length === 0) return;
      showList(items, false);
      this.#show();
    };
    const announceCount = (count: number) => {
      if (this.isConnected && query.length > 0 && count > 0) {
        announce(fillPlural(this.getAttribute('data-ax-result-count'), this.#locale, count, {count: formatNumber(count, this.#locale)}), {from: this});
      }
    };
    try {
      const answer = this.#request('search', query, update);
      const items = Array.isArray(answer) ? answer : await answer;
      if (this.#gen !== gen) return;
      isSettled = true;
      const list = showList(items, false);
      if (items.length > 0 || query.length > 0) this.#show();
      if (query.length > 0) this.#settleBusy();
      announceCount(list.length);
    } catch {
      if (this.#gen !== gen) return;
      isSettled = true;
      if (this.#closedGen === gen) {
        // The close cancelled this search: silent; keep only this query's own rows.
        if (shown) showList(shown, false);
        else { this.#results = []; this.#render([]); this.#hasSearched = false; }
      } else {
        if (query.length > 0) this.#settleBusy();
        if (shown) announceCount(showList(shown, false).length);
        else { this.#results = []; this.#render([]); }
      }
    } finally {
      if (this.#gen === gen) this.#setLoading(false);
      this.#syncEmpty();
    }
  }

  async #performBootstrap() {
    const gen = ++this.#gen;
    let answer: TypeaheadItemData[] | Promise<TypeaheadItemData[]>;
    try {
      answer = this.#request('bootstrap', '', () => {});
    } catch {
      this.#applyBootstrap([], gen);
      if (this.#gen === gen) this.#setLoading(false);
      return;
    }
    if (Array.isArray(answer)) {
      this.#setLoading(false);
      this.#applyBootstrap(answer, gen);
      return;
    }
    this.#setLoading(true);
    try {
      this.#applyBootstrap(await answer, gen);
    } catch {
      this.#applyBootstrap([], gen);
    } finally {
      if (this.#gen === gen) this.#setLoading(false);
    }
  }

  #applyBootstrap(items: TypeaheadItemData[], gen: number) {
    if (this.#gen !== gen) return;
    this.#resultsGen = gen;
    const shown = items.slice(0, this.#maxItems);
    // A focus load that offers nothing closes the list rather than showing it empty.
    if (this.#results.length === 0 && shown.length === 0 && !this.#combo?.highlighted()) {
      this.#hide();
      return;
    }
    this.#results = shown;
    this.#render(shown);
    this.#combo?.highlight(this.#combo.options()[0] ?? null, 'program');
    if (items.length > 0) this.#show();
    else this.#hide();
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  /** Spec AST-092 FR6: once a later list arrives, the popup holds its height (no jump/flip). */
  #holdHeight() {
    const listbox = this.#listbox;
    if (!listbox || listbox.hasAttribute('data-ax-held')) return;
    const box = listbox.getBoundingClientRect();
    if (box.height <= 0) return;
    listbox.style.setProperty('--_ax-held-height', `${Math.max(box.height, Math.min(300, (window.visualViewport?.height ?? window.innerHeight) - box.top - 16))}px`);
    listbox.setAttribute('data-ax-held', '');
  }

  #optionId(id: string, used: Set<string>): string {
    const base = `${this.#listbox?.id}-option-${encodeURIComponent(id)}`;
    let out = base;
    for (let i = 1; used.has(out); i++) out = `${base}-${i}`;
    used.add(out);
    return out;
  }

  #render(items: TypeaheadItemData[]) {
    const listbox = this.#listbox;
    if (!listbox) return;
    const empty = listbox.querySelector<HTMLElement>('[data-ax-empty]');
    for (const el of listbox.querySelectorAll('[data-ax-dynamic]')) el.remove();
    const staticRows = new Map([...listbox.querySelectorAll<HTMLElement>('[data-ax-static]')].map((r) => [r.getAttribute('data-id') ?? '', r]));
    const useStatic = this.#shownFromStatic && items.every((item) => staticRows.has(item.id));
    const visible = new Set(items.map((i) => i.id));
    for (const [id, row] of staticRows) row.hidden = !(useStatic && visible.has(id));
    if (!useStatic) {
      const used = new Set<string>([...staticRows.values()].map((r) => r.id));
      const doc = this.ownerDocument;
      const tpl = this.#layer?.querySelector<HTMLTemplateElement>(':scope > template[data-ax-option-template]');
      const buildRow = (item: TypeaheadItemData) => {
        const row = (tpl?.content.firstElementChild?.cloneNode(true) as HTMLElement | undefined) ?? doc.createElement('div');
        row.id = this.#optionId(item.id, used);
        row.setAttribute('role', 'option');
        row.setAttribute('data-id', item.id);
        row.setAttribute('data-ax-label', item.label);
        row.setAttribute('data-ax-item', JSON.stringify(item));
        row.setAttribute('data-ax-dynamic', '');
        row.removeAttribute('hidden');
        const size = this.getAttribute('data-size');
        if (size) row.setAttribute('data-size', size);
        const content = row.querySelector<HTMLElement>('.ax-typeahead-option-content');
        const custom = this.renderItem?.(item);
        if (content && custom != null) {
          if (typeof custom === 'string') content.innerHTML = custom;
          else content.replaceChildren(custom);
        } else {
          const label = row.querySelector('[data-ax-item-label]');
          if (label) label.textContent = item.label;
        }
        return row;
      };
      for (const group of groupItems(items as never[], {ungroupedFirst: true}) as Array<{heading: string | null; items: TypeaheadItemData[]}>) {
        if (group.heading == null) {
          for (const item of group.items) listbox.insertBefore(buildRow(item), empty);
          continue;
        }
        const wrap = doc.createElement('div');
        wrap.setAttribute('role', 'group');
        wrap.setAttribute('aria-label', group.heading);
        wrap.setAttribute('data-ax-dynamic', '');
        const heading = doc.createElement('div');
        heading.setAttribute('aria-hidden', 'true');
        heading.className = 'ax-typeahead-group-heading';
        heading.textContent = group.heading;
        wrap.append(heading, ...group.items.map(buildRow));
        listbox.insertBefore(wrap, empty);
      }
    }
    for (const group of listbox.querySelectorAll<HTMLElement>('[data-ax-group]')) {
      group.hidden = !group.querySelector('[data-ax-static]:not([hidden])');
    }
    this.#syncSelected();
    this.#syncMatches();
    this.#combo?.sync();
    this.#syncEmpty();
  }

  #syncSelected() {
    const listbox = this.#listbox;
    if (!listbox) return;
    const check = this.#layer?.querySelector<HTMLTemplateElement>(':scope > template[data-ax-check-template]');
    for (const row of listbox.querySelectorAll<HTMLElement>(OPTION)) {
      const isSelected = this.#value != null && row.getAttribute('data-id') === this.#value.id;
      row.setAttribute('aria-selected', String(isSelected));
      const slot = row.querySelector<HTMLElement>('[data-ax-check-slot]');
      if (!slot) continue;
      if (isSelected && !slot.firstElementChild && check) slot.replaceChildren(check.content.cloneNode(true));
      else if (!isSelected && slot.firstElementChild) slot.replaceChildren();
    }
  }

  #syncMatches() {
    if (!this.hasAttribute('data-ax-match-highlight') || !this.#listbox) return;
    const query = this.#query.trim().toLowerCase();
    const ranges: Range[] = [];
    if (query) {
      for (const label of this.#listbox.querySelectorAll<HTMLElement>(`${OPTION}:not([hidden]) [data-ax-item-label]`)) {
        const node = label.firstChild;
        if (!node || node.nodeType !== Node.TEXT_NODE) continue;
        const text = (node.textContent ?? '').toLowerCase();
        for (let at = text.indexOf(query); at >= 0; at = text.indexOf(query, at + query.length)) {
          const range = this.ownerDocument.createRange();
          range.setStart(node, at);
          range.setEnd(node, at + query.length);
          ranges.push(range);
        }
      }
    }
    if (ranges.length) matchRanges.set(this, ranges);
    else matchRanges.delete(this);
    syncMatchHighlight();
  }

  /** The empty row: only for a settled, searched, non-empty query (AST-056); announced as rendered. */
  #syncEmpty() {
    const empty = this.#listbox?.querySelector<HTMLElement>('[data-ax-empty]');
    if (!empty) return;
    const isPending = this.#isLoading || this.#query !== this.#lastSearchedQuery;
    const shown = this.#results.length === 0 && this.#hasSearched && !isPending;
    empty.hidden = !shown;
    this.#emptyAnnouncer?.sync(shown && this.#query.length > 0 && this.isOpen, this.#query);
  }

  // ── Busy state ────────────────────────────────────────────────────────────

  #setLoading(next: boolean) {
    if (this.#isLoading === next) return;
    this.#isLoading = next;
    const input = this.#input;
    if (next) input?.setAttribute('aria-busy', 'true');
    else input?.removeAttribute('aria-busy');
    const spinner = this.querySelector<HTMLElement>('[data-ax-typeahead-spinner]');
    const own = this.querySelector<HTMLElement>('[data-ax-own-spinner]');
    if (own) own.hidden = !next;
    else if (spinner) spinner.hidden = !next;
    this.#syncEndLane();
    // useBusyAnnouncement: the busy start is announced once, a frame later; a search that
    // settles first withdraws it.
    if (next) {
      if (!this.#busyAnnounced) {
        cancelAnimationFrame(this.#busyFrame);
        this.#busyFrame = requestAnimationFrame(() => {
          this.#busyFrame = 0;
          this.#busyAnnounced = true;
          const label = this.getAttribute('data-ax-loading-label');
          if (label) this.#busyWithdraw = announce(label, {politeness: 'polite', from: this});
        });
      }
    } else {
      this.#busyAnnounced = false;
      this.#busyWithdraw = null;
      cancelAnimationFrame(this.#busyFrame);
      this.#busyFrame = 0;
    }
  }

  #settleBusy() {
    if (this.#busyFrame) {
      cancelAnimationFrame(this.#busyFrame);
      this.#busyFrame = 0;
      this.#busyAnnounced = true;
    }
    this.#busyWithdraw?.();
    this.#busyWithdraw = null;
  }

  // ── Open / close ──────────────────────────────────────────────────────────

  #show() {
    if (this.isDisabled || !this.#layer || this.isOpen) return;
    this.#layer.show({reason: 'api'});
  }

  #hide() {
    if (this.isOpen) this.#layer?.hide('api');
  }

  /** openIfEligible: bootstrap, or re-show results no selection invalidated since. */
  #openIfEligible(force = false) {
    if (this.isDisabled) return;
    const hasCurrent = this.#results.length > 0 && this.#resultsGen >= this.#sourceGen;
    if ((this.#entriesOnFocus || force) && !hasCurrent && this.#query.length === 0) {
      if (this.#entriesOnFocus) void this.#performBootstrap();
    } else if (this.#results.length > 0 && (this.#query.length > 0 || this.#entriesOnFocus || force) && this.#resultsGen === this.#gen) {
      this.#show();
    }
  }

  #onInputClick() {
    // A click on an input that already had focus (after a pick re-focused it) reopens it.
    if (this.isDisabled || !this.#wasAlreadyFocused || this.isOpen) return;
    if (this.#entriesOnFocus && this.#query.length === 0 && this.#resultsGen !== this.#gen) {
      void this.#performBootstrap();
      return;
    }
    this.#openIfEligible();
  }

  #onBlur(event: FocusEvent) {
    if (!this.isOpen) return;
    const next = event.relatedTarget;
    if (next instanceof Node && (this.#anchor?.contains(next) || this.#layer?.contains(next))) return;
    // Focus left the field (Tab, a programmatic move): close, as an outside press would.
    noteOutsideDismissal(this.ownerDocument);
    this.#hide();
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────

  #onKeyDown(e: KeyboardEvent) {
    // Typeahead's own handler runs first (Escape in edit mode with the list closed).
    if (isImeKeyEvent(e)) return;
    if (!this.isBase && e.key === 'Escape' && this.#isEditing && !this.isOpen) {
      e.preventDefault();
      this.#isEditing = false;
      this.#syncToken();
      this.#focusTokenNextFrame();
      return;
    }
    if (e.defaultPrevented) return;
    if (this.isDisabled) {
      // Only a list open from before can close; Enter picks nothing and submits nothing.
      if (this.isOpen && e.key === 'Enter') e.preventDefault();
      if (this.isOpen && (e.key === 'Escape' || e.key === 'Tab')) {
        if (e.key === 'Escape') e.preventDefault();
        this.#hide();
      }
      return;
    }
    if (!this.isOpen) {
      if (e.key === 'ArrowDown' && (this.#entriesOnFocus || this.#query.length > 0)) {
        e.preventDefault();
        const hasCurrent = this.#results.length > 0 && this.#resultsGen >= this.#sourceGen;
        const below = this.#isBelowMin(this.#query);
        if (hasCurrent) {
          this.#show();
          this.#combo?.highlight(this.#combo.options()[0] ?? null, 'keyboard');
        } else if (this.#results.length > 0 && this.#query.length > 0 && !below) {
          void this.#performSearch(this.#query);
        } else if (this.#entriesOnFocus && !below) {
          void this.#performBootstrap();
        }
      }
      return;
    }
    if (!this.#combo) return;
    handleComboboxKey(this.#combo, e, {
      kind: 'editable',
      open: () => false,
      close: () => this.#hide(),
      activate: (option) => this.#selectOption(option),
    });
  }

  // ── Selection ─────────────────────────────────────────────────────────────

  #selectOption(option: HTMLElement) {
    if (option.getAttribute('aria-disabled') === 'true') return;
    const item = parseItem(option.getAttribute('data-ax-item'));
    if (item) this.#select(item);
  }

  #select(item: TypeaheadItemData) {
    if (this.isDisabled) return;
    this.#gen++;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.#cancelSource();
    const hadQuery = this.#query !== '';
    this.#isEditing = false;
    this.#setValue(item);
    emit(this, 'astryx-change', {value: item});
    this.#query = '';
    if (this.#input) this.#input.value = '';
    if (hadQuery) emit(this, 'astryx-change-query', {query: ''});
    this.#results = [];
    this.#hasSearched = false;
    this.#setLoading(false);
    this.#render([]);
    this.#hide();
    this.#input?.focus();
    if (!this.isBase) this.#focusTokenNextFrame();
  }

  #setValue(item: TypeaheadItemData | null) {
    this.#value = item;
    if (item) this.setAttribute('data-ax-value', JSON.stringify(item));
    else this.removeAttribute('data-ax-value');
    const hidden = this.querySelector<HTMLInputElement>(':scope > input[data-ax-typeahead-value]');
    if (hidden) hidden.value = item?.id ?? '';
    this.#syncSelected();
    this.#syncToken();
  }

  // ── Typeahead wrapper: token, edit mode, end lane ─────────────────────────

  #syncToken() {
    if (this.isBase) return;
    const input = this.#input;
    const token = this.querySelector<HTMLElement>('[data-ax-typeahead-token]');
    const showToken = this.#value != null && !this.#isEditing;
    if (token) {
      token.hidden = !showToken;
      const label = token.querySelector('.ax-token-label');
      if (label && this.#value) label.textContent = this.#value.label;
    }
    const valueText = this.querySelector('[data-ax-token-value]');
    if (valueText) valueText.textContent = this.#value?.label ?? '';
    if (input) {
      input.toggleAttribute('data-ax-input-hidden', showToken);
      // An invisible input is no tab stop; it stays programmatically focusable.
      if (showToken) input.tabIndex = -1;
      else input.removeAttribute('tabindex');
      const placeholder = this.getAttribute('data-ax-placeholder-text');
      if (showToken || placeholder == null) input.removeAttribute('placeholder');
      else input.setAttribute('placeholder', placeholder);
    }
    const clear = this.querySelector<HTMLElement>('[data-ax-end-lane] [data-ax-input-clear]');
    if (clear) clear.hidden = this.#value == null || this.isDisabled;
    this.#syncEndLane();
  }

  #syncEndLane() {
    const lane = this.querySelector<HTMLElement>('[data-ax-end-lane]');
    if (!lane) return;
    const spinner = lane.querySelector<HTMLElement>('[data-ax-typeahead-spinner]');
    const clear = lane.querySelector<HTMLElement>('[data-ax-input-clear]');
    lane.hidden = (spinner?.hidden ?? true) && (clear?.hidden ?? true);
  }

  #focusTokenNextFrame() {
    requestAnimationFrame(() => {
      const token = this.querySelector<HTMLElement>('[data-ax-typeahead-token]');
      if (!token || token.hidden) return;
      (token.querySelector<HTMLElement>('button') ?? token).focus();
    });
  }

  #enterEditMode() {
    const input = this.#input;
    if (this.isDisabled || !this.#value || !input) return;
    this.#isEditing = true;
    this.#syncToken();
    // The label becomes the query before focus, so focus does not bootstrap an empty one.
    input.value = this.#value.label;
    this.#queryChange(this.#value.label);
    input.focus();
    input.setSelectionRange(0, input.value.length);
  }

  #onBoxClick(event: MouseEvent) {
    if (this.isDisabled) return;
    const target = event.target as Element | null;
    if (!target) return;
    if (target.closest('[data-ax-input-clear]')) {
      event.stopPropagation();
      this.clear();
      return;
    }
    if (target.closest('[popover]')) return;
    const showToken = this.#value != null && !this.#isEditing;
    if (showToken) this.#enterEditMode();
    else if (target !== this.#input) this.#input?.focus();
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-typeahead')) {
  customElements.define('ax-typeahead', TypeaheadElement);
}

declare global {
  interface HTMLElementTagNameMap { 'ax-typeahead': TypeaheadElement }
  interface HTMLElementEventMap { 'astryx-query': CustomEvent<TypeaheadQueryDetail> }
}
