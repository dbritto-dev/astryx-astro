/**
 * `<ax-side-nav>` — the collapse state of a collapsible SideNav. Port of the state half of
 * @astryxdesign/core SideNav/SideNav.tsx (toggle, the collapse context, useFocusLeavingChange +
 * moveFocusLeftBehind for AR3, the autoSaveId persistence of useResizable) and
 * SideNavCollapseButton.tsx.
 *
 * Markup (SideNav.astro): `<ax-side-nav data-ax-nav="<nav id>" data-ax-collapsible
 * [data-ax-save-id="astryx-side-nav:<id>"]>` (display: contents) around the `<nav>` that carries
 * `data-ax-collapsed="true|false"`. Toggles: `[data-ax-side-nav-toggle=""]` inside the nav, or
 * `[data-ax-side-nav-toggle="<nav id>"]` anywhere in the document (SideNavCollapseButton
 * `controls`); their label follows `data-ax-label-expand` / `data-ax-label-collapse`.
 *
 * A change dispatches `astryx-collapse-change` {isCollapsed} from the nav (bubbling, cancelable:
 * `preventDefault()` keeps the state — Astryx `onCollapsedChange` with a controlled config), then:
 *  - writes `data-ax-collapsed` on the nav and the toggles (CSS swaps the presentations),
 *  - names rail leaves (`data-ax-rail-label` → `aria-label`) and enables their tooltips
 *    (`data-ax-rail-describedby` joins `aria-describedby`; the layer's `data-ax-enabled`),
 *  - closes rail flyouts / tooltips that no longer show,
 *  - moves focus the change took away (AR3): to the same row's other control, else the collapse
 *    toggle, else the nearest kept row before it (then after it),
 *  - persists `{isCollapsed}` under `data-ax-save-id` (localStorage), read back on connect.
 * API: `isCollapsed` (get / set), `collapse()`, `expand()`, `toggle()`, `nav`.
 */
import {defineElement} from './runtime/layer';
import {FOCUSABLE_SELECTOR} from './runtime/dom';
import {focusForLastInput} from './runtime/modality';

export interface SideNavCollapseDetail {
  isCollapsed: boolean;
}

const Base: typeof HTMLElement = typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement;

function loadSaved(key: string | null): boolean | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {isCollapsed?: unknown};
    return typeof parsed.isCollapsed === 'boolean' ? parsed.isCollapsed : null;
  } catch {
    return null;
  }
}

function save(key: string | null, isCollapsed: boolean): void {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify({isCollapsed}));
  } catch {
    // storage unavailable
  }
}

function isShown(el: HTMLElement): boolean {
  return el.isConnected && el.getClientRects().length > 0 && !el.closest('[inert]');
}

function firstFocusable(root: Element): HTMLElement | null {
  if (root.matches(FOCUSABLE_SELECTOR) && isShown(root as HTMLElement)) return root as HTMLElement;
  for (const el of root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) {
    if (el.closest('[popover]') && !root.closest('[popover]')) continue;
    if (isShown(el)) return el;
  }
  return null;
}

export class SideNavElement extends Base {
  #off: Array<() => void> = [];

  get nav(): HTMLElement | null {
    const id = this.getAttribute('data-ax-nav');
    return (id ? this.ownerDocument.getElementById(id) : null) ?? this.querySelector<HTMLElement>('nav.astryx-side-nav');
  }

  get isCollapsed(): boolean {
    return this.nav?.getAttribute('data-ax-collapsed') === 'true';
  }

  set isCollapsed(value: boolean) {
    this.#apply(Boolean(value), {emit: false});
  }

