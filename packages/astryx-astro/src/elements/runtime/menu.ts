/**
 * Menus — the keyboard, pointer and submenu controller of every `role="menu"` surface, and
 * `<ax-menu>`, the layer root DropdownMenu, MoreMenu and ContextMenu render (TabList's
 * TabMenu, Breadcrumb menus and NavMenu render those components; TopNav, SideNav and the
 * Selector family reuse the pieces: `createMenuHover`, `createMenuLevel`, `moveRegionsTab`).
 *
 * Ports of @astryxdesign/core 0.7.9:
 *   DropdownMenu/menuItemRoles.ts      MENU_ITEM_ROLES / SELECTOR / BOUNDARY, isModifiedClick, activateMenuItem
 *   DropdownMenu/menuItemHover.ts      focusMenuItemOnHover (one focus-driven highlight)
 *   DropdownMenu/menuRegionStops.ts    moveRegionsTab (header / menu / footer Tab cycle)
 *   DropdownMenu/useMenuOverflow.ts    the open menu scrolls (and takes a Tab stop) only while it overflows
 *   hooks/useMenuHover.ts              createMenuHover: hover intent, click guard, reopen suppression, safe triangle
 *   hooks/useLongPress.ts (+ longPressDetector.ts, motion/uikit/longPress.ts)  ContextMenu's touch long press
 *   The open/close, focus and key paths of DropdownMenu.tsx (popover presentation),
 *   DropdownMenuSubMenu.tsx (flyout presentation), DropdownMenu{Item,CheckboxItem,RadioItem,
 *   RadioGroup}.tsx activation and ContextMenu.tsx (cursor popover).
 *
 * ── Markup contract ─────────────────────────────────────────────────────────────────────
 *   <button id="T" popovertarget="L" aria-haspopup="menu" aria-expanded="false" aria-controls="M">
 *   <ax-menu id="L" popover="auto" data-ax-menu-kind="dropdown" data-ax-anchor="T"
 *            class="ax-layer ax-layer-motion" data-placement="below" data-align="start" data-astryx-layer-root>
 *     <div class="astryx-popover">                                   (surface; DropdownMenu only)
 *       <div id="M" role="menu" tabindex="-1" aria-label="…" [data-ax-overflow-tabbable]>
 *         <div role="menuitem" tabindex="-1" data-ax-menu-row="item" [data-ax-close-on-select="false"]>…
 *         <div role="menuitemcheckbox" aria-checked="false" data-ax-menu-row="checkbox" data-ax-close-on-select="false">…
 *         <div role="group" data-ax-radio-group [data-ax-close-on-select="false"]>
 *           <div role="menuitemradio" aria-checked="true" data-value="a" data-ax-menu-row="radio">…
 *         <div role="menuitem" id="R" aria-haspopup="menu" aria-expanded="false" data-ax-submenu="F" data-ax-menu-row="submenu">…
 *         <ax-menu id="F" popover="manual" data-ax-menu-kind="submenu" data-ax-anchor="R"
 *                  class="ax-layer ax-layer-motion" data-placement="end" data-align="start">
 *           <div role="menu" aria-labelledby="R" tabindex="-1">…nested rows…</div>
 *         </ax-menu>
 *   ContextMenu: <div id="A" (trigger area)>…<span id="P" class="…cursor anchor"></span></div>
 *   <ax-menu popover="manual" data-ax-menu-kind="context" data-ax-context-target="A" data-ax-anchor="P">
 *     <template data-ax-menu-content>…the role="menu" element…</template></ax-menu>
 *   Rows: `aria-disabled="true"` rows take no focus (no tabindex) and are skipped by arrows,
 *   typeahead and hover; row kinds come from the role (`data-ax-menu-row` is the CSS hook).
 *   Optional: `data-ax-menu-region="header|footer"` beside the menu (dialog Tab cycle),
 *   `data-ax-busy-label` on a row (announced politely when its level shows),
 *   `data-ax-size-from-trigger` on a dropdown root (rows follow the trigger's `data-size`).
 *
 * ── Behaviour (Astryx parity) ───────────────────────────────────────────────────────────
 *  - Open: the native invoker opens on click with zero JS; with JS, Enter / Space / ArrowDown on
 *    the closed trigger open on the first enabled row and ArrowUp on the last (APG menu
 *    button); a pointer open focuses the menu itself so no row reads as pre-selected; mounting
 *    open (`data-ax-open="true"`) moves no focus; `show()` from script lands on the first row.
 *  - Keys in a level: ↑/↓ wrap, Home/End, PageUp/PageDown, typeahead on the rows' text, Enter/
 *    Space activate (a synthesized click with the key's modifiers; auto-repeat never activates),
 *    Tab closes the whole menu without preventing the browser's Tab (the stack returns focus
 *    to the trigger first), or walks header → menu → footer when the menu has regions.
 *  - Submenus: → (← in RTL), Enter or Space on the row open and focus the first row; ← (→ in
 *    RTL) closes the level and focuses the row; hover opens after 150ms and a leave closes
 *    after 200ms (only a hover-opened flyout), with the safe triangle toward the flyout; a
 *    click within 500ms of a hover-open pins it instead of closing; one flyout per level.
 *  - Escape and outside presses go through the one dismissal stack (layerStack.ts): one
 *    Escape closes one level (the deepest open flyout first); the root DropdownMenu is light
 *    dismissed natively (`popover="auto"`), a ContextMenu (`manual`) by a press that starts
 *    and ends outside it; flyouts take no outside presses and close with their root.
 *  - Selection: an item closes the menu (`data-ax-close-on-select="false"` keeps it open), a
 *    checkbox stays open unless its row says "true", a radio closes unless its group says
 *    "false". A modified click on a link row is the browser's (no `astryx-select`), but the
 *    menu still closes; a middle click on a link row closes it too.
 *  - Focus returns to the trigger (DropdownMenu), the row (a flyout) or the element focused
 *    before the menu opened (ContextMenu) — only when focus was inside and would be lost.
 *
 * ── Events (bubbling, composed) ─────────────────────────────────────────────────────────
 *   astryx-open-change  {isOpen, reason}   on the `<ax-menu>` (a flyout's bubbles through its root:
 *                                          check `event.target`)
 *   astryx-select       {event}            on the row that acted (Astryx `onClick`), after a
 *                                          checkbox/radio change; not for submenu rows
 *   astryx-change       {value: boolean}   on a checkbox row (Astryx `onChange(checked)`), cancelable
 *   astryx-change       {value: string}    on a radio group (Astryx `onChange(value)`), cancelable
 *
 * Deviations: Tab from a flyout closes the whole menu (Astryx leaves it open while focus moves
 * on); opening a flyout closes a sibling flyout of the same level; a ContextMenu closes on a
 * press that starts and ends outside it (contract #17) rather than on mousedown. Deferred
 * (touch extras, AGENTS.md scope): press-drag-release (useMenuPress), the entrance input hold,
 * drill-in sub-menus and the bottom-sheet presentation.
 */
