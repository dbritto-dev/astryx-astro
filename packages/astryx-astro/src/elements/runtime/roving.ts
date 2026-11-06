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
 * Deviation: when an item takes focus by a click or by script, it becomes the tab stop (APG);
 * Astryx keeps the previous stop until the next arrow key.
 */
import {isRtl} from './dom';
import {focusForLastInput} from './modality';
import {createTypeahead, type Typeahead} from './typeahead';

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
const instances = new WeakMap<HTMLElement, RovingFocus & {typeahead?: Typeahead}>();

/** The roving controller for a `[data-astryx-roving]` container (created on demand). */
export function rovingFor(container: HTMLElement): RovingFocus {
  let r = instances.get(container);
  if (!r) {
    r = createRovingFocus(container);
    instances.set(container, r);
  }
  return r;
}

function containersFrom(target: EventTarget | null): HTMLElement[] {
  const out: HTMLElement[] = [];
  let node = target instanceof Element ? target.closest<HTMLElement>(`[${ATTR}]`) : null;
  while (node) {
    out.push(node);
    node = node.parentElement?.closest<HTMLElement>(`[${ATTR}]`) ?? null;
  }
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

/** Stamp the tab stop of every roving container under `root` (runs on load and for added nodes). */
export function syncRovingTabStops(root: ParentNode = document): void {
  const list = root instanceof HTMLElement && root.matches(`[${ATTR}]`) ? [root] : [];
  list.push(...root.querySelectorAll<HTMLElement>(`[${ATTR}]`));
  for (const c of list) rovingFor(c).syncTabStops();
}

const LISTENING = Symbol.for('astryx-astro/roving/v1');

function listen(doc: Document) {
  const holder = doc as Document & {[LISTENING]?: true};
  if (holder[LISTENING]) return;
  Object.defineProperty(holder, LISTENING, {value: true});
  doc.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    // The innermost container that owns the event handles it (a nested list stops here).
    for (const container of containersFrom(event.target)) {
      const roving = rovingFor(container);
      if (!roving.ownsEvent(event)) continue;
      if (container.hasAttribute('data-astryx-roving-typeahead') && typeaheadFor(container, roving).onKeyDown(event)) {
        event.preventDefault();
        return;
      }
      roving.handleKeyDown(event);
      return;
    }
  });
  doc.addEventListener('focusin', (event) => {
    for (const container of containersFrom(event.target)) {
      const roving = rovingFor(container);
      if (roving.getItems().some((item) => item === event.target || item.contains(event.target as Node))) {
        roving.handleFocus(event);
        return;
      }
    }
  });
  const start = () => {
    syncRovingTabStops(doc);
    if (typeof MutationObserver === 'undefined') return;
    let pending = new Set<HTMLElement>();
    let queued = false;
    new MutationObserver((records) => {
      for (const r of records) {
        const host = (r.target instanceof Element ? r.target : r.target.parentElement)?.closest<HTMLElement>(`[${ATTR}]`);
        if (host) pending.add(host);
        r.addedNodes.forEach((n) => {
          if (n instanceof HTMLElement && (n.matches(`[${ATTR}]`) || n.querySelector(`[${ATTR}]`))) pending.add(n);
        });
      }
      if (queued || pending.size === 0) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        const batch = pending;
        pending = new Set();
        for (const el of batch) if (el.isConnected) syncRovingTabStops(el);
      });
    }).observe(doc.documentElement, {subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'aria-disabled', 'hidden', 'inert', ATTR]});
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
}

if (typeof document !== 'undefined') listen(document);
