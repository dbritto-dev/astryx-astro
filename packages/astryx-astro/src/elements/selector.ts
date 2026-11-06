/**
 * `<ax-selector>` — the control box of Selector (light DOM, wraps the server markup), and
 * `ListboxSelectElement`, the base MultiSelector's `<ax-multi-selector>` shares.
 *
 * Port of the behaviour in @astryxdesign/core Selector/Selector.tsx, Selector/hooks.ts
 * (useCombobox, useSelectedItemOffset), Selector/useSelectorPresentation.ts (focus return,
 * pointer-restored ring), hooks/useFocusReturnVisibility.ts, hooks/useKeyboardHighlight.ts,
 * hooks/useAnnounceRenderedText.ts, Layer/useLayer.tsx useKeepLayerOpenProps.
 * Keyboard, highlight, activedescendant and type-to-select come from runtime/combobox.ts.
 *
 * Parts (server markup, see components/Selector/Selector.astro):
 *   <ax-selector id data-ax-layer data-ax-listbox [data-ax-value] [data-ax-has-search] [data-ax-overlay]>
 *     > button.ax-selector-trigger [role=combobox] popovertarget=<layer>   (focus, value)
 *     > input[type=hidden][data-ax-selector-value]                          (form value)
 *     > [data-ax-input-clear] (inside InputClearButton) · template[data-ax-*]
 *   <ax-combobox-layer id popover=auto data-ax-anchor=<box id>>
 *     [data-ax-selector-search] input · role=listbox > role=option[data-value] …
 */
import './runtime/disabledInteraction';
import {announce, createRenderedTextAnnouncer} from './runtime/announce';
import {
  ComboboxLayerElement,
  comboboxLayer,
  createCombobox,
  handleComboboxKey,
  keepLayerOpenFor,
  type Combobox,
  type ComboboxKeyConfig,
} from './runtime/combobox';
import {isFocusDetached} from './runtime/dom';
import {getModality, returnFocusForLastInput} from './runtime/modality';
import type {Typeahead} from './runtime/typeahead';
import {emit, fillPlural, formatNumber, hasTextSelection, onFormReset} from './field';

const Base: typeof HTMLElement = typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement;

/** Shared plumbing of the select-only listbox comboboxes (Selector, MultiSelector). */
export abstract class ListboxSelectElement extends Base {
  protected trigger: HTMLElement | null = null;
  protected layer: ComboboxLayerElement | null = null;
  protected listbox: HTMLElement | null = null;
  protected search: HTMLInputElement | null = null;
  protected combo: Combobox | null = null;
  protected typeahead: Typeahead | null = null;
  protected query = '';
  #cleanup: Array<() => void> = [];
  #emptyAnnouncers = new Map<HTMLElement, ReturnType<typeof createRenderedTextAnnouncer>>();
  #focusFrame = 0;
  #overlayFrame = 0;

  /** Disabled (aria-disabled trigger) — read live, so an InputGroup's stamp needs nothing. */
  get isDisabled(): boolean { return this.trigger?.getAttribute('aria-disabled') === 'true' || this.hasAttribute('data-disabled'); }
  get isReadOnly(): boolean { return this.hasAttribute('data-readonly'); }
  get hasSearch(): boolean { return this.hasAttribute('data-ax-has-search'); }
  get isOpen(): boolean { return this.layer?.isOpen ?? false; }
  get locale(): string { return this.getAttribute('data-ax-locale') ?? 'en'; }

  open(): boolean {
    if (this.isDisabled || this.isReadOnly || !this.layer || !this.trigger) return false;
    if (this.isOpen) return true;
    return this.layer.show({source: this.trigger, reason: 'api'});
  }

  close(): void {
    this.layer?.hide('api');
  }

  toggle(force?: boolean): boolean {
    const next = force ?? !this.isOpen;
    if (next) this.open();
    else this.close();
    return this.isOpen;
  }