import './disabledInteraction';
import {announce} from './announce';
import {settleLayer} from './anchor';
import {FOCUSABLE_SELECTOR, isImeKeyEvent, isRtl} from './dom';
import {LayerElement, defineElement, type OpenChangeReason} from './layer';
import {currentGesture, type DismissReason, type LayerEscapeBehavior, type LayerOutsidePress} from './layerStack';
import {focusForLastInput, getModality} from './modality';
import {createRovingFocus, type RovingFocus} from './roving';
import {createTypeahead} from './typeahead';

// ── Row roles (menuItemRoles.ts) ────────────────────────────────────────────────────────

/** The roles a menu row carries (plain, checkbox, radio). */
export const MENU_ITEM_ROLES: ReadonlySet<string> = new Set(['menuitem', 'menuitemradio', 'menuitemcheckbox']);

/** Rows that take focus: arrows, typeahead and the hover highlight reach only these. */
export const MENU_ITEM_SELECTOR: string = [...MENU_ITEM_ROLES].map((role) => `[role="${role}"]:not([aria-disabled="true"])`).join(',');

/** Every row, enabled or not. */
export const MENU_ROW_SELECTOR: string = [...MENU_ITEM_ROLES].map((role) => `[role="${role}"]`).join(',');

/** One menu level: flyouts render inline, so each level scopes rows and keys to its own menu. */
export const MENU_BOUNDARY_SELECTOR = '[role="menu"]';

/** A click with a modifier or a non-primary button: on a link row it belongs to the browser. */
export function isModifiedClick(event: {metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; button: number}): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

/**
 * Activate a row from the keyboard (Enter / Space): a synthesized click carrying the key's
 * modifiers (⌘-Enter on a link row opens it the way ⌘-click would). `detail` stays 0.
 */
export function activateMenuItem(row: HTMLElement, key: {metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean}): void {
  row.dispatchEvent(new MouseEvent('click', {
    bubbles: true, cancelable: true, composed: true,
    metaKey: key.metaKey, ctrlKey: key.ctrlKey, shiftKey: key.shiftKey, altKey: key.altKey,
  }));
}

export function isDisabledRow(row: Element | null): boolean {
  return row == null || row.getAttribute('aria-disabled') === 'true';
}

function isElement(node: unknown): node is HTMLElement {
  return node != null && (node as Node).nodeType === 1;
}

/**
 * The one focus-driven highlight follows a real mouse (menuItemHover.ts): the row under it
 * takes focus — with the last input's ring, never scrolling (a scroll would put another row
 * under the still pointer). Touch and pen have no hover; disabled rows are skipped.
 */
export function focusMenuItemOnHover(event: PointerEvent, row: HTMLElement | null = event.currentTarget as HTMLElement | null): void {
  if (!row || isDisabledRow(row) || event.pointerType !== 'mouse') return;
  if (row !== row.ownerDocument.activeElement) focusForLastInput(row, {preventScroll: true});
}

// ── Hover intent (useMenuHover.ts) ──────────────────────────────────────────────────────

const DEFAULT_CLICK_GUARD_MS = 500;
/** A close puts the trigger back under a still pointer; its mouseenter is not a new hover. */
const REOPEN_SUPPRESS_MS = 300;
const SAFE_TRIANGLE_PADDING_PX = 8;

interface Point { x: number; y: number }
interface EdgeRect { top: number; bottom: number; left: number; right: number }

function sign(p1: Point, p2: Point, p3: Point): number {
  return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
}

