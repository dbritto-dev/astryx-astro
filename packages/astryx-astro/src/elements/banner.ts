/**
 * <ax-banner> — Banner's dismiss and expand behaviour. Port of @astryxdesign/core
 * Banner/Banner.tsx (handleDismiss with the focus-origin hand-off, the useCollapsible toggle,
 * aria-controls only while the region shows) and Collapsible/useCollapsible.ts (controlled
 * vs uncontrolled open state).
 *
 * The server renders the state (toggle `aria-expanded` / `aria-controls`, content `hidden`);
 * the element owns it afterwards.
 * - Toggle (`[data-ax-banner-toggle]`): flips the content region, its translated
 *   Expand/Collapse name (`data-ax-expand-label` / `data-ax-collapse-label`) and the chevron
 *   (CSS on `aria-expanded`). Controlled banners (`data-ax-controlled`) only dispatch.
 * - Dismiss (`[data-ax-banner-dismiss]`): hides the banner (`hidden`) and moves focus back to
 *   the element it came from before entering the banner (focusin relatedTarget, or the
 *   active element at pointerdown), so a keyboard user keeps their place.
 * Events (bubbling, composed): `astryx-open-change` {isOpen} after a user toggle,
 * `astryx-dismiss` {} after a dismiss.
 * API: `isOpen` (get/set), `open()`, `close()`, `toggle()`, `dismiss()`, `isDismissed`.
 */
import {focusForLastInput, getModality} from './runtime/modality';

class AxBanner extends HTMLElement {
  #cleanup: Array<() => void> = [];
  #focusOrigin: HTMLElement | null = null;

  get #toggleButton(): HTMLElement | null {
    return this.querySelector<HTMLElement>(':scope > .astryx-banner [data-ax-banner-toggle]');
  }

  get #content(): HTMLElement | null {
    return this.querySelector<HTMLElement>(':scope > .astryx-banner-content');
  }

  get isOpen(): boolean {
    const content = this.#content;
    return content != null && !content.hidden;
  }

  set isOpen(next: boolean) {
    this.#apply(Boolean(next));
  }

  get isDismissed(): boolean {
    // `hidden` may be 'until-found' (still hidden).
    return this.hidden !== false;
  }

  open(): void { this.#apply(true); }
  close(): void { this.#apply(false); }
  toggle(): void { this.#apply(!this.isOpen); }

  dismiss(): void {
    this.#dismiss(false);
  }

  #dismiss(isUserInput: boolean) {
    if (this.hidden) return;
    const origin = this.#focusOrigin;
    // Move focus before the subtree hides, so no frame has the focused node gone. A user
    // dismiss always hands focus back (Astryx); a programmatic one only when focus is inside.
    if ((isUserInput || this.contains(document.activeElement)) && origin?.isConnected) {
      focusForLastInput(origin, undefined, getModality());
    }
    this.hidden = true;
    this.dispatchEvent(new CustomEvent('astryx-dismiss', {bubbles: true, composed: true, detail: {}}));
  }

  connectedCallback() {
    const remember = (candidate: EventTarget | null) => {
      if (candidate instanceof HTMLElement && candidate !== document.body && !this.contains(candidate)) {
        this.#focusOrigin = candidate;
      }
    };
    const onFocusIn = (event: FocusEvent) => remember(event.relatedTarget);
    const onPointerDown = () => remember(document.activeElement);
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const control = target?.closest<HTMLElement>('[data-ax-banner-toggle], [data-ax-banner-dismiss]');
      if (!control || !this.contains(control) || control.closest('ax-banner') !== this) return;
      if (control.getAttribute('aria-disabled') === 'true') return;
      if (control.hasAttribute('data-ax-banner-dismiss')) {
        this.#dismiss(true);
        return;
      }
      const next = !this.isOpen;
      if (!this.hasAttribute('data-ax-controlled')) this.#apply(next);
      this.dispatchEvent(new CustomEvent('astryx-open-change', {bubbles: true, composed: true, detail: {isOpen: next}}));
    };
    this.addEventListener('focusin', onFocusIn, true);
    this.addEventListener('pointerdown', onPointerDown, true);
    this.addEventListener('click', onClick);
    this.#cleanup.push(
      () => this.removeEventListener('focusin', onFocusIn, true),
      () => this.removeEventListener('pointerdown', onPointerDown, true),
      () => this.removeEventListener('click', onClick),
    );
  }

  disconnectedCallback() {
    for (const fn of this.#cleanup.splice(0)) fn();
  }

  #apply(next: boolean) {
    const content = this.#content;
    const toggle = this.#toggleButton;
    if (!content || !toggle || next === this.isOpen) return;
    content.hidden = !next;
    toggle.setAttribute('aria-expanded', String(next));
    if (next) toggle.setAttribute('aria-controls', content.id);
    else toggle.removeAttribute('aria-controls');
    const label = toggle.getAttribute(next ? 'data-ax-collapse-label' : 'data-ax-expand-label');
    if (label) toggle.setAttribute('aria-label', label);
  }
}

if (!customElements.get('ax-banner')) customElements.define('ax-banner', AxBanner);

declare global {
  interface HTMLElementTagNameMap {
    'ax-banner': AxBanner;
  }
}
