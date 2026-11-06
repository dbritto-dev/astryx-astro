/**
 * `<ax-power-search>` and `<ax-power-search-editor>` — the behaviour of PowerSearch and
 * PowerSearchFilterEditor (light DOM; see components/PowerSearch/*.astro).
 *
 * `<ax-power-search>` ports @astryxdesign/core PowerSearch/PowerSearch.tsx: it drives its
 * Tokenizer (`<ax-tokenizer>`) with the field source (usePowerSearchSource), field rows (icon +
 * description), filter tokens (label + bold value, editor trigger, read-only locks), and turns the
 * Tokenizer's add / remove into filter changes: a field opens the editor ("adding"), a ready
 * suggestion (content search, "field operator value") or an `empty` operator adds at once, a
 * token press edits (or re-commits an `empty` filter), ✕ / Backspace / Clear all remove. The
 * editor lives in an `<ax-layer popover="auto">` anchored to the root (light dismiss, Escape →
 * cancel), a non-modal `role="dialog"` named by the token's text while editing. Result-count
 * changes are announced politely.
 *
 * `<ax-power-search-editor>` ports PowerSearchEditPopover.tsx + PowerSearchValueEditor.tsx
 * (popover presentation): field → operator → value from server-rendered templates, the value's
 * element bound per type, Enter / Escape, `empty` operators saving on choice, Apply disabled until
 * complete, the value cell's first control focused when it mounts.
 *
 * Events: `astryx-change` `{filters, changeType, index}` on `<ax-power-search>` (cancelable);
 * `astryx-save` `{filter}` / `astryx-cancel` on `<ax-power-search-editor>`.
 */
import './runtime/layer';
import './tokenizer';
import './typeahead';
import './selector';
import './text-input';
import './number-input';
import './date-input';
import './time-input';
import './date-range-input';
import '../behaviors/token';
import {announce} from './runtime/announce';
import {isImeKeyEvent} from './runtime/dom';
import {globalSingleton} from './runtime/global';
import {emit, fillMessage, fillPlural, formatNumber} from './field';
import type {LayerElement} from './runtime/layer';
import type {TokenizerChangeDetail, TokenizerElement, TokenizerItem} from './tokenizer';
import {
  commitsWithoutEditor,
  createInternalConfig,
  createPowerSearchSource,
  filtersToItems,
  isoDateTimeToUnixSeconds,
  isoDateToUnixSeconds,
  resolveDateTimeRangePart,
  resolveDateZone,
  tokenText,
  unixSecondsToISODate,
  unixSecondsToISODateTime,
  type FilterValue,
  type FormatContext,
  type InternalConfig,
  type PartialFilter,
  type PowerSearchAuxData,
  type PowerSearchChangeType,
  type PowerSearchConfig,
  type PowerSearchFilter,
} from '../components/PowerSearch/powerSearchModel';

export interface PowerSearchChangeDetail {
  filters: PowerSearchFilter[];
  changeType: PowerSearchChangeType;
  index: number;
}

const Base: typeof HTMLElement = typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement;
const FOCUSABLE = 'input:not([disabled]), button:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const VALUE_ELEMENTS = 'ax-text-input, ax-typeahead, ax-tokenizer, ax-number-input, ax-time-input, ax-date-input, ax-date-range-input, ax-selector';

type ValueHost = HTMLElement & {value: unknown};

function parseJSON<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

function cloneTemplate(tpl: HTMLTemplateElement | null): DocumentFragment | null {
  return tpl ? tpl.ownerDocument.importNode(tpl.content, true) : null;
}

// ── <ax-power-search-editor> ─────────────────────────────────────────────────

export class PowerSearchEditorElement extends Base {
  #config: InternalConfig | null = null;
  #editors: Record<string, number> = {};
  #partial: PartialFilter | null = null;
  #mode: 'create' | 'edit' = 'create';
  #pendingDateTime: {date?: string; time?: string} = {};
  #focusFrame = 0;
  /** The value cell's first control takes focus when it mounts (not for the load on page load). */
  #focuses = true;
  #cleanup: Array<() => void> = [];