function isPointInTriangle(p: Point, a: Point, b: Point, c: Point): boolean {
  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/** Whether `point` lies in the triangle from `origin` (where the pointer left the row) to the flyout's near edge. */
export function isPointInSafeTriangle(point: Point, origin: Point, flyout: EdgeRect): boolean {
  const pad = SAFE_TRIANGLE_PADDING_PX;
  let start: Point;
  let end: Point;
  if (origin.x <= flyout.left) { start = {x: flyout.left, y: flyout.top - pad}; end = {x: flyout.left, y: flyout.bottom + pad}; }
  else if (origin.x >= flyout.right) { start = {x: flyout.right, y: flyout.top - pad}; end = {x: flyout.right, y: flyout.bottom + pad}; }
  else if (origin.y <= flyout.top) { start = {x: flyout.left - pad, y: flyout.top}; end = {x: flyout.right + pad, y: flyout.top}; }
  else if (origin.y >= flyout.bottom) { start = {x: flyout.left - pad, y: flyout.bottom}; end = {x: flyout.right + pad, y: flyout.bottom}; }
  else return false;
  return isPointInTriangle(point, origin, start, end);
}

export interface MenuHoverOptions {
  /** Open (a hover open passes `skipAutoFocus`: focus stays where it is). */
  show: (options?: {skipAutoFocus?: boolean}) => void;
  hide: () => void;
  isOpen: () => boolean;
  /** Read on every event: a disabled trigger (or a closed parent menu) never opens. */
  isEnabled: () => boolean;
  /** @default 150 */
  showDelay?: number;
  /** @default 200 */
  hideDelay?: number;
  /** Window after a hover open in which a click pins the menu. 0 = every click toggles. @default 500 */
  clickGuardMs?: number;
  /** The flyout box the safe triangle aims at (none: no triangle). */
  flyout?: () => HTMLElement | null;
  /** `click()` only: focus the first item (or the menu) after a click or keyboard open; omit to leave focus to the surface. */
  focusMenu?: () => void;
  /** `click()` only: the trigger, focused again when a click closes a menu that held focus. */
  trigger?: () => HTMLElement | null;
}

export interface MenuHover {
  triggerEnter(): void;
  /** Pass the event: where the pointer left is the apex of the safe triangle. */
  triggerLeave(event?: MouseEvent): void;
  contentEnter(): void;
  contentLeave(event?: MouseEvent): void;
  /** useMenuHover's own click handling (TopNav, SideNav): keyboard always opens, a click toggles or pins. */
  click(event?: MouseEvent): void;
  /** For a caller's own click handler: true when this click follows a hover open (it pins, it does not close). */
  confirmHoverOpen(): boolean;
  /** Call whenever the menu closed, whatever closed it. */
  notifyClosed(): void;
  /** Drop pending timers and the safe-triangle listener. */
  clear(): void;
}

/** Framework-free useMenuHover. Wire `mouseenter`/`mouseleave` of the trigger and the flyout to it. */
export function createMenuHover(options: MenuHoverOptions): MenuHover {
  const showDelay = options.showDelay ?? 150;
  const hideDelay = options.hideDelay ?? 200;
  const clickGuardMs = options.clickGuardMs ?? DEFAULT_CLICK_GUARD_MS;
  let showTimer: ReturnType<typeof setTimeout> | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let stopTriangle: (() => void) | null = null;
  let hoverMode = false;
  let closedAt = 0;
  let hoverOpenedAt = 0;

  const hasHover = () => typeof matchMedia === 'function' && matchMedia('(hover: hover)').matches;

  const clear = () => {
    if (showTimer) clearTimeout(showTimer);
    if (hideTimer) clearTimeout(hideTimer);
    showTimer = hideTimer = null;
    stopTriangle?.();
    stopTriangle = null;
  };

  const confirmHoverOpen = () => {
    const confirming = clickGuardMs > 0 && hoverOpenedAt > 0 && Date.now() - hoverOpenedAt < clickGuardMs;
    if (!confirming) return false;
    hoverMode = false;
    hoverOpenedAt = 0;
    return true;
  };

  const openAndFocus = () => {
    if (!options.focusMenu) { options.show(); return; }
    options.show({skipAutoFocus: true});
    options.focusMenu();
  };

  const hideAndRestoreFocus = () => {
    const menu = options.flyout?.();
    const hadFocus = menu?.contains(menu.ownerDocument.activeElement) ?? false;
    options.hide();
    const trigger = options.trigger?.();
    if (hadFocus && trigger) focusForLastInput(trigger);
  };

  const leave = (event?: MouseEvent) => {
    closedAt = 0;
    if (!hoverMode || !options.isEnabled()) return;
    clear();
    let lastPoint: Point | null = null;
    let tracking = false;
    let inside: (p: Point) => boolean = () => false;
    const scheduleHide = () => {
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        // A pointer that stopped mid-diagonal is still heading for the flyout.
        if (tracking && lastPoint && inside(lastPoint)) { scheduleHide(); return; }
        hideTimer = null;
        options.hide();
      }, hideDelay);
    };
    scheduleHide();
    const flyout = options.flyout?.();
    if (!flyout || !event || !options.isOpen()) return;
    const rect = flyout.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const apex = {x: event.clientX, y: event.clientY};
    const doc = flyout.ownerDocument;
    inside = (p) => isPointInSafeTriangle(p, apex, rect);
    tracking = true;
    lastPoint = apex;
    const onMove = (move: PointerEvent) => {
      const p = {x: move.clientX, y: move.clientY};
      lastPoint = p;
      if (inside(p)) { scheduleHide(); return; }
      tracking = false;
      stopTriangle?.();
      stopTriangle = null;
    };
    doc.addEventListener('pointermove', onMove, true);
    stopTriangle = () => doc.removeEventListener('pointermove', onMove, true);
  };

  return {
    triggerEnter() {
      if (!options.isEnabled() || !hasHover()) return;
      if (closedAt > 0 && Date.now() - closedAt < REOPEN_SUPPRESS_MS) return;
      // Re-entering an open menu's trigger never re-arms the click guard.
      if (options.isOpen()) { clear(); return; }
      hoverMode = true;
      clear();
      const openByHover = () => {
        showTimer = null;
        if (!options.isEnabled()) return;
        hoverOpenedAt = Date.now();
        options.show({skipAutoFocus: true});
      };
      if (showDelay > 0) showTimer = setTimeout(openByHover, showDelay);
      else openByHover();
    },
    triggerLeave: leave,
    contentEnter() {
      if (options.isEnabled()) clear();
    },
    contentLeave: leave,
    click(event) {
      clear();
      if (event != null && event.detail === 0) {
        // Enter / Space: always open (a keyboard user on the trigger of an open menu lands in it).
        closedAt = 0; hoverMode = false; hoverOpenedAt = 0;
        if (options.isOpen()) options.focusMenu?.();
        else openAndFocus();
        return;
      }
      if (!options.isOpen()) {
        closedAt = 0; hoverMode = false; hoverOpenedAt = 0;
        openAndFocus();
        return;
      }
      if (confirmHoverOpen()) { options.focusMenu?.(); return; }
      hideAndRestoreFocus();
    },
    confirmHoverOpen,
    notifyClosed() {
      clear();
      hoverMode = false;
      hoverOpenedAt = 0;
      closedAt = Date.now();
    },
    clear,
  };
}

// ── Header / footer Tab cycle (menuRegionStops.ts) ──────────────────────────────────────

