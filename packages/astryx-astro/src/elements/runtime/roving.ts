/**
 * 1-D roving focus for composite widgets (toolbars, tab lists, segmented controls, menus,
 * breadcrumbs, pagination …), driven by attributes so a component needs no script of its own.
 *
 * Port of @astryxdesign/core hooks/useListFocus.ts (+ hooks/isRtlElement.ts): arrows by
 * orientation with RTL-aware horizontal keys, Home/End, optional PageUp/PageDown paging,
 * wrap, disabled items skipped (`aria-disabled="true"`, `disabled`), items under a `hidden` or
 * `inert` ancestor inside the list excluded, nested lists scoped by a boundary selector, the
 * caret guard for text fields and editors, and one managed tab stop.
 *
 * Attributes on the container:
 *   data-astryx-roving="horizontal|vertical|both"   orientation (empty = vertical, as Astryx)
 *   data-astryx-roving-items="<selector>"           items (default '[role="menuitem"]')
 *   data-astryx-roving-boundary="<selector>"        nested-list boundary (e.g. '[role="menu"]')
 *   data-astryx-roving-wrap="false"                 stop at the ends (default wraps)
 *   data-astryx-roving-home-end="false"             no Home/End
 *   data-astryx-roving-paging                       PageUp/PageDown
 *   data-astryx-roving-tabindex="false"             do not manage tabindex (default manages it:
 *                                                   one enabled item tabindex=0, others -1)
 *   data-astryx-roving-caret                        never steal caret keys from text fields
 *   data-astryx-roving-focus="last-input"           move focus with the last input's ring
 *   data-astryx-roving-typeahead                    type-to-focus by item text (typeahead.ts)
 *
 * Nested lists (a ButtonGroup inside a Toolbar) follow React's order for nested composites,
 * as useListFocus sees it:
 *  - Items: an outer list sweeps the inner list's items into its own order unless its boundary
 *    selector stops at the inner container (a Toolbar's `[role="toolbar"], [popover]` does not
 *    stop at a ButtonGroup's `role="group"`, so the group's members are Toolbar items too).
 *  - Keys: the innermost container handles a keydown first; each enclosing container runs
 *    only while nothing has prevented the key (Astryx composites skip a defaultPrevented key),
 *    so an arrow the inner list consumed never reaches the outer one, and a key it ignores (an
 *    ArrowDown in a horizontal group inside a vertical toolbar) moves through the outer list.
 *  - Tab stops: containers sync inner first, then each enclosing one (a child's layout effect
 *    runs before its parent's), on load, on DOM changes and after every focus or tab-stop move;
 *    the outer sync keeps the first item already holding `tabindex="0"`, so one stop remains.
 *
 * Deviation: when an item takes focus by a click or by script, it becomes the tab stop (APG);
 * Astryx keeps the previous stop until the next arrow key.
 */
import {isRtl} from './dom';
import {focusForLastInput} from './modality';
import {createTypeahead, type Typeahead} from './typeahead';
import {globalSingleton} from './global';

export type RovingOrientation = 'horizontal' | 'vertical' | 'both';

export interface RovingOptions {
  itemSelector?: string;
  boundarySelector?: string;
  orientation?: RovingOrientation;
  wrap?: boolean;
  hasHomeEnd?: boolean;
  hasPaging?: boolean;
  hasRovingTabIndex?: boolean;
  hasCaretGuard?: boolean;
  focusFollowsLastInput?: boolean;
}

const ATTR = 'data-astryx-roving';
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number']);

function optionsFrom(container: HTMLElement): Required<RovingOptions> {
  const a = (name: string) => container.getAttribute(`${ATTR}-${name}`);
  const orientation = container.getAttribute(ATTR);
  return {
    itemSelector: a('items') || '[role="menuitem"]',
    boundarySelector: a('boundary') || '',
    orientation: orientation === 'horizontal' || orientation === 'both' ? orientation : 'vertical',
    wrap: a('wrap') !== 'false',
    hasHomeEnd: a('home-end') !== 'false',
    hasPaging: container.hasAttribute(`${ATTR}-paging`),
    hasRovingTabIndex: a('tabindex') !== 'false',
    hasCaretGuard: container.hasAttribute(`${ATTR}-caret`),
    focusFollowsLastInput: a('focus') === 'last-input',
  };
}

function isDisabled(el: HTMLElement): boolean {
  return el.getAttribute('aria-disabled') === 'true' || (el as HTMLButtonElement).disabled === true || el.hasAttribute('disabled');
}

function isHiddenWithin(el: HTMLElement, list: HTMLElement): boolean {
  const hidden = el.parentElement?.closest<HTMLElement>('[hidden],[inert]');
  return hidden != null && hidden !== list && list.contains(hidden);
}