  // ── Subclass policy ───────────────────────────────────────────────────────
  /** Commit (Selector) or toggle (MultiSelector) an option. */
  protected abstract activate(option: HTMLElement, event: Event | null): void;
  /** Keyboard map options beyond the shared ones. */
  protected abstract keyConfig(): Partial<ComboboxKeyConfig>;
  /** Runs once the list is shown (`reason` 'api' for isDefaultOpen / the element API). */
  protected abstract opened(reason: string): void;
  /** Runs once the list is hidden. */
  protected abstract closed(): void;
  /** Called from connectedCallback after the parts were found. */
  protected abstract setup(): Array<() => void>;
  /** Label match for the search row (substring, case-insensitive, Astryx optionMatchesQuery). */
  protected matches(option: HTMLElement, query: string): boolean {
    if (!query) return true;
    return (option.getAttribute('data-ax-label') ?? option.textContent ?? '').toLowerCase().includes(query.toLowerCase());
  }
  /** Options the search never hides (MultiSelector's select-all / create rows). */
  protected isFixedRow(_option: HTMLElement): boolean { return false; }
  /** Called after each filter pass with the number of matching options. */
  protected filtered(_count: number): void {}

  connectedCallback(): void {
    const trigger = this.querySelector<HTMLElement>(':scope > [data-astryx-focus-owner]');
    if (!trigger) return;
    this.trigger = trigger;
    const doc = this.ownerDocument;
    this.layer = comboboxLayer(this, this.getAttribute('data-ax-layer'));
    const listboxId = this.getAttribute('data-ax-listbox');
    this.listbox = listboxId ? doc.getElementById(listboxId) : null;
    this.search = this.layer?.querySelector<HTMLInputElement>('[data-ax-panel-search] input') ?? null;
    const cleanup: Array<() => void> = [];

    // Option rows take the box's effective size (a size provider stamps only the box).
    const size = this.getAttribute('data-size');
    if (size && this.listbox) for (const row of this.listbox.querySelectorAll<HTMLElement>('[data-size]')) row.setAttribute('data-size', size);

    if (this.listbox && this.layer) {
      const combo = createCombobox({
        listbox: this.listbox,
        fields: () => [this.hasSearch ? this.search : this.trigger],
        isOpen: () => this.isOpen,
        onActivate: (option, event) => this.activate(option, event),
      });
      this.combo = combo;
      cleanup.push(combo.attach());
      cleanup.push(keepLayerOpenFor(this, () => this.layer));
      const layer = this.layer;
      const onOpenChange = (event: Event) => {
        if (event.target !== layer) return;
        const detail = (event as CustomEvent<{isOpen: boolean; reason: string}>).detail;
        if (detail.isOpen) this.#didOpen(detail.reason);
        else this.#didClose();
      };
      const onBeforeToggle = (event: Event) => {
        if (event.target !== layer || (event as ToggleEvent).newState !== 'open') return;
        if (this.hasAttribute('data-ax-overlay')) {
          cancelAnimationFrame(this.#overlayFrame);
          // Runs before the first frame paints (useSelectedItemOffset is a layout effect).
          this.#overlayFrame = requestAnimationFrame(() => this.#overlaySelectedItem());
        }
      };
      layer.addEventListener('astryx-open-change', onOpenChange);
      layer.addEventListener('beforetoggle', onBeforeToggle);
      cleanup.push(() => layer.removeEventListener('astryx-open-change', onOpenChange));
      cleanup.push(() => layer.removeEventListener('beforetoggle', onBeforeToggle));
    }

    // The press that light-dismissed the list (on the label, the box chrome) never reopens it.
    const onTriggerClick = (event: MouseEvent) => {
      if (this.layer?.wasJustDismissed()) event.preventDefault();
    };
    trigger.addEventListener('click', onTriggerClick);
    cleanup.push(() => trigger.removeEventListener('click', onTriggerClick));

    const onTriggerKeyDown = (event: KeyboardEvent) => this.#onTriggerKeyDown(event);
    trigger.addEventListener('keydown', onTriggerKeyDown);
    cleanup.push(() => trigger.removeEventListener('keydown', onTriggerKeyDown));

    const onTriggerFocus = () => {
      // useFocusReturnVisibility: a keyboard focus brings the ring back.
      if (getModality(this) === 'keyboard') this.removeAttribute('data-ax-focus-restored');
    };
    trigger.addEventListener('focus', onTriggerFocus);
    cleanup.push(() => trigger.removeEventListener('focus', onTriggerFocus));

    // A press on the control box's chrome (padding, icons) behaves as a press on the trigger.
    const onBoxClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target || trigger.contains(target) || this.isDisabled || this.isReadOnly) return;
      if (target.closest('[data-ax-input-clear], [data-ax-selector-status], [popover], template')) return;
      if (hasTextSelection(this) || this.layer?.wasJustDismissed()) return;
      if (doc.activeElement !== trigger) trigger.focus({preventScroll: true});
      trigger.click();
    };
    this.addEventListener('click', onBoxClick);
    cleanup.push(() => this.removeEventListener('click', onBoxClick));