/** Tabbable controls of a region, minus those inside a `display: none` wrapper. */
export function tabbablesIn(region: HTMLElement | null): HTMLElement[] {
  if (!region) return [];
  const view = region.ownerDocument.defaultView ?? window;
  const hidden = (el: HTMLElement) => {
    for (let node = el.parentElement; node && node !== region.parentElement; node = node.parentElement) {
      if (view.getComputedStyle(node).display === 'none') return true;
    }
    return false;
  };
  return [...region.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((el) => el.tabIndex >= 0 && !el.closest('[inert]') && !hidden(el));
}

/** A named radio group is one Tab stop: the focused radio, else the checked one, else the edge. */
function collapseRadioGroups(elements: HTMLElement[], active: Element | null, isBackward: boolean): HTMLElement[] {
  const keyOf = (el: HTMLElement) => el instanceof HTMLInputElement && el.type === 'radio' && el.name !== '' ? `${el.form?.id ?? ''}\u0000${el.name}` : null;
  const groups = new Map<string, HTMLInputElement[]>();
  for (const el of elements) {
    const key = keyOf(el);
    if (key != null) groups.set(key, [...(groups.get(key) ?? []), el as HTMLInputElement]);
  }
  const placed = new Set<string>();
  const out: HTMLElement[] = [];
  for (const el of elements) {
    const key = keyOf(el);
    if (key == null) { out.push(el); continue; }
    if (placed.has(key)) continue;
    placed.add(key);
    const members = groups.get(key) ?? [];
    out.push(members.find((r) => r === active) ?? members.find((r) => r.checked) ?? (isBackward ? members[members.length - 1] : members[0]));
  }
  return out;
}

/**
 * Tab / Shift+Tab in a menu with a header or footer (the popover is then a modal dialog): the
 * header's controls, the menu as ONE stop, the footer's controls, wrapping at either end.
 * Handles the key in full (preventDefault).
 */
export function moveRegionsTab(event: KeyboardEvent, menu: HTMLElement | null, header: HTMLElement | null, footer: HTMLElement | null, isFromFlyout = false): void {
  if (!menu) return;
  event.preventDefault();
  event.stopPropagation();
  const doc = menu.ownerDocument;
  const active = doc.activeElement;
  const cycle = collapseRadioGroups([...tabbablesIn(header), menu, ...tabbablesIn(footer)], active, event.shiftKey);
  if (cycle.length === 1) {
    if (isFromFlyout) menu.focus();
    return;
  }
  const menuIndex = cycle.indexOf(menu);
  let index = menu.contains(active) ? menuIndex : cycle.findIndex((el) => el === active || el.contains(active));
  if (index < 0) index = menuIndex;
  const next = cycle[(index + (event.shiftKey ? -1 : 1) + cycle.length) % cycle.length];
  next.focus();
  if (doc.activeElement !== next) menu.focus();
}

// ── One menu level: roving focus, typeahead, activation keys, hover focus ───────────────

export interface MenuLevelOptions {
  /** Move focus with the last input's ring (ContextMenu: a right-click lands without one). */
  focusFollowsLastInput?: boolean;
  /** The inline-start arrow (← in LTR, → in RTL) closes this level (submenus). */
  onCloseKey?: (event: KeyboardEvent) => void;
  /** Tab from this level; the default does nothing (the browser moves focus). */
  onTab?: (event: KeyboardEvent) => void;
  /** A key on one of this level's rows, before the level's own handling; true = handled. */
  onRowKey?: (row: HTMLElement, event: KeyboardEvent) => boolean;
  /** A click on one of this level's rows (disabled rows never get here: disabledInteraction). */
  onRowClick?: (row: HTMLElement, event: MouseEvent) => void;
  /** A non-primary click (`auxclick`) on one of this level's rows. */
  onRowAuxClick?: (row: HTMLElement, event: MouseEvent) => void;
}

export interface MenuLevel {
  readonly menu: HTMLElement;
  readonly roving: RovingFocus;
  /** Enabled rows of this level, in DOM order. */
  getItems(): HTMLElement[];
  focusFirst(): boolean;
  focusLast(): boolean;
  focusItem(index: number): void;
  /** The first enabled row, else the menu itself (an empty or loading menu still owns the keys). */
  focusMenu(): void;
  ownsEvent(event: Event): boolean;
  /** The row of this level that contains `target`, if any. */
  rowOf(target: EventTarget | null): HTMLElement | null;
  handleKeyDown(event: KeyboardEvent): void;
  /** Forget the typeahead buffer. */
  reset(): void;
  destroy(): void;
}

/**
 * Attach a menu level to a `role="menu"` element: listeners on that element only (keydown,
 * pointermove, click, auxclick). Events from a nested level's rows bubble through and are
 * ignored here (`ownsEvent`), so each level handles its own keys.
 */
export function createMenuLevel(menu: HTMLElement, options: MenuLevelOptions = {}): MenuLevel {
  const doc = menu.ownerDocument;
  const roving = createRovingFocus(menu, {
    itemSelector: MENU_ITEM_SELECTOR,
    boundarySelector: MENU_BOUNDARY_SELECTOR,
    orientation: 'vertical',
    wrap: true,
    hasHomeEnd: true,
    hasPaging: true,
    hasRovingTabIndex: false,
    focusFollowsLastInput: options.focusFollowsLastInput ?? false,
  });
  const rowOf = (target: EventTarget | null): HTMLElement | null => {
    const row = isElement(target) ? target.closest<HTMLElement>(MENU_ROW_SELECTOR) : null;
    return row && row.closest(MENU_BOUNDARY_SELECTOR) === menu ? row : null;
  };
  // Typeahead over the enabled rows' text: a row's label leads its text, so the prefix match
  // reads the label (never only a description or shortcut).
  const typeahead = createTypeahead({
    getItemLabels: () => roving.getItems().map((el) => el.textContent),
    onMatch: (index) => roving.focusItem(index),
    getCurrentIndex: () => {
      const active = doc.activeElement;
      return roving.getItems().findIndex((el) => el === active || el.contains(active));
    },
  });

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || isImeKeyEvent(event) || !roving.ownsEvent(event)) return;
    const row = rowOf(event.target);
    if (row && options.onRowKey?.(row, event)) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      // The key that opened the menu, held, auto-repeats into it: a repeat never activates.
      if (event.repeat) return;
      const focused = rowOf(doc.activeElement);
      if (focused && MENU_ITEM_ROLES.has(focused.getAttribute('role') ?? '')) activateMenuItem(focused, event);
      return;
    }
    if (event.key === 'Tab') {
      options.onTab?.(event);
      return;
    }
    if (options.onCloseKey && !event.altKey && !event.ctrlKey && !event.metaKey && event.key === (isRtl(menu) ? 'ArrowRight' : 'ArrowLeft')) {
      event.preventDefault();
      options.onCloseKey(event);
      return;
    }
    if (typeahead.onKeyDown(event)) {
      event.preventDefault();
      return;
    }
    roving.handleKeyDown(event);
  };
  const onPointerMove = (event: PointerEvent) => {
    const row = rowOf(event.target);
    if (row) focusMenuItemOnHover(event, row);
  };
  const onClick = (event: MouseEvent) => {
    const row = rowOf(event.target);
    if (row) options.onRowClick?.(row, event);
  };
  const onAuxClick = (event: MouseEvent) => {
    const row = rowOf(event.target);
    if (row) options.onRowAuxClick?.(row, event);
  };
  menu.addEventListener('keydown', handleKeyDown);
  menu.addEventListener('pointermove', onPointerMove);
  menu.addEventListener('click', onClick);
  menu.addEventListener('auxclick', onAuxClick);

  return {
    menu,
    roving,
    getItems: roving.getItems,
    focusFirst: roving.focusFirst,
    focusLast: roving.focusLast,
    focusItem: roving.focusItem,
    focusMenu: () => { if (!roving.focusFirst()) menu.focus(); },
    ownsEvent: roving.ownsEvent,
    rowOf,
    handleKeyDown,
    reset: typeahead.reset,
    destroy() {
      typeahead.reset();
      menu.removeEventListener('keydown', handleKeyDown);
      menu.removeEventListener('pointermove', onPointerMove);
      menu.removeEventListener('click', onClick);
      menu.removeEventListener('auxclick', onAuxClick);
    },
  };
}

// ── `<ax-menu>` ─────────────────────────────────────────────────────────────────────────

export type MenuKind = 'dropdown' | 'submenu' | 'context';
type OpenFocus = 'first' | 'last' | 'container' | 'none';

export interface MenuSelectDetail { event: MouseEvent }
export interface MenuChangeDetail<T> { value: T }

const KIND_ATTR = 'data-ax-menu-kind';
const OVERFLOW_ATTR = 'data-ax-overflow';
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_PX = 10;
const MENU_TAG = 'ax-menu';

/** Keep the 1px cursor anchor inside the trigger: a point in its last pixel steps back one. */
function keepAnchorInside(offset: number, size: number): number {
  return offset > size - 1 && offset <= size ? Math.max(size - 1, 0) : offset;
}

