/**
 * `<ax-command-palette>` — the behaviour of CommandPalette (light DOM, `display: contents`
 * around the Dialog it renders; see components/CommandPalette/CommandPalette.astro).
 *
 * Ports @astryxdesign/core CommandPalette/CommandPalette.tsx (bootstrap on open, one search per
 * keystroke with stale answers dropped by version, optimistic narrowing of the previous results
 * while a search is pending, grouping, the empty / pending states, result-count and rendered
 * empty-message announcements, picker `value`, select-and-close, reset on close),
 * CommandPaletteInput.tsx (combobox attributes, the delayed busy Spinner, the busy start
 * announced once from inside the dialog and dropped when the outcome is about to be spoken,
 * keyboard-only focus ring), CommandPaletteItem.tsx / CommandPaletteList.tsx (option identity,
 * listbox semantics only while results exist), Selector/hooks.ts useCombobox (↓/↑ clamped,
 * PageUp/PageDown, Tab drops the highlight; hover highlights without scrolling) through
 * runtime/combobox.ts, and hooks/useHotkeys.ts (./hotkeys.ts, the `hotkey` option).
 *
 * The dialog itself (open/close, Escape through the layer stack, backdrop press, focus return,
 * modal outlet, scroll lock) is `<ax-dialog>` (./dialog.ts); this element listens to its
 * `astryx-open-change`.
 *
 * Also defines two attribute behaviours: `data-ax-command-palette-input` (the keyboard-only
 * focus ring, also for a standalone CommandPaletteInput) and `data-ax-command-palette-item`
 * (a standalone item's click → `astryx-select` {value}).
 */
import './dialog';
import {announce, createRenderedTextAnnouncer, type Withdraw} from './runtime/announce';
import {createCombobox, type Combobox} from './runtime/combobox';
import {isImeKeyEvent} from './runtime/dom';
import {getModality} from './runtime/modality';
import {defineBehavior} from './behavior';
import {emit, fillPlural, formatNumber} from './field';
import {registerHotkey} from './hotkeys';
import {groupItems} from '../lib/groupItems';
import type {ModalHostElement} from './dialog';
import type {TypeaheadItemData, TypeaheadQueryDetail, TypeaheadSearchSource} from './typeahead';

export type CommandPaletteItemData = TypeaheadItemData;
export interface CommandPaletteSelectDetail {
  value: string;
  item: CommandPaletteItemData;
}

const Base: typeof HTMLElement = typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement;
const OPTION = '[role="option"]';

