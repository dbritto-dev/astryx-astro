/**
 * `<ax-radio-list>` — the `role="radiogroup"` of RadioList (light DOM, wraps the server markup).
 * Port of the behaviour in @astryxdesign/core RadioList/RadioList.tsx (handleFocus) and
 * RadioList/RadioListItem.tsx (the onChange guard, selected state).
 *
 * Selection, roving and arrow keys are the native radio group's (one `name`); this element:
 *  - redraws every option's circle (elements/indicator-state.ts) and `data-selected` on its row
 *    when the selection changes — the newly unchecked radio gets no event of its own — and
 *    dispatches `astryx-change` `{value}` for a user selection;
 *  - blocks selection of a focusable-disabled radio (`aria-disabled`, the group's
 *    disabledMessage mode): arrows still move focus, as in Astryx, but the previous selection
 *    is restored (a click / Space never reaches it: runtime/disabledInteraction);
 *  - with no selection, a Tab entry from outside lands on the first enabled radio (forward) or
 *    keeps the last one (Shift+Tab, where browsers land on it);
 *  - re-syncs after a form reset.
 */
import './runtime/disabledInteraction';
import {emit} from './field';
import {setIndicatorState} from './indicator-state';

export class RadioListElement extends HTMLElement {
  #cleanup: Array<() => void> = [];
  #selected: HTMLInputElement | null = null;

  /** The group's own radios (one per RadioListItem). */
  get radios(): HTMLInputElement[] {
    return [...this.querySelectorAll<HTMLInputElement>('[data-ax-radio-item] input.ax-radio-native')]
      .filter((radio) => radio.closest('ax-radio-list') === this);
  }

  get value(): string {
    return this.radios.find((radio) => radio.checked)?.value ?? '';
  }
  set value(next: string) {
    for (const radio of this.radios) radio.checked = radio.value === next;
    this.#sync();
  }

  connectedCallback() {
    const onChange = (event: Event) => {
      const radio = event.target;
      if (!(radio instanceof HTMLInputElement) || radio.type !== 'radio' || !this.radios.includes(radio)) return;
      if (radio.getAttribute('aria-disabled') === 'true' || radio.disabled) {
        // RadioListItem's onChange guard: a disabled option never becomes the value.
        event.stopImmediatePropagation();
        if (this.#selected && this.#selected !== radio) this.#selected.checked = true;
        else radio.checked = false;
        this.#sync();
        return;
      }
      this.#sync();
      emit(this, 'astryx-change', {value: radio.value});
    };

    const onFocusIn = (event: FocusEvent) => {
      const radios = this.radios;
      if (radios.some((radio) => radio.checked)) return;
      const related = event.relatedTarget as Node | null;
      if (related) {
        if (this.contains(related)) return;
      } else {
        const active = this.ownerDocument.activeElement;
        if (active && active !== event.target && this.contains(active)) return;
      }
      const enabled = radios.filter((radio) => !radio.disabled);
      if (enabled.length === 0) return;
      const index = enabled.indexOf(event.target as HTMLInputElement);
      if (index === -1) return;
      const intended = index === enabled.length - 1 ? enabled[enabled.length - 1] : enabled[0];
      if (event.target !== intended) intended.focus();
    };

    // A reset restores each radio's default checkedness after the event: re-sync then.
    const onReset = (event: Event) => {
      const form = this.radios[0]?.form;
      if (form && event.target === form) setTimeout(() => this.#sync(), 0);
    };

    this.addEventListener('change', onChange);
    this.addEventListener('focusin', onFocusIn);
    this.ownerDocument.addEventListener('reset', onReset, true);
    this.#cleanup = [
      () => this.removeEventListener('change', onChange),
      () => this.removeEventListener('focusin', onFocusIn),
      () => this.ownerDocument.removeEventListener('reset', onReset, true),
    ];
    this.#sync();
  }

  disconnectedCallback() {
    for (const fn of this.#cleanup.splice(0)) fn();
  }

  #sync() {
    this.#selected = null;
    for (const radio of this.radios) {
      if (radio.checked) this.#selected = radio;
      const row = radio.closest<HTMLElement>('[data-ax-radio-item]');
      if (row) {
        if (radio.checked) row.setAttribute('data-selected', 'selected');
        else row.removeAttribute('data-selected');
      }
      const slot = radio.parentElement?.querySelector<HTMLElement>(':scope > [data-ax-indicator-slot]') ?? null;
      setIndicatorState(slot, radio.checked ? 'checked' : 'unchecked');
    }
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-radio-list')) {
  customElements.define('ax-radio-list', RadioListElement);
}

declare global {
  interface HTMLElementTagNameMap { 'ax-radio-list': RadioListElement }
}
