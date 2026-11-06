/**
 * <ax-tree-list> — TreeList behaviour. Port of @astryxdesign/core hooks/useTreeFocus.ts
 * (roving tab stop, APG keyboard map, typeahead on the label), TreeList/TreeList.tsx
 * (handleToggle, activateItem, focus moved off a collapsing branch, takeTabStop),
 * TreeList/TreeListItem.tsx (row click rules: chevron, onClick rows, toggle rows, link rows
 * through hooks/useClickableContainer.ts) and the animatedLayout exit (inert while leaving).
 *
 * State the server rendered — `aria-expanded` on parents and their chevrons, collapsed groups
 * `hidden="until-found"`, `aria-selected` / `data-selected` — is owned here afterwards.
 * Visible rows are the treeitems not inside a hidden or exiting group.
 */
import {createTypeahead} from './runtime/typeahead';
import {focusForLastInput, getModality, trackModality} from './runtime/modality';
import {isRtl} from './runtime/dom';
import './runtime/disabledInteraction';

trackModality();

const INTERACTIVE = [
  'button', 'a', 'input', 'select', 'textarea', '[role="button"]', '[role="link"]', '[role="checkbox"]',
  '[role="radio"]', '[role="switch"]', '[role="tab"]', '[role="menuitem"]', '[role="option"]',
  '[role="combobox"]', '[role="listbox"]', '[role="slider"]', '[role="spinbutton"]', '[data-pressable-container]',
].join(',');

function hasInteractiveAncestor(target: Element, root: Element): boolean {
  for (let el: Element | null = target; el && el !== root && el !== el.ownerDocument.body; el = el.parentElement) {
    if (el.matches(INTERACTIVE) && !el.matches('[aria-readonly="true"]')) return true;
    if (el.hasAttribute('data-astryx-layer-root') || el.hasAttribute('popover')) return true;
  }
  return false;
}

function hasTextSelection(node: Element): boolean {
  const selection = node.ownerDocument.getSelection();
  return selection != null && !selection.isCollapsed && node.contains(selection.anchorNode);
}

const NAVIGATION_KEYS = new Set(['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End', 'Enter', ' ']);

export interface TreeExpandedChangeDetail {
  id: string;
  isExpanded: boolean;
}

export interface TreeSelectDetail {
  id: string;
  event: Event;
}