function editableRoot(el: HTMLElement): HTMLElement | null {
  if (el.isContentEditable) return el;
  const c = el.closest<HTMLElement>('[contenteditable]');
  return c && c.getAttribute('contenteditable') !== 'false' ? c : null;
}

/** Whether a caret key belongs to the text field it was pressed in. */
function shouldDeferToCaret(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const editor = editableRoot(target);
  if (editor) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) return true;
    return (editor.textContent ?? '').length > 0;
  }
  const isTextarea = target.tagName === 'TEXTAREA';
  const isText = target.tagName === 'INPUT' && TEXT_INPUT_TYPES.has((target as HTMLInputElement).type);
  if (!isTextarea && !isText) return false;
  const {selectionStart, selectionEnd, value} = target as HTMLInputElement;
  if (selectionStart !== selectionEnd) return true;
  if (selectionStart == null) return true;
  if (key === 'ArrowLeft' || key === 'ArrowUp' || key === 'Home') return selectionStart > 0;
  if (key === 'ArrowRight' || key === 'ArrowDown' || key === 'End') return selectionStart < value.length;
  return false;
}

export interface RovingFocus {
  getItems(): HTMLElement[];
  ownsEvent(event: Event): boolean;
  handleKeyDown(event: KeyboardEvent): void;
  handleFocus(event?: FocusEvent): void;
  focusItem(index: number): void;
  focusFirst(): boolean;
  focusLast(): boolean;
  syncTabStops(): void;
}

/**
 * Roving focus over `container`'s items. `options` defaults come from the container's
 * `data-astryx-roving*` attributes, read on every call, so attribute changes apply live.
 */
