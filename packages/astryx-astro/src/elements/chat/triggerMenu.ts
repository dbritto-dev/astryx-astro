// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Port of @astryxdesign/core 0.7.9 src/Chat/useTriggerMenu.tsx on the shared
// combobox runtime (elements/runtime/combobox.ts) and layer stack.

/**
 * The trigger menu of `<ax-chat-composer-input>`: detects a trigger character before the
 * caret, opens a listbox above the caret, searches, and inserts text or a token on selection
 * (component:ChatComposerInput FR10–FR16).
 *
 *  - Activation (findActiveTrigger): a trigger character at the start or after a space, tab or
 *    line break. A single-word query ends at whitespace; `hasMultiWordQuery` runs it to a line
 *    break or 64 characters, and the same trigger's character starts a new query (another
 *    trigger's character is ordinary text). An unmatched multi-word query hides the menu
 *    (unless the trigger has its own empty text) while the query stays active.
 *  - Results apply only while their request is the latest and the caret is still inside the
 *    same trigger query (a send or clear ends it without an input event).
 *  - Escape closes and stays closed while that same query (same text node) keeps growing.
 *  - The popup is an `<ax-combobox-layer popover="manual" data-ax-outside-press="dismiss">`
 *    anchored to a fixed zero-size span at the caret (appended to <body>, outside the
 *    contenteditable, as Astryx does); presses in the editor count as inside.
 *  - Focus never leaves the editor: highlight + `aria-activedescendant` come from
 *    `createCombobox`; the editor's role / aria-expanded / aria-controls follow visibility.
 *  - The loading row ("Searching…") is announced once per episode (useBusyAnnouncement).
 *
 * Deviation: keyboard and pointer selection both use display order (Astryx indexes the raw
 * item array for Enter, which picks a different item when groups reorder rows).
 */
import {createCombobox, type Combobox, type ComboboxLayerElement} from '../runtime/combobox';
import {isImeKeyEvent} from '../runtime/dom';
import {groupItems} from '../../lib/groupItems';
import {createBusyAnnouncement} from './busy';

export interface TriggerItem {
  id: string;
  label: string;
  auxiliaryData?: unknown;
  /** What the item inserts when the trigger has no `onSelect` (asynchronous items). */
  insert?: string | ClientToken;
  [key: string]: unknown;
}

/** A token on the client: a badge config, a custom render (Node or HTML string), or pre-rendered HTML. */
export type ClientToken =
  | {value: string; label?: string | number; variant?: string; icon?: string | Node}
  | {value: string; render: () => Node | string}
  | {value: string; html: string};

export interface TriggerSearchSource {
  search(query: string, context?: {update(items: TriggerItem[]): void}): Promise<TriggerItem[]> | TriggerItem[];
  bootstrap?(): Promise<TriggerItem[]> | TriggerItem[];
  cancel?(): void;
}

/** A trigger in the browser (`input.triggers`); merged with the server's by `character`. */
export interface ClientTrigger {
  character: string;
  searchSource?: TriggerSearchSource;
  onSelect?: (item: TriggerItem) => string | ClientToken;
  renderItem?: (item: TriggerItem) => Node | string;
  emptySearchText?: string;
  loadingText?: string;
  menuLabel?: string;
  hasMultiWordQuery?: boolean;
}

/** `astryx-query` detail for a trigger search (the Typeahead async contract). */
export interface TriggerQueryDetail {
  query: string;
  kind: 'search';
  /** The trigger character. */
  trigger: string;
  signal: AbortSignal;
  respond(items: TriggerItem[]): void;
  update(items: TriggerItem[]): void;
  reject(error?: unknown): void;
}

export interface ResolvedTrigger extends ClientTrigger {
  /** Server-rendered rows of a static source (template content). */
  staticRows: HTMLElement[] | null;
}

interface Row {
  item: TriggerItem;
  /** The server row to clone (static triggers). */
  template?: HTMLElement;
}

export interface TriggerMenuOptions {
  host: HTMLElement;
  editable: HTMLElement;
  layer: ComboboxLayerElement;
  listbox: HTMLElement;
  triggers: () => ResolvedTrigger[];
  debounceMs: () => number;
  defaults: {menuLabel: string; loadingText: string};
  /** Insert the selection's result; the caller emits the change afterwards. */
  insert: (result: string | ClientToken, row: HTMLElement | null) => void;
  emitChange: () => void;
}

const MAX_MULTI_WORD_QUERY_LENGTH = 64;

