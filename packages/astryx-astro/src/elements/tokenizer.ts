/**
 * `<ax-tokenizer>` — the behaviour of Tokenizer (light DOM, wraps the server markup of
 * components/Tokenizer/Tokenizer.astro).
 *
 * Ports @astryxdesign/core Tokenizer/Tokenizer.tsx (tokens, add/create/remove/Clear all, the
 * announcements, Backspace on an empty input, focus redirect into the input, maxEntries, the
 * end lane with its idle busy slot, unfocusedInline/unfocusedLayer folding, form carriers),
 * Tokenizer/useEndLaneReserve.ts (the measured lane reserve, `--_tokenizer-end-lane-reserve`),
 * hooks/useOverflow.ts driving OverflowList/computeOverflow.ts ("+N more"), and the
 * BaseTypeahead engine the Tokenizer composes (Typeahead/BaseTypeahead.tsx: debounced search,
 * minQueryLength by grapheme, bootstrap on focus, generations that drop stale answers, partial
 * lists through `context.update`, maxMenuItems, grouping, `__queryEntries` — the Create row —,
 * committed choices that leave every list and reload an open one (committedChoicesKey.tsx),
 * the busy state and its one announcement, result-count and rendered empty-message
 * announcements, blur dismissal, the keyboard map, the IME guard). Highlight, keyboard and
 * aria-activedescendant come from runtime/combobox.ts; the popup is BaseTypeahead's
 * `<ax-combobox-layer popover="manual" data-ax-outside-press="dismiss">`.
 *
 * Sources, in order: `el.searchSource` (Astryx SearchSource) → an `astryx-query` listener that
 * claims the query (`preventDefault()`) and answers `respond(items)` → the static items the
 * server rendered (createStaticSource semantics). Selected items are filtered out of all of them.
 *
 * Events: `astryx-change` `{values, change: {item, type: 'add'|'create'|'remove'}}` (cancelable:
 * `preventDefault()` keeps the tokens; the owner then sets `value`), `astryx-change-query`
 * `{query}`, `astryx-query` (see Typeahead).
 */
import './runtime/disabledInteraction';
import './runtime/layer';
import '../behaviors/token';
import {announce, createRenderedTextAnnouncer, type Withdraw} from './runtime/announce';
import {comboboxLayer, createCombobox, handleComboboxKey, type Combobox, type ComboboxLayerElement} from './runtime/combobox';
import {isImeKeyEvent} from './runtime/dom';
import {noteOutsideDismissal} from './runtime/layerStack';
import type {LayerElement} from './runtime/layer';
import {groupItems} from '../lib/groupItems';
import {computeOverflow} from '../components/OverflowList/computeOverflow';
import {emit, fillMessage, fillPlural, formatNumber, onFormReset} from './field';
import type {TypeaheadItemData, TypeaheadQueryDetail, TypeaheadSearchContext, TypeaheadSearchSource} from './typeahead';

export type TokenizerItem = TypeaheadItemData;
export type TokenizerChangeType = 'add' | 'create' | 'remove';
export interface TokenizerChangeDetail<T extends TokenizerItem = TokenizerItem> {
  values: T[];
  change: {item: T; type: TokenizerChangeType};
}
export type {TypeaheadSearchSource as TokenizerSearchSource, TypeaheadSearchContext as TokenizerSearchContext};

const OPTION = '[role="option"]:not([data-ax-empty])';
// Astryx's sentinel prefix for the derived "Create: X" entry.
const CREATE_PREFIX = '__xds_create__';
const Base: typeof HTMLElement = typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement;

function graphemes(text: string): number {
  const Segmenter = (Intl as {Segmenter?: new (l?: string, o?: {granularity: string}) => {segment(t: string): Iterable<unknown>}}).Segmenter;
  if (!Segmenter) return [...text].length;
  let n = 0;
  for (const _ of new Segmenter(undefined, {granularity: 'grapheme'}).segment(text)) n++;
  return n;
}

function parseJSON<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

const plain = (item: TokenizerItem): TokenizerItem =>
  item.auxiliaryData === undefined ? {id: item.id, label: item.label} : {id: item.id, label: item.label, auxiliaryData: item.auxiliaryData};

export class TokenizerElement extends Base {
  #wrapper: HTMLElement | null = null;
  #overlay: LayerElement | null = null;
  #input: HTMLInputElement | null = null;
  #layer: ComboboxLayerElement | null = null;
  #listbox: HTMLElement | null = null;
  #combo: Combobox | null = null;
  #cleanup: Array<() => void> = [];
  #staticItems: TokenizerItem[] = [];
  #staticKeywords = new Map<string, string[]>();
  #query = '';
  #results: TokenizerItem[] = [];
  #entryCount = 0;
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
  #values: TokenizerItem[] = [];
  #default: TokenizerItem[] = [];
  #committedKey = '[]';
  #isFocusedWithin = false;
  #wasAlreadyFocused = false;
  #searchSource: TypeaheadSearchSource | null = null;
  #resize: ResizeObserver | null = null;
  #overflowFrame = 0;
  /** Client rows: a Node or an HTML string for an item (server rows use `renderItem`). */
  renderItem: ((item: TokenizerItem) => Node | string | null | undefined) | null = null;
  /** Client tokens for items added in the browser (server tokens use `renderToken`). */
  renderToken: ((item: TokenizerItem) => Node | string | null | undefined) | null = null;
  #isItemRemovable: ((item: TokenizerItem) => boolean) | null = null;

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

