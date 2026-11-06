// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Port of @astryxdesign/core 0.7.9 src/Chat/ChatComposer.tsx, ChatContext.tsx
// (composer context) and ChatSendButton.tsx.

/**
 * `<ax-chat-composer>` — the composer shell's state (Astryx ChatComposerContext): the draft
 * value (tracked from the input's `astryx-change`), `isDisabled`, `isStopShown`, `canSend`,
 * submit, the default send / stop button, click-to-focus, the keyboard-only editor focus ring
 * and status announcements (useAnnounceRenderedText: errors assertive, warnings polite, once
 * per occasion, silent for a status shown with the page).
 *
 * Send button (`[data-ax-chat-send]`, also standalone): a click dispatches cancelable
 * `astryx-send` (send state) or `astryx-stop` (stop state). The composer answers
 * `astryx-send` from its own button with `submit()` unless prevented.
 */
import './runtime/modality';
import {createRenderedTextAnnouncer} from './runtime/announce';
import {defineBehavior} from './behavior';
import {defineElement} from './runtime/layer';
import {getModality} from './runtime/modality';
import type {ChatComposerInputElement, ChatSubmitToken} from './chat-composer-input';

const Base: typeof HTMLElement = typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement;

export interface ChatComposerStatus {
  type: 'error' | 'warning';
  message?: string;
}

export interface ChatComposerInputControl {
  focus(): void;
}

const EDITOR_SELECTOR =
  'textarea, [contenteditable="true"], [role="textbox"], [role="combobox"][contenteditable], input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="tel"], input[type="password"]';

/**
 * Switch a ChatSendButton between its send and stop states (Astryx: label, variant, icon,
 * `isDisabled={!isStopShown && isDisabled}`). Props the button was rendered with stay fixed.
 */
export function setChatSendButtonState(button: HTMLElement, state: {isStopShown: boolean; isDisabled: boolean}): void {
  const fixedStop = button.getAttribute('data-ax-fixed-stop');
  const fixedDisabled = button.getAttribute('data-ax-fixed-disabled');
  const isStop = fixedStop != null ? fixedStop === 'true' : state.isStopShown;
  const isDisabled = !isStop && (fixedDisabled != null ? fixedDisabled === 'true' : state.isDisabled);
  button.toggleAttribute('data-ax-stop-shown', isStop);
  button.setAttribute('data-variant', isStop ? 'secondary' : 'primary');
  const label = button.getAttribute(isStop ? 'data-ax-stop-label' : 'data-ax-send-label');
  if (label) button.setAttribute('aria-label', label);
  for (const icon of button.querySelectorAll<HTMLElement>('[data-ax-chat-icon]')) {
    const kind = icon.getAttribute('data-ax-chat-icon');
    if (kind === 'send' || kind === 'stop') icon.hidden = (kind === 'stop') !== isStop;
  }
  (button as HTMLButtonElement).disabled = isDisabled;
  button.toggleAttribute('data-ax-disabled', isDisabled);
}

// One click listener per send button (it must stay a native <button> inside Button's markup).
defineBehavior('chat-send', (button) => {
  const onClick = () => {
    if ((button as HTMLButtonElement).disabled) return;
    const name = button.hasAttribute('data-ax-stop-shown') ? 'astryx-stop' : 'astryx-send';
    button.dispatchEvent(new CustomEvent(name, {detail: {}, bubbles: true, composed: true, cancelable: true}));
  };
  button.addEventListener('click', onClick);
  return () => button.removeEventListener('click', onClick);
});

export class ChatComposerElement extends Base {
  #value = '';
  #inputControl: ChatComposerInputControl | null = null;
  #announcers = new Map<string, ReturnType<typeof createRenderedTextAnnouncer>>();
  #announcerTarget: HTMLElement | null = null;
  #status: ChatComposerStatus | null = null;
  #cleanup: Array<() => void> = [];

