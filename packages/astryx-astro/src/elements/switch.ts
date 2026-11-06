/**
 * `<ax-switch>` — the field root of Switch (light DOM, wraps the server markup).
 * Port of the behaviour in @astryxdesign/core Switch/Switch.tsx (the onChange guard,
 * `isOn` → track / thumb state) and utils/disabledInteraction.ts (via the runtime).
 *
 *  - a toggle while busy is cancelled (the click's default is prevented); a disabled one never
 *    starts (aria-disabled → runtime/disabledInteraction cancels the click and Enter/Space);
 *  - every user toggle writes `data-checked` on the track and thumb (the thumb slides by CSS)
 *    and dispatches `astryx-change` `{isChecked, event}`;
 *  - a form reset restores the initial state.
 */
import './runtime/disabledInteraction';
import {emit, onFormReset} from './field';

export class SwitchElement extends HTMLElement {
  #input: HTMLInputElement | null = null;
  #cleanup: Array<() => void> = [];

  get input(): HTMLInputElement | null { return this.#input; }

  get checked(): boolean { return this.#input?.checked ?? false; }
  set checked(next: boolean) {
    if (!this.#input) return;
    this.#input.checked = next;
    this.#sync();
  }

  /** Astryx `value` (on / off). */
  get value(): boolean { return this.checked; }
  set value(next: boolean) { this.checked = next; }

  get isDisabled(): boolean { return this.#input?.getAttribute('aria-disabled') === 'true'; }
  get isBusy(): boolean { return this.#input?.getAttribute('aria-busy') === 'true'; }

  connectedCallback() {
    const input = this.querySelector<HTMLInputElement>('input.ax-switch-native');
    if (!input) return;
    this.#input = input;
    const onClick = (event: MouseEvent) => {
      if (this.isDisabled || this.isBusy) event.preventDefault();
    };
    const onChange = (event: Event) => {
      this.#sync();
      if (this.isDisabled || this.isBusy) return;
      emit(this, 'astryx-change', {isChecked: input.checked, event});
    };
    input.addEventListener('click', onClick);
    input.addEventListener('change', onChange);
    this.#cleanup = [
      () => input.removeEventListener('click', onClick),
      () => input.removeEventListener('change', onChange),
      onFormReset(input, () => this.#sync()),
    ];
    this.#sync();
  }

  disconnectedCallback() {
    for (const fn of this.#cleanup.splice(0)) fn();
  }

  #sync() {
    const input = this.#input;
    if (!input) return;
    const surface = input.parentElement;
    for (const part of surface?.querySelectorAll<HTMLElement>(':scope > .astryx-switch, :scope > .astryx-switch > .astryx-switch-thumb') ?? []) {
      if (input.checked) part.setAttribute('data-checked', 'checked');
      else part.removeAttribute('data-checked');
    }
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-switch')) {
  customElements.define('ax-switch', SwitchElement);
}

declare global {
  interface HTMLElementTagNameMap { 'ax-switch': SwitchElement }
}
