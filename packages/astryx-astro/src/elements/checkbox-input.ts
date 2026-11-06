/**
 * `<ax-checkbox-input>` — the root of CheckboxInput (light DOM, wraps the server markup).
 * Port of the behaviour in @astryxdesign/core CheckboxInput/CheckboxInput.tsx (the
 * indeterminate ref, the onChange guards, handleRowPointerDown / handleRowClick) and
 * utils/disabledInteraction.ts (via runtime/disabledInteraction).
 *
 *  - sets the native `indeterminate` property from `data-ax-indeterminate` (an attribute cannot);
 *  - a toggle while read-only or busy is cancelled (the click's default is prevented, which
 *    restores checked and indeterminate); a disabled one never starts (aria-disabled →
 *    runtime/disabledInteraction cancels the click and Enter/Space);
 *  - every user toggle redraws the indicator (elements/indicator-state.ts) and dispatches
 *    `astryx-change` `{isChecked, event}`;
 *  - under a coarse pointer a press that starts on the row's hit band (outside the row's box)
 *    toggles the checkbox, as a tap on the box does (a click from code never does);
 *  - a form reset restores the initial checked / indeterminate state.
 */
import './runtime/disabledInteraction';
import {emit, onFormReset} from './field';
import {setIndicatorState} from './indicator-state';

export class CheckboxInputElement extends HTMLElement {
  #input: HTMLInputElement | null = null;
  #cleanup: Array<() => void> = [];

  get input(): HTMLInputElement | null { return this.#input; }

  get checked(): boolean { return this.#input?.checked ?? false; }
  set checked(next: boolean) {
    if (!this.#input) return;
    this.#input.indeterminate = false;
    this.#input.checked = next;
    this.#sync();
  }

  get indeterminate(): boolean { return this.#input?.indeterminate ?? false; }
  set indeterminate(next: boolean) {
    if (!this.#input) return;
    this.#input.indeterminate = next;
    this.#sync();
  }

  /** Astryx `value`: `true` | `false` | `'indeterminate'`. */
  get value(): boolean | 'indeterminate' {
    return this.indeterminate ? 'indeterminate' : this.checked;
  }
  set value(next: boolean | 'indeterminate') {
    if (!this.#input) return;
    this.#input.indeterminate = next === 'indeterminate';
    this.#input.checked = next === true;
    this.#sync();
  }

  get isDisabled(): boolean { return this.#input?.getAttribute('aria-disabled') === 'true'; }
  get isReadOnly(): boolean { return this.#input?.getAttribute('aria-readonly') === 'true'; }
  get isBusy(): boolean { return this.#input?.getAttribute('aria-busy') === 'true'; }

  connectedCallback() {
    const input = this.querySelector<HTMLInputElement>('input.ax-checkbox-native');
    if (!input) return;
    this.#input = input;
    const initialIndeterminate = this.hasAttribute('data-ax-indeterminate');
    input.indeterminate = initialIndeterminate;

    // Read-only and busy checkboxes keep their state: cancel the activation (the browser
    // restores checked and indeterminate). Disabled ones are cancelled by the runtime first.
    const onClick = (event: MouseEvent) => {
      if (this.isDisabled || this.isReadOnly || this.isBusy) event.preventDefault();
    };
    const onChange = (event: Event) => {
      this.#sync();
      if (this.isDisabled || this.isReadOnly || this.isBusy) return;
      emit(this, 'astryx-change', {isChecked: input.checked, event});
    };
    input.addEventListener('click', onClick);
    input.addEventListener('change', onChange);
    this.#cleanup.push(
      () => input.removeEventListener('click', onClick),
      () => input.removeEventListener('change', onChange),
    );

    // The coarse-pointer hit band: where a press on the row itself began.
    const row = this.querySelector<HTMLElement>(':scope > .ax-checkbox-row');
    if (row?.hasAttribute('data-ax-hit-area')) {
      let press: {x: number; y: number} | null = null;
      const onRowDown = (event: PointerEvent) => {
        press = event.target === row ? {x: event.clientX, y: event.clientY} : null;
      };
      const onRowClick = (event: MouseEvent) => {
        const start = press;
        press = null;
        if (start == null || event.detail === 0 || event.target !== row) return;
        const box = row.getBoundingClientRect();
        const isOnBand = start.x < box.left || start.x > box.right || start.y < box.top || start.y > box.bottom;
        if (isOnBand) input.click();
      };
      row.addEventListener('pointerdown', onRowDown);
      row.addEventListener('click', onRowClick);
      this.#cleanup.push(
        () => row.removeEventListener('pointerdown', onRowDown),
        () => row.removeEventListener('click', onRowClick),
      );
    }

    this.#cleanup.push(onFormReset(input, () => {
      input.indeterminate = initialIndeterminate;
      this.#sync();
    }));
    this.#sync();
  }

  disconnectedCallback() {
    for (const fn of this.#cleanup.splice(0)) fn();
  }

  #sync() {
    const input = this.#input;
    if (!input) return;
    const state = input.indeterminate ? 'indeterminate' : input.checked ? 'checked' : 'unchecked';
    setIndicatorState(this.querySelector<HTMLElement>('.ax-checkbox-box > [data-ax-indicator-slot]'), state);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-checkbox-input')) {
  customElements.define('ax-checkbox-input', CheckboxInputElement);
}

declare global {
  interface HTMLElementTagNameMap { 'ax-checkbox-input': CheckboxInputElement }
}