  connectedCallback(): void {
    const body = this.#body;
    // The input may not be upgraded yet: read the server draft from its editor.
    const input = this.#input;
    const editor = body?.querySelector<HTMLElement>('[data-ax-chat-editable]');
    const initial = typeof input?.getTokens === 'function' ? input.value : (editor?.textContent ?? '');
    this.#value = initial.trim() === '' ? '' : initial;
    const on = (target: EventTarget, type: string, fn: (e: Event) => void, capture = false) => {
      target.addEventListener(type, fn, capture);
      this.#cleanup.push(() => target.removeEventListener(type, fn, capture));
    };
    on(this, 'astryx-change', (e) => {
      if (!this.#owns(e.target)) return;
      const value = (e as CustomEvent<{value?: unknown}>).detail?.value;
      if (typeof value !== 'string') return;
      this.#value = value;
      this.#syncSend();
    });
    on(this, 'astryx-send', (e) => {
      if (e.defaultPrevented || !this.#owns(e.target)) return;
      this.submit();
    });
    if (body) {
      on(body, 'click', (e) => this.#onBodyClick(e as MouseEvent));
      on(body, 'pointerdown', () => body.removeAttribute('data-ax-keyboard-focus'), true);
      on(body, 'focusin', (e) => {
        const target = e.target;
        body.toggleAttribute('data-ax-keyboard-focus', target instanceof HTMLElement && target.matches(EDITOR_SELECTOR) && getModality(target) === 'keyboard');
      }, true);
      on(body, 'focusout', (e) => {
        const next = (e as FocusEvent).relatedTarget;
        if (!(next instanceof Node) || !body.contains(next)) body.removeAttribute('data-ax-keyboard-focus');
      }, true);
    }
    const shown = this.#statusElement;
    if (shown) {
      // Rendered with the page: register silently so later changes are new occasions.
      const type = shown.getAttribute('data-ax-type') ?? '';
      this.#status = {type: type === 'error' ? 'error' : 'warning', message: shown.querySelector('[data-ax-status-message]')?.textContent ?? undefined};
      this.#announcer(shown, type === 'error' ? 'assertive' : 'polite').sync(Boolean(this.#status.message), type);
    }
    this.#syncSend();
  }

  disconnectedCallback(): void {
    for (const fn of this.#cleanup.splice(0)) fn();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** The draft. Setting it replaces the input's content (no change event). */
  get value(): string { return this.#value; }
  set value(next: string) {
    this.#value = next ?? '';
    const input = this.#input;
    if (input && input.value !== this.#value) input.value = this.#value;
    this.#syncSend();
  }

  get isDisabled(): boolean { return this.hasAttribute('data-ax-disabled'); }
  set isDisabled(next: boolean) {
    this.toggleAttribute('data-ax-disabled', !!next);
    const input = this.#input;
    if (input) input.isDisabled = !!next;
    this.#syncSend();
  }

  get isStopShown(): boolean { return this.hasAttribute('data-ax-stop-shown'); }
  set isStopShown(next: boolean) {
    this.toggleAttribute('data-ax-stop-shown', !!next);
    this.#syncSend();
  }

  /** The draft has non-whitespace content and the composer is enabled. */
  get canSend(): boolean { return this.#value.trim().length > 0 && !this.isDisabled; }

  /** A custom input registers its focus control (Astryx inputControlRef). */
  get inputControl(): ChatComposerInputControl | null { return this.#inputControl; }
  set inputControl(next: ChatComposerInputControl | null) { this.#inputControl = next; }

  get status(): ChatComposerStatus | null { return this.#status; }
  set status(next: ChatComposerStatus | null) {
    this.#status = next ?? null;
    this.#renderStatus();
  }

  /** Submit the trimmed draft: `astryx-submit` {value, tokens}, then clear. */
  submit(value: string = this.#value, tokens?: ChatSubmitToken[]): void {
    const trimmed = value.trim();
    if (!trimmed || this.isDisabled) return;
    const detail = {value: trimmed, tokens: tokens ?? this.#input?.getTokens() ?? []};
    this.dispatchEvent(new CustomEvent('astryx-submit', {detail, bubbles: true, composed: true}));
    this.value = '';
  }

  /** Request a stop (as the stop button does). */
  stop(): void {
    this.dispatchEvent(new CustomEvent('astryx-stop', {detail: {}, bubbles: true, composed: true}));
  }

  /** Focus the input with the caret after the draft. */
  focusInput(): void {
    if (this.#inputControl) {
      this.#inputControl.focus();
      return;
    }
    const input = this.#input;
    if (input) {
      input.focusAtEnd();
      return;
    }
    this.#body?.querySelector<HTMLElement>('[contenteditable="true"], textarea')?.focus();
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  get #body(): HTMLElement | null {
    return this.querySelector<HTMLElement>(':scope > [data-ax-chat-body]');
  }

  get #input(): ChatComposerInputElement | null {
    const input = this.#body?.querySelector('ax-chat-composer-input') as ChatComposerInputElement | null;
    return input && input.closest('ax-chat-composer') === this ? input : null;
  }

  get #statusElement(): HTMLElement | null {
    return this.querySelector<HTMLElement>(':scope > [data-ax-chat-status]');
  }

  #owns(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest('ax-chat-composer') === this;
  }

  #syncSend() {
    const isDisabled = !this.canSend;
    for (const button of this.querySelectorAll<HTMLElement>('[data-ax-chat-send]')) {
      if (button.closest('ax-chat-composer') !== this) continue;
      setChatSendButtonState(button, {isStopShown: this.isStopShown, isDisabled});
    }
  }

  #onBodyClick(event: MouseEvent) {
    const target = event.target as Element | null;
    // Empty body space focuses the input; controls, links, the editor and tokens keep the click.
    if (!target || target.closest('button, a, [role="button"], [contenteditable="true"], [data-astryx-token]')) return;
    this.focusInput();
  }

  #announcer(el: HTMLElement, politeness: 'polite' | 'assertive') {
    if (this.#announcerTarget !== el) {
      this.#announcers.clear();
      this.#announcerTarget = el;
    }
    let announcer = this.#announcers.get(politeness);
    if (!announcer) {
      announcer = createRenderedTextAnnouncer(el, {skipFirstRender: true, politeness});
      this.#announcers.set(politeness, announcer);
    }
    return announcer;
  }

  #renderStatus() {
    const status = this.#status;
    let el = this.#statusElement;
    if (!status) {
      for (const a of this.#announcers.values()) a.sync(false);
      el?.remove();
      return;
    }
    if (!el) {
      const tpl = this.querySelector<HTMLTemplateElement>(':scope > template[data-ax-status-template]');
      el = tpl?.content.firstElementChild?.cloneNode(true) as HTMLElement | null;
      if (!el) return;
      const position = this.getAttribute('data-ax-status-position') === 'top' ? 'top' : 'bottom';
      el.setAttribute('data-ax-position', position);
      if (position === 'top') {
        const first = [...this.children].find((c) => c.tagName !== 'TEMPLATE');
        this.insertBefore(el, first ?? null);
      } else {
        this.append(el);
      }
    }
    el.setAttribute('data-ax-type', status.type);
    for (const icon of el.querySelectorAll<HTMLElement>('[data-ax-status-icon]')) icon.hidden = icon.getAttribute('data-ax-status-icon') !== status.type;
    const message = el.querySelector('[data-ax-status-message]');
    if (message) message.textContent = status.message ?? '';
    const politeness = status.type === 'error' ? 'assertive' : 'polite';
    for (const [p, a] of this.#announcers) if (p !== politeness) a.sync(false);
    this.#announcer(el, politeness).sync(Boolean(status.message), status.type);
  }
}

defineElement('ax-chat-composer', ChatComposerElement);

declare global {
  interface HTMLElementTagNameMap {
    'ax-chat-composer': ChatComposerElement;
  }
}