function getCaretTextNode(editable: HTMLElement): Node | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const node = selection.getRangeAt(0).startContainer;
  return node.nodeType === Node.TEXT_NODE && editable.contains(node) ? node : null;
}

function getTextBeforeCursor(editable: HTMLElement): string | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!range.collapsed || !editable.contains(range.startContainer)) return null;
  const node = range.startContainer;
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').slice(0, range.startOffset);
  return null;
}

const isTriggerBoundary = (char: string | null) => char === null || char === ' ' || char === '\t' || char === '\n';

export function findActiveTrigger<T extends {character: string; hasMultiWordQuery?: boolean}>(textBeforeCursor: string, triggers: T[]): {trigger: T; query: string; triggerStart: number} | null {
  let active: {trigger: T; triggerStart: number} | null = null;
  for (let i = 0; i < textBeforeCursor.length; i++) {
    const char = textBeforeCursor[i];
    if (char === '\n') { active = null; continue; }
    if (active && !active.trigger.hasMultiWordQuery) {
      if (char === ' ' || char === '\t') active = null;
      continue;
    }
    if (active && i - active.triggerStart > MAX_MULTI_WORD_QUERY_LENGTH) active = null;
    if (!isTriggerBoundary(i > 0 ? textBeforeCursor[i - 1] : null)) continue;
    const trigger = triggers.find((t) => t.character === char);
    if (!trigger) continue;
    if (active && trigger.character !== active.trigger.character) continue;
    active = {trigger, triggerStart: i};
  }
  if (!active) return null;
  const query = textBeforeCursor.slice(active.triggerStart + 1);
  if (active.trigger.hasMultiWordQuery && query.length > MAX_MULTI_WORD_QUERY_LENGTH) return null;
  return {trigger: active.trigger, query, triggerStart: active.triggerStart};
}

function deleteTriggerText(triggerStart: number): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return;
  const text = node.textContent ?? '';
  node.textContent = text.slice(0, triggerStart) + text.slice(range.startOffset);
  const next = document.createRange();
  next.setStart(node, triggerStart);
  next.collapse(true);
  selection.removeAllRanges();
  selection.addRange(next);
}

function parseItem(raw: string | null): TriggerItem | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as TriggerItem; } catch { return null; }
}

function staticSearch(rows: HTMLElement[], query: string): Row[] {
  const lower = query.toLowerCase().trim();
  const out: Row[] = [];
  for (const template of rows) {
    const item = parseItem(template.getAttribute('data-ax-item'));
    if (!item) continue;
    if (lower !== '') {
      let keywords: string[] = [];
      try { keywords = JSON.parse(template.getAttribute('data-ax-keywords') ?? '[]'); } catch { /* none */ }
      if (!item.label.toLowerCase().includes(lower) && !keywords.some((k) => k.includes(lower))) continue;
    }
    out.push({item, template});
  }
  return out;
}

export interface TriggerMenu {
  handleInput(): void;
  handleKeyDown(event: KeyboardEvent): boolean;
  reset(): void;
  isActive(): boolean;
  isVisible(): boolean;
  /** Re-write the editor's role-dependent ARIA. */
  syncAria(isDisabled: boolean): void;
  destroy(): void;
}