function parseJSON<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export class CommandPaletteElement extends Base {
  #host: ModalHostElement | null = null;
  #inline: HTMLElement | null = null;
  #input: HTMLInputElement | null = null;
  #list: HTMLElement | null = null;
  #combo: Combobox | null = null;
  #cleanup: Array<() => void> = [];
  #staticItems: CommandPaletteItemData[] = [];
  /** What the input shows (Astryx optimisticSearch). */
  #query = '';
  /** The query the shown results belong to (Astryx search). */
  #search = '';
  /** Committed results (Astryx searchResults). */
  #results: CommandPaletteItemData[] = [];
  /** Rendered results (Astryx optimisticResults). */
  #shown: CommandPaletteItemData[] = [];
  #shownFromStatic = true;
  #isPending = false;
  #version = 0;
  #controller: AbortController | null = null;
  #value: string | null = null;
  #keepsValue = false;
  #isActive = false;
  #searchSource: TypeaheadSearchSource | null = null;
  #emptyAnnouncer: ReturnType<typeof createRenderedTextAnnouncer> | null = null;
  #busyFrame = 0;
  #busyAnnounced = false;
  #busyWithdraw: Withdraw | null = null;
  /** Client rows: a Node or an HTML string for an item (server rows use `renderItem`). */
  renderItem: ((item: CommandPaletteItemData, isSelected: boolean) => Node | string | null | undefined) | null = null;

  // ── Public API ────────────────────────────────────────────────────────────

  get searchSource(): TypeaheadSearchSource | null { return this.#searchSource; }
  set searchSource(next: TypeaheadSearchSource | null) {
    if (next === this.#searchSource) return;
    this.#searchSource?.cancel?.();
    this.#searchSource = next;
    if (this.isOpen) this.#runSearch(this.#query);
  }

  /** Picker mode: the selected command's value. */
  get value(): string | null { return this.#value; }
  set value(next: string | null) {
    this.#value = next ?? null;
    this.#keepsValue = true;
    this.#syncSelected();
  }

  get query(): string { return this.#query; }
  get dialog(): HTMLDialogElement | null { return this.#host?.dialog ?? null; }
  get isOpen(): boolean {
    if (this.#inline) return this.#inline.isConnected && !this.#inline.hidden;
    return this.#host?.isOpen ?? false;
  }

  show(options: {source?: HTMLElement | null} = {}): boolean {
    if (this.#inline) {
      this.#inline.hidden = false;
      if (!this.#isActive) this.#onOpen();
      return true;
    }
    return this.#host?.show({source: options.source ?? null, reason: 'api'}) ?? false;
  }
  hide(): void { this.#close('api'); }
  open(): boolean { return this.show(); }
  close(): void { this.#close('api'); }
  toggle(force?: boolean): boolean {
    const next = force ?? !this.isOpen;
    if (next) this.show();
    else this.#close('api');
    return this.isOpen;
  }

  // ── Wiring ────────────────────────────────────────────────────────────────

  connectedCallback(): void {
    const doc = this.ownerDocument;
    this.#host = this.querySelector<ModalHostElement>(':scope > ax-dialog');
    this.#inline = this.querySelector<HTMLElement>(':scope > [data-ax-inline]');
    const surface = this.#host?.querySelector(':scope > dialog') ?? this.#inline;
    const input = surface?.querySelector<HTMLInputElement>('[data-ax-command-palette-input]') ?? null;
    const listId = this.getAttribute('data-ax-list');
    const list = listId ? doc.getElementById(listId) : null;
    if (!input || !list) return;
    this.#input = input;
    this.#list = list;
    this.#keepsValue = this.hasAttribute('data-ax-value');
    this.#value = this.getAttribute('data-ax-value');
    const rows = [...list.querySelectorAll<HTMLElement>('[data-ax-static]')]
      .sort((a, b) => Number(a.getAttribute('data-ax-order')) - Number(b.getAttribute('data-ax-order')));
    this.#staticItems = rows.map((row) => parseJSON<CommandPaletteItemData>(row.getAttribute('data-ax-item'))).filter((i): i is CommandPaletteItemData => i != null);
    this.#shown = rows.filter((r) => !r.hidden && !r.closest('[hidden]')).map((r) => parseJSON<CommandPaletteItemData>(r.getAttribute('data-ax-item'))).filter((i): i is CommandPaletteItemData => i != null);
    const empty = list.querySelector<HTMLElement>('[data-ax-empty="search"]');
    if (empty) this.#emptyAnnouncer = createRenderedTextAnnouncer(empty);

    const combo = createCombobox({
      listbox: list,
      fields: () => [this.#input],
      isOpen: () => this.isOpen && this.#shown.length > 0,
      onActivate: (option) => this.#activate(option),
      onHighlight: (option) => {
        for (const row of list.querySelectorAll('[data-highlighted]')) if (row !== option) row.removeAttribute('data-highlighted');
        option?.setAttribute('data-highlighted', 'highlighted');
      },
      optionSelector: OPTION,
    });
    this.#combo = combo;
    const cleanup: Array<() => void> = [combo.attach()];
    const on = (target: EventTarget, type: string, fn: (e: Event) => void) => {
      target.addEventListener(type, fn);
      cleanup.push(() => target.removeEventListener(type, fn));
    };
    on(input, 'input', () => this.#setSearch(input.value));
    on(input, 'keydown', (e) => this.#onKeyDown(e as KeyboardEvent));
    if (this.#host) {
      const host = this.#host;
      on(host, 'astryx-open-change', (e) => {
        if (e.target !== host) return;
        if ((e as CustomEvent<{isOpen: boolean}>).detail.isOpen) this.#onOpen();
        else this.#onClose();
      });
    }
    const keys = this.getAttribute('data-ax-hotkey');
    if (keys) {
      cleanup.push(registerHotkey({
        keys,
        allowInInputs: this.hasAttribute('data-ax-hotkey-in-inputs'),
        isDisabled: () => !this.isConnected || this.isOpen,
        onPress: () => { this.show(); },
      }));
    }
    this.#cleanup = cleanup;
    this.#syncSelected();
    if (this.isOpen) this.#onOpen();
  }

  disconnectedCallback(): void {
    for (const fn of this.#cleanup) fn();
    this.#cleanup = [];
    cancelAnimationFrame(this.#busyFrame);
    this.#cancelSource();
    this.#isActive = false;
  }

  // ── Open / close ──────────────────────────────────────────────────────────

  #onOpen() {
    if (this.#isActive) return;
    this.#isActive = true;
    this.#query = '';
    if (this.#input) this.#input.value = '';
    this.#runSearch('');
  }

  /** handleClose: every in-flight search is abandoned and the palette resets. */
  #onClose() {
    if (!this.#isActive) return;
    this.#isActive = false;
    this.#version++;
    this.#cancelSource();
    this.#query = '';
    this.#search = '';
    if (this.#input) this.#input.value = '';
    this.#results = [];
    if (!this.#keepsValue) this.#value = null;
    this.#setPending(false);
    this.#render([]);
    announce('', {from: this});
  }

  #close(reason: 'api' | 'escape') {
    if (this.#inline) {
      if (this.#inline.hidden) return;
      this.#inline.hidden = true;
      this.#onClose();
      emit(this, 'astryx-open-change', {isOpen: false, reason});
      return;
    }
    this.#host?.hide(reason);
  }

  // ── Search ────────────────────────────────────────────────────────────────

  #setSearch(query: string) {
    this.#query = query;
    this.#runSearch(query);
  }

  #cancelSource() {
    this.#searchSource?.cancel?.();
    this.#controller?.abort();
    this.#controller = null;
  }

  #staticSearch(query: string): CommandPaletteItemData[] {
    const lower = query.toLowerCase().trim();
    if (lower === '') return this.#staticItems;
    return this.#staticItems.filter((item) => item.label.toLowerCase().includes(lower));
  }

  #request(query: string): CommandPaletteItemData[] | Promise<CommandPaletteItemData[]> {
    const kind = query === '' ? 'bootstrap' : 'search';
    const source = this.#searchSource;
    if (source) {
      this.#shownFromStatic = false;
      return kind === 'bootstrap' ? source.bootstrap() : source.search(query);
    }
    const controller = new AbortController();
    this.#controller = controller;
    let resolve!: (items: CommandPaletteItemData[]) => void;
    let reject!: (error?: unknown) => void;
    const answer = new Promise<CommandPaletteItemData[]>((res, rej) => { resolve = res; reject = rej; });
    const detail: TypeaheadQueryDetail = {
      query,
      kind,
      signal: controller.signal,
      respond: (items) => resolve(items ?? []),
      update: () => {},
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
    return this.#staticSearch(query);
  }

  #runSearch(query: string) {
    this.#cancelSource();
    const version = ++this.#version;
    // A highlight belongs to the query that created it.
    this.#combo?.highlight(null);
    const isBootstrap = query === '';
    this.#setPending(true);
    // Narrow the previous results at once while the source answers (useOptimistic).
    if (!isBootstrap && this.#results.length > 0) {
      const lower = query.toLowerCase().trim();
      this.#render(this.#results.filter((item) => item.label.toLowerCase().includes(lower)));
    } else {
      this.#syncEmpty();
    }
    const commit = (items: CommandPaletteItemData[]) => {
      if (this.#version !== version) return;
      if (!isBootstrap) this.#settleBusy();
      this.#search = query;
      this.#results = items;
      this.#setPending(false);
      this.#render(items);
      if (isBootstrap) announce('', {from: this});
      else if (items.length > 0) {
        const locale = this.getAttribute('data-ax-locale') ?? 'en';
        announce(fillPlural(this.getAttribute('data-ax-result-count'), locale, items.length, {count: formatNumber(items.length, locale)}), {from: this});
      }
      // Opening with a preselected value highlights it (an inline preview never scrolls the page).
      if (isBootstrap && this.#value) {
        const row = this.#combo?.options().find((o) => o.getAttribute('data-value') === this.#value);
        if (row) this.#combo?.highlight(row, this.#inline ? 'pointer' : 'program');
      }
      this.#syncEmpty();
    };
    let answer: CommandPaletteItemData[] | Promise<CommandPaletteItemData[]>;
    try {
      answer = this.#request(query);
    } catch {
      commit([]);
      return;
    }
    if (Array.isArray(answer)) commit(answer);
    else answer.then(commit, () => commit([]));
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  #render(items: CommandPaletteItemData[]) {
    const list = this.#list;
    if (!list) return;
    this.#shown = items;
    const doc = this.ownerDocument;
    for (const el of list.querySelectorAll('[data-ax-dynamic]')) el.remove();
    const staticRows = new Map([...list.querySelectorAll<HTMLElement>('[data-ax-static]')].map((r) => [r.getAttribute('data-value') ?? '', r]));
    const staticGroups = new Map([...list.querySelectorAll<HTMLElement>('[data-ax-static-group]')].map((g) => [g.getAttribute('data-ax-static-group') ?? '', g]));
    // Hidden rows give up their index id (ids follow the displayed order).
    for (const row of staticRows.values()) {
      row.hidden = true;
      row.removeAttribute('id');
    }
    for (const group of staticGroups.values()) group.hidden = true;
    const useStatic = this.#shownFromStatic && items.every((item) => staticRows.has(item.id));
    const before = list.querySelector('[data-ax-empty]');
    const itemTpl = this.querySelector<HTMLTemplateElement>(':scope > template[data-ax-item-template]');
    const groupTpl = this.querySelector<HTMLTemplateElement>(':scope > template[data-ax-group-template]');
    const listId = list.id;
    let index = 0;
    const rowFor = (item: CommandPaletteItemData): HTMLElement => {
      if (useStatic) return staticRows.get(item.id)!;
      const row = (itemTpl?.content.firstElementChild?.cloneNode(true) as HTMLElement | undefined) ?? doc.createElement('div');
      row.setAttribute('role', 'option');
      row.setAttribute('data-value', item.id);
      row.setAttribute('data-ax-item', JSON.stringify(item));
      row.setAttribute('data-ax-label', item.label);
      row.setAttribute('data-ax-dynamic', '');
      const custom = this.renderItem?.(item, item.id === this.#value);
      if (custom == null) row.textContent = item.label;
      else if (typeof custom === 'string') row.innerHTML = custom;
      else row.replaceChildren(custom);
      return row;
    };
    for (const group of groupItems(items as never[]) as Array<{heading: string | null; items: CommandPaletteItemData[]}>) {
      let container: HTMLElement = list;
      if (group.heading != null) {
        const existing = useStatic ? staticGroups.get(group.heading) : undefined;
        if (existing) container = existing;
        else {
          const created = (groupTpl?.content.firstElementChild?.cloneNode(true) as HTMLElement | undefined) ?? doc.createElement('div');
          created.setAttribute('role', 'group');
          created.setAttribute('aria-label', group.heading);
          created.setAttribute('data-ax-dynamic', '');
          const heading = created.querySelector('.astryx-command-palette-group-heading');
          if (heading) heading.textContent = group.heading;
          container = created;
        }
        container.hidden = false;
        list.insertBefore(container, before);
      }
      for (const item of group.items) {
        const row = rowFor(item);
        row.id = `${listId}-item-${index++}`;
        row.hidden = false;
        if (container === list) list.insertBefore(row, before);
        else container.append(row);
      }
    }
    // A listbox only while it holds results (CommandPaletteList / CommandPaletteInput).
    const hasListbox = items.length > 0;
    if (hasListbox) {
      list.setAttribute('role', 'listbox');
      list.setAttribute('aria-label', list.getAttribute('data-ax-list-label') ?? '');
    } else {
      list.removeAttribute('role');
      list.removeAttribute('aria-label');
    }
    const input = this.#input;
    if (input) {
      input.setAttribute('aria-expanded', String(this.isOpen && hasListbox));
      if (hasListbox) input.setAttribute('aria-controls', listId);
      else input.removeAttribute('aria-controls');
    }
    this.#syncSelected();
    this.#combo?.sync();
    this.#syncEmpty();
  }

  #syncSelected() {
    const list = this.#list;
    if (!list) return;
    for (const row of list.querySelectorAll<HTMLElement>(OPTION)) {
      const isSelected = this.#value != null && row.getAttribute('data-value') === this.#value;
      row.setAttribute('aria-selected', String(isSelected));
      if (isSelected) row.setAttribute('data-selected', 'selected');
      else row.removeAttribute('data-selected');
    }
  }

  /**
   * "No query" is what the field shows, so the bootstrap text never sits under a typed query; the
   * search-empty text belongs to a committed query and stays across keystrokes; a first query
   * still pending shows an empty line.
   */
  #syncEmpty() {
    const list = this.#list;
    if (!list) return;
    const empty = this.#shown.length === 0;
    const hasQuery = this.#query !== '';
    const showBootstrap = !hasQuery && empty;
    const showSearch = hasQuery && this.#search !== '' && empty;
    const showPending = empty && !showBootstrap && !showSearch;
    const toggle = (kind: string, shown: boolean) => {
      const el = list.querySelector<HTMLElement>(`[data-ax-empty="${kind}"]`);
      if (el) el.hidden = !shown;
    };
    toggle('bootstrap', showBootstrap);
    toggle('search', showSearch);
    toggle('pending', showPending);
    // Announce only a settled empty answer (optimistic narrowing may empty the list early).
    this.#emptyAnnouncer?.sync(showSearch && !this.#isPending && this.isOpen, this.#search);
  }

  // ── Busy (the input's delayed Spinner, useBusyAnnouncement) ───────────────

  #setPending(next: boolean) {
    if (this.#isPending === next) return;
    this.#isPending = next;
    const end = this.#input?.parentElement?.querySelector<HTMLElement>('[data-ax-end]');
    const spinner = end?.querySelector<HTMLElement>('[data-ax-busy]');
    if (spinner) spinner.hidden = !next;
    if (end && spinner) {
      const hasEnd = [...end.children].some((c) => c !== spinner && !c.matches('script, template, style'));
      end.hidden = !next && !hasEnd;
    }
    this.#input?.toggleAttribute('aria-busy', next);
    if (next) {
      if (!this.#busyAnnounced) {
        cancelAnimationFrame(this.#busyFrame);
        this.#busyFrame = requestAnimationFrame(() => {
          this.#busyFrame = 0;
          this.#busyAnnounced = true;
          const label = this.getAttribute('data-ax-loading-label');
          if (label) this.#busyWithdraw = announce(label, {politeness: 'polite', from: this.#input ?? this});
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

  // ── Keyboard and selection ────────────────────────────────────────────────

  #onKeyDown(e: KeyboardEvent) {
    if (e.defaultPrevented || isImeKeyEvent(e)) return;
    const combo = this.#combo;
    if (!combo) return;
    switch (e.key) {
      case 'Escape':
        // A modal palette leaves Escape to the dialog's layer stack (a nested layer goes first).
        if (this.#inline) {
          e.preventDefault();
          this.#close('escape');
        }
        return;
      case 'Enter': {
        e.preventDefault();
        const option = combo.highlighted();
        if (option && !combo.isDisabled(option)) this.#activate(option);
        return;
      }
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault();
        combo.move(e.key === 'ArrowDown' ? 1 : -1, {wrap: false});
        return;
      case 'PageUp':
      case 'PageDown': {
        e.preventDefault();
        const target = e.key === 'PageUp' ? combo.first() : combo.last();
        if (target) combo.highlight(target, 'keyboard');
        return;
      }
      case 'Tab':
        combo.highlight(null);
        return;
      default:
        // Home/End move the caret; Space and characters type.
    }
  }

  #activate(option: HTMLElement) {
    if (option.getAttribute('aria-disabled') === 'true') return;
    const value = option.getAttribute('data-value') ?? '';
    const item = parseJSON<CommandPaletteItemData>(option.getAttribute('data-ax-item')) ?? {id: value, label: (option.textContent ?? '').trim()};
    this.#value = value;
    this.#syncSelected();
    emit<CommandPaletteSelectDetail>(this, 'astryx-select', {value, item});
    this.#close('api');
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-command-palette')) {
  customElements.define('ax-command-palette', CommandPaletteElement);
}

// The keyboard-only ring: text fields match :focus-visible after pointer focus in Chromium.
defineBehavior('command-palette-input', (input) => {
  const onFocus = () => {
    const keyboard = getModality(input) === 'keyboard';
    input.classList.toggle('ax-focus-visible', keyboard);
    input.classList.toggle('ax-focus-suppressed', !keyboard);
  };
  const onBlur = () => {
    input.classList.remove('ax-focus-visible');
    input.classList.add('ax-focus-suppressed');
  };
  input.addEventListener('focus', onFocus);
  input.addEventListener('blur', onBlur);
  if (input.ownerDocument.activeElement === input) onFocus();
  return () => {
    input.removeEventListener('focus', onFocus);
    input.removeEventListener('blur', onBlur);
  };
});

// A standalone item (outside a palette) reports its pointer activation (Astryx onSelect).
defineBehavior('command-palette-item', (item) => {
  const onClick = () => {
    if (item.closest('ax-command-palette') || item.getAttribute('aria-disabled') === 'true') return;
    emit(item, 'astryx-select', {value: item.getAttribute('data-value') ?? ''});
  };
  item.addEventListener('click', onClick);
  return () => item.removeEventListener('click', onClick);
});

declare global {
  interface HTMLElementTagNameMap { 'ax-command-palette': CommandPaletteElement }
}