  get partialFilter(): PartialFilter | null { return this.#partial; }
  get mode(): 'create' | 'edit' { return this.#mode; }
  get #isReadOnly() { return this.hasAttribute('data-ax-read-only'); }
  get #timezone() { return this.getAttribute('data-ax-timezone') ?? undefined; }
  #part<T extends HTMLElement>(selector: string): T | null { return this.querySelector<T>(`:scope ${selector}`); }
  get #row() { return this.#part<HTMLElement>('[data-ax-row]'); }
  get #fieldCell() { return this.#part<HTMLElement>('[data-ax-field-cell]'); }
  get #operatorCell() { return this.#part<HTMLElement>('[data-ax-operator-cell]'); }
  get #valueCell() { return this.#part<HTMLElement>('[data-ax-value-cell]'); }

  /** Load a filter to edit (or a field to create one for). */
  load(partial: PartialFilter | null, mode: 'create' | 'edit' = 'create'): void {
    this.#load(partial, mode, true);
  }

  #load(partial: PartialFilter | null, mode: 'create' | 'edit', focuses: boolean): void {
    this.#focuses = focuses;
    this.#partial = partial ? {...partial} : null;
    this.#mode = mode;
    this.#pendingDateTime = {};
    const field = this.#fieldCell?.querySelector<ValueHost>('ax-selector');
    if (field) field.value = partial?.field ?? null;
    this.#renderOperator();
    this.#renderValue();
    this.#syncFooter();
  }

  connectedCallback(): void {
    const config = parseJSON<PowerSearchConfig>(this.getAttribute('data-ax-config'));
    if (!config) return;
    this.#config = createInternalConfig(config);
    this.#editors = parseJSON<Record<string, number>>(this.getAttribute('data-ax-editors')) ?? {};
    const on = (type: string, fn: (e: Event) => void) => {
      this.addEventListener(type, fn);
      this.#cleanup.push(() => this.removeEventListener(type, fn));
    };
    on('astryx-change', (e) => this.#onChange(e as CustomEvent));
    on('astryx-enter', (e) => {
      if ((e.target as Element).closest('ax-number-input') && this.#isComplete()) this.#saveCurrent();
      e.stopPropagation();
    });
    on('keydown', (e) => this.#onKeyDown(e as KeyboardEvent));
    on('click', (e) => {
      const button = (e.target as Element | null)?.closest('button');
      if (!button || !this.contains(button) || button.disabled) return;
      if (button.hasAttribute('data-ax-delete')) this.#save(null);
      else if (button.hasAttribute('data-ax-cancel')) emit(this, 'astryx-cancel', {});
      else if (button.hasAttribute('data-ax-apply')) this.#saveCurrent();
    });
    const initial = parseJSON<PartialFilter>(this.getAttribute('data-ax-filter'));
    if (initial) this.#load(initial, this.getAttribute('data-ax-mode') === 'edit' ? 'edit' : 'create', false);
    else this.#syncFooter();
  }

  disconnectedCallback(): void {
    for (const fn of this.#cleanup) fn();
    this.#cleanup = [];
    cancelAnimationFrame(this.#focusFrame);
  }

  #operator() {
    const p = this.#partial;
    return p?.operator ? this.#config?.getOperator(p.field, p.operator) : undefined;
  }

  #isComplete(): boolean {
    return !!this.#partial?.field && !!this.#partial.operator && this.#partial.value != null;
  }

  #renderOperator() {
    const cell = this.#operatorCell;
    const config = this.#config;
    if (!cell || !config) return;
    cell.replaceChildren();
    const p = this.#partial;
    const ops = p ? config.getVisibleOperators(p.field) : [];
    const isEmpty = this.#operator()?.value.type === 'empty';
    const show = !!p && ops.length > 0 && (ops.length > 1 || !isEmpty);
    cell.hidden = !show;
    if (!show || !p) return;
    const frag = cloneTemplate(this.querySelector<HTMLTemplateElement>(`:scope > template[data-ax-operators-for="${CSS.escape(p.field)}"]`));
    if (!frag) return;
    cell.append(frag);
    const selector = cell.querySelector<ValueHost>('ax-selector');
    if (selector) selector.value = p.operator ?? null;
  }

  /** ValueEditorCell, keyed on field + operator: a switch mounts a fresh editor. */
  #renderValue() {
    const cell = this.#valueCell;
    const config = this.#config;
    if (!cell || !config) return;
    cell.replaceChildren();
    cancelAnimationFrame(this.#focusFrame);
    const p = this.#partial;
    const op = this.#operator();
    const index = p && op ? this.#editors[`${p.field}\u0000${op.key}`] : undefined;
    const isDateTime = op?.value.type === 'date_absolute' && op.value.isDateOnly === false;
    cell.toggleAttribute('data-ax-full', isDateTime);
    this.#row?.toggleAttribute('data-ax-wrapped', isDateTime);
    if (index == null || !p || !op) {
      cell.hidden = true;
      return;
    }
    const frag = cloneTemplate(this.querySelector<HTMLTemplateElement>(`:scope > template[data-ax-editor="${index}"]`));
    if (!frag) {
      cell.hidden = true;
      return;
    }
    cell.hidden = false;
    cell.append(frag);
    this.#writeValue(p.value);
    if (!this.#focuses) {
      this.#focuses = true;
      return;
    }
    this.#focusFrame = requestAnimationFrame(() => {
      this.#focusFrame = 0;
      // The first control that renders (a hidden part, such as an empty Typeahead's value token, is skipped).
      const first = [...cell.querySelectorAll<HTMLElement>(FOCUSABLE)].find((el) => !el.closest('[hidden]') && el.getClientRects().length > 0);
      first?.focus();
    });
  }

  /** Put a stored value into the mounted editor's element(s). */
  #writeValue(value: FilterValue | undefined) {
    const cell = this.#valueCell;
    const op = this.#operator();
    if (!cell || !op) return;
    const el = cell.querySelector<ValueHost>(VALUE_ELEMENTS);
    if (!el) return;
    const v = op.value;
    const tz = this.#timezone;
    switch (v.type) {
      case 'string': {
        const text = value?.type === 'string' ? value.value : '';
        el.value = el.matches('ax-typeahead') ? (text ? {id: text, label: text} : null) : text;
        return;
      }
      case 'string_list':
        el.value = value?.type === 'string_list' ? value.value.map((s) => ({id: s, label: s})) : [];
        return;
      case 'enum_list':
        el.value = value?.type === 'enum_list' ? value.value.map((id) => ({id, label: v.values.find((e) => e.value === id)?.label ?? id})) : [];
        return;
      case 'entity_list':
        el.value = value?.type === 'entity_list' ? value.value.map((e) => ({id: e.id, label: e.label, auxiliaryData: e.photo ? {photo: e.photo} : undefined})) : [];
        return;
      case 'integer':
      case 'float':
        el.value = value?.type === v.type ? value.value : null;
        return;
      case 'time':
        el.value = value?.type === 'time' ? value.value : null;
        return;
      case 'date_absolute': {
        const seconds = value?.type === 'date_absolute' ? value.unixSeconds : undefined;
        if (v.isDateOnly === false) {
          const [date, time] = seconds == null ? [undefined, undefined] : unixSecondsToISODateTime(seconds, resolveDateZone(tz, false)).split('T');
          const dateEl = cell.querySelector<ValueHost>('ax-date-input');
          const timeEl = cell.querySelector<ValueHost>('ax-time-input');
          if (dateEl) dateEl.value = date ?? null;
          if (timeEl) timeEl.value = time ?? null;
          return;
        }
        el.value = seconds == null ? null : unixSecondsToISODate(seconds, resolveDateZone(tz, true));
        return;
      }
      case 'date_relative':
      case 'enum':
        el.value = value?.type === v.type ? value.value : null;
        return;
      case 'date_range': {
        if (value?.type !== 'date_range') {
          el.value = null;
          return;
        }
        const zone = resolveDateZone(tz, true);
        const now = Date.now() / 1000;
        el.value = {
          start: unixSecondsToISODate(resolveDateTimeRangePart(value.value.start, now), zone),
          end: unixSecondsToISODate(resolveDateTimeRangePart(value.value.end, now), zone),
        };
        return;
      }
      default:
    }
  }