    if (this.search) cleanup.push(...this.#wireSearch(this.search));
    cleanup.push(...this.setup());
    this.#cleanup = cleanup;
    if (this.isOpen) this.#didOpen();
  }

  disconnectedCallback(): void {
    for (const fn of this.#cleanup) fn();
    this.#cleanup = [];
    cancelAnimationFrame(this.#focusFrame);
    cancelAnimationFrame(this.#overlayFrame);
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────

  protected sharedKeyConfig(): ComboboxKeyConfig {
    return {
      kind: 'select',
      hasSearch: this.hasSearch,
      open: () => this.open(),
      close: () => this.close(),
      activate: (option, event) => this.activate(option, event),
      seed: this.hasSearch ? (char) => this.#seed(char) : undefined,
      ...this.keyConfig(),
    };
  }

  #onTriggerKeyDown(event: KeyboardEvent) {
    if (this.isDisabled || this.isReadOnly || !this.combo) return;
    if (getModality(this) === 'keyboard') this.removeAttribute('data-ax-focus-restored');
    // With a search row the query owns typing, so type-to-select is off.
    if (!this.hasSearch && this.typeahead && this.typeaheadAllowed(event) && this.typeahead.onKeyDown(event)) {
      event.preventDefault();
      return;
    }
    handleComboboxKey(this.combo, event, this.sharedKeyConfig());
  }

  /** MultiSelector keeps Space as the toggle (never extends the typed prefix). */
  protected typeaheadAllowed(_event: KeyboardEvent): boolean { return true; }

  // ── Open / close ──────────────────────────────────────────────────────────

  #didOpen(reason = 'api') {
    this.trigger?.setAttribute('aria-expanded', 'true');
    this.search?.setAttribute('aria-expanded', 'true');
    this.querySelector('.ax-selector-chevron, .ax-multi-selector-chevron')?.setAttribute('data-state', 'expanded');
    this.removeAttribute('data-ax-focus-restored');
    const listbox = this.listbox;
    if (listbox) listbox.toggleAttribute('data-ax-overflow', listbox.scrollHeight > listbox.clientHeight + 1);
    this.opened(reason);
    this.combo?.sync();
    this.#syncEmpty();
    if (this.search) {
      cancelAnimationFrame(this.#focusFrame);
      // useSelectorPresentation handleLayerShow: focus the query a frame later, caret at the end.
      this.#focusFrame = requestAnimationFrame(() => {
        const input = this.search;
        if (!input || !this.isOpen) return;
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      });
    }
  }

  #didClose() {
    cancelAnimationFrame(this.#focusFrame);
    cancelAnimationFrame(this.#overlayFrame);
    this.trigger?.setAttribute('aria-expanded', 'false');
    this.search?.setAttribute('aria-expanded', 'false');
    this.querySelector('.ax-selector-chevron, .ax-multi-selector-chevron')?.setAttribute('data-state', 'collapsed');
    this.layer?.style.removeProperty('margin-block-start');
    this.combo?.highlight(null);
    this.typeahead?.reset();
    if (this.query !== '' || this.search?.value) this.setQuery('', {silent: true});
    // Clear a lingering result count so stale status text does not linger.
    announce('', {from: this});
    this.closed();
    this.combo?.sync();
    this.#syncEmpty();
    // Focus return (useSelectorPresentation): back to the trigger unless a press already put it
    // on another control; a pointer-driven return draws no ring (pointerRestoredFocus).
    const trigger = this.trigger;
    if (!trigger) return;
    const doc = this.ownerDocument;
    if (isFocusDetached(doc)) returnFocusForLastInput(trigger);
    if (doc.activeElement === trigger && getModality(this) !== 'keyboard') this.setAttribute('data-ax-focus-restored', '');
  }

  /** useSelectedItemOffset: the selected (else first) option sits over the trigger, clamped. */
  #overlaySelectedItem() {
    const layer = this.layer;
    const listbox = this.listbox;
    if (!layer || !listbox || !this.isOpen) return;
    const target = this.combo?.selected() ?? this.combo?.options()[0] ?? null;
    layer.style.removeProperty('margin-block-start');
    if (!target) return;
    const layoutTop = (el: HTMLElement) => {
      let top = 0;
      for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) top += node.offsetTop;
      return top;
    };
    const anchorRect = this.getBoundingClientRect();
    const listboxHeight = listbox.offsetHeight;
    if (listboxHeight <= 0) return;
    // Scroll a long list so the target is in it before measuring.
    if (target.offsetTop + target.offsetHeight > listbox.scrollTop + listbox.clientHeight || target.offsetTop < listbox.scrollTop) {
      target.scrollIntoView({block: 'nearest'});
    }
    const itemCenter = layoutTop(target) - layoutTop(listbox) - listbox.scrollTop + target.offsetHeight / 2;
    const anchorCenter = anchorRect.top + anchorRect.height / 2;
    // The selected row renders one optical pixel below the trigger label at the same centre.
    const desiredTop = anchorCenter - itemCenter - 1;
    const maxTop = Math.max(0, window.innerHeight - listboxHeight);
    const clampedTop = Math.min(Math.max(desiredTop, 0), maxTop);
    const offset = Math.max(0, anchorRect.bottom - clampedTop);
    if (offset > 0) layer.style.setProperty('margin-block-start', `-${offset}px`);
  }