export function createTriggerMenu(options: TriggerMenuOptions): TriggerMenu {
  const {host, editable, layer, listbox} = options;
  let isActive = false;
  let activeTrigger: ResolvedTrigger | null = null;
  let query = '';
  let rows: Row[] = [];
  let isLoading = false;
  let isHidden = false;
  let triggerStart = -1;
  let dismissed: {character: string; triggerStart: number; dismissedQuery: string; textNode: Node | null} | null = null;
  let anchorSpan: HTMLSpanElement | null = null;
  let isSuppressed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let requestId = 0;
  let controller: AbortController | null = null;
  let ownHide = false;
  let disabled = false;
  const busy = createBusyAnnouncement(() => editable);

  const isVisible = () => isActive && !isHidden;
  const combo: Combobox = createCombobox({
    listbox,
    fields: () => [editable],
    isOpen: () => isVisible() && layer.isOpen,
    onActivate: (option) => select(option),
    // Astryx marks the highlighted row aria-selected.
    onHighlight: (option) => {
      for (const el of listbox.querySelectorAll<HTMLElement>('[role="option"]')) el.setAttribute('aria-selected', String(el === option));
    },
  });
  const detachCombo = combo.attach();

  const loadingText = () => activeTrigger?.loadingText ?? options.defaults.loadingText;
  const syncBusy = () => busy.set(isLoading && !isHidden && activeTrigger !== null, loadingText());

  const removeAnchorSpan = () => {
    anchorSpan?.remove();
    anchorSpan = null;
  };

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const abort = () => {
    controller?.abort();
    controller = null;
  };

  const hideLayer = () => {
    if (!layer.isOpen) return;
    ownHide = true;
    try { layer.hide('api'); } finally { ownHide = false; }
  };

  const clearState = () => {
    isActive = false;
    activeTrigger = null;
    query = '';
    rows = [];
    isLoading = false;
    isHidden = false;
    syncBusy();
  };

  const reset = () => {
    clearTimer();
    requestId++;
    activeTrigger?.searchSource?.cancel?.();
    abort();
    removeAnchorSpan();
    isSuppressed = false;
    // Ending the query also forgets an Escape on it.
    dismissed = null;
    hideLayer();
    triggerStart = -1;
    clearState();
    render();
  };

  // A close the layer stack made (Escape through the stack, an outside press): Astryx onHide.
  const onOpenChange = (event: Event) => {
    if (event.target !== layer || ownHide) return;
    const {isOpen} = (event as CustomEvent<{isOpen: boolean}>).detail;
    if (isOpen || isSuppressed) return;
    clearTimer();
    requestId++;
    abort();
    removeAnchorSpan();
    clearState();
    render();
  };
  layer.addEventListener('astryx-open-change', onOpenChange);

  // Anchor at the caret: a fixed zero-size span on <body>, never inside the editor.
  const anchorAtCaret = (): HTMLElement => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return editable;
    removeAnchorSpan();
    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(true);
    const rect = typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : null;
    if (!rect || (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0)) return editable;
    const span = document.createElement('span');
    span.setAttribute('aria-hidden', 'true');
    span.setAttribute('data-astryx-trigger-anchor', '');
    span.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${Math.max(rect.width, 1)}px;height:${rect.height}px;pointer-events:none;opacity:0`;
    document.body.appendChild(span);
    anchorSpan = span;
    return span;
  };

  const showLayer = (anchor: HTMLElement) => {
    if (disabled) return;
    if (layer.isOpen) layer.show({anchor});
    else layer.show({anchor, reason: 'api'});
  };

  // ── Rendering ───────────────────────────────────────────────────────────

  const optionId = (index: number) => `${listbox.id}-option-${index}`;

  function rowElement(row: Row, index: number): HTMLElement {
    let el: HTMLElement;
    if (row.template) {
      el = row.template.cloneNode(true) as HTMLElement;
    } else {
      el = document.createElement('div');
      el.setAttribute('role', 'option');
      el.className = 'ax-chat-trigger-item';
      el.tabIndex = -1;
      const rendered = activeTrigger?.renderItem?.(row.item);
      if (rendered != null) {
        if (typeof rendered === 'string') el.innerHTML = rendered;
        else el.append(rendered);
      } else {
        const label = document.createElement('span');
        label.className = 'ax-chat-trigger-item-label';
        label.textContent = row.item.label;
        el.append(label);
      }
    }
    el.id = optionId(index);
    el.setAttribute('aria-selected', 'false');
    el.removeAttribute('data-ax-highlighted');
    rowItems.set(el, row);
    return el;
  }

  let rowItems = new WeakMap<HTMLElement, Row>();

  function render() {
    rowItems = new WeakMap();
    if (!activeTrigger || isHidden) {
      listbox.replaceChildren();
      combo.highlight(null);
      syncAria(disabled);
      return;
    }
    listbox.setAttribute('aria-label', activeTrigger.menuLabel ?? options.defaults.menuLabel);
    if (isLoading) {
      const div = document.createElement('div');
      div.className = 'ax-chat-trigger-loading';
      div.textContent = loadingText();
      listbox.replaceChildren(div);
    } else if (rows.length === 0) {
      const div = document.createElement('div');
      div.className = 'ax-chat-trigger-empty';
      div.textContent = activeTrigger.emptySearchText ?? 'No results';
      listbox.replaceChildren(div);
    } else {
      const groups = groupItems(rows.map((r) => ({...r.item, __row: r})) as never[]);
      let index = 0;
      const nodes: HTMLElement[] = [];
      for (const group of groups) {
        const els = (group.items as Array<{__row: Row}>).map((g) => rowElement(g.__row, index++));
        if (group.heading) {
          const wrap = document.createElement('div');
          wrap.setAttribute('role', 'group');
          wrap.setAttribute('aria-label', group.heading);
          const heading = document.createElement('div');
          heading.setAttribute('aria-hidden', 'true');
          heading.className = 'ax-chat-trigger-heading';
          heading.textContent = group.heading;
          wrap.append(heading, ...els);
          nodes.push(wrap);
        } else {
          nodes.push(...els);
        }
      }
      listbox.replaceChildren(...nodes);
    }
    const first = combo.first();
    combo.highlight(!isLoading && first ? first : null, 'program');
    syncAria(disabled);
  }

  function syncAria(isDisabled: boolean) {
    disabled = isDisabled;
    const hasTriggers = options.triggers().length > 0;
    if (!hasTriggers) {
      editable.setAttribute('role', 'textbox');
      editable.setAttribute('aria-multiline', 'true');
      for (const a of ['aria-expanded', 'aria-controls', 'aria-activedescendant', 'aria-haspopup']) editable.removeAttribute(a);
      return;
    }
    editable.setAttribute('role', 'combobox');
    editable.removeAttribute('aria-multiline');
    editable.setAttribute('aria-haspopup', 'listbox');
    const expanded = isVisible() && !isDisabled;
    editable.setAttribute('aria-expanded', String(expanded));
    if (expanded) {
      editable.setAttribute('aria-controls', listbox.id);
      combo.sync();
    } else {
      editable.removeAttribute('aria-controls');
      editable.removeAttribute('aria-activedescendant');
    }
  }

  // ── Search ──────────────────────────────────────────────────────────────

  function isUnmatchedMultiWord(trigger: ResolvedTrigger | null, count: number, loading: boolean) {
    return trigger?.hasMultiWordQuery === true && trigger.emptySearchText == null && count === 0 && !loading;
  }

  function searchItems(trigger: ResolvedTrigger, q: string) {
    clearTimer();
    abort();
    const id = ++requestId;
    const isCurrent = () => {
      if (id !== requestId) return false;
      const before = getTextBeforeCursor(editable);
      const found = before === null ? null : findActiveTrigger(before, options.triggers());
      if (found?.trigger.character !== trigger.character || found.triggerStart !== triggerStart) {
        reset();
        return false;
      }
      return true;
    };
    const apply = (items: Row[], settled = true) => {
      if (settled) busy.settle();
      const hidden = isUnmatchedMultiWord(trigger, items.length, false);
      rows = items;
      isLoading = false;
      isHidden = hidden;
      syncBusy();
      if (hidden && !isSuppressed) {
        isSuppressed = true;
        hideLayer();
      } else if (!hidden && isSuppressed) {
        isSuppressed = false;
        showLayer(anchorAtCaret());
      }
      render();
    };
    const toRows = (items: TriggerItem[]) => (items ?? []).map((item) => ({item}));
    const setLoading = () => {
      if (isLoading) return;
      isLoading = true;
      syncBusy();
      render();
    };

    if (trigger.staticRows && !trigger.searchSource) {
      // A server-rendered static source answers synchronously (never shows the loading row).
      if (isCurrent()) apply(staticSearch(trigger.staticRows, q));
      return;
    }

    const run = () => {
      timer = null;
      const source = trigger.searchSource;
      if (source) {
        source.cancel?.();
        const result = source.search(q);
        if (!Array.isArray(result)) setLoading();
        Promise.resolve(result).then(
          (items) => { if (isCurrent()) apply(toRows(items)); },
          () => { if (isCurrent()) apply([]); },
        );
        return;
      }
      const ctrl = new AbortController();
      controller = ctrl;
      let resolve!: (items: TriggerItem[]) => void;
      let rejectFn!: (error?: unknown) => void;
      const answer = new Promise<TriggerItem[]>((res, rej) => { resolve = res; rejectFn = rej; });
      const detail: TriggerQueryDetail = {
        query: q,
        kind: 'search',
        trigger: trigger.character,
        signal: ctrl.signal,
        respond: (items) => resolve(items ?? []),
        update: (items) => { if (!ctrl.signal.aborted && isCurrent()) apply(toRows(items), false); },
        reject: (error) => rejectFn(error ?? new Error('rejected')),
      };
      const event = new CustomEvent<TriggerQueryDetail>('astryx-query', {detail, bubbles: true, composed: true, cancelable: true});
      host.dispatchEvent(event);
      if (!event.defaultPrevented) {
        // Nobody answers: static rows if any, else nothing.
        controller = null;
        if (isCurrent()) apply(trigger.staticRows ? staticSearch(trigger.staticRows, q) : []);
        return;
      }
      if (rows.length === 0) setLoading();
      answer.then(
        (items) => { if (!ctrl.signal.aborted && isCurrent()) apply(toRows(items)); },
        () => { if (!ctrl.signal.aborted && isCurrent()) apply([]); },
      );
    };

    const source = trigger.searchSource;
    // Debounce asynchronous sources; synchronous ones answer at once (Astryx probes search('')).
    const isAsync = source ? source.search('') instanceof Promise : true;
    const delay = options.debounceMs();
    if (isAsync && delay > 0) {
      setLoading();
      timer = setTimeout(run, delay);
    } else {
      run();
    }
  }

  // ── Selection ───────────────────────────────────────────────────────────

  function select(option: HTMLElement) {
    const trigger = activeTrigger;
    const row = rowItems.get(option);
    if (!trigger || !row) return;
    removeAnchorSpan();
    deleteTriggerText(triggerStart);
    let result: string | ClientToken | null = trigger.onSelect ? trigger.onSelect(row.item) : null;
    if (result == null && row.item.insert != null) result = row.item.insert;
    if (result == null && row.template) {
      try {
        const insert = JSON.parse(row.template.getAttribute('data-ax-insert') ?? 'null') as {text?: string; token?: string} | null;
        if (insert?.text != null) result = insert.text;
        else if (insert?.token != null) {
          const tpl = row.template.querySelector<HTMLTemplateElement>(':scope > template[data-ax-token-html]');
          result = {value: insert.token, html: tpl?.innerHTML ?? ''};
        }
      } catch { /* no server result */ }
    }
    options.insert(result ?? row.item.label, option);
    options.emitChange();
    reset();
  }

  // ── Input / keys ────────────────────────────────────────────────────────

  function handleInput() {
    const triggers = options.triggers();
    if (triggers.length === 0) return;
    const before = getTextBeforeCursor(editable);
    const found = before === null ? null : findActiveTrigger(before, triggers);
    if (!found) {
      dismissed = null;
      if (isActive) reset();
      return;
    }
    const {trigger, query: q, triggerStart: start} = found;
    const d = dismissed;
    if (d && d.character === trigger.character && d.triggerStart === start && d.textNode !== null && d.textNode.isConnected && d.textNode === getCaretTextNode(editable)) {
      if (q.startsWith(d.dismissedQuery)) return;
    }
    dismissed = null;
    if (!isActive || activeTrigger?.character !== trigger.character || triggerStart !== start) {
      triggerStart = start;
      isSuppressed = false;
      isActive = true;
      activeTrigger = trigger;
      query = q;
      isHidden = false;
      rows = [];
      const anchor = anchorAtCaret();
      render();
      searchItems(trigger, q);
      if (!isHidden) showLayer(anchor);
      syncAria(disabled);
    } else if (query !== q) {
      query = q;
      activeTrigger = trigger;
      searchItems(trigger, q);
    }
  }

  function handleKeyDown(e: KeyboardEvent): boolean {
    if (isImeKeyEvent(e)) return false;
    // A hidden menu consumes nothing: arrows move the caret, Enter submits.
    if (!isVisible()) return false;
    if (e.key === 'Escape') {
      e.preventDefault();
      const memo = activeTrigger ? {character: activeTrigger.character, triggerStart, dismissedQuery: query, textNode: getCaretTextNode(editable)} : null;
      reset();
      dismissed = memo;
      return true;
    }
    const hasPickableRows = !isLoading && rows.length > 0;
    if (!hasPickableRows && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      return true;
    }
    if (!hasPickableRows) return false;
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault();
        combo.move(e.key === 'ArrowDown' ? 1 : -1, {wrap: true, source: 'keyboard'});
        return true;
      case 'Enter':
      case 'Tab': {
        const option = combo.highlighted();
        if (!option) return false;
        e.preventDefault();
        select(option);
        return true;
      }
      default:
        return false;
    }
  }

  return {
    handleInput,
    handleKeyDown,
    reset,
    isActive: () => isActive,
    isVisible,
    syncAria,
    destroy() {
      clearTimer();
      abort();
      removeAnchorSpan();
      busy.destroy();
      detachCombo();
      layer.removeEventListener('astryx-open-change', onOpenChange);
    },
  };
}