  #onChange(event: CustomEvent) {
    const target = event.target as Element;
    // Internal control events stop at the editor.
    event.stopPropagation();
    if (target === this) return;
    if (this.#fieldCell?.contains(target) && target.matches('ax-selector')) {
      this.#handleFieldChange(String(event.detail.value ?? ''));
    } else if (this.#operatorCell?.contains(target) && target.matches('ax-selector')) {
      this.#handleOperatorChange(String(event.detail.value ?? ''));
    } else if (this.#valueCell?.contains(target) && target.matches(VALUE_ELEMENTS)) {
      this.#handleValueEvent(target, event.detail);
    }
  }

  #handleFieldChange(fieldKey: string) {
    const config = this.#config;
    if (!config || !fieldKey) return;
    const prev = this.#partial;
    const defaultOp = config.getDefaultOperator(fieldKey);
    this.#partial = {field: fieldKey, operator: defaultOp?.key, value: undefined};
    this.#pendingDateTime = {};
    this.#renderOperator();
    this.#renderValue();
    this.#syncFooter();
    // Re-choosing the current field with its current operator changes nothing.
    if (fieldKey !== prev?.field || defaultOp?.key !== prev?.operator) this.#saveIfEmpty(fieldKey, defaultOp?.key);
  }

  #handleOperatorChange(operatorKey: string) {
    const config = this.#config;
    const prev = this.#partial;
    if (!config || !prev || !operatorKey) return;
    const next = config.getOperator(prev.field, operatorKey);
    const old = this.#operator();
    const keep = next && old && next.value.type === old.value.type;
    this.#partial = {...prev, operator: operatorKey, value: keep ? prev.value : undefined};
    this.#pendingDateTime = {};
    if (operatorKey !== prev.operator) {
      this.#renderValue();
      this.#saveIfEmpty(prev.field, operatorKey);
    }
    this.#syncFooter();
  }

  /** An `empty` operator takes no value: choosing it saves the filter (after the Selector settles). */
  #saveIfEmpty(fieldKey: string, operatorKey: string | undefined) {
    const op = operatorKey ? this.#config?.getOperator(fieldKey, operatorKey) : undefined;
    if (op?.value.type !== 'empty') return;
    queueMicrotask(() => this.#save({field: fieldKey, operator: op.key, value: {type: 'empty'}}));
  }

  #handleValueEvent(target: Element, detail: Record<string, unknown>) {
    const op = this.#operator();
    if (!op) return;
    const v = op.value;
    const tz = this.#timezone;
    switch (v.type) {
      case 'string':
        if (target.matches('ax-typeahead')) {
          const item = detail.value as TokenizerItem | null;
          if (item) this.#change({type: 'string', value: item.label}, true);
          else this.#change({type: 'string', value: ''});
        } else {
          this.#change({type: 'string', value: String(detail.value ?? '')});
        }
        return;
      case 'string_list':
        this.#change({type: 'string_list', value: (detail.values as TokenizerItem[]).map((i) => i.label)});
        return;
      case 'enum_list':
        this.#change({type: 'enum_list', value: (detail.values as TokenizerItem[]).map((i) => i.id)});
        return;
      case 'entity_list':
        this.#change({
          type: 'entity_list',
          value: (detail.values as TokenizerItem[]).map((i) => {
            const photo = (i.auxiliaryData as {photo?: string} | undefined)?.photo;
            return photo ? {id: i.id, label: i.label, photo} : {id: i.id, label: i.label};
          }),
        });
        return;
      case 'integer':
      case 'float':
        if (typeof detail.value === 'number') this.#change({type: v.type, value: detail.value});
        return;
      case 'time':
        if (detail.value) this.#change({type: 'time', value: String(detail.value)});
        return;
      case 'date_absolute': {
        if (v.isDateOnly === false) {
          // A part picked first waits for the other; the instant is written once both exist.
          const pending = this.#pendingDateTime;
          const current = this.#partial?.value?.type === 'date_absolute'
            ? unixSecondsToISODateTime(this.#partial.value.unixSeconds, resolveDateZone(tz, false)).split('T')
            : [undefined, undefined];
          if (target.matches('ax-date-input')) pending.date = detail.value as string | undefined;
          else pending.time = detail.value as string | undefined;
          const date = pending.date ?? current[0];
          const time = pending.time ?? current[1];
          if (date && time) this.#change({type: 'date_absolute', unixSeconds: isoDateTimeToUnixSeconds(`${date}T${time}`, resolveDateZone(tz, false))});
          return;
        }
        if (detail.value) this.#change({type: 'date_absolute', unixSeconds: isoDateToUnixSeconds(String(detail.value), resolveDateZone(tz, true))});
        return;
      }
      case 'date_relative':
        if (detail.value != null) this.#change({type: 'date_relative', value: String(detail.value)}, true);
        return;
      case 'date_range': {
        const range = detail.value as {start: string; end: string} | null;
        if (!range) return;
        const zone = resolveDateZone(tz, true);
        this.#change({
          type: 'date_range',
          value: {
            start: {type: 'ABSOLUTE', unixSeconds: isoDateToUnixSeconds(range.start, zone)},
            end: {type: 'ABSOLUTE', unixSeconds: isoDateToUnixSeconds(range.end, zone)},
          },
        });
        return;
      }
      case 'enum':
        if (detail.value != null) this.#change({type: 'enum', value: String(detail.value)}, true);
        return;
      default:
    }
  }

  #change(value: FilterValue, shouldSave = false) {
    const p = this.#partial;
    if (!p) return;
    this.#partial = {...p, value};
    this.#syncFooter();
    if (shouldSave && p.field && p.operator) this.#save({field: p.field, operator: p.operator, value});
  }

  #syncFooter() {
    const isEmpty = this.#operator()?.value.type === 'empty';
    const footer = this.#part<HTMLElement>('[data-ax-footer]');
    if (footer) footer.hidden = isEmpty;
    const del = this.#part<HTMLElement>('[data-ax-delete-slot]');
    if (del) del.hidden = this.#isReadOnly || this.#mode !== 'edit';
    const apply = this.#part<HTMLButtonElement>('[data-ax-apply]');
    if (apply) {
      const disabled = !this.#partial?.operator || this.#partial.value == null;
      apply.disabled = disabled;
      apply.toggleAttribute('data-ax-disabled', disabled);
    }
  }

  #saveCurrent() {
    const p = this.#partial;
    if (p?.field && p.operator && p.value != null) this.#save({field: p.field, operator: p.operator, value: p.value});
  }

  #save(filter: PowerSearchFilter | null) {
    emit(this, 'astryx-save', {filter});
  }

  #onKeyDown(e: KeyboardEvent) {
    if (isImeKeyEvent(e)) return;
    const target = e.target as Element;
    if (e.key === 'Enter') {
      // A focused button owns its Enter; the number and date-range editors handle theirs.
      if (target instanceof HTMLButtonElement || target.closest('ax-number-input, ax-date-range-input')) return;
      if (this.#isComplete() && !e.defaultPrevented) {
        e.preventDefault();
        this.#saveCurrent();
      }
    } else if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault();
      emit(this, 'astryx-cancel', {});
    }
  }
}