  /** The selected items. Setting it re-renders the tokens (no event). */
  get value(): TokenizerItem[] { return this.#values.map(plain); }
  set value(next: TokenizerItem[] | null) { this.#setValues((next ?? []).map(plain)); }

  /** Which tokens a remove path may remove (TokenizerItemRemovableContext). */
  get isItemRemovable(): (item: TokenizerItem) => boolean {
    return this.#isItemRemovable ?? ((item) => !this.#tokenNode(item.id)?.hasAttribute('data-ax-locked'));
  }
  set isItemRemovable(fn: ((item: TokenizerItem) => boolean) | null) {
    this.#isItemRemovable = fn;
    this.#syncChrome();
  }

  get query(): string { return this.#query; }
  get input(): HTMLInputElement | null { return this.#input; }
  get isOpen(): boolean { return this.#layer?.isOpen ?? false; }
  get isDisabled(): boolean {
    const input = this.#input;
    return !!input && (input.disabled || input.getAttribute('aria-disabled') === 'true');
  }
  get isAtMax(): boolean {
    const max = this.#num('data-ax-max-entries', Number.POSITIVE_INFINITY);
    return this.#values.length >= max;
  }

  focus(options?: FocusOptions): void {
    if (this.#overlay && !this.isDisabled) this.#expandLayer();
    this.#input?.focus(options);
  }
  blur(): void { this.#input?.blur(); }
  open(): void { this.#openIfEligible(true); }
  close(): void { this.#hide(); }
  /** Clear all removable tokens, as the Clear all button does. */
  clear(): void { this.#clearAll(); }

  // ── Wiring ────────────────────────────────────────────────────────────────

  #num(name: string, fallback: number): number {
    const v = Number(this.getAttribute(name));
    return this.hasAttribute(name) && Number.isFinite(v) ? v : fallback;
  }
  get #debounceMs() { return this.#num('data-ax-debounce', 150); }
  get #minQuery() { return this.#num('data-ax-min-query', 1); }
  get #maxItems() { return this.#num('data-ax-max-items', 10); }
  get #entriesOnFocus() { return this.hasAttribute('data-ax-entries-on-focus') && !this.isAtMax; }
  get #hasCreate() { return this.hasAttribute('data-ax-has-create'); }
  get #locale() { return this.getAttribute('data-ax-locale') ?? 'en'; }
  get #truncates() {
    const mode = this.getAttribute('data-ax-overflow-behavior');
    return mode === 'unfocusedInline' || mode === 'unfocusedLayer';
  }
  get #anchor(): HTMLElement | null {
    const id = this.#layer?.getAttribute('data-ax-anchor');
    return (id ? this.ownerDocument.getElementById(id) : null) ?? this.#wrapper;
  }

  connectedCallback(): void {
    const doc = this.ownerDocument;
    const overlayId = this.getAttribute('data-ax-overlay');
    const overlay = overlayId ? doc.getElementById(overlayId) as LayerElement | null : null;
    const wrapperId = this.getAttribute('data-ax-wrapper');
    const wrapper = overlay && wrapperId ? doc.getElementById(wrapperId) : this;
    const input = wrapper?.querySelector<HTMLInputElement>('[data-ax-tokenizer-input]') ?? null;
    const layer = comboboxLayer(this, this.getAttribute('data-ax-layer'));
    const listboxId = this.getAttribute('data-ax-listbox');
    const listbox = listboxId ? doc.getElementById(listboxId) : null;
    if (!wrapper || !input || !layer || !listbox) return;
    this.#wrapper = wrapper;
    this.#overlay = overlay;
    this.#input = input;
    this.#layer = layer;
    this.#listbox = listbox;
    this.#values = (parseJSON<TokenizerItem[]>(this.getAttribute('data-ax-value')) ?? []).map(plain);
    this.#default = this.#values.map(plain);
    this.#committedKey = this.#keyOf(this.#values);
    const rows = [...listbox.querySelectorAll<HTMLElement>('[data-ax-static]')]
      .sort((a, b) => Number(a.getAttribute('data-ax-order')) - Number(b.getAttribute('data-ax-order')));
    this.#staticItems = rows.map((row) => parseJSON<TokenizerItem>(row.getAttribute('data-ax-item'))).filter((i): i is TokenizerItem => i != null);
    for (const row of rows) {
      const kw = parseJSON<string[]>(row.getAttribute('data-ax-keywords'));
      if (kw) this.#staticKeywords.set(row.getAttribute('data-id') ?? '', kw);
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
    const on = <K extends keyof HTMLElementEventMap>(target: EventTarget, type: K | string, fn: (e: HTMLElementEventMap[K]) => void, options?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, options);
      cleanup.push(() => target.removeEventListener(type, fn as EventListener, options));
    };

    on(layer, 'astryx-open-change', (event: Event) => {
      if (event.target !== layer) return;
      const {isOpen} = (event as CustomEvent<{isOpen: boolean}>).detail;
      input.setAttribute('aria-expanded', String(isOpen));
      if (isOpen) {
        combo.sync();
        this.#syncEmpty();
      } else {
        // handleLayerHide: drop the highlight; the search the close cancelled settles silently.
        combo.highlight(null);
        this.#closedGen = this.#gen;
        this.#cancelSource();
        listbox.removeAttribute('data-ax-held');
      }
    });
    on(input, 'input', () => { if (!this.isDisabled) this.#queryChange(input.value); });
    on(input, 'keydown', (e: KeyboardEvent) => this.#onKeyDown(e));
    on(input, 'focus', () => this.#openIfEligible());
    on(input, 'pointerdown', () => { this.#wasAlreadyFocused = doc.activeElement === input; });
    on(input, 'click', () => this.#onInputClick());
    on(input, 'blur', (e: FocusEvent) => this.#onBlur(e));
    on(wrapper, 'click', (e: MouseEvent) => this.#onBoxClick(e));
    on(wrapper, 'mousedown', (e: MouseEvent) => {
      const target = e.target as Element | null;
      // A press on the clear button, or on the box's chrome while the input has focus, keeps
      // focus in the field (the wrapper click would only hand it back).
      if (target?.closest('[data-ax-input-clear]')) e.preventDefault();
      else if (doc.activeElement === input && target && target !== input && !target.closest('input, textarea, select, button, a[href], [tabindex], [contenteditable="true"]')) e.preventDefault();
    });
    on(wrapper, 'astryx-remove', (e: Event) => this.#onTokenRemove(e));
    for (const box of this.#focusBoxes()) {
      on(box, 'focusin', (e: FocusEvent) => this.#onFocusIn(e));
      on(box, 'focusout', (e: FocusEvent) => this.#onFocusOut(e));
    }
    if (overlay) {
      on(this, 'click', (e: MouseEvent) => this.#onPlaceholderClick(e));
      on(this, 'astryx-remove', (e: Event) => this.#onTokenRemove(e));
    }
    cleanup.push(onFormReset(input, () => this.#setValues(this.#default.map(plain))));

    // useEndLaneReserve + useOverflow: one observer for the lane and the folded rows.
    const lane = this.#lane();
    this.#resize = new ResizeObserver(() => {
      this.#syncLaneReserve();
      this.#scheduleOverflow();
    });
    if (lane) this.#resize.observe(lane);
    this.#resize.observe(this);
    if (wrapper !== this) this.#resize.observe(wrapper);
    cleanup.push(() => { this.#resize?.disconnect(); this.#resize = null; });

    this.#cleanup = cleanup;
    this.#isFocusedWithin = this.#focusBoxes().some((box) => box.contains(doc.activeElement));
    this.#syncChrome();
    this.#syncLaneReserve();
    this.#syncOverflow();
  }

  disconnectedCallback(): void {
    for (const fn of this.#cleanup) fn();
    this.#cleanup = [];
    if (this.#timer) clearTimeout(this.#timer);
    cancelAnimationFrame(this.#busyFrame);
    cancelAnimationFrame(this.#overflowFrame);
    this.#cancelSource();
  }

  // ── Tokens and value ──────────────────────────────────────────────────────

  #keyOf(items: TokenizerItem[]) { return JSON.stringify(items.map((i) => i.id)); }

  /** The boxes focus may be in: the field box, plus the folded field (unfocusedLayer). */
  #focusBoxes(): HTMLElement[] {
    const boxes: HTMLElement[] = [];
    if (this.#wrapper) boxes.push(this.#wrapper);
    if (this.#overlay && this.#wrapper !== this) boxes.push(this);
    return boxes;
  }

  #isInside(node: EventTarget | null): boolean {
    if (!(node instanceof Node)) return false;
    return this.#focusBoxes().some((box) => box.contains(node)) || (this.#overlay?.contains(node) ?? false);
  }

  #tokenNodes(): HTMLElement[] {
    const nodes: HTMLElement[] = [];
    for (const box of this.#focusBoxes()) nodes.push(...box.querySelectorAll<HTMLElement>(':scope > [data-ax-token-item]'));
    return nodes;
  }

  #tokenNode(id: string): HTMLElement | null {
    return this.#tokenNodes().find((n) => n.getAttribute('data-ax-token-item') === id) ?? null;
  }

  #lane(): HTMLElement | null { return this.#wrapper?.querySelector<HTMLElement>(':scope > [data-ax-end-lane]') ?? null; }

  #template(selector: string): HTMLTemplateElement | null {
    for (const box of this.#focusBoxes()) {
      const tpl = box.querySelector<HTMLTemplateElement>(`:scope > template${selector}`);
      if (tpl) return tpl;
    }
    return null;
  }

  #buildToken(item: TokenizerItem): HTMLElement {
    const doc = this.ownerDocument;
    const wrap = (content: Node | string) => {
      const span = doc.createElement('span');
      span.className = 'ax-tokenizer-token';
      if (typeof content === 'string') span.innerHTML = content;
      else span.append(content);
      return span;
    };
    let node: HTMLElement | null = null;
    const custom = this.renderToken?.(item);
    if (custom != null) node = wrap(custom);
    if (!node) {
      const tpl = this.#template(`[data-ax-token-for="${CSS.escape(item.id)}"]`);
      const first = tpl?.content.firstElementChild?.cloneNode(true);
      if (first instanceof HTMLElement) node = first;
    }
    if (!node) {
      const tpl = this.#template('[data-ax-token-template]');
      const first = tpl?.content.firstElementChild?.cloneNode(true);
      node = first instanceof HTMLElement ? first : wrap(item.label);
      const label = node.querySelector('.ax-token-label');
      if (label) label.textContent = item.label;
      const remove = node.querySelector<HTMLElement>('[data-ax-token-remove]');
      if (remove) {
        const name = fillMessage(this.getAttribute('data-ax-msg-remove'), {label: item.label});
        if (name) remove.setAttribute('aria-label', name);
      }
    }
    node.setAttribute('data-ax-token-item', item.id);
    node.setAttribute('data-ax-token-label', item.label);
    if (this.#isItemRemovable && !this.#isItemRemovable(item)) {
      node.setAttribute('data-ax-locked', '');
      node.querySelector('[data-ax-token-remove]')?.remove();
    }
    return node;
  }

  /** Where tokens live now: the folded field while collapsed (unfocusedLayer), else the box. */
  #tokenHome(): {box: HTMLElement; before: Node | null} {
    const collapsed = this.#overlay && !this.#isFocusedWithin;
    const box = collapsed ? this : this.#wrapper!;
    const before = collapsed
      ? box.querySelector(':scope > [data-ax-overflow]')
      : box.querySelector(':scope > [data-ax-overflow]') ?? this.#input;
    return {box, before};
  }

  /** Re-render the tokens (kept nodes stay where they are; order follows the items). */
  #renderTokens() {
    const existing = new Map(this.#tokenNodes().map((n) => [n.getAttribute('data-ax-token-item') ?? '', n]));
    const {box, before} = this.#tokenHome();
    const wanted = new Map(this.#values.map((i) => [i.id, i]));
    for (const [id, node] of existing) {
      // A token whose item changed under the same id (an edited label) renders again.
      const item = wanted.get(id);
      if (item && node.hasAttribute('data-ax-token-label') && node.getAttribute('data-ax-token-label') !== item.label) {
        const fresh = this.#buildToken(item);
        node.replaceWith(fresh);
        existing.set(id, fresh);
        continue;
      }
      if (!item) {
        node.remove();
        existing.delete(id);
      }
    }
    const keptOrder = this.#values.filter((i) => existing.has(i.id)).map((i) => i.id);
    const domOrder = [...box.querySelectorAll<HTMLElement>(':scope > [data-ax-token-item]')].map((n) => n.getAttribute('data-ax-token-item'));
    const inPlace = existing.size === domOrder.length && keptOrder.every((id, i) => domOrder[i] === id);
    if (inPlace) {
      // Only insert the new tokens, each before the next kept one (no focused node moves).
      let ref: Node | null = before;
      for (let i = this.#values.length - 1; i >= 0; i--) {
        const item = this.#values[i];
        const node = existing.get(item.id);
        if (node) { ref = node; continue; }
        const created = this.#buildToken(item);
        box.insertBefore(created, ref);
        ref = created;
      }
      return;
    }
    for (const item of this.#values) box.insertBefore(existing.get(item.id) ?? this.#buildToken(item), before);
  }

  #setValues(next: TokenizerItem[]) {
    this.#values = next;
    this.setAttribute('data-ax-value', JSON.stringify(next));
    if (!this.#wrapper) return;
    this.#renderTokens();
    // Form carriers: one hidden input per id, none while disabled.
    const name = this.getAttribute('data-ax-html-name');
    const wrapper = this.#wrapper;
    for (const el of wrapper.querySelectorAll(':scope > input[data-ax-tokenizer-value]')) el.remove();
    if (name != null && !this.isDisabled) {
      const lane = this.#lane();
      for (const item of next) {
        const hidden = this.ownerDocument.createElement('input');
        hidden.type = 'hidden';
        hidden.name = name;
        hidden.value = item.id;
        hidden.setAttribute('data-ax-tokenizer-value', '');
        wrapper.insertBefore(hidden, lane);
      }
    }
    this.#syncChrome();
    this.#syncOverflow();
    const key = this.#keyOf(next);
    if (key !== this.#committedKey) {
      this.#committedKey = key;
      this.#dropCommittedRows();
      queueMicrotask(() => {
        if (this.#committedKey === key) this.#reloadForCommitted();
      });
    }
  }

  /** has-tokens, placeholder, at-max, Clear all, the busy slot and the lane. */
  #syncChrome() {
    const wrapper = this.#wrapper;
    const input = this.#input;
    if (!wrapper || !input) return;
    const hasTokens = this.#values.length > 0;
    const tokensInWrapper = !this.#overlay || this.#isFocusedWithin;
    wrapper.toggleAttribute('data-ax-has-tokens', hasTokens && tokensInWrapper);
    if (this.#overlay) this.toggleAttribute('data-ax-has-tokens', hasTokens);
    // A space keeps :placeholder-shown as the empty-query signal beside tokens.
    input.setAttribute('placeholder', hasTokens ? ' ' : this.getAttribute('data-ax-placeholder-text') ?? '');
    input.toggleAttribute('data-ax-at-max', this.isAtMax);
    const clear = wrapper.querySelector<HTMLElement>('[data-ax-end-lane] [data-ax-input-clear]');
    const removable = this.isItemRemovable;
    const showsClear = this.hasAttribute('data-ax-has-clear') && !this.isDisabled && this.#values.some((i) => removable(i));
    if (clear) clear.hidden = !showsClear;
    this.#syncLane();
  }

  #syncLane() {
    const lane = this.#lane();
    if (!lane) return;
    const spinner = lane.querySelector<HTMLElement>('[data-ax-tokenizer-spinner]');
    const clear = lane.querySelector<HTMLElement>('[data-ax-input-clear]');
    const hasBusySlot = this.#values.length > 0 && !this.isDisabled && !this.isAtMax;
    const hasStatic = [...lane.children].some((c) => c !== spinner && !c.matches('script, template, style, .ax-input-clear-slot'))
      || (clear != null && !clear.hidden);
    if (spinner) {
      spinner.hidden = !(this.#isLoading || hasBusySlot);
      spinner.toggleAttribute('data-ax-idle', !this.#isLoading);
      if (this.#isLoading) spinner.removeAttribute('aria-hidden');
      else spinner.setAttribute('aria-hidden', 'true');
    }
    lane.hidden = !(this.#isLoading || hasStatic || hasBusySlot);
    this.#syncLaneReserve();
  }

  #syncLaneReserve() {
    const lane = this.#lane();
    const wrapper = this.#wrapper;
    if (!wrapper) return;
    const width = lane && !lane.hidden ? lane.offsetWidth : 0;
    if (width > 0) wrapper.style.setProperty('--_tokenizer-end-lane-reserve', `calc(var(--spacing-2) + ${width}px)`);
    else wrapper.style.removeProperty('--_tokenizer-end-lane-reserve');
  }

  // ── Add / remove ──────────────────────────────────────────────────────────

  #commit(next: TokenizerItem[], change: TokenizerChangeDetail['change']): boolean {
    const detail: TokenizerChangeDetail = {values: next.map(plain), change: {item: plain(change.item), type: change.type}};
    const accepted = emit(this, 'astryx-change', detail);
    if (accepted) this.#setValues(next);
    return accepted;
  }

  #announce(attr: string, values: Record<string, string>) {
    const text = fillMessage(this.getAttribute(attr), values);
    if (text) announce(text, {from: this});
  }

  #add(item: TokenizerItem): boolean {
    if (this.isDisabled || this.isAtMax) return false;
    const selectedIds = new Set(this.#values.map((v) => v.id));
    const selectedLabels = new Set(this.#values.map((v) => v.label.toLowerCase()));
    if (this.#hasCreate && item.id.startsWith(CREATE_PREFIX)) {
      const created = item.id.slice(CREATE_PREFIX.length);
      if (selectedIds.has(created) || selectedLabels.has(created.toLowerCase())) return false;
      const real = {id: created, label: created};
      this.#commit([...this.#values, real], {item: real, type: 'create'});
      this.#announce('data-ax-msg-added', {label: created});
      return true;
    }
    if (selectedIds.has(item.id)) return false;
    this.#commit([...this.#values, plain(item)], {item: plain(item), type: 'add'});
    this.#announce('data-ax-msg-added', {label: item.label});
    return true;
  }

  #remove(item: TokenizerItem): boolean {
    if (this.isDisabled || !this.isItemRemovable(item)) return false;
    this.#commit(this.#values.filter((v) => v.id !== item.id), {item, type: 'remove'});
    this.#announce('data-ax-msg-removed', {label: item.label});
    this.focus();
    return true;
  }

  #clearAll() {
    const removable = this.isItemRemovable;
    const removed = this.#values.filter((i) => removable(i));
    if (this.isDisabled || removed.length === 0) return;
    // onChange names one item: Clear all names the last one it removes.
    this.#commit(this.#values.filter((i) => !removable(i)), {item: removed[removed.length - 1], type: 'remove'});
    const text = this.getAttribute('data-ax-msg-all-removed');
    if (text) announce(text, {from: this});
    this.focus();
  }

  #onTokenRemove(event: Event) {
    const node = (event.target as Element | null)?.closest<HTMLElement>('[data-ax-token-item]');
    if (!node || !this.#isInside(node)) return;
    const id = node.getAttribute('data-ax-token-item');
    const item = this.#values.find((v) => v.id === id);
    if (item) this.#remove(item);
  }

  // ── Focus, folding, the unfocusedLayer overlay ────────────────────────────

  #onFocusIn(event: FocusEvent) {
    const fromOutside = !this.#isInside(event.relatedTarget);
    if (!this.#isFocusedWithin) {
      this.#isFocusedWithin = true;
      this.#expandLayer();
      this.#syncChrome();
      this.#syncOverflow();
    }
    // Redirect to the input so nobody tabs through every token's remove button.
    if (fromOutside && event.target !== this.#input) this.#input?.focus();
  }

  #onFocusOut(event: FocusEvent) {
    if (this.#isInside(event.relatedTarget)) return;
    // Focus may move inside the field in the same task (a removed token hands focus back).
    queueMicrotask(() => {
      if (this.#isInside(this.ownerDocument.activeElement)) return;
      if (!this.#isFocusedWithin) return;
      this.#isFocusedWithin = false;
      this.#collapseLayer();
      this.#syncChrome();
      this.#syncOverflow();
    });
  }

  #expandLayer() {
    const overlay = this.#overlay;
    if (!overlay) return;
    if (!overlay.isOpen) overlay.show({reason: 'focus'} as never);
    // The tokens move into the expanded field, before its input.
    const wrapper = this.#wrapper!;
    for (const node of this.#tokenNodes()) if (node.parentElement !== wrapper) wrapper.insertBefore(node, this.#input);
  }

  #collapseLayer() {
    const overlay = this.#overlay;
    if (!overlay) return;
    const before = this.querySelector(':scope > [data-ax-overflow]');
    for (const node of this.#tokenNodes()) if (node.parentElement !== this) this.insertBefore(node, before);
    if (overlay.isOpen) overlay.hide('api' as never);
  }

  #onPlaceholderClick(event: MouseEvent) {
    if (this.isDisabled || event.defaultPrevented) return;
    this.#isFocusedWithin = true;
    this.#expandLayer();
    this.#syncChrome();
    this.#syncOverflow();
    this.#input?.focus();
  }

  #scheduleOverflow() {
    if (!this.#truncates) return;
    cancelAnimationFrame(this.#overflowFrame);
    this.#overflowFrame = requestAnimationFrame(() => {
      this.#overflowFrame = 0;
      this.#syncOverflow();
    });
  }

  /** The folded row (useOverflow over computeOverflow, observeParent): tokens that fit + "+N more". */
  #syncOverflow() {
    const box = this.#overlay ? this : this.#wrapper;
    if (!box) return;
    const truncated = this.#truncates && !this.#isFocusedWithin && this.#values.length > 0;
    box.toggleAttribute('data-ax-truncated', truncated);
    if (this.#overlay) this.#wrapper?.removeAttribute('data-ax-truncated');
    const indicator = box.querySelector<HTMLElement>(':scope > [data-ax-overflow]');
    for (const t of this.#tokenNodes()) t.removeAttribute('data-ax-overflow-hidden');
    const tokens = [...box.querySelectorAll<HTMLElement>(':scope > [data-ax-token-item]')];
    if (!truncated || !indicator) {
      if (indicator) indicator.hidden = true;
      return;
    }
    const count = indicator.querySelector('[data-overflow-count]') ?? indicator.querySelector('[data-ax-overflow-count]');
    const setCount = (n: number) => { if (count) count.textContent = String(n); };
    // Measure every token in flow and the indicator at its widest.
    indicator.hidden = false;
    setCount(tokens.length);
    const indicatorWidth = indicator.offsetWidth;
    indicator.hidden = true;
    const widths = tokens.map((t) => t.offsetWidth);
    const style = getComputedStyle(box);
    const icon = box.querySelector<HTMLElement>(':scope > [data-ax-start-icon]');
    const gap = parseFloat(style.columnGap) || 0;
    const available = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - (icon ? icon.offsetWidth + gap : 0);
    const {visibleCount} = computeOverflow({widths, gap, availableWidth: available, indicatorWidth, minVisibleItems: 0, collapseFrom: 'end'});
    tokens.forEach((t, i) => t.toggleAttribute('data-ax-overflow-hidden', i >= visibleCount));
    const hidden = tokens.length - visibleCount;
    setCount(hidden);
    indicator.hidden = hidden === 0;
  }

  // ── Query → search ────────────────────────────────────────────────────────

  #isBelowMin(query: string) {
    const n = graphemes(query);
    return n > 0 && n < this.#minQuery;
  }

  /** The derived "Create X" entry (Tokenizer createEntries → BaseTypeahead __queryEntries). */
  #queryEntries(query: string, results: TokenizerItem[]): TokenizerItem[] {
    const trimmed = query.trim();
    if (!this.#hasCreate || trimmed === '') return [];
    const lower = trimmed.toLowerCase();
    const exists = this.#values.some((v) => v.id === trimmed || v.label.toLowerCase() === lower)
      || results.some((item) => item.label.toLowerCase() === lower);
    if (exists) return [];
    const label = fillMessage(this.getAttribute('data-ax-msg-create'), {value: trimmed}) || trimmed;
    return [{id: `${CREATE_PREFIX}${trimmed}`, label, auxiliaryData: {__createdValue: trimmed}}];
  }

  #committedIds(): Set<string> { return new Set(this.#values.map((v) => v.id)); }
  #withoutCommitted(items: TokenizerItem[]): TokenizerItem[] {
    const ids = this.#committedIds();
    return items.filter((item) => !ids.has(item.id));
  }

  #queryChange(query: string) {
    this.#query = query;
    emit(this, 'astryx-change-query', {query});
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    if ((query.length === 0 && !this.#entriesOnFocus) || this.#isBelowMin(query)) {
      // Nothing to search; a query too short can still carry its derived entries.
      this.#gen++;
      this.#cancelSource();
      const derived = this.#queryEntries(query, []);
      this.#results = derived;
      this.#entryCount = derived.length;
      this.#render(derived, derived.length);
      this.#combo?.highlight(this.#combo.options()[0] ?? null, 'program');
      this.#hasSearched = false;
      this.#setLoading(false);
      announce('', {from: this});
      if (derived.length > 0) this.#show();
      else this.#hide();
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

  #staticSearch(query: string): TokenizerItem[] {
    const lower = query.toLowerCase().trim();
    if (lower === '') return this.#staticItems;
    return this.#staticItems.filter((item) => item.label.toLowerCase().includes(lower)
      || (this.#staticKeywords.get(item.id) ?? []).some((k) => k.includes(lower)));
  }

  /** Ask the current source (an array is a synchronous answer). At the limit nothing is offered. */
  #request(kind: 'search' | 'bootstrap', query: string, update: (items: TokenizerItem[]) => void): TokenizerItem[] | Promise<TokenizerItem[]> {
    if (this.isAtMax) return [];
    const source = this.#searchSource;
    if (source) {
      this.#shownFromStatic = false;
      return kind === 'search' ? source.search(query, {update}) : source.bootstrap();
    }
    const controller = new AbortController();
    this.#controller = controller;
    let resolve!: (items: TokenizerItem[]) => void;
    let reject!: (error?: unknown) => void;
    const answer = new Promise<TokenizerItem[]>((res, rej) => { resolve = res; reject = rej; });
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
    let shown: TokenizerItem[] | null = null;
    const showList = (list: TokenizerItem[], isFinal: boolean): TokenizerItem[] => {
      const fetched = this.#withoutCommitted(list).slice(0, this.#maxItems);
      // The derived entries wait for the query to settle (a pending result may still offer them).
      const entries = isFinal ? this.#queryEntries(query, fetched) : [];
      const rows = [...fetched, ...entries];
      const isFirst = shown == null;
      const keepId = this.#combo?.highlighted()?.getAttribute('data-id') ?? null;
      if (!isFirst) this.#holdHeight();
      this.#resultsGen = gen;
      this.#results = rows;
      this.#entryCount = entries.length;
      this.#render(rows, entries.length);
      const options = this.#combo?.options() ?? [];
      const kept = !isFirst && keepId != null ? options.find((r) => r.getAttribute('data-id') === keepId) : null;
      this.#combo?.highlight(kept ?? options[0] ?? null, 'program');
      if (fetched.length > 0) shown = fetched;
      return rows;
    };
    const update = (items: TokenizerItem[]) => {
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
      const list = showList(items, true);
      if (list.length > 0 || query.length > 0) this.#show();
      if (query.length > 0) this.#settleBusy();
      announceCount(list.length);
    } catch {
      if (this.#gen !== gen) return;
      isSettled = true;
      if (this.#closedGen === gen) {
        if (shown) showList(shown, true);
        else { this.#results = []; this.#entryCount = 0; this.#render([]); this.#hasSearched = false; }
      } else {
        if (query.length > 0) this.#settleBusy();
        if (shown) announceCount(showList(shown, true).length);
        else {
          const entries = this.#queryEntries(query, []);
          this.#results = entries;
          this.#entryCount = entries.length;
          this.#render(entries, entries.length);
        }
      }
    } finally {
      if (this.#gen === gen) this.#setLoading(false);
      this.#syncEmpty();
    }
  }

  async #performBootstrap() {
    const gen = ++this.#gen;
    let answer: TokenizerItem[] | Promise<TokenizerItem[]>;
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

  #applyBootstrap(items: TokenizerItem[], gen: number) {
    if (this.#gen !== gen) return;
    this.#resultsGen = gen;
    const shown = this.#withoutCommitted(items).slice(0, this.#maxItems);
    // A focus load that offers nothing closes the list rather than showing it empty.
    if (this.#results.length === 0 && shown.length === 0 && !this.#combo?.highlighted()) {
      this.#hide();
      return;
    }
    this.#results = shown;
    this.#entryCount = 0;
    this.#render(shown);
    this.#combo?.highlight(this.#combo.options()[0] ?? null, 'program');
    if (shown.length > 0) this.#show();
    else this.#hide();
  }

  /** Committed values leave the shown rows at once (FR13); the highlight stays on its item. */
  #dropCommittedRows() {
    const ids = this.#committedIds();
    const kept = this.#results.filter((item) => !ids.has(item.id));
    if (kept.length === this.#results.length) return;
    const keepId = this.#combo?.highlighted()?.getAttribute('data-id') ?? null;
    this.#entryCount = Math.min(this.#entryCount, kept.length);
    this.#results = kept;
    this.#render(kept, this.#entryCount);
    const options = this.#combo?.options() ?? [];
    this.#combo?.highlight(options.find((o) => o.getAttribute('data-id') === keepId) ?? options[0] ?? null, 'program');
  }

  /** reloadForCommittedChoices: an open list reloads (or closes at the limit) after a commit. */
  #reloadForCommitted() {
    const hadPending = this.#timer != null;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    if (this.isDisabled || !this.isConnected) return;
    if (this.isAtMax) {
      this.#hide();
      return;
    }
    if (!this.isOpen && !hadPending) return;
    if (this.#query.length > 0) {
      if (!this.#isBelowMin(this.#query)) void this.#performSearch(this.#query);
      return;
    }
    if (!this.#entriesOnFocus || (this.#results.length === 0 && !hadPending)) {
      this.#hide();
      return;
    }
    void this.#performBootstrap();
  }

  // ── Rendering the list ────────────────────────────────────────────────────

  /** Spec AST-092 FR6: once a later list arrives, the popup holds its height. */
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

  #render(items: TokenizerItem[], entryCount = 0) {
    const listbox = this.#listbox;
    if (!listbox) return;
    const empty = listbox.querySelector<HTMLElement>('[data-ax-empty]');
    for (const el of listbox.querySelectorAll('[data-ax-dynamic]')) el.remove();
    const sourceItems = items.slice(0, items.length - entryCount);
    const entries = items.slice(items.length - entryCount);
    const staticRows = new Map([...listbox.querySelectorAll<HTMLElement>('[data-ax-static]')].map((r) => [r.getAttribute('data-id') ?? '', r]));
    const useStatic = this.#shownFromStatic && sourceItems.every((item) => staticRows.has(item.id));
    const visible = new Set(sourceItems.map((i) => i.id));
    for (const [id, row] of staticRows) row.hidden = !(useStatic && visible.has(id));
    const used = new Set<string>([...staticRows.values()].map((r) => r.id));
    const doc = this.ownerDocument;
    const tpl = this.#layer?.querySelector<HTMLTemplateElement>(':scope > template[data-ax-option-template]');
    const buildRow = (item: TokenizerItem, isEntry: boolean) => {
      const row = (tpl?.content.firstElementChild?.cloneNode(true) as HTMLElement | undefined) ?? doc.createElement('div');
      row.id = this.#optionId(item.id, used);
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', 'false');
      row.setAttribute('data-id', item.id);
      row.setAttribute('data-ax-label', item.label);
      row.setAttribute('data-ax-item', JSON.stringify(item));
      row.setAttribute('data-ax-dynamic', '');
      row.removeAttribute('hidden');
      const size = this.getAttribute('data-size');
      if (size) row.setAttribute('data-size', size);
      const content = row.querySelector<HTMLElement>('.ax-typeahead-option-content');
      const custom = isEntry ? null : this.renderItem?.(item);
      if (content && custom != null) {
        if (typeof custom === 'string') content.innerHTML = custom;
        else content.replaceChildren(custom);
      } else {
        const label = row.querySelector('[data-ax-item-label]');
        if (label) label.textContent = item.label;
      }
      return row;
    };
    if (!useStatic) {
      for (const group of groupItems(sourceItems as never[], {ungroupedFirst: true}) as Array<{heading: string | null; items: TokenizerItem[]}>) {
        if (group.heading == null) {
          for (const item of group.items) listbox.insertBefore(buildRow(item, false), empty);
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
        wrap.append(heading, ...group.items.map((item) => buildRow(item, false)));
        listbox.insertBefore(wrap, empty);
      }
    }
    // Entries derived from the typed text display after every group.
    for (const item of entries) listbox.insertBefore(buildRow(item, true), empty);
    for (const group of listbox.querySelectorAll<HTMLElement>('[data-ax-group]')) {
      group.hidden = !group.querySelector('[data-ax-static]:not([hidden])');
    }
    this.#combo?.sync();
    this.#syncEmpty();
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

  // ── Busy state (the end lane's Spinner, useBusyAnnouncement) ──────────────

  #setLoading(next: boolean) {
    if (this.#isLoading === next) return;
    this.#isLoading = next;
    const input = this.#input;
    if (next) input?.setAttribute('aria-busy', 'true');
    else input?.removeAttribute('aria-busy');
    this.#syncLane();
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
    // The popup anchors to the expanded field; it must be showing first (unfocusedLayer).
    if (this.#overlay && !this.#overlay.isOpen) return;
    this.#layer.show({reason: 'api'});
  }

  #hide() {
    if (this.isOpen) this.#layer?.hide('api');
  }

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
    noteOutsideDismissal(this.ownerDocument);
    this.#hide();
  }

  #onBoxClick(event: MouseEvent) {
    const target = event.target as Element | null;
    if (!target) return;
    if (target.closest('[data-ax-input-clear]')) {
      event.stopPropagation();
      this.#clearAll();
      return;
    }
    if (this.isDisabled || target.closest('[popover]')) return;
    if (target !== this.#input) this.#input?.focus();
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────

  #onKeyDown(e: KeyboardEvent) {
    if (isImeKeyEvent(e) || e.defaultPrevented) return;
    const input = this.#input!;
    // Tokenizer: Backspace in an empty input removes the last token.
    if (e.key === 'Backspace' && input.value === '' && this.#values.length > 0) {
      e.preventDefault();
      this.#remove(this.#values[this.#values.length - 1]);
      return;
    }
    if (this.isDisabled) {
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

  // ── Selection (BaseTypeahead handleSelect with value = null) ──────────────

  #selectOption(option: HTMLElement) {
    if (option.getAttribute('aria-disabled') === 'true') return;
    const item = parseJSON<TokenizerItem>(option.getAttribute('data-ax-item'));
    if (!item || this.isDisabled) return;
    this.#gen++;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.#cancelSource();
    const hadQuery = this.#query !== '';
    this.#add(item);
    this.#query = '';
    if (this.#input) this.#input.value = '';
    if (hadQuery) emit(this, 'astryx-change-query', {query: ''});
    this.#results = [];
    this.#entryCount = 0;
    this.#hasSearched = false;
    this.#setLoading(false);
    this.#render([]);
    this.#hide();
    this.#input?.focus();
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-tokenizer')) {
  customElements.define('ax-tokenizer', TokenizerElement);
}

declare global {
  interface HTMLElementTagNameMap { 'ax-tokenizer': TokenizerElement }
}