export function createRovingFocus(container: HTMLElement, options: RovingOptions = {}): RovingFocus {
  const opts = () => ({...optionsFrom(container), ...stripUndefined(options)});

  const getItems = () => {
    const {itemSelector, boundarySelector} = opts();
    const matched = [...container.querySelectorAll<HTMLElement>(itemSelector)].filter((el) => !isHiddenWithin(el, container));
    return boundarySelector ? matched.filter((el) => el.closest(boundarySelector) === container) : matched;
  };

  const ownsEvent = (event: Event) => {
    const {boundarySelector} = opts();
    const target = event.target as HTMLElement | null;
    return !boundarySelector || !target ? true : target.closest(boundarySelector) === container;
  };

  const findEnabled = (items: HTMLElement[], start: number, step: 1 | -1, wrap: boolean) => {
    const n = items.length;
    let i = start;
    for (let k = 0; k < n; k++) {
      if (i < 0 || i >= n) {
        if (!wrap) return -1;
        i = (i + n) % n;
      }
      if (!isDisabled(items[i])) return i;
      i += step;
    }
    return -1;
  };

  const currentIndex = (items = getItems()) => {
    const active = container.ownerDocument.activeElement;
    return items.findIndex((item) => item === active || item.contains(active));
  };

  const setTabIndex = (el: HTMLElement, value: 0 | -1) => {
    if (el.getAttribute('tabindex') !== String(value)) el.setAttribute('tabindex', String(value));
  };

  const syncTabStops = () => {
    if (!opts().hasRovingTabIndex) return;
    const items = getItems();
    const enabled = items.filter((el) => !isDisabled(el));
    if (enabled.length === 0) return;
    const focused = enabled[currentIndex(enabled)];
    const tabbable = focused ?? enabled.find((el) => el.getAttribute('tabindex') === '0') ?? enabled[0];
    for (const el of items) setTabIndex(el, el === tabbable ? 0 : -1);
  };

  const focusIndex = (items: HTMLElement[], index: number) => {
    const target = items[index];
    if (!target) return;
    const o = opts();
    if (o.hasRovingTabIndex) for (const el of items) setTabIndex(el, el === target ? 0 : -1);
    if (o.focusFollowsLastInput) focusForLastInput(target);
    else target.focus();
    // The stop moved inside this list: every enclosing list re-syncs (the focusin pass does
    // too, but not when focus could not land on the target).
    syncEnclosing(container);
  };

  const focusItem = (index: number) => {
    const items = getItems();
    if (items.length) focusIndex(items, Math.max(0, Math.min(index, items.length - 1)));
  };

  const focusFirst = () => {
    const items = getItems();
    const i = findEnabled(items, 0, 1, false);
    if (i === -1) return false;
    focusIndex(items, i);
    return true;
  };

  const focusLast = () => {
    const items = getItems();
    const i = findEnabled(items, items.length - 1, -1, false);
    if (i === -1) return false;
    focusIndex(items, i);
    return true;
  };

  const focusPage = (direction: 1 | -1) => {
    const items = getItems();
    if (!items.length) return;
    const current = currentIndex(items);
    const enabled = items.map((it, i) => (isDisabled(it) ? -1 : i)).filter((i) => i !== -1);
    if (!enabled.length) return;
    const edgeVisible = () => {
      const b = container.getBoundingClientRect();
      const visible = enabled.filter((i) => {
        const r = items[i].getBoundingClientRect();
        return r.top >= b.top - 1 && r.bottom <= b.bottom + 1;
      });
      if (!visible.length) return -1;
      return direction === 1 ? visible[visible.length - 1] : visible[0];
    };
    const ahead = (i: number) => current === -1 || (direction === 1 ? i > current : i < current);
    if (current === -1 && direction === -1) { focusFirst(); return; }
    let target = edgeVisible();
    if (target === -1 || !ahead(target)) {
      container.scrollTop += direction * container.clientHeight;
      target = edgeVisible();
      if (target === -1 || !ahead(target)) {
        const pos = enabled.indexOf(current);
        const from = pos === -1 ? (direction === 1 ? -1 : enabled.length) : pos;
        target = enabled[Math.max(0, Math.min(enabled.length - 1, from + direction))];
      }
    }
    if (target !== -1 && target !== current) focusIndex(items, target);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
    if (!ownsEvent(event)) return;
    const o = opts();
    const horizontal = o.orientation === 'horizontal' || o.orientation === 'both';
    const vertical = o.orientation === 'vertical' || o.orientation === 'both';
    const next: string[] = [];
    const prev: string[] = [];
    if (horizontal) {
      const rtl = event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? isRtl(container) : false;
      next.push(rtl ? 'ArrowLeft' : 'ArrowRight');
      prev.push(rtl ? 'ArrowRight' : 'ArrowLeft');
    }
    if (vertical) { next.push('ArrowDown'); prev.push('ArrowUp'); }
    const isNext = next.includes(event.key);
    const isPrev = prev.includes(event.key);
    const isHome = o.hasHomeEnd && event.key === 'Home';
    const isEnd = o.hasHomeEnd && event.key === 'End';
    const isPageDown = o.hasPaging && event.key === 'PageDown';
    const isPageUp = o.hasPaging && event.key === 'PageUp';
    if (!isNext && !isPrev && !isHome && !isEnd && !isPageDown && !isPageUp) return;
    if (o.hasCaretGuard && (shouldDeferToCaret(event.target, event.key) || shouldDeferToCaret(container.ownerDocument.activeElement, event.key))) return;
    const items = getItems();
    const current = currentIndex(items);
    if (isNext) {
      const i = findEnabled(items, current === -1 ? 0 : current + 1, 1, o.wrap);
      if (i !== -1) focusIndex(items, i);
    } else if (isPrev) {
      const i = findEnabled(items, current === -1 ? items.length - 1 : current - 1, -1, o.wrap);
      if (i !== -1) focusIndex(items, i);
    } else if (isHome) focusFirst();
    else if (isEnd) focusLast();
    else if (isPageDown) focusPage(1);
    else if (isPageUp) focusPage(-1);
    event.preventDefault();
  };

  return {getItems, ownsEvent, handleKeyDown, handleFocus: () => syncTabStops(), focusItem, focusFirst, focusLast, syncTabStops};
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

// ── Attribute-driven containers: one delegated listener set per document ──
// Shared by every copy of this module: the delegated listeners one copy installs read the
// controllers and key listeners any copy registers.
interface RovingState {
  instances: WeakMap<HTMLElement, RovingFocus & {typeahead?: Typeahead}>;
  keyListeners: WeakMap<HTMLElement, Set<(event: KeyboardEvent) => void>>;
  listening: WeakSet<Document>;
}
const shared: RovingState = globalSingleton('roving', () => ({instances: new WeakMap(), keyListeners: new WeakMap(), listening: new WeakSet()}));
const {instances, keyListeners} = shared;

/** The roving controller for a `[data-astryx-roving]` container (created on demand). */
export function rovingFor(container: HTMLElement): RovingFocus {
  let r = instances.get(container);
  if (!r) {
    r = createRovingFocus(container);
    instances.set(container, r);
  }
  return r;
}

/**
 * Run `listener` for each keydown the delegated roving pass brings to `container` (a
 * `[data-astryx-roving]` element): after nested lists had their turn, only while no handler has
 * prevented the key, and right before the container's own arrow / typeahead handling — where
 * an Astryx composite calls its extra key handlers (useKeyboardHint's `onKeyDown`) before
 * useListFocus's. Calling `preventDefault()` keeps the container from handling the key.
 * Returns the unsubscribe function.
 */
export function onRovingKeyDown(container: HTMLElement, listener: (event: KeyboardEvent) => void): () => void {
  let set = keyListeners.get(container);
  if (!set) keyListeners.set(container, (set = new Set()));
  set.add(listener);
  return () => { set.delete(listener); };
}

/** `[data-astryx-roving]` containers from `target` outward: the innermost first. */
function containersFrom(target: EventTarget | null): HTMLElement[] {
  const out: HTMLElement[] = [];
  let node = target instanceof Element ? target.closest<HTMLElement>(`[${ATTR}]`) : null;
  while (node) {
    out.push(node);
    node = node.parentElement?.closest<HTMLElement>(`[${ATTR}]`) ?? null;
  }
  return out;
}

/** Sync each container once, every container before the ones enclosing it (reverse document order). */
function syncInOrder(containers: Iterable<HTMLElement>): void {
  const list = [...new Set(containers)].filter((c) => c.isConnected);
  list.sort((a, b) => (a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1));
  for (const c of list) rovingFor(c).syncTabStops();
}

/** Re-sync the lists enclosing `container` (the closest first), after its stop moved. */
function syncEnclosing(container: HTMLElement): void {
  for (const c of containersFrom(container.parentElement)) rovingFor(c).syncTabStops();
}

/** `root` (when it is a container), the containers inside it, and the ones enclosing it. */
function containersAround(root: ParentNode, out: HTMLElement[] = []): HTMLElement[] {
  if (root instanceof HTMLElement && root.matches(`[${ATTR}]`)) out.push(root);
  out.push(...root.querySelectorAll<HTMLElement>(`[${ATTR}]`));
  if (root instanceof Element) out.push(...containersFrom(root.parentElement));
  return out;
}

function typeaheadFor(container: HTMLElement, roving: RovingFocus & {typeahead?: Typeahead}): Typeahead {
  if (!roving.typeahead) {
    roving.typeahead = createTypeahead({
      getItemLabels: () => roving.getItems().map((el) => el.getAttribute('data-astryx-typeahead-label') ?? el.textContent ?? ''),
      onMatch: (i) => roving.focusItem(i),
      getCurrentIndex: () => roving.getItems().findIndex((el) => el === container.ownerDocument.activeElement || el.contains(container.ownerDocument.activeElement)),
      isDisabled: (i) => {
        const el = roving.getItems()[i];
        return el ? isDisabled(el) : true;
      },
    });
  }
  return roving.typeahead;
}

/**
 * Stamp the tab stop of every roving container under `root` and of every container enclosing
 * it — inner containers first — so nested lists keep one stop. Runs on load, for DOM changes
 * and after focus moves; call it after moving a stop yourself (e.g. a list with
 * `data-astryx-roving-tabindex="false"` that places its own stop).
 */
export function syncRovingTabStops(root: ParentNode = document): void {
  syncInOrder(containersAround(root));
}

function listen(doc: Document) {
  if (shared.listening.has(doc)) return;
  shared.listening.add(doc);
  doc.addEventListener('keydown', (event) => {
    // Innermost container first, as React bubbles a keydown through nested composites; a
    // level runs only while nothing prevented the key (a nested list that moved focus did).
    for (const container of containersFrom(event.target)) {
      if (event.defaultPrevented) return;
      const listeners = keyListeners.get(container);
      if (listeners) for (const listener of [...listeners]) listener(event);
      if (event.defaultPrevented) return;
      const roving = rovingFor(container);
      if (!roving.ownsEvent(event)) continue;
      if (container.hasAttribute('data-astryx-roving-typeahead') && typeaheadFor(container, roving).onKeyDown(event)) {
        event.preventDefault();
        return;
      }
      roving.handleKeyDown(event);
    }
  });
  doc.addEventListener('focusin', (event) => {
    // Every enclosing list syncs (each composite's onFocus runs handleFocus), innermost first.
    for (const container of containersFrom(event.target)) rovingFor(container).handleFocus(event);
  });
  const start = () => {
    syncRovingTabStops(doc);
    let pending: HTMLElement[] = [];
    let queued = false;
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'attributes') {
          // An item toggled disabled / hidden, or a wrapper hid a part of a list (or a list).
          if (r.target instanceof HTMLElement) containersAround(r.target, pending);
          continue;
        }
        const target = r.target instanceof Element ? r.target : r.target.parentElement;
        const host = target?.closest<HTMLElement>(`[${ATTR}]`);
        if (host) pending.push(host, ...containersFrom(host.parentElement));
        r.addedNodes.forEach((n) => {
          if (n instanceof HTMLElement && (n.matches(`[${ATTR}]`) || n.querySelector(`[${ATTR}]`))) containersAround(n, pending);
        });
      }
      if (queued || pending.length === 0) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        const batch = pending;
        pending = [];
        syncInOrder(batch);
      });
    }).observe(doc.documentElement, {subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'aria-disabled', 'hidden', 'inert', ATTR]});
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
}

if (typeof document !== 'undefined') listen(document);
