/**
 * `<ax-chat-tool-calls>` and `<ax-chat-composer-drawer>` — the two Chat disclosures.
 * Ports of the toggle state of @astryxdesign/core Chat/ChatToolCalls.tsx (group header and
 * CallRow details) and Chat/ChatComposerDrawer.tsx. Light DOM: the server renders every state
 * (both header views, the detail hidden, the content `inert` while collapsed); the elements
 * only flip attributes.
 *
 * Toggles are `role="button"` elements: click, Enter and Space (keydown, preventDefault) as
 * in Astryx. User toggles dispatch (bubbling, composed):
 *   - `astryx-expanded-change` {isExpanded} on `<ax-chat-tool-calls>` (the group header);
 *     a row's own detail has no event (CallRow keeps it as internal state).
 *   - `astryx-collapsed-change` {isCollapsed} on `<ax-chat-composer-drawer>`.
 * API: `toolCalls.isExpanded`, `drawer.isCollapsed` (setters change the state silently).
 */
import {defineElement} from './runtime/layer';

const Base: typeof HTMLElement = typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement;

const isActivationKey = (e: KeyboardEvent) => e.key === 'Enter' || e.key === ' ';

function emit(target: Element, name: string, detail: unknown) {
  target.dispatchEvent(new CustomEvent(name, {detail, bubbles: true, composed: true}));
}

/** Rows and headers that belong to this element, not to a nested one. */
function owned<T extends Element>(host: Element, el: T | null, tag: string): T | null {
  return el && el.closest(tag) === host ? el : null;
}

export class ChatToolCallsElement extends Base {
  #onClick = (event: MouseEvent) => this.#activate(event.target);
  #onKeyDown = (event: KeyboardEvent) => {
    if (!isActivationKey(event)) return;
    if (this.#activate(event.target)) event.preventDefault();
  };

  connectedCallback(): void {
    this.addEventListener('click', this.#onClick);
    this.addEventListener('keydown', this.#onKeyDown);
  }

  disconnectedCallback(): void {
    this.removeEventListener('click', this.#onClick);
    this.removeEventListener('keydown', this.#onKeyDown);
  }

  get #header(): HTMLElement | null {
    return owned(this, this.querySelector<HTMLElement>(':scope > [data-ax-chat-tool-toggle]'), 'ax-chat-tool-calls');
  }

  get isExpanded(): boolean {
    return this.#header?.getAttribute('aria-expanded') === 'true';
  }

  set isExpanded(next: boolean) {
    const header = this.#header;
    if (!header) return;
    next = !!next;
    header.setAttribute('aria-expanded', String(next));
    for (const view of header.querySelectorAll<HTMLElement>('[data-ax-view]')) view.hidden = (view.getAttribute('data-ax-view') === 'expanded') !== next;
    const content = this.querySelector<HTMLElement>(`#${CSS.escape(header.getAttribute('aria-controls') ?? '')}`);
    if (content) {
      content.toggleAttribute('data-ax-expanded', next);
      content.inert = !next;
    }
  }

  /** Whether `target` was a toggle of this element (and it acted). */
  #activate(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    const header = target.closest<HTMLElement>('[data-ax-chat-tool-toggle]');
    if (header && owned(this, header, 'ax-chat-tool-calls')) {
      const next = !this.isExpanded;
      this.isExpanded = next;
      emit(this, 'astryx-expanded-change', {isExpanded: next});
      return true;
    }
    const row = target.closest<HTMLElement>('[data-ax-detail]');
    if (!row || !owned(this, row, 'ax-chat-tool-calls')) return false;
    const detailId = row.getAttribute('data-ax-detail') ?? '';
    const detail = this.querySelector<HTMLElement>(`#${CSS.escape(detailId)}`);
    const open = row.getAttribute('aria-expanded') !== 'true';
    row.setAttribute('aria-expanded', String(open));
    if (open) row.setAttribute('aria-controls', detailId);
    else row.removeAttribute('aria-controls');
    if (detail) detail.hidden = !open;
    return true;
  }
}

export class ChatComposerDrawerElement extends Base {
  #onClick = (event: MouseEvent) => {
    if (this.#toggleOf(event.target)) this.#toggle();
  };
  #onKeyDown = (event: KeyboardEvent) => {
    if (!isActivationKey(event) || !this.#toggleOf(event.target)) return;
    event.preventDefault();
    this.#toggle();
  };

  connectedCallback(): void {
    this.addEventListener('click', this.#onClick);
    this.addEventListener('keydown', this.#onKeyDown);
  }

  disconnectedCallback(): void {
    this.removeEventListener('click', this.#onClick);
    this.removeEventListener('keydown', this.#onKeyDown);
  }

  #toggleOf(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    return owned(this, target.closest<HTMLElement>('[data-ax-chat-drawer-toggle]'), 'ax-chat-composer-drawer');
  }

  get isCollapsed(): boolean {
    return this.hasAttribute('data-collapsed');
  }

  set isCollapsed(next: boolean) {
    next = !!next;
    if (next) this.setAttribute('data-collapsed', 'collapsed');
    else this.removeAttribute('data-collapsed');
    const toggle = this.querySelector<HTMLElement>(':scope > [data-ax-chat-drawer-toggle]');
    if (toggle) {
      toggle.setAttribute('aria-expanded', String(!next));
      const label = toggle.getAttribute(next ? 'data-ax-expand-label' : 'data-ax-collapse-label');
      if (label) toggle.setAttribute('aria-label', label);
    }
    const grid = this.querySelector<HTMLElement>(':scope > .ax-chat-drawer-grid');
    if (grid?.hasAttribute('data-ax-can-collapse')) {
      grid.toggleAttribute('data-ax-collapsed', next);
      grid.inert = next;
    }
  }

  #toggle() {
    const next = !this.isCollapsed;
    this.isCollapsed = next;
    emit(this, 'astryx-collapsed-change', {isCollapsed: next});
  }
}

defineElement('ax-chat-tool-calls', ChatToolCallsElement);
defineElement('ax-chat-composer-drawer', ChatComposerDrawerElement);

declare global {
  interface HTMLElementTagNameMap {
    'ax-chat-tool-calls': ChatToolCallsElement;
    'ax-chat-composer-drawer': ChatComposerDrawerElement;
  }
}