  collapse(): void { this.#request(true); }
  expand(): void { this.#request(false); }
  toggle(): void { this.#request(!this.isCollapsed); }

  connectedCallback(): void {
    if (!this.hasAttribute('data-ax-collapsible')) return;
    queueMicrotask(() => {
      if (!this.isConnected) return;
      this.#wire();
      const saved = loadSaved(this.getAttribute('data-ax-save-id'));
      if (saved != null && saved !== this.isCollapsed) this.#apply(saved, {emit: false, persist: false});
    });
  }

  disconnectedCallback(): void {
    for (const off of this.#off.splice(0)) off();
  }

  #toggles(): HTMLElement[] {
    const nav = this.nav;
    if (!nav) return [];
    const inside = [...nav.querySelectorAll<HTMLElement>('[data-ax-side-nav-toggle=""]')];
    const outside = nav.id ? [...this.ownerDocument.querySelectorAll<HTMLElement>(`[data-ax-side-nav-toggle="${CSS.escape(nav.id)}"]`)] : [];
    return [...inside, ...outside];
  }

  #wire(): void {
    if (this.#off.length) return;
    for (const toggle of this.#toggles()) {
      const onClick = () => this.toggle();
      toggle.addEventListener('click', onClick);
      this.#off.push(() => toggle.removeEventListener('click', onClick));
    }
  }

  #request(next: boolean): void {
    if (next === this.isCollapsed) return;
    const nav = this.nav;
    if (!nav) return;
    const change = new CustomEvent<SideNavCollapseDetail>('astryx-collapse-change', {
      bubbles: true, composed: true, cancelable: true, detail: {isCollapsed: next},
    });
    nav.dispatchEvent(change);
    if (change.defaultPrevented) return;
    this.#apply(next, {emit: false});
  }

  #apply(next: boolean, {persist = true}: {emit: boolean; persist?: boolean}): void {
    const nav = this.nav;
    if (!nav) return;
    const doc = this.ownerDocument;
    const active = doc.activeElement as HTMLElement | null;
    const hadFocus = active != null && nav.contains(active) && !active.closest('[popover]');
    // Where focus sits now, for the move after the change (AR3).
    const fromRow = hadFocus ? active!.closest<HTMLElement>('.ax-side-nav-item-root, .ax-side-nav-heading-host') : null;
    const wasOnToggle = hadFocus && this.#toggles().some((t) => t.contains(active));

    nav.setAttribute('data-ax-collapsed', String(next));
    for (const t of this.#toggles()) {
      t.setAttribute('data-ax-collapsed', String(next));
      const label = t.getAttribute(next ? 'data-ax-label-expand' : 'data-ax-label-collapse');
      if (label != null) t.setAttribute('aria-label', label);
    }
    // Rail leaves: the same control, named (and described by its tooltip) only on the rail.
    for (const control of nav.querySelectorAll<HTMLElement>('[data-ax-rail-label]')) {
      if (control.closest('[popover]')) continue;
      if (next) control.setAttribute('aria-label', control.getAttribute('data-ax-rail-label') ?? '');
      else control.removeAttribute('aria-label');
    }
    for (const control of nav.querySelectorAll<HTMLElement>('[data-ax-rail-describedby]')) {
      if (control.closest('[popover]')) continue;
      const tipId = control.getAttribute('data-ax-rail-describedby')!;
      const ids = (control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id && id !== tipId);
      if (next) ids.push(tipId);
      if (ids.length) control.setAttribute('aria-describedby', ids.join(' '));
      else control.removeAttribute('aria-describedby');
      const tip = doc.getElementById(tipId) as (HTMLElement & {hideNow?: () => void}) | null;
      if (tip) {
        if (next) tip.removeAttribute('data-ax-enabled');
        else {
          tip.hideNow?.();
          tip.setAttribute('data-ax-enabled', 'false');
        }
      }
    }
    // Layers of the presentation that just left: rail flyouts on expand, expanded menus on collapse.
    const leaving = next ? '[data-ax-rail="split"] > .ax-side-nav-expanded-part [popover]' : '.ax-side-nav-rail-part [popover]';
    for (const layer of nav.querySelectorAll<HTMLElement & {hide?: (reason?: string) => void}>(leaving)) {
      let open = false;
      try { open = layer.matches(':popover-open'); } catch { open = false; }
      if (open) layer.hide?.('api');
    }
    if (hadFocus && !isShown(active!)) this.#moveFocus(nav, fromRow, wasOnToggle);
    if (persist) save(this.getAttribute('data-ax-save-id'), next);
  }

  /** AR3: focus the change took away goes to the same row, the toggle, or the nearest kept row. */
  #moveFocus(nav: HTMLElement, fromRow: HTMLElement | null, wasOnToggle: boolean): void {
    const toggle = this.#toggles().find((t) => nav.contains(t) && isShown(t)) ?? null;
    let target: HTMLElement | null = null;
    if (wasOnToggle) target = toggle;
    if (!target && fromRow) target = firstFocusable(fromRow);
    if (!target) target = toggle;
    if (!target && fromRow) {
      const rows = [...nav.querySelectorAll<HTMLElement>('.ax-side-nav-item-root')].filter((r) => !r.closest('[popover]'));
      const at = rows.indexOf(fromRow.closest('.ax-side-nav-item-root') ?? fromRow);
      const before = rows.slice(0, Math.max(at, 0)).reverse();
      const after = rows.slice(at + 1);
      for (const row of [...before, ...after]) {
        target = firstFocusable(row);
        if (target) break;
      }
    }
    if (target) focusForLastInput(target, {preventScroll: true});
  }
}

defineElement('ax-side-nav', SideNavElement);