function isTriggerDisabled(trigger: Element | null): boolean {
  return trigger == null || trigger.matches(':disabled, [aria-disabled="true"]');
}

function emit<T>(target: Element, type: string, detail: T, cancelable = false): CustomEvent<T> {
  const event = new CustomEvent<T>(type, {detail, bubbles: true, composed: true, cancelable});
  target.dispatchEvent(event);
  return event;
}

/** The flyout a submenu row opens. */
export function flyoutFor(row: Element | null): MenuElement | null {
  const id = row?.getAttribute('data-ax-submenu');
  const el = id ? row!.ownerDocument.getElementById(id) : null;
  return el instanceof MenuElement ? el : null;
}

export class MenuElement extends LayerElement {
  #level: MenuLevel | null = null;
  #levelCleanup: Array<() => void> = [];
  #hover: MenuHover | null = null;
  #openFocus: OpenFocus | null = null;
  #frame = 0;
  #wired: Array<() => void> = [];
  #stopOverflow: (() => void) | null = null;
  #disabledTooltip: HTMLElement | null = null;
  /** The gesture that opened (or re-anchored) a context menu: its own release is not outside. */
  #openGesture: number | null = null;
  /** The gesture of an open the menu made itself (keyboard fallback, long press): the native contextmenu of it is absorbed. */
  #ownOpenGesture: number | null = null;
  #longPress: {timer: ReturnType<typeof setTimeout>; x: number; y: number} | null = null;

  get kind(): MenuKind {
    const kind = this.getAttribute(KIND_ATTR);
    if (kind === 'dropdown' || kind === 'submenu' || kind === 'context') return kind;
    return this.getAttribute('popover') === 'auto' ? 'dropdown' : 'submenu';
  }

  /** This layer's own `role="menu"` element (not a nested flyout's). */
  get menu(): HTMLElement | null {
    for (const el of this.querySelectorAll<HTMLElement>(MENU_BOUNDARY_SELECTOR)) if (el.closest(MENU_TAG) === this) return el;
    return null;
  }

  /** The control the menu hangs off: the trigger, a flyout's row, a context menu's trigger area. */
  get trigger(): HTMLElement | null {
    const doc = this.ownerDocument;
    if (this.kind === 'context') {
      const id = this.getAttribute('data-ax-context-target');
      return id ? doc.getElementById(id) : null;
    }
    const id = this.getAttribute('data-ax-anchor');
    const el = id ? doc.getElementById(id) : null;
    return el ?? (this.id ? doc.querySelector<HTMLElement>(`[popovertarget="${CSS.escape(this.id)}"]`) : null);
  }

  /** The menu layer whose level holds this flyout's row. */
  get parentMenu(): MenuElement | null {
    const el = this.parentElement?.closest(MENU_TAG);
    return el instanceof MenuElement ? el : null;
  }

  /** The root of this menu tree (a dropdown or context menu). */
  get root(): MenuElement {
    let menu: MenuElement = this;
    while (menu.kind === 'submenu') {
      const parent = menu.parentMenu;
      if (!parent) break;
      menu = parent;
    }
    return menu;
  }

  /** The level controller of this layer's menu (created on demand). */
  get level(): MenuLevel | null {
    return this.#ensureLevel();
  }