  // ── Search row ────────────────────────────────────────────────────────────

  #wireSearch(input: HTMLInputElement): Array<() => void> {
    const field = input.closest<HTMLElement>('.ax-panel-search-field');
    const row = input.closest<HTMLElement>('[data-ax-panel-search]');
    const onInput = () => this.setQuery(input.value);
    const onKeyDown = (event: KeyboardEvent) => {
      if (!this.combo) return;
      // Tab with a query moves to the row's clear button (the popup stays open).
      if (event.key === 'Tab' && !event.shiftKey && input.value !== '') return;
      if (this.beforeSearchKey(event)) return;
      handleComboboxKey(this.combo, event, {...this.sharedKeyConfig(), isTextField: true, seed: undefined});
    };
    // Keys on the row's clear button: a forward Tab leaves the popup, so it closes.
    const onRowKeyDown = (event: KeyboardEvent) => {
      if (event.target === input) return;
      if (event.key === 'Tab' && !event.shiftKey) this.close();
    };
    const onFocus = () => { field?.toggleAttribute('data-keyboard-focus', getModality(input) === 'keyboard'); };
    const onBlur = () => { field?.removeAttribute('data-keyboard-focus'); };
    const onClear = (event: MouseEvent) => {
      if (!(event.target as Element | null)?.closest('[data-ax-input-clear]')) return;
      this.setQuery('');
      input.focus(event.detail === 0 ? undefined : {preventScroll: true});
    };
    const onClearDown = (event: Event) => {
      if ((event.target as Element | null)?.closest('[data-ax-input-clear]')) event.preventDefault();
    };
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKeyDown);
    input.addEventListener('focus', onFocus);
    input.addEventListener('blur', onBlur);
    row?.addEventListener('keydown', onRowKeyDown);
    row?.addEventListener('click', onClear);
    row?.addEventListener('mousedown', onClearDown);
    return [
      () => input.removeEventListener('input', onInput),
      () => input.removeEventListener('keydown', onKeyDown),
      () => input.removeEventListener('focus', onFocus),
      () => input.removeEventListener('blur', onBlur),
      () => row?.removeEventListener('keydown', onRowKeyDown),
      () => row?.removeEventListener('click', onClear),
      () => row?.removeEventListener('mousedown', onClearDown),
    ];
  }

  /** A subclass claims a search-row key before the shared map (MultiSelector's create row). */
  protected beforeSearchKey(_event: KeyboardEvent): boolean { return false; }

  /** Type-to-find on the trigger appends to the query (characters racing the open are kept). */
  #seed(char: string) {
    this.setQuery(this.query + char);
  }

  /** Set the search query, filter the list and announce the outcome. */
  setQuery(query: string, {silent = false}: {silent?: boolean} = {}) {
    this.query = query;
    const input = this.search;
    if (input && input.value !== query) input.value = query;
    const clear = input?.closest('[data-ax-panel-search]')?.querySelector<HTMLElement>('[data-ax-input-clear]');
    if (clear) clear.hidden = query === '';
    const count = this.#filter(query);
    this.filtered(count);
    this.combo?.sync();
    this.#syncEmpty();
    if (!silent) this.announceSearch(query, count);
  }

  /** Hide the options that do not match; returns the number of matching options. */
  #filter(query: string): number {
    const listbox = this.listbox;
    if (!listbox) return 0;
    let count = 0;
    for (const option of listbox.querySelectorAll<HTMLElement>('[role="option"]')) {
      if (this.isFixedRow(option)) continue;
      const match = this.matches(option, query);
      option.hidden = !match;
      if (match) count++;
    }
    // A group with no match goes with its heading; dividers would orphan while searching.
    for (const section of listbox.querySelectorAll<HTMLElement>('[data-ax-section]')) {
      section.hidden = !section.querySelector('[role="option"]:not([hidden])');
    }
    for (const divider of listbox.querySelectorAll<HTMLElement>('[data-ax-divider]')) divider.hidden = query !== '';
    return count;
  }

  /** Count of real (non-fixed) options in the list. */
  protected realOptionCount(visibleOnly: boolean): number {
    if (!this.listbox) return 0;
    return [...this.listbox.querySelectorAll<HTMLElement>('[role="option"]')]
      .filter((o) => !this.isFixedRow(o) && (!visibleOnly || !o.hidden)).length;
  }

  protected get isLoading(): boolean { return this.hasAttribute('data-ax-loading'); }

  /** Selector announceSearchResults: a count for a query; an empty result speaks from the panel. */
  protected announceSearch(query: string, count: number) {
    if (query === '' || this.isLoading) {
      announce('', {from: this});
      return;
    }
    if (count === 0) return;
    const templates = this.getAttribute('data-ax-result-count');
    announce(fillPlural(templates, this.locale, count, {count: formatNumber(count, this.locale)}), {from: this});
  }

  /** Show the right empty message and announce it (useAnnounceRenderedText). */
  #syncEmpty() {
    const listbox = this.listbox;
    if (!listbox) return;
    const visible = this.realOptionCount(true);
    const shown = !this.isLoading && visible === 0 && !this.hasExtraRows();
    for (const empty of listbox.querySelectorAll<HTMLElement>('[data-ax-empty]')) {
      const kind = empty.getAttribute('data-ax-empty');
      empty.hidden = !(shown && (kind === 'search' ? this.query !== '' : this.query === ''));
      let announcer = this.#emptyAnnouncers.get(empty);
      if (!announcer) {
        announcer = createRenderedTextAnnouncer(empty);
        this.#emptyAnnouncers.set(empty, announcer);
      }
      announcer.sync(this.isOpen && !empty.hidden, this.query);
    }
  }

  /** Rows that make a panel non-empty without matching (MultiSelector's create row). */
  protected hasExtraRows(): boolean { return false; }

  /** Re-run the empty state (after the list changed). */
  protected refreshEmpty() { this.#syncEmpty(); }

  /** Clone a server-rendered `<template>` found inside this element. */
  protected templateContent(selector: string): DocumentFragment | null {
    const tpl = this.querySelector<HTMLTemplateElement>(`:scope > template${selector}`);
    return tpl ? (tpl.content.cloneNode(true) as DocumentFragment) : null;
  }

  /** Swap an option's selection mark for the server-rendered one of `state`. */
  protected setMark(option: HTMLElement, state: string) {
    if (option.getAttribute('data-ax-mark-state') === state) return;
    const slot = option.querySelector<HTMLElement>('[data-ax-mark-slot]');
    const content = this.templateContent(`[data-ax-mark="${state}"]`);
    if (!slot || !content) return;
    slot.replaceChildren(content);
    option.setAttribute('data-ax-mark-state', state);
  }
}

