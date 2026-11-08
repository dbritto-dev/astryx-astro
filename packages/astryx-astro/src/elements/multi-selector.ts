/**
 * `<ax-multi-selector>` — the control box of MultiSelector (light DOM, wraps the server
 * markup). Port of the behaviour in @astryxdesign/core MultiSelector/MultiSelector.tsx and
 * MultiSelector/hooks.ts (useMultiCombobox): toggling keeps the list open, a tri-state
 * select-all row, a create row for an unmatched query (`hasCreate`), selected options first
 * within their group while the list is open, the trigger summary (count / labels / badges),
 * one hidden input per value, and the selection / search announcements.
 * Shared plumbing (open/close, search row, focus return, empty states): ./selector.ts.
 * Each row's decorative checkbox is an inert CheckboxInput (as in Astryx); `setMark` sets its
 * `value` in place.
 */
// Defined first: the rows' checkboxes are upgraded before this element sets their values.
import './checkbox-input';
import type {CheckboxInputElement} from './checkbox-input';
import {announce, createAnnouncer} from './runtime/announce';
import type {ComboboxKeyConfig} from './runtime/combobox';
import {ListboxSelectElement} from './selector';
import {emit, fillMessage, fillPlural, formatNumber, onFormReset} from './field';

const CREATE_PREFIX = '__astryx_multi_selector_create__';

export interface MultiSelectorSelectedItem {
  value: string;
  label: string;
}

export interface MultiSelectorChange {
  type: 'create';
  query: string;
}

interface Messages {
  selectedCount: string;
  selectionCount: string;
  allSelected: string;
  selectionCleared: string;
  resultCount: string;
  createOption: string;
  optionCreated: string;
  partial: string;
}

export class MultiSelectorElement extends ListboxSelectElement {
  #values: string[] = [];
  #default: string[] = [];
  #messages: Partial<Messages> = {};
  #isSorted = false;
  #created = 0;
  #announceSearch = createAnnouncer({hasReplace: true});
  /** Client counterpart of the `formatValue` prop: the trigger text for count/labels. */
  formatValue: ((items: MultiSelectorSelectedItem[]) => string) | null = null;

