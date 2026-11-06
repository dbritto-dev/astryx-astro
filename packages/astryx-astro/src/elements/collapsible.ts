/**
 * <ax-collapsible> and <ax-collapsible-group> — Collapsible / CollapsibleGroup behaviour.
 * Port of @astryxdesign/core Collapsible/Collapsible.tsx (toggle, disabled guard, focus kept
 * across collapse), useCollapsible.ts (standalone vs group-controlled state),
 * CollapsibleGroup.tsx (single / multiple open set) and utils/focusReturn.ts
 * (noteFocusWithin, moveFocusLeftBehind, focusForLastInput) as sequenced by
 * utils/useFocusLeavingChange.ts.
 *
 * The server renders the state (trigger `aria-expanded` / `data-open`, content `data-open` /
 * `hidden`); the elements own it afterwards and keep those attributes in sync.
 * - Item: `<button>` click (Enter / Space natively) toggles unless `aria-disabled`.
 *   A find-in-page / text-fragment match in closed `hidden="until-found"` content opens it
 *   (`beforematch`; a reveal that happened before this script ran is picked up on connect).
 *   Grouped items (a `data-value` inside a group) defer to the nearest group.
 * - Focus inside content that closes moves to the item's trigger when it would be lost, with
 *   a ring only after keyboard input (focusForLastInput).
 * - `[data-ax-animate]`: CSS animates the height; the element marks the content
 *   `data-ax-transition` while it moves and keeps a closing content `inert` (Astryx's exit is
 *   inert) until the transition ends.
 *
 * Item API: `isOpen` (get/set), `open()`, `close()`, `toggle()`, `value`, `isDisabled`.
 * Group API: `value` (string | string[], settable), `type`, `items`.
 * Events (bubbling, composed), after user input only:
 *   item  `astryx-open-change` {isOpen}  — standalone items (Astryx onOpenChange)
 *   group `astryx-change` {value}        — string ('' when none) in single mode, string[] in
 *                                          multiple mode (Astryx onChange)
 * Programmatic changes (setters, methods) do not dispatch, like a controlled prop update.
 */

type Modality = 'keyboard' | 'pointer';
type GroupType = 'single' | 'multiple';

import {focusForLastInput as runtimeFocusForLastInput, getModality, trackModality} from './runtime/modality';

trackModality();

/** The shared runtime's last input; a screen-reader (virtual) activation counts as keyboard here. */
function inferModality(): Modality {
  return getModality() === 'pointer' ? 'pointer' : 'keyboard';
}

/** focusReturn.ts focusForLastInput, via the shared modality runtime. */
function focusForLastInput(element: HTMLElement, modality: Modality): void {
  runtimeFocusForLastInput(element, undefined, modality);
}

/** focusReturn.ts isFocusLost: nothing focused, or focus still inside `surface`. */
function isFocusLost(surface: Element | null): boolean {
  const active = document.activeElement;
  return active == null || active === document.body || (surface != null && surface.contains(active));
}

function parseValues(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string');
    return typeof parsed === 'string' ? [parsed] : [];
  } catch {
    return [raw];
  }
}

function normalizeToArray(value: string | string[] | null | undefined): string[] {
  if (value == null) return [];
  return Array.isArray(value) ? [...value] : [value];
}

function transitionTime(el: Element): number {
  const cs = getComputedStyle(el);
  const list = (v: string) => v.split(',').map((s) => parseFloat(s) * (s.trim().endsWith('ms') ? 1 : 1000) || 0);
  const durations = list(cs.transitionDuration);
  const delays = list(cs.transitionDelay);
  return durations.reduce((max, d, i) => Math.max(max, d + (delays[i % delays.length] ?? 0)), 0);
}

class AxCollapsible extends HTMLElement {
  #cleanup: Array<() => void> = [];
  #transitionTimer = 0;
  #transitionEnd: (() => void) | null = null;