class AxTreeList extends HTMLElement {
  #cleanup: Array<() => void> = [];
  #typeahead = createTypeahead({
    getItemLabels: () => this.#visibleItems().map((item) => this.#labelOf(item)),
    getCurrentIndex: () => this.#visibleItems().indexOf(this.#activeItem()!),
    isDisabled: (index) => this.#isDisabled(this.#visibleItems()[index]),
    onMatch: (index) => this.#focusItem(this.#visibleItems()[index]),
    resetMs: 500,
  });

  get #tree(): HTMLElement | null {
    return this.querySelector<HTMLElement>(':scope > ul[role="tree"]');
  }

  // ── Public API ──────────────────────────────────────────────────────────
  get expandedIds(): string[] {
    return [...(this.#tree?.querySelectorAll<HTMLElement>('[role="treeitem"][aria-expanded="true"]') ?? [])].map((li) => li.dataset.treeId!);
  }

  isExpanded(id: string): boolean {
    return this.#item(id)?.getAttribute('aria-expanded') === 'true';
  }

  expand(id: string): void { this.#setExpanded(id, true, false); }
  collapse(id: string): void { this.#setExpanded(id, false, false); }
  toggle(id: string): void { this.#setExpanded(id, !this.isExpanded(id), false); }

  get selectedId(): string | null {
    return this.#tree?.querySelector<HTMLElement>('[role="treeitem"][aria-selected="true"]')?.dataset.treeId ?? null;
  }

  set selectedId(id: string | null) {
    for (const li of this.#tree?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []) {
      const on = id != null && li.dataset.treeId === id;
      const row = li.querySelector<HTMLElement>(':scope > .ax-tree-row-wrap > .astryx-tree-list-item');
      const label = row?.querySelector<HTMLElement>('.astryx-tree-list-item-label');
      if (on) li.setAttribute('aria-selected', 'true');
      else li.removeAttribute('aria-selected');
      for (const el of [row, label]) {
        if (!el) continue;
        if (on) el.setAttribute('data-selected', 'selected');
        else el.removeAttribute('data-selected');
      }
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────
  connectedCallback() {
    const tree = this.#tree;
    if (!tree) return;
    const onKeyDown = (event: KeyboardEvent) => this.#onKeyDown(event);
    const onFocusIn = (event: FocusEvent) => {
      const item = event.target instanceof Element ? event.target.closest<HTMLElement>('[role="treeitem"]') : null;
      if (item && this.#visibleItems().includes(item) && !this.#isDisabled(item)) this.#moveTabStop(item);
    };
    const onClick = (event: MouseEvent) => this.#onClick(event);
    const onMouseUp = (event: MouseEvent) => this.#onMouseUp(event);
    // find-in-page / text fragment inside a collapsed group expands its branch.
    const onBeforeMatch = (event: Event) => {
      const group = event.target instanceof Element ? event.target.closest('[role="group"]') : null;
      const li = group?.parentElement;
      if (li?.dataset.treeId) this.#setExpanded(li.dataset.treeId, true, true);
    };
    tree.addEventListener('keydown', onKeyDown);
    tree.addEventListener('focusin', onFocusIn);
    tree.addEventListener('click', onClick);
    tree.addEventListener('mouseup', onMouseUp);
    tree.addEventListener('beforematch', onBeforeMatch, true);
    this.#cleanup.push(() => {
      tree.removeEventListener('keydown', onKeyDown);
      tree.removeEventListener('focusin', onFocusIn);
      tree.removeEventListener('click', onClick);
      tree.removeEventListener('mouseup', onMouseUp);
      tree.removeEventListener('beforematch', onBeforeMatch, true);
    });
    this.#syncTabStops();
  }

  disconnectedCallback() {
    for (const fn of this.#cleanup.splice(0)) fn();
    this.#typeahead.reset();
  }

  // ── Items ───────────────────────────────────────────────────────────────
  #item(id: string): HTMLElement | null {
    return this.#tree?.querySelector<HTMLElement>(`[role="treeitem"][data-tree-id="${CSS.escape(id)}"]`) ?? null;
  }

  /** Visible treeitems in DOM order: not inside a collapsed or exiting group. */
  #visibleItems(): HTMLElement[] {
    const tree = this.#tree;
    if (!tree) return [];
    return [...tree.querySelectorAll<HTMLElement>('[role="treeitem"]')].filter((li) => {
      const hidden = li.parentElement?.closest('[role="group"][hidden], [data-tree-exiting]');
      return hidden == null || !tree.contains(hidden);
    });
  }

  #isDisabled(item: HTMLElement | undefined): boolean {
    return item == null || item.dataset.treeDisabled != null || item.getAttribute('aria-disabled') === 'true';
  }

  #labelOf(item: HTMLElement): string {
    const ids = item.getAttribute('aria-labelledby');
    if (ids) {
      const text = ids.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
      if (text !== '') return text;
    }
    return (item.textContent ?? '').trim();
  }

  #activeItem(): HTMLElement | null {
    const active = document.activeElement;
    const item = active instanceof Element ? active.closest<HTMLElement>('[role="treeitem"]') : null;
    return item && this.#tree?.contains(item) ? item : null;
  }

  #moveTabStop(target: HTMLElement) {
    for (const li of this.#tree?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []) {
      const value = li === target ? '0' : '-1';
      if (li.getAttribute('tabindex') !== value) li.setAttribute('tabindex', value);
    }
  }

  /** Exactly one enabled visible row is tabbable: keep the seeded one, else the first. */
  #syncTabStops() {
    const items = this.#visibleItems();
    const enabled = items.filter((li) => !this.#isDisabled(li));
    if (enabled.length === 0) return;
    const current = enabled.find((li) => li.getAttribute('tabindex') === '0');
    this.#moveTabStop(current ?? enabled[0]);
  }

  #focusItem(item: HTMLElement | undefined) {
    if (!item) return;
    this.#moveTabStop(item);
    item.focus();
  }

  #focusEnabledFrom(items: HTMLElement[], start: number, dir: 1 | -1) {
    for (let i = start; i >= 0 && i < items.length; i += dir) {
      if (!this.#isDisabled(items[i])) {
        this.#focusItem(items[i]);
        return;
      }
    }
  }

  // ── Expansion ───────────────────────────────────────────────────────────
  #setExpanded(id: string, next: boolean, isUserInput: boolean) {
    const li = this.#item(id);
    const group = li?.querySelector<HTMLElement>(':scope > [role="group"]');
    if (!li || !group || (li.getAttribute('aria-expanded') === 'true') === next) return;
    // noteFocusWithin: focus inside the group that is about to go moves to its row.
    const active = document.activeElement;
    const focusInside = !next && active != null && group.contains(active);
    const isAnimated = this.hasAttribute('data-ax-animate');

    li.setAttribute('aria-expanded', String(next));
    const chevron = li.querySelector<HTMLElement>(':scope > .ax-tree-row-wrap [data-tree-toggle]');
    chevron?.setAttribute('aria-expanded', String(next));
    chevron?.setAttribute('data-state', next ? 'expanded' : 'collapsed');
    if (isAnimated) this.#startTransition(group, next);
    if (next) group.removeAttribute('hidden');
    else group.setAttribute('hidden', 'until-found');

    if (focusInside) {
      focusForLastInput(li, undefined, getModality());
      if (!this.#isDisabled(li)) this.#moveTabStop(li);
    } else if (!next) {
      // A tab stop left inside the collapsed group moves back to a visible row.
      const stop = group.querySelector('[role="treeitem"][tabindex="0"]');
      if (stop) this.#syncTabStops();
    }
    if (isUserInput) {
      this.dispatchEvent(new CustomEvent<TreeExpandedChangeDetail>('astryx-expanded-change', {bubbles: true, composed: true, detail: {id, isExpanded: next}}));
    }
  }

  /** animatedLayout exit: the leaving group is inert and out of the keyboard order. */
  #startTransition(group: HTMLElement, opening: boolean) {
    const end = () => {
      group.removeAttribute('data-ax-transition');
      group.removeAttribute('data-tree-exiting');
      group.inert = false;
      group.removeEventListener('transitionend', onEnd);
      group.removeEventListener('transitioncancel', onEnd);
      clearTimeout(timer);
    };
    const onEnd = (event: TransitionEvent) => { if (event.target === group) end(); };
    group.setAttribute('data-ax-transition', '');
    if (!opening) {
      group.inert = true;
      group.setAttribute('data-tree-exiting', '');
    } else {
      group.removeAttribute('data-tree-exiting');
      group.inert = false;
    }
    group.addEventListener('transitionend', onEnd);
    group.addEventListener('transitioncancel', onEnd);
    const timer = setTimeout(end, 1000);
  }

  // ── Keyboard (useTreeFocus) ─────────────────────────────────────────────
  #onKeyDown(event: KeyboardEvent) {
    if (event.defaultPrevented) return;
    const items = this.#visibleItems();
    if (items.length === 0) return;
    const current = this.#activeItem() ?? undefined;
    const currentIndex = current ? items.indexOf(current) : -1;

    if (event.key === '*' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // APG: expand every sibling of the focused row.
      if (!current) return;
      event.preventDefault();
      const siblings = current.parentElement ? [...current.parentElement.children] : [];
      for (const sibling of siblings) {
        if (sibling instanceof HTMLElement && sibling.getAttribute('aria-expanded') === 'false' && !this.#isDisabled(sibling)) {
          this.#setExpanded(sibling.dataset.treeId!, true, true);
        }
      }
      return;
    }

    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && !NAVIGATION_KEYS.has(event.key)) {
      if (this.#typeahead.onKeyDown(event)) event.preventDefault();
      return;
    }
    if (!NAVIGATION_KEYS.has(event.key)) return;

    let key = event.key;
    if ((key === 'ArrowLeft' || key === 'ArrowRight') && isRtl(this.#tree)) key = key === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
    const level = (el: HTMLElement) => Number(el.getAttribute('aria-level') ?? '1');

    switch (key) {
      case 'ArrowDown':
        event.preventDefault();
        this.#focusEnabledFrom(items, currentIndex < 0 ? 0 : currentIndex + 1, 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.#focusEnabledFrom(items, currentIndex < 0 ? items.length - 1 : currentIndex - 1, -1);
        break;
      case 'ArrowRight': {
        if (!current) break;
        event.preventDefault();
        const expanded = current.getAttribute('aria-expanded');
        if (expanded === 'false') {
          this.#setExpanded(current.dataset.treeId!, true, true);
        } else if (expanded === 'true') {
          const next = items[currentIndex + 1];
          if (next && level(next) > level(current)) this.#focusItem(next);
        }
        break;
      }
      case 'ArrowLeft': {
        if (!current) break;
        event.preventDefault();
        if (current.getAttribute('aria-expanded') === 'true') {
          this.#setExpanded(current.dataset.treeId!, false, true);
        } else {
          for (let i = currentIndex - 1; i >= 0; i--) {
            if (level(items[i]) < level(current)) {
              this.#focusItem(items[i]);
              break;
            }
          }
        }
        break;
      }
      case 'Home':
        event.preventDefault();
        this.#focusEnabledFrom(items, 0, 1);
        break;
      case 'End':
        event.preventDefault();
        this.#focusEnabledFrom(items, items.length - 1, -1);
        break;
      case 'Enter':
      case ' ': {
        if (!current || this.#isDisabled(current)) break;
        event.preventDefault();
        if (!this.#activate(current) && current.getAttribute('aria-expanded') != null) {
          this.#setExpanded(current.dataset.treeId!, current.getAttribute('aria-expanded') !== 'true', true);
        }
        break;
      }
    }
  }

  /** Enter/Space: click the row's own link or button (never a nested row's). */
  #activate(item: HTMLElement): boolean {
    for (const candidate of item.querySelectorAll<HTMLElement>('a[href], button:not([data-tree-toggle])')) {
      if (candidate.closest('[role="treeitem"]') === item) {
        candidate.click();
        return true;
      }
    }
    return false;
  }

  // ── Pointer (TreeListItem row rules) ────────────────────────────────────
  #rowOf(target: Element): {row: HTMLElement; item: HTMLElement} | null {
    const row = target.closest<HTMLElement>('.astryx-tree-list-item');
    const item = row?.closest<HTMLElement>('[role="treeitem"]');
    return row && item && this.#tree?.contains(item) ? {row, item} : null;
  }

  #onClick(event: MouseEvent) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const found = this.#rowOf(target);
    if (!found) return;
    const {row, item} = found;
    const id = item.dataset.treeId!;
    if (this.#isDisabled(item)) return;

    const chevron = target.closest('[data-tree-toggle]');
    if (chevron && row.contains(chevron)) {
      this.#setExpanded(id, item.getAttribute('aria-expanded') !== 'true', true);
      return;
    }

    const kind = row.getAttribute('data-ax-row');
    const action = row.querySelector<HTMLElement>('[data-ax-tree-action]');
    if (kind === 'button' && action && action.contains(target)) {
      this.dispatchEvent(new CustomEvent<TreeSelectDetail>('astryx-select', {bubbles: true, composed: true, detail: {id, event}}));
      return;
    }
    // Controls inside the row keep their own activation.
    if (hasInteractiveAncestor(target, row)) return;

    if (kind === 'link') {
      // Enlarged surface for the link (useClickableContainer proxy): one click per press.
      const link = row.querySelector<HTMLAnchorElement>('a[data-ax-tree-link]');
      if (!link || hasTextSelection(row)) return;
      event.stopPropagation();
      link.dispatchEvent(new MouseEvent('click', {
        bubbles: true, cancelable: true, ctrlKey: event.ctrlKey, metaKey: event.metaKey,
        shiftKey: event.shiftKey, altKey: event.altKey, button: event.button,
      }));
    } else if (kind === 'button' && action) {
      event.stopPropagation();
      action.click();
    } else if (kind === 'toggle') {
      this.#setExpanded(id, item.getAttribute('aria-expanded') !== 'true', true);
    }
  }

  #onMouseUp(event: MouseEvent) {
    if (event.button !== 1 || !(event.target instanceof Element)) return;
    const found = this.#rowOf(event.target);
    if (!found || found.row.getAttribute('data-ax-row') !== 'link' || this.#isDisabled(found.item)) return;
    if (hasInteractiveAncestor(event.target, found.row)) return;
    const link = found.row.querySelector<HTMLAnchorElement>('a[data-ax-tree-link][href]');
    if (link) window.open(link.href, '_blank', 'noopener');
  }
}

if (!customElements.get('ax-tree-list')) customElements.define('ax-tree-list', AxTreeList);

declare global {
  interface HTMLElementTagNameMap {
    'ax-tree-list': AxTreeList;
  }
}