  connectedCallback(): void {
    // Mounting open is not an open anyone asked for: no focus move (#5976).
    if (this.getAttribute('data-ax-open') === 'true' && !this.isOpen) this.#openFocus = 'none';
    super.connectedCallback();
    queueMicrotask(() => { if (this.isConnected) this.#wire(); });
  }

  disconnectedCallback(): void {
    for (const off of this.#wired.splice(0)) off();
    this.#destroyLevel();
    this.#hover?.clear();
    this.#hover = null;
    this.#stopOverflow?.();
    this.#stopOverflow = null;
    cancelAnimationFrame(this.#frame);
    this.#cancelLongPress();
    super.disconnectedCallback();
  }

  // ── API ──────────────────────────────────────────────────────────────────

  show(options: {anchor?: HTMLElement | null; source?: HTMLElement | null; reason?: OpenChangeReason} = {}): boolean {
    // A programmatic open lands on the first row (APG), unless the caller decided already.
    if (!this.isOpen && this.#openFocus == null && this.kind !== 'submenu') this.#openFocus = 'first';
    const wasOpen = this.isOpen;
    const shown = super.show(options);
    if (!shown && !wasOpen) this.#openFocus = null;
    return shown;
  }

  /** Focus the first enabled row, else the menu itself. */
  focusMenu(): void {
    this.#ensureLevel()?.focusMenu();
  }

  focusFirst(): boolean {
    return this.#ensureLevel()?.focusFirst() ?? false;
  }

  focusLast(): boolean {
    return this.#ensureLevel()?.focusLast() ?? false;
  }

  /** ContextMenu: open with the top-left corner at a viewport point (clientX/clientY). */
  openAt(clientX: number, clientY: number): boolean {
    const rect = this.trigger?.getBoundingClientRect();
    return this.#openAtLocal(rect ? clientX - rect.left : clientX, rect ? clientY - rect.top : clientY);
  }

  /** A flyout: open beside its row; `focusFirst` lands on its first row (keyboard and click opens). */
  openSubmenu({focusFirst = false, reason = 'toggle' as OpenChangeReason} = {}): boolean {
    const row = this.trigger;
    if (!row || isDisabledRow(row)) return false;
    if (!this.isOpen) {
      this.#openFocus = 'none';
      if (!this.show({anchor: row, reason})) return false;
    }
    // Synchronous: the flyout shows in the same task, and keyboard ownership must leave the parent.
    if (focusFirst) this.focusMenu();
    return true;
  }

  /** A flyout: close it, focusing its row (← / Escape, a click on an open row). */
  closeSubmenu({focusTrigger = true, reason = 'toggle' as OpenChangeReason} = {}): void {
    const row = this.trigger;
    this.hide(reason);
    if (focusTrigger && row) row.focus();
  }

  // ── LayerElement policy ──────────────────────────────────────────────────

  protected escapeBehavior(): LayerEscapeBehavior | null {
    return this.getAttribute('data-ax-escape') === 'none' ? null : 'close';
  }

  protected outsidePressMode(): LayerOutsidePress {
    const kind = this.kind;
    if (kind === 'context') return 'dismiss';
    if (kind === 'submenu') return 'ignore';
    return this.getAttribute('popover') === 'auto' ? 'native' : 'dismiss';
  }

  protected isInsidePress(path: ReadonlyArray<EventTarget>): boolean {
    // A context menu's own trigger area is outside it: a press there closes the menu.
    if (this.kind === 'context') return path.includes(this);
    const trigger = this.trigger;
    return super.isInsidePress(path) || (trigger != null && path.includes(trigger));
  }

  protected restoreFocusTarget(): HTMLElement | null {
    if (this.kind === 'context') return super.restoreFocusTarget();
    return this.trigger ?? super.restoreFocusTarget();
  }

  protected requestDismiss(reason: DismissReason): void {
    // The release of the press that opened (or moved) a context menu is not a press outside it.
    if (reason === 'outside' && this.#openGesture != null && this.#openGesture === currentGesture()) return;
    this.hide(reason);
  }

  protected willOpen(): void {
    const level = this.#ensureLevel();
    const kind = this.kind;
    const trigger = this.trigger;
    if (kind === 'dropdown') {
      if (trigger?.hasAttribute('aria-expanded')) trigger.setAttribute('aria-expanded', 'true');
      this.#setTriggerTooltip(false);
      this.#syncSizeFromTrigger();
    } else if (kind === 'submenu') {
      if (trigger) {
        trigger.setAttribute('aria-expanded', 'true');
        const id = this.#flyoutControlsId();
        if (id) trigger.setAttribute('aria-controls', id);
      }
      this.#hideSiblingFlyouts();
    } else {
      this.#hideOtherContextMenus();
    }
    const focus: OpenFocus = this.#openFocus
      ?? (kind === 'dropdown' ? (getModality(this) === 'pointer' ? 'container' : 'first') : kind === 'context' ? 'first' : 'none');
    this.#openFocus = null;
    cancelAnimationFrame(this.#frame);
    const view = this.ownerDocument.defaultView ?? window;
    // The next frame runs before the shown layer paints.
    this.#frame = view.requestAnimationFrame(() => {
      this.#frame = 0;
      this.#measureOverflow();
      if (!this.isOpen || !level) return;
      if (focus === 'first') level.focusMenu();
      else if (focus === 'last') { if (!level.focusLast()) level.menu.focus(); }
      else if (focus === 'container') focusForLastInput(level.menu, {preventScroll: true});
    });
  }

  protected didOpen(): void {
    this.#measureOverflow();
    this.#observeOverflow();
    this.#announceBusyRows();
  }

  protected willClose(): void {
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    // Flyouts are manual popovers inside this one: the browser never closes them for it.
    this.#hideFlyouts();
    const kind = this.kind;
    const trigger = this.trigger;
    if (kind === 'dropdown') {
      if (trigger?.hasAttribute('aria-expanded')) trigger.setAttribute('aria-expanded', 'false');
    } else if (kind === 'submenu') {
      if (trigger) {
        trigger.setAttribute('aria-expanded', 'false');
        trigger.removeAttribute('aria-controls');
      }
      this.#hover?.notifyClosed();
    }
    this.#level?.reset();
    this.#stopOverflow?.();
    this.#stopOverflow = null;
  }

  protected didClose(): void {
    if (this.kind === 'dropdown') this.#setTriggerTooltip(true);
  }

  // ── Wiring ───────────────────────────────────────────────────────────────

  #wire(): void {
    if (this.#wired.length) return;
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn as EventListener, opts);
      this.#wired.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };
    // Header / footer controls walk the dialog's Tab cycle.
    on(this, 'keydown', (event) => {
      if (event.key !== 'Tab' || event.defaultPrevented) return;
      const target = event.target as Element | null;
      const region = target?.closest?.('[data-ax-menu-region]');
      if (region && region.closest(MENU_TAG) === this) {
        const regions = this.#regions();
        if (regions) moveRegionsTab(event, this.menu, regions.header, regions.footer);
      }
    });
    const trigger = this.trigger;
    const kind = this.kind;
    if (kind === 'dropdown' && trigger) {
      on(trigger, 'keydown', this.#onTriggerKeyDown);
      if (!trigger.hasAttribute('popovertarget')) on(trigger, 'click', this.#onTriggerClick);
    } else if (kind === 'submenu' && trigger) {
      const hover = this.#hoverController();
      on(trigger, 'mouseenter', () => hover.triggerEnter());
      on(trigger, 'mouseleave', (event) => hover.triggerLeave(event));
    } else if (kind === 'context' && trigger) {
      on(trigger, 'contextmenu', this.#onAreaContextMenu);
      on(trigger, 'keydown', this.#onAreaKeyDown);
      on(trigger, 'touchstart', this.#onTouchStart, {passive: true});
      on(trigger, 'touchmove', this.#onTouchMove, {passive: true});
      on(trigger, 'touchend', this.#cancelLongPress, {passive: true});
      on(trigger, 'touchcancel', this.#cancelLongPress, {passive: true});
      // A right-click inside the open menu shows nothing.
      on(this, 'contextmenu', (event) => event.preventDefault());
    }
    // A lazy (template) menu is mounted by its first open, not here.
    this.#ensureLevel(false);
  }

  /** ContextMenu content waits in a `<template>` until the first open (Astryx lazyMount). */
  #materialize(): void {
    const template = this.querySelector<HTMLTemplateElement>(':scope > template[data-ax-menu-content]');
    if (!template) return;
    this.append(template.content);
    template.remove();
  }

  #ensureLevel(materialize = true): MenuLevel | null {
    if (materialize) this.#materialize();
    const menu = this.menu;
    if (!menu) return null;
    if (this.#level?.menu === menu) return this.#level;
    this.#destroyLevel();
    const kind = this.kind;
    this.#level = createMenuLevel(menu, {
      focusFollowsLastInput: this.root.kind === 'context',
      onCloseKey: kind === 'submenu' ? () => this.closeSubmenu({focusTrigger: true}) : undefined,
      onTab: (event) => this.root.#handleTab(event, this),
      onRowKey: (row, event) => this.#onRowKey(row, event),
      onRowClick: (row, event) => this.#onRowClick(row, event),
      onRowAuxClick: (row, event) => {
        // A middle click opens the link in a new tab (auxclick, never click): the menu closes.
        if (event.button === 1 && row.matches('a[href]') && row.getAttribute('data-ax-close-on-select') !== 'false') this.root.hide('press');
      },
    });
    if (kind === 'submenu') {
      const hover = this.#hoverController();
      const enter = () => hover.contentEnter();
      const leave = (event: MouseEvent) => hover.contentLeave(event);
      menu.addEventListener('mouseenter', enter);
      menu.addEventListener('mouseleave', leave);
      this.#levelCleanup.push(() => { menu.removeEventListener('mouseenter', enter); menu.removeEventListener('mouseleave', leave); });
    }
    return this.#level;
  }

  #destroyLevel(): void {
    for (const off of this.#levelCleanup.splice(0)) off();
    this.#level?.destroy();
    this.#level = null;
  }

  #hoverController(): MenuHover {
    if (!this.#hover) {
      this.#hover = createMenuHover({
        show: () => { this.openSubmenu({focusFirst: false, reason: 'hover'}); },
        hide: () => this.hide('hover'),
        isOpen: () => this.isOpen,
        // Hover intent dies with the parent level (#6893) and never opens a disabled row.
        isEnabled: () => !isDisabledRow(this.trigger) && (this.parentMenu?.isOpen ?? false),
        flyout: () => this.menu,
      });
    }
    return this.#hover;
  }

  // ── Dropdown trigger ─────────────────────────────────────────────────────

  #onTriggerKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const trigger = this.trigger;
    if (!this.isOpen) {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      if (event.repeat || isTriggerDisabled(trigger)) return;
      this.#openFocus = event.key === 'ArrowUp' ? 'last' : 'first';
      this.show({source: trigger, reason: 'toggle'});
      return;
    }
    // Open with focus still on the trigger (mounted open, or Shift+Tab back): ↓ walks in.
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.focusMenu();
    }
  };

  /** A trigger that is not a native invoker (`role="button"`). */
  #onTriggerClick = (event: MouseEvent): void => {
    if (event.defaultPrevented || isTriggerDisabled(this.trigger)) return;
    if (this.isOpen) { this.hide('toggle'); return; }
    this.#openFocus = event.detail === 0 ? 'first' : 'container';
    this.show({source: this.trigger, reason: 'toggle'});
  };

  #setTriggerTooltip(enabled: boolean): void {
    if (enabled) {
      this.#disabledTooltip?.removeAttribute('data-ax-enabled');
      this.#disabledTooltip = null;
      return;
    }
    const id = this.trigger?.getAttribute('data-ax-tooltip');
    const tip = id ? this.ownerDocument.getElementById(id) as (HTMLElement & {hideNow?: (r?: OpenChangeReason) => void}) | null : null;
    if (!tip || tip.getAttribute('data-ax-enabled') === 'false') return;
    tip.hideNow?.('press');
    tip.setAttribute('data-ax-enabled', 'false');
    this.#disabledTooltip = tip;
  }

  /** MoreMenu under a size provider: the rows follow the trigger's effective size (useSize). */
  #syncSizeFromTrigger(): void {
    if (!this.hasAttribute('data-ax-size-from-trigger')) return;
    const size = this.trigger?.getAttribute('data-size');
    if (!size || size === this.getAttribute('data-ax-menu-size')) return;
    this.setAttribute('data-ax-menu-size', size);
    const control = size === 'sm' ? 'sm' : 'md';
    for (const row of this.querySelectorAll('[data-ax-menu-row]')) row.setAttribute('data-size', size);
    for (const marker of this.querySelectorAll('[data-ax-marker]')) {
      for (const el of [marker, ...marker.querySelectorAll('[data-size]')]) el.setAttribute('data-size', control);
    }
  }

  // ── Rows ─────────────────────────────────────────────────────────────────

  #onRowKey(row: HTMLElement, event: KeyboardEvent): boolean {
    if (!row.hasAttribute('data-ax-submenu')) return false;
    const flyout = flyoutFor(row);
    if (!flyout || event.altKey || event.ctrlKey || event.metaKey) return false;
    const openKey = isRtl(row) ? 'ArrowLeft' : 'ArrowRight';
    if (event.key !== openKey && event.key !== 'Enter' && event.key !== ' ') return false;
    event.preventDefault();
    if (!event.repeat) flyout.openSubmenu({focusFirst: true, reason: 'toggle'});
    return true;
  }