// ── <ax-power-search> ────────────────────────────────────────────────────────

type EditorState =
  | {type: 'idle'}
  | {type: 'adding'; partial: PartialFilter}
  | {type: 'editing'; index: number; partial: PartialFilter};

/** Token-name id counter, page-wide (shared by every copy of this module). */
const tokenNames = globalSingleton('power-search-token-names', () => ({count: 0}));

export class PowerSearchElement extends Base {
  #config: InternalConfig | null = null;
  #filters: PowerSearchFilter[] = [];
  #tokenizer: TokenizerElement | null = null;
  #layer: LayerElement | null = null;
  #editor: PowerSearchEditorElement | null = null;
  #state: EditorState = {type: 'idle'};
  #ctx: FormatContext | null = null;
  #resultCount: number | string | null = null;
  #cleanup: Array<() => void> = [];

  get filters(): PowerSearchFilter[] { return this.#filters.map((f) => ({...f})); }
  set filters(next: ReadonlyArray<PowerSearchFilter> | null) { this.#setFilters([...(next ?? [])]); }

  /** Results matching the filters: a number reads "N results"; a change is announced. */
  get resultCount(): number | string | null { return this.#resultCount; }
  set resultCount(next: number | string | null) {
    const text = this.#resultCountText(next);
    const before = this.#resultCountText(this.#resultCount);
    this.#resultCount = next;
    const span = this.querySelector<HTMLElement>('[data-ax-result-count-text]');
    if (span) {
      span.textContent = text ?? '';
      span.hidden = text == null;
    }
    if (text != null && text !== before) announce(text, {from: this});
  }

  get #maxTokenLength() { return Number(this.getAttribute('data-ax-max-token-length') ?? 40) || 40; }
  get #isReadOnly() { return this.hasAttribute('data-ax-read-only'); }
  get #isDisabled() { return this.hasAttribute('data-ax-disabled'); }
  get #locale() { return this.getAttribute('data-ax-locale') ?? 'en'; }

  focus(options?: FocusOptions): void { this.#tokenizer?.focus(options); }
  blur(): void { this.#tokenizer?.blur(); }

  #resultCountText(value: number | string | null): string | null {
    if (value == null) return null;
    if (typeof value === 'number') return fillPlural(this.getAttribute('data-ax-msg-result-count'), this.#locale, value, {count: formatNumber(value, this.#locale)});
    return value;
  }

  connectedCallback(): void {
    const config = parseJSON<PowerSearchConfig>(this.getAttribute('data-ax-config'));
    const tokenizer = this.querySelector<TokenizerElement>('ax-tokenizer[data-ax-power-search-field]');
    const layerId = this.getAttribute('data-ax-layer');
    const layer = layerId ? this.ownerDocument.getElementById(layerId) as LayerElement | null : null;
    const editor = layer?.querySelector<PowerSearchEditorElement>('ax-power-search-editor') ?? null;
    if (!config || !tokenizer || !layer || !editor) return;
    this.#config = createInternalConfig(config);
    this.#filters = parseJSON<PowerSearchFilter[]>(this.getAttribute('data-ax-filters')) ?? [];
    this.#tokenizer = tokenizer;
    this.#layer = layer;
    this.#editor = editor;
    const raw = this.getAttribute('data-ax-result-count');
    this.#resultCount = raw == null ? null : (raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw);
    const locale = this.#locale;
    const plural = (attr: string) => (count: number) => fillPlural(this.getAttribute(attr), locale, count, {count: formatNumber(count, locale)});
    this.#ctx = {
      locale,
      calendar: (this.getAttribute('data-ax-calendar') ?? undefined) as FormatContext['calendar'],
      timezoneID: this.getAttribute('data-ax-timezone') ?? undefined,
      messages: {
        itemsCount: plural('data-ax-msg-items'),
        entitiesCount: plural('data-ax-msg-entities'),
        filtersCount: plural('data-ax-msg-filters'),
        dateRange: this.getAttribute('data-ax-msg-date-range') ?? '',
      },
    };

    const source = createPowerSearchSource(this.#config, Number(this.getAttribute('data-ax-max-search-results') ?? 10) || 10);
    tokenizer.searchSource = {search: (query) => source.search(query), bootstrap: () => source.bootstrap()};
    tokenizer.renderItem = (item) => this.#buildRow(item);
    tokenizer.renderToken = (item) => this.#buildToken(item);
    tokenizer.isItemRemovable = (item) => {
      if (this.#isReadOnly) return false;
      const index = (item.auxiliaryData as PowerSearchAuxData | undefined)?.filterIndex;
      return index == null || !this.#filters[index]?.isReadOnly;
    };

    const on = (target: EventTarget, type: string, fn: (e: Event) => void, options?: AddEventListenerOptions) => {
      target.addEventListener(type, fn, options);
      this.#cleanup.push(() => target.removeEventListener(type, fn, options));
    };
    on(tokenizer, 'astryx-change', (e) => {
      if (e.target !== tokenizer) return;
      // PowerSearch owns the tokens: the Tokenizer's change becomes a filter change.
      e.preventDefault();
      e.stopPropagation();
      this.#onTokenizerChange((e as CustomEvent<TokenizerChangeDetail>).detail);
    });
    // A press on a filter token edits it (before the field's own click focuses the input).
    on(tokenizer, 'click', (e) => this.#onTokenPress(e as MouseEvent), {capture: true});
    on(tokenizer, 'mousedown', (e) => {
      const token = this.#interactiveTokenOf(e.target);
      if (token && !(e.target as Element).closest('[data-ax-token-remove]')) e.preventDefault();
    });
    on(editor, 'astryx-save', (e) => this.#onSave((e as CustomEvent<{filter: PowerSearchFilter | null}>).detail.filter));
    on(editor, 'astryx-cancel', () => this.#setState({type: 'idle'}));
    on(layer, 'astryx-open-change', (e) => {
      if (e.target !== layer || (e as CustomEvent<{isOpen: boolean}>).detail.isOpen) return;
      // handleLayerHide: a light dismiss ends the editing; focus stays where the press put it.
      this.#state = {type: 'idle'};
      this.#syncExpanded();
    });
    this.#syncClearAllMessage();
  }

  disconnectedCallback(): void {
    for (const fn of this.#cleanup) fn();
    this.#cleanup = [];
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  #buildRow(item: TokenizerItem): Node | null {
    const aux = item.auxiliaryData as PowerSearchAuxData | undefined;
    if (!aux) return null;
    const frag = cloneTemplate(this.querySelector<HTMLTemplateElement>(`:scope > template[data-ax-row-for="${CSS.escape(aux.fieldKey)}"]`));
    const node = frag?.firstElementChild as HTMLElement | null;
    const label = node?.querySelector('[data-ax-item-label]');
    if (label) label.textContent = item.label;
    return node ?? null;
  }

  #buildToken(item: TokenizerItem): Node {
    const doc = this.ownerDocument;
    const config = this.#config!;
    const aux = item.auxiliaryData as PowerSearchAuxData;
    const filter = this.#filters[aux.filterIndex ?? -1];
    const operator = filter ? config.getOperator(filter.field, filter.operator) : undefined;
    const text = filter ? tokenText(config, filter, this.#maxTokenLength, this.#ctx!) : {label: item.label, value: null, full: item.label};
    const canInteract = !this.#isReadOnly && !this.#isDisabled && !filter?.isReadOnly;
    const frag = cloneTemplate(this.querySelector<HTMLTemplateElement>(`:scope > template[data-ax-filter-token="${canInteract ? 'interactive' : 'static'}"]`))
      ?? doc.createDocumentFragment();
    const name = frag.querySelector<HTMLElement>('[data-ax-token-name]');
    const nameId = `${this.id || 'ax-power-search'}-token-name-${++tokenNames.count}`;
    if (name) {
      name.id = nameId;
      name.textContent = text.full;
    }
    const token = frag.querySelector<HTMLElement>('.astryx-token');
    token?.querySelector('.ax-token-label')?.replaceChildren(text.label);
    const value = token?.querySelector<HTMLElement>('[data-ax-token-value]');
    if (value) {
      if (text.value == null) value.remove();
      else value.textContent = text.value;
    }
    const action = token?.querySelector<HTMLElement>('.ax-token-action');
    if (action && canInteract) {
      action.setAttribute('aria-labelledby', nameId);
      if (commitsWithoutEditor(operator)) {
        action.removeAttribute('aria-haspopup');
        action.removeAttribute('aria-expanded');
      } else {
        action.setAttribute('aria-haspopup', 'dialog');
        action.setAttribute('aria-expanded', 'false');
      }
    }
    const remove = token?.querySelector<HTMLElement>('[data-ax-token-remove]');
    if (remove) remove.setAttribute('aria-label', fillMessage(this.getAttribute('data-ax-msg-remove'), {label: text.full}));
    return frag;
  }

  #setFilters(next: PowerSearchFilter[]) {
    this.#filters = next;
    if (this.#tokenizer && this.#config && this.#ctx) {
      this.#tokenizer.value = filtersToItems(this.#config, next, this.#maxTokenLength, this.#ctx);
    }
    this.#syncClearAllMessage();
    this.#syncExpanded();
  }

  /** PowerSearch words its Clear all as its record does (Tokenizer AR7). */
  #syncClearAllMessage() {
    const attr = this.#filters.some((f) => f.isReadOnly) ? 'data-ax-msg-editable-removed' : 'data-ax-msg-all-removed';
    const message = this.getAttribute(attr);
    if (message) this.#tokenizer?.setAttribute('data-ax-msg-all-removed', message);
  }

  #syncExpanded() {
    const editing = this.#state.type === 'editing' ? this.#state.index : -1;
    for (const node of this.#tokenizer?.querySelectorAll<HTMLElement>('[data-ax-token-item]') ?? []) {
      const index = Number(/^filter-(\d+)-/.exec(node.getAttribute('data-ax-token-item') ?? '')?.[1] ?? -1);
      const action = node.querySelector<HTMLElement>('.ax-token-action[aria-expanded]');
      action?.setAttribute('aria-expanded', String(index === editing));
    }
  }

  // ── Changes ───────────────────────────────────────────────────────────────

  #commit(next: PowerSearchFilter[], changeType: PowerSearchChangeType, index: number) {
    if (emit<PowerSearchChangeDetail>(this, 'astryx-change', {filters: next.map((f) => ({...f})), changeType, index})) this.#setFilters(next);
    else this.#setFilters(this.#filters);
  }

  #onTokenizerChange({values, change}: TokenizerChangeDetail) {
    const config = this.#config!;
    if (change.type === 'add') {
      const aux = change.item.auxiliaryData as PowerSearchAuxData | undefined;
      if (!aux || !config.getField(aux.fieldKey)) return;
      const operator = aux.operatorKey ? config.getOperator(aux.fieldKey, aux.operatorKey) : config.getDefaultOperator(aux.fieldKey);
      // A ready value (content search, "field operator value") adds at once.
      if (aux.filterValue && operator) {
        this.#commit([...this.#filters, {field: aux.fieldKey, operator: operator.key, value: aux.filterValue}], 'add', this.#filters.length);
        return;
      }
      if (operator?.value.type === 'empty') {
        this.#commit([...this.#filters, {field: aux.fieldKey, operator: operator.key, value: {type: 'empty'}}], 'add', this.#filters.length);
        return;
      }
      this.#setState({type: 'adding', partial: {field: aux.fieldKey, operator: operator?.key, value: undefined}});
    } else if (change.type === 'remove') {
      const kept = new Set(values.map((item) => (item.auxiliaryData as PowerSearchAuxData | undefined)?.filterIndex));
      const first = this.#filters.findIndex((_, i) => !kept.has(i));
      if (first >= 0) this.#commit(this.#filters.filter((_, i) => kept.has(i)), 'remove', first);
    }
  }

  #interactiveTokenOf(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    const node = target.closest<HTMLElement>('[data-ax-token-item]');
    if (!node || !this.#tokenizer?.contains(node) || !node.querySelector('.ax-token-action')) return null;
    return node;
  }

  #onTokenPress(event: MouseEvent) {
    const node = this.#interactiveTokenOf(event.target);
    if (!node || (event.target as Element).closest('[data-ax-token-remove]')) return;
    event.stopPropagation();
    const index = Number(/^filter-(\d+)-/.exec(node.getAttribute('data-ax-token-item') ?? '')?.[1] ?? -1);
    this.#editToken(index);
  }

  #editToken(index: number) {
    const filter = this.#filters[index];
    if (!filter || this.#isReadOnly || this.#isDisabled || filter.isReadOnly) return;
    const operator = this.#config!.getOperator(filter.field, filter.operator);
    // An `empty` filter has no value to edit: commit it as its editor's save would.
    if (commitsWithoutEditor(operator)) {
      const next = [...this.#filters];
      next[index] = {field: filter.field, operator: filter.operator, value: {type: 'empty'}};
      this.#commit(next, 'edit', index);
      this.#setState({type: 'idle'});
      return;
    }
    this.#setState({type: 'editing', index, partial: {field: filter.field, operator: filter.operator, value: filter.value}});
  }

  #onSave(filter: PowerSearchFilter | null) {
    const state = this.#state;
    if (state.type === 'adding' && filter) {
      this.#commit([...this.#filters, filter], 'add', this.#filters.length);
    } else if (state.type === 'editing') {
      if (filter) {
        const next = [...this.#filters];
        next[state.index] = filter;
        this.#commit(next, 'edit', state.index);
      } else {
        this.#commit(this.#filters.filter((_, i) => i !== state.index), 'remove', state.index);
      }
    }
    this.#setState({type: 'idle'});
  }

  #setState(state: EditorState) {
    const layer = this.#layer!;
    const editor = this.#editor!;
    this.#state = state;
    if (state.type === 'idle') {
      if (layer.isOpen) layer.hide('api');
      this.#syncExpanded();
      this.#tokenizer?.focus();
      return;
    }
    // Editing a token: a non-modal dialog named by its text; adding: the popup stands alone.
    const surface = layer.querySelector<HTMLElement>('[data-ax-surface]');
    const filter = state.type === 'editing' ? this.#filters[state.index] : undefined;
    if (surface) {
      if (filter) {
        surface.setAttribute('role', 'dialog');
        surface.setAttribute('aria-label', tokenText(this.#config!, filter, this.#maxTokenLength, this.#ctx!).full);
      } else {
        surface.removeAttribute('role');
        surface.removeAttribute('aria-label');
      }
    }
    this.#syncExpanded();
    requestAnimationFrame(() => {
      if (this.#state !== state) return;
      if (!layer.isOpen) layer.show({anchor: this, reason: 'api'});
      this.#tokenizer?.blur();
      editor.load(state.partial, state.type === 'editing' ? 'edit' : 'create');
    });
  }
}

if (typeof customElements !== 'undefined') {
  if (!customElements.get('ax-power-search-editor')) customElements.define('ax-power-search-editor', PowerSearchEditorElement);
  if (!customElements.get('ax-power-search')) customElements.define('ax-power-search', PowerSearchElement);
}

declare global {
  interface HTMLElementTagNameMap {
    'ax-power-search': PowerSearchElement;
    'ax-power-search-editor': PowerSearchEditorElement;
  }
}