  get #trigger(): HTMLButtonElement | null {
    return this.querySelector<HTMLButtonElement>(':scope > .astryx-collapsible-trigger');
  }

  get #content(): HTMLElement | null {
    return this.querySelector<HTMLElement>(':scope > .astryx-collapsible-content');
  }

  // ── Public API ──────────────────────────────────────────────────────────
  get value(): string | null {
    return this.getAttribute('data-value');
  }

  get isOpen(): boolean {
    return this.#trigger?.getAttribute('aria-expanded') === 'true';
  }

  set isOpen(next: boolean) {
    this.#request(Boolean(next), inferModality(), false);
  }

  get isDisabled(): boolean {
    return this.#trigger?.getAttribute('aria-disabled') === 'true';
  }

  /** The group that owns this item's state (nearest, and only with a `value`). */
  get group(): AxCollapsibleGroup | null {
    if (this.value == null) return null;
    const group = this.parentElement?.closest('ax-collapsible-group');
    return group instanceof AxCollapsibleGroup ? group : null;
  }

  open(): void {
    this.#request(true, inferModality(), false);
  }

  close(): void {
    this.#request(false, inferModality(), false);
  }

  toggle(): void {
    this.#request(!this.isOpen, inferModality(), false);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────
  connectedCallback() {
    const trigger = this.#trigger;
    const content = this.#content;
    if (!trigger || !content) return;
    const onClick = (event: MouseEvent) => {
      // aria-disabled, not native disabled: the guard blocks activation (Collapsible.tsx).
      if (this.isDisabled) return;
      this.#request(!this.isOpen, event.detail === 0 ? 'keyboard' : 'pointer', true);
    };
    const onBeforeMatch = () => this.#request(true, 'keyboard', true);
    trigger.addEventListener('click', onClick);
    content.addEventListener('beforematch', onBeforeMatch);
    this.#cleanup.push(
      () => trigger.removeEventListener('click', onClick),
      () => content.removeEventListener('beforematch', onBeforeMatch),
    );
    // Revealed by find-in-page before the element upgraded: adopt the open state.
    if (!this.isOpen && !content.hasAttribute('hidden')) this.#request(true, 'keyboard', true);
  }

  disconnectedCallback() {
    for (const fn of this.#cleanup.splice(0)) fn();
    this.#finishTransition();
  }

  // ── State ───────────────────────────────────────────────────────────────
  #request(next: boolean, modality: Modality, isUserInput: boolean) {
    const group = this.group;
    if (group) {
      group.setItemOpen(this.value!, next, {modality, isUserInput});
      return;
    }
    if (next === this.isOpen) return;
    this.applyOpen(next, modality);
    if (isUserInput) {
      this.dispatchEvent(new CustomEvent('astryx-open-change', {bubbles: true, composed: true, detail: {isOpen: next}}));
    }
  }

  /** Write an open state (also called by the owning group). @internal */
  applyOpen(next: boolean, modality: Modality = inferModality()): void {
    const trigger = this.#trigger;
    const content = this.#content;
    if (!trigger || !content || next === this.isOpen) return;
    // noteFocusWithin: focus inside the content before the change hides it.
    const active = document.activeElement;
    const noted = !next && active != null && content.contains(active);
    const isAnimated = this.hasAttribute('data-ax-animate');

    trigger.setAttribute('aria-expanded', String(next));
    for (const part of [trigger, content]) {
      if (next) part.setAttribute('data-open', 'open');
      else part.removeAttribute('data-open');
    }
    if (isAnimated) this.#startTransition(content, next);
    if (next) {
      content.removeAttribute('hidden');
    } else {
      content.setAttribute('hidden', this.isDisabled ? '' : 'until-found');
    }

    // moveFocusLeftBehind: only when the change lost it (content hidden or exiting).
    if (noted && (isAnimated || isFocusLost(content))) focusForLastInput(trigger, modality);
  }

  #startTransition(content: HTMLElement, opening: boolean) {
    this.#finishTransition();
    content.setAttribute('data-ax-transition', '');
    if (!opening) content.inert = true;
    const end = () => this.#finishTransition();
    const onEnd = (e: TransitionEvent) => { if (e.target === content) end(); };
    content.addEventListener('transitionend', onEnd);
    content.addEventListener('transitioncancel', onEnd);
    this.#transitionEnd = () => {
      content.removeEventListener('transitionend', onEnd);
      content.removeEventListener('transitioncancel', onEnd);
      content.removeAttribute('data-ax-transition');
      content.inert = false;
    };
    // The style change lands after the attribute writes; read the timing in the next frame.
    requestAnimationFrame(() => {
      if (this.#transitionEnd == null) return;
      const ms = transitionTime(content);
      this.#transitionTimer = window.setTimeout(end, ms + 50);
    });
  }

  #finishTransition() {
    window.clearTimeout(this.#transitionTimer);
    const fn = this.#transitionEnd;
    this.#transitionEnd = null;
    fn?.();
  }
}

class AxCollapsibleGroup extends HTMLElement {
  #values: string[] = [];
  #initialized = false;

  connectedCallback() {
    if (!this.#initialized) {
      this.#values = parseValues(this.getAttribute('data-value'));
      this.#initialized = true;
    }
  }

  get type(): GroupType {
    return this.getAttribute('data-type') === 'multiple' ? 'multiple' : 'single';
  }

  /** Open item(s): a string in single mode ('' when none), an array in multiple mode. */
  get value(): string | string[] {
    return this.type === 'single' ? (this.#values[0] ?? '') : [...this.#values];
  }

  set value(next: string | string[]) {
    this.#set(normalizeToArray(next), inferModality());
  }

  /** The items this group owns (nearest group wins). */
  get items(): AxCollapsible[] {
    return [...this.querySelectorAll('ax-collapsible[data-value]')].filter(
      (el): el is AxCollapsible => el instanceof AxCollapsible && el.group === this,
    );
  }

  /** CollapsibleGroup `toggle(value)`, reached when `open` differs from the item's state. @internal */
  setItemOpen(itemValue: string, open: boolean, {modality, isUserInput}: {modality: Modality; isUserInput: boolean}): void {
    if (!this.#initialized) this.connectedCallback();
    const isOpen = this.#values.includes(itemValue);
    if (isOpen === open) return;
    let nextValues: string[];
    if (this.type === 'single') {
      // Toggling an open item closes it; toggling a closed item opens it (and closes others).
      nextValues = isOpen ? [] : [itemValue];
    } else {
      nextValues = isOpen ? this.#values.filter((v) => v !== itemValue) : [...this.#values, itemValue];
    }
    this.#set(nextValues, modality);
    if (isUserInput) {
      const value = this.type === 'single' ? (nextValues[0] ?? '') : nextValues;
      this.dispatchEvent(new CustomEvent('astryx-change', {bubbles: true, composed: true, detail: {value}}));
    }
  }

  #set(values: string[], modality: Modality) {
    this.#values = values;
    this.#initialized = true;
    this.setAttribute('data-value', JSON.stringify(values));
    for (const item of this.items) item.applyOpen(values.includes(item.value!), modality);
  }
}

if (!customElements.get('ax-collapsible-group')) customElements.define('ax-collapsible-group', AxCollapsibleGroup);
if (!customElements.get('ax-collapsible')) customElements.define('ax-collapsible', AxCollapsible);

declare global {
  interface HTMLElementTagNameMap {
    'ax-collapsible': AxCollapsible;
    'ax-collapsible-group': AxCollapsibleGroup;
  }
}

export type {AxCollapsible, AxCollapsibleGroup};
