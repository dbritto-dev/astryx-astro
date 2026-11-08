/**
 * CheckboxList behaviour (light DOM, wraps the server markup). Port of the client side of
 * @astryxdesign/core CheckboxList/CheckboxList.tsx (collection-mode onChange),
 * CheckboxList/CheckboxListItem.tsx (handleToggle, the checked-row state) and
 * CheckboxList/requiredGroup.ts.
 *
 * `[data-ax-checkbox-list-item]` (every CheckboxListItem row, also inside a plain List):
 *  - its CheckboxInput's own `astryx-change` stays inside the row (stopped on the way down);
 *  - a user toggle updates the row's `data-selected` (checked, enabled, not read-only) and, for a
 *    standalone item (no collection-mode list around it), dispatches `astryx-check`
 *    `{isChecked}` from the row (Astryx onCheck(checked)).
 *
 * `<ax-checkbox-list>` (the `role="group"`):
 *  - collection mode (`data-ax-collection`): keeps the values in Astryx's order (a checked value
 *    is appended, an unchecked one removed; values without an item are kept) and dispatches
 *    `astryx-change` `{values}` for each user toggle;
 *  - select-all items (`data-ax-select-all`, port extension): toggling checks every enabled,
 *    non-read-only item unless all already are (then unchecks them), dispatches `astryx-check`
 *    from the select-all row, and the select-all shows checked / indeterminate / unchecked;
 *  - required group (`data-ax-required`): while no box is checked, the first enabled box carries
 *    native `required` — after every change, value set, reset and option move;
 *  - a form reset restores the initial values and states.
 * API: `value` (get/set string[]; setting never dispatches).
 */
import './runtime/disabledInteraction';
import './checkbox-input';
import {defineBehavior} from './behavior';
import {emit} from './field';
import {setIndicatorState} from './indicator-state';
import type {CheckboxInputElement} from './checkbox-input';

const ROW = '[data-ax-checkbox-list-item]';
const INPUT = 'input[data-ax-checkbox-list-input]';

function inputOf(row: Element): HTMLInputElement | null {
  for (const input of row.querySelectorAll<HTMLInputElement>(INPUT)) if (input.closest(ROW) === row) return input;
  return null;
}
function boxOf(input: HTMLInputElement): CheckboxInputElement | null {
  return input.closest<CheckboxInputElement>('ax-checkbox-input');
}
const isEnabled = (input: HTMLInputElement) =>
  input.getAttribute('aria-disabled') !== 'true' && input.getAttribute('aria-readonly') !== 'true' && !input.disabled;
const isBusy = (input: HTMLInputElement) => input.getAttribute('aria-busy') === 'true';

/** The checked-row state (theme hook + fill): checked, enabled and not read-only. */
function syncRow(row: Element, input: HTMLInputElement): void {
  const isCheckedRow = input.checked && !input.indeterminate && isEnabled(input);
  if (isCheckedRow) row.setAttribute('data-selected', 'selected');
  else row.removeAttribute('data-selected');
}

/** Set a box's state through its element (indicator included), then the row. */
function setState(row: Element, input: HTMLInputElement, state: boolean | 'indeterminate'): void {
  const box = boxOf(input);
  if (box && typeof box.value !== 'undefined' && box.input === input) box.value = state;
  else {
    input.indeterminate = state === 'indeterminate';
    input.checked = state === true;
    setIndicatorState(input.parentElement?.querySelector<HTMLElement>(':scope > [data-ax-indicator-slot]') ?? null, state === 'indeterminate' ? 'indeterminate' : state ? 'checked' : 'unchecked');
  }
  syncRow(row, input);
}

defineBehavior('checkbox-list-item', (row) => {
  const onInnerChange = (event: Event) => {
    const input = inputOf(row);
    if (input && event.target === boxOf(input)) event.stopPropagation();
  };
  const onChange = (event: Event) => {
    const input = inputOf(row);
    if (!input || event.target !== input) return;
    syncRow(row, input);
    if (!isEnabled(input) || isBusy(input) || row.hasAttribute('data-ax-select-all')) return;
    const list = row.closest('ax-checkbox-list');
    if (list?.hasAttribute('data-ax-collection')) return;
    emit(row, 'astryx-check', {isChecked: input.checked});
  };
  // Capture: the CheckboxInput's own event never reaches its element or the page.
  row.addEventListener('astryx-change', onInnerChange, {capture: true});
  row.addEventListener('change', onChange);
  return () => {
    row.removeEventListener('astryx-change', onInnerChange, {capture: true});
    row.removeEventListener('change', onChange);
  };
});

export class CheckboxListElement extends HTMLElement {
  #values: string[] = [];
  #initial: string[] = [];
  #cleanup: Array<() => void> = [];
  #scheduled = false;

  /** This list's own rows (not those of a list nested in them). */
  get rows(): HTMLElement[] {
    return [...this.querySelectorAll<HTMLElement>(ROW)].filter((row) => row.closest('ax-checkbox-list') === this);
  }

  get isCollection(): boolean {
    return this.hasAttribute('data-ax-collection');
  }