/** `<ax-selector>`: single selection. */
export class SelectorElement extends ListboxSelectElement {
  #value: string | null = null;
  #default: string | null = null;

  get value(): string | null { return this.#value; }
  set value(next: string | null) { this.#setValue(next ?? null); }

  /** Clear the selection as the clear button does (fires `astryx-change` `{value: null}`). */
  clear(): void {
    if (this.isDisabled || this.isReadOnly) return;
    this.typeahead?.reset();
    this.#setValue(null);
    emit(this, 'astryx-change', {value: null});
  }

  protected setup(): Array<() => void> {
    this.#value = this.hasAttribute('data-ax-value') ? this.getAttribute('data-ax-value') : null;
    this.#default = this.#value;
    const cleanup: Array<() => void> = [];
    if (this.combo) {
      const combo = this.combo;
      // Type-to-select: open, it walks the highlight; closed, it commits the match like a
      // native select and announces it (nothing else would prompt AT to re-read the trigger).
      this.typeahead = combo.typeahead({
        getCurrent: () => (this.isOpen ? combo.highlighted() : combo.selected()),
        onMatch: (option) => {
          if (this.isOpen) combo.highlight(option, 'keyboard');
          else if (option.getAttribute('data-value') !== this.#value) {
            this.#commit(option);
            announce(option.getAttribute('data-ax-label') ?? '', {from: this});
          }
        },
      });
    }
    const onClearClick = (event: MouseEvent) => {
      if (!(event.target as Element | null)?.closest('[data-ax-input-clear]')) return;
      event.stopPropagation();
      this.clear();
      // A keyboard activation leaves focus on the (now hidden) clear button: hand it to the trigger.
      if (event.detail === 0) this.trigger?.focus();
    };
    const onClearDown = (event: Event) => {
      if ((event.target as Element | null)?.closest('[data-ax-input-clear]')) event.preventDefault();
    };
    const onStatusClick = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest('[data-ax-selector-status]')) event.stopPropagation();
    };
    this.addEventListener('click', onClearClick);
    this.addEventListener('mousedown', onClearDown);
    this.addEventListener('click', onStatusClick);
    cleanup.push(() => this.removeEventListener('click', onClearClick));
    cleanup.push(() => this.removeEventListener('mousedown', onClearDown));
    cleanup.push(() => this.removeEventListener('click', onStatusClick));
    if (this.trigger instanceof HTMLButtonElement) cleanup.push(onFormReset(this.trigger, () => this.#setValue(this.#default)));
    return cleanup;
  }

  protected keyConfig(): Partial<ComboboxKeyConfig> {
    return {
      clear: this.querySelector('[data-ax-input-clear]') ? () => this.clear() : undefined,
      hasValue: () => this.#value != null,
    };
  }

  protected activate(option: HTMLElement): void {
    if (this.isDisabled || this.isReadOnly || option.getAttribute('aria-disabled') === 'true') return;
    this.#commit(option);
    this.close();
  }

  protected opened(reason: string): void {
    // onTriggerClick: a press opens the list on the selection (else the first option); with a
    // search row nothing is highlighted until the arrows move; isDefaultOpen highlights nothing.
    if (reason !== 'api' && !this.hasSearch && this.combo && !this.combo.highlighted()) {
      this.combo.highlight(this.combo.selected() ?? this.combo.first(), 'program');
    }
  }

  protected closed(): void {}

  #commit(option: HTMLElement) {
    const value = option.getAttribute('data-value');
    if (value == null) return;
    this.#setValue(value);
    emit(this, 'astryx-change', {value});
  }

  #setValue(value: string | null) {
    this.#value = value;
    const listbox = this.listbox;
    let label: string | null = null;
    if (listbox) {
      for (const option of listbox.querySelectorAll<HTMLElement>('[role="option"]')) {
        const isSelected = value != null && option.getAttribute('data-value') === value;
        if (isSelected) label = option.getAttribute('data-ax-label');
        option.setAttribute('aria-selected', String(isSelected));
        if (isSelected) option.setAttribute('data-selected', 'selected');
        else option.removeAttribute('data-selected');
        const disabled = option.getAttribute('aria-disabled') === 'true';
        this.setMark(option, `${isSelected ? 'checked' : 'unchecked'}${disabled ? '-disabled' : ''}`);
      }
    }
    if (value == null) this.removeAttribute('data-ax-value');
    else this.setAttribute('data-ax-value', value);
    this.toggleAttribute('data-ax-placeholder', value == null);
    const slot = this.trigger?.querySelector<HTMLElement>('[data-ax-value-slot]');
    if (slot) {
      const content = value == null
        ? this.templateContent('[data-ax-placeholder-template]')
        : this.templateContent(`[data-ax-value-template="${CSS.escape(value)}"]`);
      if (content) slot.replaceChildren(content);
      else {
        const span = this.ownerDocument.createElement('span');
        span.className = 'ax-selector-label';
        span.textContent = label ?? value ?? '';
        slot.replaceChildren(span);
      }
    }
    const input = this.querySelector<HTMLInputElement>(':scope > input[data-ax-selector-value]');
    if (input) input.value = value ?? '';
    const clear = this.querySelector<HTMLElement>(':scope > .ax-input-clear-slot [data-ax-input-clear]');
    if (clear) clear.hidden = value == null;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-selector')) {
  customElements.define('ax-selector', SelectorElement);
}

declare global {
  interface HTMLElementTagNameMap { 'ax-selector': SelectorElement }
}