  get values(): string[] { return [...this.#values]; }
  set values(next: string[]) { this.#setValues([...(next ?? [])]); }

  /** Clear every value as the clear button does (fires `astryx-change` `{values: []}`). */
  clear(): void {
    if (this.isDisabled || this.isReadOnly) return;
    this.#commit([]);
  }

  protected setup(): Array<() => void> {
    try { this.#values = JSON.parse(this.getAttribute('data-ax-values') ?? '[]'); } catch { this.#values = []; }
    this.#default = [...this.#values];
    try { this.#messages = JSON.parse(this.getAttribute('data-ax-messages') ?? '{}'); } catch { this.#messages = {}; }
    const cleanup: Array<() => void> = [];
    if (this.combo) {
      const combo = this.combo;
      // A match on the closed control opens the list on that option.
      this.typeahead = combo.typeahead({
        getCurrent: () => (this.isOpen ? combo.highlighted() : null),
        onMatch: (option) => {
          if (this.isOpen || this.open()) combo.highlight(option, 'keyboard');
        },
      });
    }
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('[data-ax-selector-status]')) { event.stopPropagation(); return; }
      if (!target?.closest('[data-ax-input-clear]')) return;
      event.stopPropagation();
      this.clear();
      if (event.detail === 0) this.trigger?.focus();
    };
    const onClearDown = (event: Event) => {
      if ((event.target as Element | null)?.closest('[data-ax-input-clear]')) event.preventDefault();
    };
    this.addEventListener('click', onClick);
    this.addEventListener('mousedown', onClearDown);
    cleanup.push(() => this.removeEventListener('click', onClick));
    cleanup.push(() => this.removeEventListener('mousedown', onClearDown));
    if (this.trigger instanceof HTMLButtonElement) cleanup.push(onFormReset(this.trigger, () => this.#setValues([...this.#default])));
    this.#syncSelectAll();
    return cleanup;
  }

  protected typeaheadAllowed(event: KeyboardEvent): boolean {
    // Space stays the toggle: after a letter jumps to an option, Space picks it.
    return event.key !== ' ';
  }

  protected keyConfig(): Partial<ComboboxKeyConfig> {
    return {
      isMultiple: true,
      seed: undefined,
      openHighlight: (key) => (key === 'ArrowUp' ? 'last' : key === 'ArrowDown' || !this.hasSearch ? 'first' : 'none'),
      clear: this.querySelector(':scope > .ax-input-clear-slot [data-ax-input-clear]') ? () => this.clear() : undefined,
      hasValue: () => this.#values.length > 0,
    };
  }

  protected activate(option: HTMLElement): void {
    if (this.isDisabled || this.isReadOnly || option.getAttribute('aria-disabled') === 'true') return;
    if (option.hasAttribute('data-ax-select-all-row')) this.#selectAll();
    else if (option.hasAttribute('data-ax-create-row')) {
      const value = option.getAttribute('data-value') ?? '';
      if (value.startsWith(CREATE_PREFIX)) this.#commitCreate(value.slice(CREATE_PREFIX.length));
    } else {
      const value = option.getAttribute('data-value');
      if (value == null) return;
      this.#commit(this.#values.includes(value) ? this.#values.filter((v) => v !== value) : [...this.#values, value]);
    }
  }

  protected opened(reason: string): void {
    // Snapshot the selection: selected options move first in their group until the list closes.
    this.#reorder(true);
    this.#syncSelectAll();
    this.#syncCreate();
    if (reason !== 'api' && !this.hasSearch && this.combo && !this.combo.highlighted()) {
      this.combo.highlight(this.combo.first(), 'program');
    }
  }

  protected closed(): void {
    this.#reorder(false);
    this.#announceSearch('', {from: this});
  }

  /** The select-all and create rows are never matched by the search (nor counted as results). */
  protected isFixedRow(option: HTMLElement): boolean {
    return option.hasAttribute('data-ax-fixed');
  }

  protected filtered(): void {
    this.#syncSelectAll();
    this.#syncCreate();
  }

  protected hasExtraRows(): boolean {
    const row = this.listbox?.querySelector<HTMLElement>('[data-ax-create-row]');
    return !!row && !row.hidden;
  }

  protected beforeSearchKey(event: KeyboardEvent): boolean {
    // Enter with nothing highlighted mints the typed text, as it does in Tokenizer.
    if (event.key !== 'Enter' || this.combo?.highlighted()) return false;
    const query = this.#createQuery();
    if (query == null) return false;
    event.preventDefault();
    this.#commitCreate(query);
    return true;
  }

  protected announceSearch(query: string, count: number): void {
    if (query === '' || this.isLoading) {
      this.#announceSearch('', {from: this});
      return;
    }
    if (count === 0) {
      const create = this.#createQuery(query);
      // The create row is the one result on screen: say it.
      if (create != null) this.#announceSearch(fillMessage(this.#messages.createOption, {query: create}), {from: this});
      return;
    }
    this.#announceSearch(fillPlural(this.#messages.resultCount, this.locale, count, {count: formatNumber(count, this.locale)}), {from: this});
  }

  // ── State ─────────────────────────────────────────────────────────────────

  #realOptions(): HTMLElement[] {
    return this.listbox ? [...this.listbox.querySelectorAll<HTMLElement>('[role="option"]:not([data-ax-fixed])')] : [];
  }

  #labelOf(value: string): string {
    const option = this.#realOptions().find((o) => o.getAttribute('data-value') === value);
    return option?.getAttribute('data-ax-label') ?? value;
  }

  #commit(next: string[], change?: MultiSelectorChange) {
    this.#setValues(next);
    if (!change) this.#announceSelection(next);
    emit(this, 'astryx-change', change ? {values: [...next], change} : {values: [...next]});
  }

  /** "2 of 5 selected" / "All selected" / "Selection cleared" (comboboxes-7). */
  #announceSelection(next: string[]) {
    const all = this.#realOptions().map((o) => o.getAttribute('data-value'));
    const total = all.length;
    const set = new Set(all);
    const count = next.filter((v) => set.has(v)).length;
    const m = this.#messages;
    const text = count === 0
      ? m.selectionCleared
      : total > 0 && count === total
        ? m.allSelected
        : fillMessage(m.selectionCount, {count: formatNumber(count, this.locale), total: formatNumber(total, this.locale)});
    if (text) announce(text, {from: this});
  }

  #selectAll() {
    // Over the enabled options the search shows; selected disabled options are kept.
    const enabled = this.#realOptions().filter((o) => !o.hidden && o.getAttribute('aria-disabled') !== 'true').map((o) => o.getAttribute('data-value')!);
    const isAll = enabled.length > 0 && enabled.every((v) => this.#values.includes(v));
    let next: string[];
    if (isAll) {
      const drop = new Set(enabled);
      next = this.#values.filter((v) => !drop.has(v));
    } else {
      next = [...this.#values];
      for (const v of enabled) if (!next.includes(v)) next.push(v);
    }
    this.#commit(next);
  }

  /** The query a create row would mint, or null (no hasCreate, loading, empty, an exact label). */
  #createQuery(query = this.query): string | null {
    if (!this.hasAttribute('data-ax-create') || this.isLoading) return null;
    const trimmed = query.trim();
    if (trimmed === '') return null;
    const wanted = trimmed.toLowerCase();
    const exists = this.#realOptions().some((o) => (o.getAttribute('data-ax-label') ?? '').toLowerCase() === wanted);
    return exists ? null : trimmed;
  }

  #syncCreate() {
    const row = this.listbox?.querySelector<HTMLElement>('[data-ax-create-row]');
    if (!row) return;
    const query = this.#createQuery();
    row.hidden = query == null;
    if (query == null) return;
    row.setAttribute('data-value', `${CREATE_PREFIX}${query}`);
    const text = fillMessage(this.#messages.createOption, {query});
    row.setAttribute('data-ax-label', text);
    const label = row.querySelector('[data-ax-create-label]');
    if (label) label.textContent = text;
    this.refreshEmpty();
  }

  #commitCreate(query: string) {
    if (this.isDisabled || this.isReadOnly) return;
    // The element owns its options: add the new one (Astryx asks the caller to).
    if (!this.#realOptions().some((o) => o.getAttribute('data-value') === query)) this.#mintOption(query);
    const next = this.#values.includes(query) ? [...this.#values] : [...this.#values, query];
    this.#commit(next, {type: 'create', query});
    this.setQuery('', {silent: true});
    this.combo?.highlight(null);
    announce(fillMessage(this.#messages.optionCreated, {label: query}), {from: this});
  }

  #mintOption(value: string) {
    const listbox = this.listbox;
    const tpl = this.querySelector<HTMLTemplateElement>(':scope > template[data-ax-option-template]');
    const row = tpl?.content.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
    if (!listbox || !row) return;
    row.id = `${listbox.id}-created-${++this.#created}`;
    row.setAttribute('data-value', value);
    row.setAttribute('data-ax-label', value);
    row.setAttribute('data-ax-order', String(100000 + this.#created));
    const label = row.querySelector('.ax-multi-selector-label');
    if (label) label.textContent = value;
    // The template's checkbox id is shared by every clone: give this row's its own.
    const input = row.querySelector<HTMLInputElement>('[data-ax-mark-slot] input.ax-checkbox-native');
    if (input) {
      const old = input.id;
      input.id = `${row.id}-checkbox`;
      for (const el of row.querySelectorAll(`label[for="${CSS.escape(old)}"]`)) el.setAttribute('for', input.id);
    }
    const size = this.getAttribute('data-size');
    if (size) row.setAttribute('data-size', size);
    listbox.insertBefore(row, listbox.querySelector(':scope > [data-ax-empty]'));
  }

  /** Selected-at-open first within each run of options (a section, or flat options between dividers). */
  #reorder(selectedFirst: boolean) {
    const listbox = this.listbox;
    if (!listbox || (!selectedFirst && !this.#isSorted)) return;
    const selected = new Set(this.#values);
    const containers: HTMLElement[] = [listbox, ...listbox.querySelectorAll<HTMLElement>('[data-ax-section]')];
    const sortable = (el: Element): el is HTMLElement => el.matches('[role="option"][data-ax-order]:not([data-ax-fixed])');
    for (const container of containers) {
      const children = [...container.children];
      let i = 0;
      while (i < children.length) {
        if (!sortable(children[i])) { i++; continue; }
        const run: HTMLElement[] = [];
        while (i < children.length && sortable(children[i])) run.push(children[i++] as HTMLElement);
        const anchor = run[run.length - 1].nextSibling;
        const order = (el: HTMLElement) => Number(el.getAttribute('data-ax-order'));
        const sorted = run.toSorted((a, b) => {
          if (selectedFirst) {
            const sa = selected.has(a.getAttribute('data-value') ?? '') ? 0 : 1;
            const sb = selected.has(b.getAttribute('data-value') ?? '') ? 0 : 1;
            if (sa !== sb) return sa - sb;
          }
          return order(a) - order(b);
        });
        if (sorted.some((el, k) => el !== run[k])) for (const el of sorted) container.insertBefore(el, anchor);
      }
    }
    this.#isSorted = selectedFirst;
  }

  /** Rows take the box's size; their checkboxes the CheckboxInput size (Astryx: lg → md). */
  protected override syncRowSize(size: string) {
    super.syncRowSize(size);
    const checkbox = size === 'lg' ? 'md' : size;
    for (const el of this.listbox?.querySelectorAll<HTMLElement>('[data-ax-mark-slot] [data-size]') ?? []) el.setAttribute('data-size', checkbox);
  }

  /** The row's inert CheckboxInput takes the state in place (an option's disabled state is fixed). */
  protected override setMark(option: HTMLElement, state: string) {
    if (option.getAttribute('data-ax-mark-state') === state) return;
    const box = option.querySelector<CheckboxInputElement>('[data-ax-mark-slot] ax-checkbox-input');
    if (!box) return;
    const mark = state.replace(/-disabled$/, '');
    box.value = mark === 'indeterminate' ? 'indeterminate' : mark === 'checked';
    option.setAttribute('data-ax-mark-state', state);
  }

  #syncSelectAll() {
    const row = this.listbox?.querySelector<HTMLElement>('[data-ax-select-all-row]');
    if (!row) return;
    const visible = this.#realOptions().filter((o) => !o.hidden);
    const enabled = visible.filter((o) => o.getAttribute('aria-disabled') !== 'true');
    const has = (o: HTMLElement) => this.#values.includes(o.getAttribute('data-value') ?? '');
    const isAll = enabled.length > 0 && enabled.every(has);
    const isSome = enabled.some(has);
    const state = isAll ? 'checked' : isSome ? 'indeterminate' : 'unchecked';
    row.setAttribute('aria-selected', String(isAll));
    if (isAll) row.setAttribute('data-selected', 'selected');
    else row.removeAttribute('data-selected');
    const partial = row.getAttribute('data-ax-partial-label');
    if (state === 'indeterminate' && partial) row.setAttribute('aria-label', partial);
    else row.removeAttribute('aria-label');
    this.setMark(row, state);
    // Shown only while there are options to select.
    row.hidden = visible.length === 0;
  }

  #setValues(next: string[]) {
    this.#values = next;
    this.setAttribute('data-ax-values', JSON.stringify(next));
    const set = new Set(next);
    for (const option of this.#realOptions()) {
      const isSelected = set.has(option.getAttribute('data-value') ?? '');
      option.setAttribute('aria-selected', String(isSelected));
      if (isSelected) option.setAttribute('data-selected', 'selected');
      else option.removeAttribute('data-selected');
      const disabled = option.getAttribute('aria-disabled') === 'true';
      this.setMark(option, `${isSelected ? 'checked' : 'unchecked'}${disabled ? '-disabled' : ''}`);
    }
    this.#syncSelectAll();
    this.toggleAttribute('data-ax-placeholder', next.length === 0);
    this.#renderTrigger();
    // One hidden input per value, like a native multi-select.
    const name = this.getAttribute('data-ax-html-name');
    if (name != null && this.trigger) {
      for (const input of this.querySelectorAll(':scope > input[data-ax-multi-value]')) input.remove();
      let after: Element = this.trigger;
      for (const v of next) {
        const input = this.ownerDocument.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = v;
        input.setAttribute('data-ax-multi-value', '');
        after.after(input);
        after = input;
      }
    }
    const clear = this.querySelector<HTMLElement>(':scope > .ax-input-clear-slot [data-ax-input-clear]');
    if (clear) clear.hidden = next.length === 0;
  }

  #renderTrigger() {
    const slot = this.trigger?.querySelector<HTMLElement>('[data-ax-trigger-content]');
    if (!slot) return;
    const doc = this.ownerDocument;
    const items = this.#values.map((value) => ({value, label: this.#labelOf(value)}));
    if (items.length === 0) {
      const content = this.templateContent('[data-ax-placeholder-template]');
      if (content) slot.replaceChildren(content);
      return;
    }
    const display = this.getAttribute('data-ax-trigger-display') ?? 'count';
    if (display === 'badges') {
      const max = Number(this.getAttribute('data-ax-max-badges') ?? 3);
      const wrap = doc.createElement('span');
      wrap.className = 'ax-multi-selector-badges';
      for (const item of items.slice(0, max)) {
        const badge = this.templateContent('[data-ax-badge-template]')?.firstElementChild as HTMLElement | null;
        if (!badge) continue;
        badge.setAttribute('title', item.label);
        badge.setAttribute('data-has-label', '');
        const label = badge.querySelector('.ax-badge-label');
        if (label) label.textContent = item.label;
        wrap.append(badge);
      }
      if (items.length > max) {
        const more = doc.createElement('span');
        more.className = 'ax-multi-selector-overflow';
        more.textContent = `+${items.length - max}`;
        wrap.append(more);
      }
      slot.replaceChildren(wrap);
      return;
    }
    let text = this.formatValue?.(items);
    if (text == null) {
      if (display === 'count') {
        text = fillPlural(this.#messages.selectedCount, this.locale, items.length, {count: formatNumber(items.length, this.locale)});
      } else {
        const labels = items.map((i) => i.label);
        const shown = labels.slice(0, 3);
        const rest = labels.length - shown.length;
        text = rest > 0 ? `${shown.join(', ')}, +${rest}` : shown.join(', ');
      }
    }
    const span = doc.createElement('span');
    span.className = 'ax-multi-selector-text';
    span.textContent = text;
    slot.replaceChildren(span);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-multi-selector')) {
  customElements.define('ax-multi-selector', MultiSelectorElement);
}

declare global {
  interface HTMLElementTagNameMap { 'ax-multi-selector': MultiSelectorElement }
}