  #onRowClick(row: HTMLElement, event: MouseEvent): void {
    if (row.hasAttribute('data-ax-submenu')) {
      const flyout = flyoutFor(row);
      if (flyout) flyout.#onSubmenuRowClick(event);
      return;
    }
    this.root.#activate(row, event);
  }

  /** The click on a flyout's row: toggles, except the click that follows a hover open (#3121). */
  #onSubmenuRowClick(event: MouseEvent): void {
    if (isDisabledRow(this.trigger)) { event.preventDefault(); return; }
    if (this.isOpen) {
      if (this.#hover?.confirmHoverOpen()) { this.focusMenu(); return; }
      this.closeSubmenu({focusTrigger: true, reason: 'press'});
    } else {
      this.openSubmenu({focusFirst: true, reason: 'press'});
    }
  }

  /** A row acted (root only): checkbox / radio state, events, the close policy. */
  #activate(row: HTMLElement, event: MouseEvent): void {
    if (isDisabledRow(row)) { event.preventDefault(); return; }
    const role = row.getAttribute('role');
    let closes: boolean;
    if (role === 'menuitemcheckbox') {
      const next = row.getAttribute('aria-checked') !== 'true';
      if (!emit<MenuChangeDetail<boolean>>(row, 'astryx-change', {value: next}, true).defaultPrevented) row.setAttribute('aria-checked', String(next));
      closes = row.getAttribute('data-ax-close-on-select') === 'true';
    } else if (role === 'menuitemradio') {
      const group = row.closest<HTMLElement>('[data-ax-radio-group]');
      const value = row.getAttribute('data-value') ?? '';
      if (!emit<MenuChangeDetail<string>>(group ?? row, 'astryx-change', {value}, true).defaultPrevented) {
        const radios = group ? [...group.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].filter((r) => r.closest('[data-ax-radio-group]') === group) : [row];
        for (const radio of radios) radio.setAttribute('aria-checked', String(radio === row));
      }
      closes = (group?.getAttribute('data-ax-close-on-select') ?? row.getAttribute('data-ax-close-on-select')) !== 'false';
    } else {
      // A modified click on a link row is the browser's (a new tab); the menu still closes.
      if (!(row.matches('a[href]') && isModifiedClick(event))) emit<MenuSelectDetail>(row, 'astryx-select', {event});
      if (row.getAttribute('data-ax-close-on-select') !== 'false') this.hide('press');
      return;
    }
    if (closes) this.hide('press');
    emit<MenuSelectDetail>(row, 'astryx-select', {event});
  }

  #handleTab(event: KeyboardEvent, from: MenuElement): void {
    const regions = this.#regions();
    if (regions) {
      if (from !== this) this.#hideFlyouts();
      moveRegionsTab(event, this.menu, regions.header, regions.footer, from !== this);
      return;
    }
    // APG: Tab closes the menu. No preventDefault: focus returns to the trigger as the menu
    // hides, and the browser's Tab moves on from there.
    this.hide('focus');
  }

  #regions(): {header: HTMLElement | null; footer: HTMLElement | null} | null {
    let header: HTMLElement | null = null;
    let footer: HTMLElement | null = null;
    for (const el of this.querySelectorAll<HTMLElement>('[data-ax-menu-region]')) {
      if (el.closest(MENU_TAG) !== this) continue;
      if (el.getAttribute('data-ax-menu-region') === 'header') header ??= el;
      else footer ??= el;
    }
    return header || footer ? {header, footer} : null;
  }

  // ── Flyouts ──────────────────────────────────────────────────────────────

  #flyoutControlsId(): string | null {
    return this.menu?.id || null;
  }

  /** Every open flyout inside this layer, innermost first. */
  #hideFlyouts(): void {
    const flyouts = [...this.querySelectorAll(MENU_TAG)].reverse();
    for (const flyout of flyouts) if (flyout instanceof MenuElement && flyout.isOpen) flyout.hide('api');
  }

  #hideSiblingFlyouts(): void {
    const level = this.parentElement?.closest(MENU_BOUNDARY_SELECTOR);
    if (!level) return;
    for (const other of level.querySelectorAll(MENU_TAG)) {
      if (other === this || !(other instanceof MenuElement) || !other.isOpen || other.contains(this)) continue;
      if (other.parentElement?.closest(MENU_BOUNDARY_SELECTOR) === level) other.hide('api');
    }
  }

  #hideOtherContextMenus(): void {
    for (const other of this.ownerDocument.querySelectorAll(`${MENU_TAG}[${KIND_ATTR}="context"]`)) {
      if (other !== this && other instanceof MenuElement && other.isOpen && !other.contains(this) && !this.contains(other)) other.hide('outside');
    }
  }

  // ── Overflow (useMenuOverflow.ts) ────────────────────────────────────────

  #measureOverflow(): void {
    const menu = this.menu;
    if (!menu || !this.isOpen) return;
    const over = menu.scrollHeight > menu.clientHeight + 1;
    if (menu.hasAttribute(OVERFLOW_ATTR) !== over) menu.toggleAttribute(OVERFLOW_ATTR, over);
    // An overflowing menu joins the Tab order so its scroll region is keyboard-accessible.
    if (menu.hasAttribute('data-ax-overflow-tabbable')) {
      const tabIndex = over ? '0' : '-1';
      if (menu.getAttribute('tabindex') !== tabIndex) menu.setAttribute('tabindex', tabIndex);
    }
  }

  #observeOverflow(): void {
    this.#stopOverflow?.();
    const menu = this.menu;
    if (!menu) return;
    const view = this.ownerDocument.defaultView ?? window;
    let frame = 0;
    const schedule = () => { if (!frame) frame = view.requestAnimationFrame(() => { frame = 0; this.#measureOverflow(); }); };
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    ro?.observe(menu);
    const mo = new MutationObserver(schedule);
    mo.observe(menu, {childList: true, characterData: true, subtree: true});
    view.addEventListener('resize', schedule);
    this.#stopOverflow = () => {
      ro?.disconnect();
      mo.disconnect();
      view.removeEventListener('resize', schedule);
      if (frame) view.cancelAnimationFrame(frame);
    };
  }

  /** A busy submenu row announces its loading state once its level shows (spec:AST-086 FR8). */
  #announceBusyRows(): void {
    const menu = this.menu;
    if (!menu) return;
    for (const row of menu.querySelectorAll<HTMLElement>('[data-ax-busy-label]')) {
      if (row.closest(MENU_BOUNDARY_SELECTOR) === menu) announce(row.getAttribute('data-ax-busy-label') ?? '', {politeness: 'polite', from: row});
    }
  }

  // ── Context menu ─────────────────────────────────────────────────────────

  get #cursorAnchor(): HTMLElement | null {
    const id = this.getAttribute('data-ax-anchor');
    return id ? this.ownerDocument.getElementById(id) : null;
  }

  #isAreaDisabled(): boolean {
    return this.hasAttribute('data-ax-disabled');
  }

  /** Place the 1px cursor anchor at a point in the trigger area's own box and open there. */
  #openAtLocal(localX: number, localY: number): boolean {
    const area = this.trigger;
    const anchor = this.#cursorAnchor;
    if (!area || !anchor) return false;
    const rect = area.getBoundingClientRect();
    anchor.style.left = `${keepAnchorInside(localX, rect.width)}px`;
    anchor.style.top = `${keepAnchorInside(localY, rect.height)}px`;
    this.#openGesture = currentGesture();
    if (this.isOpen) {
      // Moved under a new right-click: the anchor carries it; land on the first row again.
      settleLayer(this);
      this.#ensureLevel()?.focusMenu();
      return true;
    }
    this.#openFocus = 'first';
    return this.show({anchor, reason: 'press'});
  }

  #onAreaContextMenu = (event: MouseEvent): void => {
    if (this.#isAreaDisabled()) return;
    event.preventDefault();
    // The keyboard fallback or a long press of this gesture opened the menu already.
    if (this.isOpen && this.#ownOpenGesture != null && this.#ownOpenGesture === currentGesture()) return;
    const area = this.trigger;
    if (!area) return;
    const rect = area.getBoundingClientRect();
    // Shift+F10 / the Menu key fire a contextmenu at (0, 0) in several browsers: anchor the
    // menu to the area's bottom-start instead (menus-8).
    const isKeyboard = event.clientX === 0 && event.clientY === 0 && event.detail === 0;
    this.#ownOpenGesture = null;
    this.#openAtLocal(isKeyboard ? 0 : event.clientX - rect.left, isKeyboard ? rect.height : event.clientY - rect.top);
  };

  /** Shift+F10 / the Menu key where the platform sends no contextmenu event for them. */
  #onAreaKeyDown = (event: KeyboardEvent): void => {
    if (this.#isAreaDisabled() || event.defaultPrevented) return;
    if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
    const gesture = currentGesture();
    setTimeout(() => {
      if (this.isOpen || currentGesture() !== gesture || !this.isConnected) return;
      const area = this.trigger;
      if (!area) return;
      this.#ownOpenGesture = gesture;
      this.#openAtLocal(0, area.getBoundingClientRect().height);
    }, 0);
  };

  #onTouchStart = (event: TouchEvent): void => {
    this.#cancelLongPress();
    if (this.#isAreaDisabled() || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;
    this.#longPress = {
      x, y,
      timer: setTimeout(() => {
        this.#longPress = null;
        this.#ownOpenGesture = currentGesture();
        this.openAt(x, y);
      }, LONG_PRESS_MS),
    };
  };

  #onTouchMove = (event: TouchEvent): void => {
    const press = this.#longPress;
    const touch = event.touches[0];
    if (!press || !touch) return;
    if (Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > LONG_PRESS_MOVE_PX) this.#cancelLongPress();
  };

  #cancelLongPress = (): void => {
    if (this.#longPress) clearTimeout(this.#longPress.timer);
    this.#longPress = null;
  };
}

defineElement(MENU_TAG, MenuElement);