  /** The checked values (collection mode: Astryx's order; otherwise the checked items in order). */
  get value(): string[] {
    if (this.isCollection) return [...this.#values];
    return this.#items().filter(({input}) => input.checked).map(({value}) => value).filter((v): v is string => v != null);
  }
  set value(next: string[]) {
    const values = [...(next ?? [])];
    if (this.isCollection) this.#values = values;
    for (const {row, input, value} of this.#items()) setState(row, input, value != null && values.includes(value));
    this.#syncSelectAll();
    this.#syncRequired();
  }

  connectedCallback() {
    try {
      const parsed = JSON.parse(this.getAttribute('data-ax-value') ?? '[]');
      this.#initial = Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      this.#initial = [];
    }
    this.#values = [...this.#initial];

    const onChange = (event: Event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      const row = input.closest<HTMLElement>(ROW);
      if (!row || row.closest('ax-checkbox-list') !== this || inputOf(row) !== input) return;
      if (!isEnabled(input) || isBusy(input)) return;
      if (row.hasAttribute('data-ax-select-all')) this.#toggleAll(row, input);
      else this.#toggleItem(row, input);
    };
    this.addEventListener('change', onChange);
    this.#cleanup.push(() => this.removeEventListener('change', onChange));

    // requiredGroup.observe: options that move register no box again.
    if (this.hasAttribute('data-ax-required')) {
      const observer = new MutationObserver(() => this.#scheduleRequired());
      observer.observe(this, {childList: true, subtree: true});
      this.#cleanup.push(() => observer.disconnect());
    }

    const form = this.querySelector<HTMLInputElement>(INPUT)?.form ?? this.closest('form');
    if (form) {
      const onReset = (event: Event) => {
        if (event.target !== form) return;
        // The browser restores the defaults after the event.
        setTimeout(() => {
          this.#values = [...this.#initial];
          for (const {row, input} of this.#items(true)) syncRow(row, input);
          this.#syncSelectAll();
          this.#syncRequired();
        }, 0);
      };
      form.addEventListener('reset', onReset);
      this.#cleanup.push(() => form.removeEventListener('reset', onReset));
    }

    this.#syncSelectAll();
    this.#syncRequired();
  }

  disconnectedCallback() {
    for (const fn of this.#cleanup.splice(0)) fn();
  }

  /** Rows with their checkbox; select-all rows only when asked. */
  #items(withSelectAll = false): {row: HTMLElement; input: HTMLInputElement; value: string | null}[] {
    const out: {row: HTMLElement; input: HTMLInputElement; value: string | null}[] = [];
    for (const row of this.rows) {
      if (!withSelectAll && row.hasAttribute('data-ax-select-all')) continue;
      const input = inputOf(row);
      if (input) out.push({row, input, value: row.getAttribute('data-ax-checkbox-value')});
    }
    return out;
  }

  #toggleItem(row: HTMLElement, input: HTMLInputElement) {
    if (this.isCollection) {
      const value = row.getAttribute('data-ax-checkbox-value');
      if (value != null) {
        this.#values = input.checked ? (this.#values.includes(value) ? this.#values : [...this.#values, value]) : this.#values.filter((v) => v !== value);
      }
    }
    this.#syncSelectAll();
    this.#syncRequired();
    if (this.isCollection) emit(this, 'astryx-change', {values: [...this.#values]});
  }

  #toggleAll(selectAllRow: HTMLElement, selectAllInput: HTMLInputElement) {
    const actionable = this.#items().filter(({input}) => isEnabled(input) && !isBusy(input));
    const isAllChecked = actionable.length > 0 && actionable.every(({input}) => input.checked && !input.indeterminate);
    const next = !isAllChecked;
    for (const {row, input, value} of actionable) {
      setState(row, input, next);
      if (!this.isCollection || value == null) continue;
      if (next && !this.#values.includes(value)) this.#values.push(value);
      if (!next) this.#values = this.#values.filter((v) => v !== value);
    }
    this.#syncSelectAll();
    this.#syncRequired();
    syncRow(selectAllRow, selectAllInput);
    emit(selectAllRow, 'astryx-check', {isChecked: next});
    if (this.isCollection) emit(this, 'astryx-change', {values: [...this.#values]});
  }

  /** Every select-all row shows the state of the items it acts on. */
  #syncSelectAll() {
    const rows = this.rows.filter((row) => row.hasAttribute('data-ax-select-all'));
    if (rows.length === 0) return;
    const actionable = this.#items().filter(({input}) => isEnabled(input));
    const checked = actionable.filter(({input}) => input.checked && !input.indeterminate).length;
    const state: boolean | 'indeterminate' = actionable.length === 0 || checked === 0 ? false : checked === actionable.length ? true : 'indeterminate';
    for (const row of rows) {
      const input = inputOf(row);
      if (input) setState(row, input, state);
    }
  }

  #scheduleRequired() {
    if (this.#scheduled) return;
    this.#scheduled = true;
    queueMicrotask(() => {
      this.#scheduled = false;
      if (this.isConnected) this.#syncRequired();
    });
  }

  /** requiredGroup.update(): the first enabled box carries `required` while none is checked. */
  #syncRequired() {
    if (!this.hasAttribute('data-ax-required')) return;
    const inputs = this.#items().map(({input}) => input);
    const isEmpty = !inputs.some((input) => input.checked);
    const target = isEmpty ? inputs.find(isEnabled) : undefined;
    for (const input of inputs) if (input.required !== (input === target)) input.required = input === target;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-checkbox-list')) {
  customElements.define('ax-checkbox-list', CheckboxListElement);
}

declare global {
  interface HTMLElementTagNameMap { 'ax-checkbox-list': CheckboxListElement }
}
