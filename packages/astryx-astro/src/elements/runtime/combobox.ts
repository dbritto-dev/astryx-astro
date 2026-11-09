/**
 * The combobox / listbox controller every listbox popup builds on (Selector, MultiSelector,
 * Typeahead here; Tokenizer, PowerSearch, CommandPalette, DateInput/TimeInput lists next),
 * plus `<ax-combobox-layer>`, the listbox layer root.
 *
 * Ports of @astryxdesign/core:
 *   Selector/hooks.ts useCombobox (keyboard map of the select-only trigger and of a field the
 *     caller renders — getFieldProps / getListboxProps / getOptionProps), MultiSelector/hooks.ts
 *     useMultiCombobox (Enter/Space toggle without closing, typeahead that opens),
 *   hooks/useHighlightedOptionScroll.ts (keyboard moves scroll the option into view; pointer
 *     moves never do; a keyboard scroll holds the highlight until the pointer really moves),
 *   hooks/useKeyboardHighlight.ts (the active option draws the focus ring only after keyboard
 *     input), hooks/useTypeahead.ts (through ./typeahead.ts), utils/ime.ts, and
 *   Layer/outsidePress.ts for a manual list a text input owns (start AND end outside).
 *
 * Markup contract (server-rendered; the controller only reads it and writes state attributes):
 *
 *   <button|input role="combobox" aria-controls="L" aria-expanded="false"
 *           [aria-autocomplete="list"] [aria-activedescendant]>        ← a "field": keeps DOM focus
 *   <… id="L" role="listbox|grid" [aria-multiselectable="true"]>      ← the listbox
 *     <div role="option" id="L-item-0" data-value="apple" [data-ax-label="Apple"]
 *          aria-selected="true|false" [aria-disabled="true"] [hidden]>…</div>
 *     <div role="group" aria-label="Fruit" [hidden]>
 *       <div aria-hidden="true">Fruit</div>                           ← heading (named by the group)
 *       <div role="option" …>…</div>
 *     </div>
 *     <… role="presentation">No options</…>                           ← empty state (never an option)
 *   </…>
 *
 *  - Options are `[role="option"]` descendants of the listbox (configurable), in DOM order;
 *    an option that is `[hidden]` or inside a `[hidden]` ancestor (a filtered group) is not
 *    navigable. Each needs an `id` (aria-activedescendant names it).
 *  - `aria-disabled="true"` options are skipped by the keyboard, the pointer and typeahead.
 *  - Typeahead reads `data-ax-label`, else the option's text.
 *  - State the controller writes: `data-ax-highlighted` on the active option,
 *    `data-ax-keyboard` while that highlight came from keyboard input (draw the focus ring),
 *    and `aria-activedescendant` on every field while the list is open and an option is active.
 *    `aria-selected`, `aria-expanded` and the value are the owner's.
 *  - A press anywhere in the listbox keeps DOM focus in the field (mousedown is cancelled);
 *    a click on an enabled option calls `onActivate`.
 *
 * Usage (an owner element):
 *   const combo = createCombobox({listbox, fields: () => [trigger, searchInput], isOpen, onActivate});
 *   const detach = combo.attach();
 *   trigger.addEventListener('keydown', (e) => handleComboboxKey(combo, e, {kind: 'select', open, close}));
 *   layer 'astryx-open-change' → combo.highlight(combo.selected() ?? combo.first(), 'program'); combo.sync();
 *
 * Framework-free and SSR-safe to import.
 */
import {isImeKeyEvent, upgradeNow} from './dom';
import {LayerElement, defineElement, type OpenChangeReason} from './layer';
import type {LayerEscapeBehavior, LayerOutsidePress} from './layerStack';
import {getModality} from './modality';
import {createTypeahead, type Typeahead} from './typeahead';
import {createSheetSurface, type SheetSurface} from '../sheet/surface';
import {brandClass} from './global';

export const OPTION_SELECTOR = '[role="option"]';
const HIGHLIGHTED = 'data-ax-highlighted';
const KEYBOARD = 'data-ax-keyboard';

/** What moved the highlight: a key (scrolls, may ring), the pointer (never scrolls), the owner. */
export type HighlightSource = 'keyboard' | 'pointer' | 'program';

export interface ComboboxConfig {
  /** The `role="listbox"` (or grid) element. */
  listbox: HTMLElement;
  /** Every element that carries `aria-activedescendant` for this listbox (trigger, search input). */
  fields: () => ReadonlyArray<HTMLElement | null | undefined>;
  /** Whether the list is shown (aria-activedescendant is written only then). */
  isOpen: () => boolean;
  /** A click (or the owner's Enter/Space) on an enabled option. */
  onActivate?: (option: HTMLElement, event: Event | null) => void;
  /** Every highlight change, after the attributes were written. */
  onHighlight?: (option: HTMLElement | null, source: HighlightSource) => void;
  /** @default '[role="option"]' */
  optionSelector?: string;
}

export interface Combobox {
  readonly listbox: HTMLElement;
  /** The owner's open state. */
  isOpen(): boolean;
  /** Navigable options in DOM order (not hidden). */
  options(): HTMLElement[];
  /** Navigable options that are not aria-disabled. */
  enabled(): HTMLElement[];
  isDisabled(option: HTMLElement): boolean;
  /** The active option, or null. */
  highlighted(): HTMLElement | null;
  /** Index of the active option in `options()`, or -1. */
  highlightedIndex(): number;
  /** The first `aria-selected="true"` navigable option, or null. */
  selected(): HTMLElement | null;
  first(): HTMLElement | null;
  last(): HTMLElement | null;
  /** Make `option` active (null clears). */
  highlight(option: HTMLElement | null, source?: HighlightSource): void;
  /** Move among enabled options; clamps at the ends unless `wrap`. Returns the new option. */
  move(step: 1 | -1, options?: {wrap?: boolean; source?: HighlightSource}): HTMLElement | null;
  /** Re-write aria-activedescendant / drop a highlight that is no longer navigable. */
  sync(): void;
  /** Type-to-select over `options()` (labels from data-ax-label / text). */
  typeahead(options: {onMatch: (option: HTMLElement) => void; getCurrent?: () => HTMLElement | null}): Typeahead;
  /** Listbox listeners (pointer highlight, focus keeping, activation). Returns detach. */
  attach(): () => void;
}

const isElement = (t: EventTarget | null): t is Element => t instanceof Element;

function labelOf(option: HTMLElement): string {
  return option.getAttribute('data-ax-label') ?? (option.textContent ?? '').trim();
}

export function createCombobox(config: ComboboxConfig): Combobox {
  const {listbox} = config;
  const selector = config.optionSelector ?? OPTION_SELECTOR;
  let active: HTMLElement | null = null;
  // useHighlightedOptionScroll: after a keyboard move scrolled the list, rows move under a
  // still pointer; the row under it takes the highlight only once the pointer really moves.
  let isHeld = false;
  let lastPointer: {x: number; y: number} | null = null;

  const isNavigable = (el: HTMLElement) => el.isConnected && listbox.contains(el) && el.closest('[hidden]') == null;
  const options = () => [...listbox.querySelectorAll<HTMLElement>(selector)].filter(isNavigable);
  const isDisabled = (el: HTMLElement) => el.getAttribute('aria-disabled') === 'true';
  const enabled = () => options().filter((el) => !isDisabled(el));

  const sync = () => {
    if (active && !isNavigable(active)) {
      active.removeAttribute(HIGHLIGHTED);
      active.removeAttribute(KEYBOARD);
      active = null;
    }
    const id = config.isOpen() && active ? active.id : '';
    for (const field of config.fields()) {
      if (!field) continue;
      if (id) field.setAttribute('aria-activedescendant', id);
      else field.removeAttribute('aria-activedescendant');
    }
  };

  const highlight = (option: HTMLElement | null, source: HighlightSource = 'program') => {
    if (option && !isNavigable(option)) option = null;
    if (active && active !== option) {
      active.removeAttribute(HIGHLIGHTED);
      active.removeAttribute(KEYBOARD);
    }
    active = option;
    if (option) {
      option.setAttribute(HIGHLIGHTED, '');
      // useKeyboardHighlight: the ring follows the shared modality at the time of the move;
      // a pointer highlight keeps the fill alone.
      const ring = source !== 'pointer' && getModality(listbox) === 'keyboard';
      option.toggleAttribute(KEYBOARD, ring);
      if (source !== 'pointer' && config.isOpen()) {
        const before = listbox.scrollTop;
        option.scrollIntoView({block: 'nearest'});
        // Scrolling the list (or its scroll parent) moves rows under the pointer: hold.
        if (source === 'keyboard' || listbox.scrollTop !== before) isHeld = true;
      }
    }
    sync();
    config.onHighlight?.(option, source);
  };

  const move = (step: 1 | -1, {wrap = false, source = 'keyboard'}: {wrap?: boolean; source?: HighlightSource} = {}) => {
    const list = enabled();
    if (list.length === 0) return active;
    const at = active ? list.indexOf(active) : -1;
    let next: number;
    if (wrap) {
      next = at < 0 ? (step > 0 ? 0 : list.length - 1) : (at + step + list.length) % list.length;
    } else {
      next = Math.min(Math.max(at + step, 0), list.length - 1);
    }
    highlight(list[next] ?? null, source);
    return active;
  };

  const onPointerMove = (event: PointerEvent) => {
    const last = lastPointer;
    lastPointer = {x: event.screenX, y: event.screenY};
    if (isHeld) {
      if (last != null && last.x === event.screenX && last.y === event.screenY) return;
      isHeld = false;
    }
    const option = isElement(event.target) ? event.target.closest<HTMLElement>(selector) : null;
    if (!option || !listbox.contains(option) || isDisabled(option) || option === active) return;
    highlight(option, 'pointer');
  };
  const onPointerDown = () => { isHeld = false; };
  // getListboxProps: a press anywhere in the list keeps focus in the field (FR6).
  const onMouseDown = (event: MouseEvent) => {
    if (isElement(event.target) && event.target.closest('input, textarea, [contenteditable="true"]')) return;
    event.preventDefault();
  };
  const onClick = (event: MouseEvent) => {
    const option = isElement(event.target) ? event.target.closest<HTMLElement>(selector) : null;
    if (!option || !listbox.contains(option) || !isNavigable(option) || isDisabled(option)) return;
    config.onActivate?.(option, event);
  };

  return {
    listbox,
    isOpen: () => config.isOpen(),
    options,
    enabled,
    isDisabled,
    highlighted: () => (active && isNavigable(active) ? active : null),
    highlightedIndex: () => (active ? options().indexOf(active) : -1),
    selected: () => options().find((el) => el.getAttribute('aria-selected') === 'true') ?? null,
    first: () => enabled()[0] ?? null,
    last: () => enabled().at(-1) ?? null,
    highlight,
    move,
    sync,
    typeahead({onMatch, getCurrent}) {
      let snapshot: HTMLElement[] = [];
      return createTypeahead({
        getItemLabels: () => {
          snapshot = options();
          return snapshot.map(labelOf);
        },
        isDisabled: (index) => (snapshot[index] ? isDisabled(snapshot[index]) : true),
        getCurrentIndex: () => {
          const current = getCurrent?.() ?? null;
          return current ? snapshot.indexOf(current) : -1;
        },
        onMatch: (index) => { if (snapshot[index]) onMatch(snapshot[index]); },
      });
    },
    attach() {
      listbox.addEventListener('pointermove', onPointerMove);
      listbox.addEventListener('pointerdown', onPointerDown);
      listbox.addEventListener('mousedown', onMouseDown);
      listbox.addEventListener('click', onClick);
      return () => {
        listbox.removeEventListener('pointermove', onPointerMove);
        listbox.removeEventListener('pointerdown', onPointerDown);
        listbox.removeEventListener('mousedown', onMouseDown);
        listbox.removeEventListener('click', onClick);
      };
    },
  };
}

// ── Keyboard map ─────────────────────────────────────────────────────────────

/** Where the highlight lands when a key opens the list. */
export type OpenHighlight = 'first' | 'last' | 'selected' | 'none';

export interface ComboboxKeyConfig {
  /**
   * `select`: a select-only combobox (a `<button role=combobox>`, or the search row of its
   * popup) — useCombobox / useMultiCombobox onKeyDown. `editable`: a text field that owns its
   * caret (Typeahead, a field the caller renders) — getFieldProps / BaseTypeahead.
   */
  kind: 'select' | 'editable';
  /** Enter/Space toggle the active option and keep the list open (MultiSelector). */
  isMultiple?: boolean;
  /**
   * The popup has a search row that owns typing (Selector/MultiSelector `hasSearch`): Space,
   * Delete/Backspace and type-to-select stay off the trigger; a key that opens the list with
   * Enter leaves nothing highlighted.
   */
  hasSearch?: boolean;
  /**
   * The key lands in that search row: only ArrowDown/ArrowUp/PageUp/PageDown/Enter/Escape and
   * Tab are the list's; Space, Home/End and characters stay with the text (APG editable combobox).
   */
  isTextField?: boolean;
  /** Arrows wrap at the ends. @default editable: true, select: false */
  wrap?: boolean;
  /** Open the list; return false when it did not open. */
  open: (key: string) => boolean;
  close: (reason: 'escape' | 'tab' | 'select') => void;
  /** Activate the active option (commit, or toggle when isMultiple). */
  activate: (option: HTMLElement, event: KeyboardEvent) => void;
  /** Where the highlight lands when `key` opened the list. Default: Down → first, Up → last, else selected-or-first. */
  openHighlight?: (key: string) => OpenHighlight;
  /** Delete/Backspace on the closed, non-search trigger clears (comboboxes-2). */
  clear?: () => void;
  hasValue?: () => boolean;
  /** Printable keys on a closed/open trigger whose search row owns typing (Selector hasSearch). */
  seed?: (char: string) => void;
  isDisabled?: () => boolean;
}

function placeOpenHighlight(combo: Combobox, where: OpenHighlight) {
  if (where === 'none') return;
  const target = where === 'last' ? combo.last()
    : where === 'selected' ? (combo.selected() ?? combo.first())
      : combo.first();
  combo.highlight(target, 'keyboard');
}

const hasChord = (e: KeyboardEvent) => e.altKey || e.ctrlKey || e.metaKey || e.shiftKey;

/**
 * Run the combobox keyboard map for one keydown on a field. Returns true when it handled
 * (and, where Astryx does, cancelled) the key; the caller runs its own handler for the rest.
 * IME composition is never treated as a command (utils/ime.ts).
 */
export function handleComboboxKey(combo: Combobox, event: KeyboardEvent, config: ComboboxKeyConfig): boolean {
  if (event.defaultPrevented || isImeKeyEvent(event) || config.isDisabled?.()) return false;
  const isOpen = combo.isOpen();
  if (config.kind === 'editable') return editableKey(combo, event, config, isOpen);
  return selectKey(combo, event, config, isOpen);
}

const TEXT_FIELD_KEYS = new Set(['ArrowDown', 'ArrowUp', 'PageUp', 'PageDown', 'Enter', 'Escape', 'Tab']);

function selectKey(combo: Combobox, e: KeyboardEvent, config: ComboboxKeyConfig, isOpen: boolean): boolean {
  const hasSearch = !!config.hasSearch || !!config.isTextField;
  if (config.isTextField && !TEXT_FIELD_KEYS.has(e.key)) return false;
  const openWith = (key: string, fallback: OpenHighlight) => {
    if (config.open(key)) placeOpenHighlight(combo, config.openHighlight?.(key) ?? fallback);
  };
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      if (!isOpen) openWith('ArrowDown', 'first');
      else combo.move(1, {wrap: config.wrap ?? false});
      return true;
    case 'ArrowUp':
      e.preventDefault();
      if (!isOpen) openWith('ArrowUp', 'last');
      else combo.move(-1, {wrap: config.wrap ?? false});
      return true;
    case ' ':
      // With a search row Space is text; mid-typeahead it extends the query (the caller's
      // typeahead claims it before this map runs).
      if (hasSearch) return false;
    // falls through
    case 'Enter': {
      e.preventDefault();
      const option = combo.highlighted();
      if (isOpen && option) {
        if (!combo.isDisabled(option)) {
          config.activate(option, e);
          if (!config.isMultiple) config.close('select');
        }
      } else if (!isOpen) {
        openWith(e.key, hasSearch ? 'none' : 'selected');
      }
      return true;
    }
    case 'Escape':
      if (isOpen) {
        e.preventDefault();
        config.close('escape');
        return true;
      }
      return false;
    case 'Tab':
      if (isOpen) config.close('tab');
      return false;
    case 'Home':
    case 'End':
    case 'PageUp':
    case 'PageDown': {
      e.preventDefault();
      if (isOpen) {
        const target = e.key === 'Home' || e.key === 'PageUp' ? combo.first() : combo.last();
        if (target) combo.highlight(target, 'keyboard');
      }
      return true;
    }
    case 'Delete':
    case 'Backspace':
      if (!hasSearch && !isOpen && config.clear && (config.hasValue?.() ?? true)) {
        e.preventDefault();
        config.clear();
        return true;
      }
      return false;
    default:
      if (config.seed && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        if (isOpen || config.open(e.key)) config.seed(e.key);
        return true;
      }
      return false;
  }
}

function editableKey(combo: Combobox, e: KeyboardEvent, config: ComboboxKeyConfig, isOpen: boolean): boolean {
  // A chord is the field's own command (Shift+Enter …), except Escape.
  if (hasChord(e) && e.key !== 'Escape') return false;
  if (!isOpen) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (config.open('ArrowDown')) placeOpenHighlight(combo, config.openHighlight?.('ArrowDown') ?? 'first');
      return true;
    }
    return false;
  }
  switch (e.key) {
    case 'ArrowDown':
    case 'ArrowUp':
      // The list keeps the arrows even with nothing to move to (no caret moves under it).
      e.preventDefault();
      combo.move(e.key === 'ArrowDown' ? 1 : -1, {wrap: config.wrap ?? true});
      return true;
    case 'Enter': {
      // BaseTypeahead: Enter on an open list is the list's (no form submit).
      e.preventDefault();
      const option = combo.highlighted();
      if (option && !combo.isDisabled(option)) {
        config.activate(option, e);
        if (!config.isMultiple) config.close('select');
      }
      return true;
    }
    case 'Escape':
      e.preventDefault();
      config.close('escape');
      return true;
    case 'Tab':
      // Dismiss on the keydown, not the blur (Chrome drops a focus move hidden mid-focusout).
      config.close('tab');
      return false;
    case 'Home':
    case 'End': {
      e.preventDefault();
      const target = e.key === 'Home' ? combo.first() : combo.last();
      if (target) combo.highlight(target, 'keyboard');
      return true;
    }
    default:
      return false;
  }
}

// ── <ax-combobox-layer> ──────────────────────────────────────────────────────

/**
 * The layer root of a combobox's list. `popover="auto"` (a button trigger — the browser's
 * light dismiss) or `popover="manual"` + `data-ax-outside-press="dismiss"` (a text input
 * cannot be an invoker: the shared stack closes it when a press starts AND ends outside the
 * layer and its anchor — Layer/outsidePress.ts). Escape closes it through the shared stack
 * unless `data-ax-escape="none"`; it never takes focus (the field keeps it).
 *
 * Attributes: everything `<ax-layer>` reads, plus `data-ax-outside-press="dismiss"` and
 * `data-ax-inside="<id> …"` (more elements whose presses count as inside, e.g. a clear button
 * outside the anchor).
 *
 * Presentation (Selector, MultiSelector): `data-ax-presentation="bottom-sheet|adaptive"` + the
 * `ax-sheet-layer` class, the surface `.ax-sheet-surface` and `data-ax-surface-class` (its
 * anchored theme classes, swapped for `astryx-bottom-sheet`) — the presentation contract
 * (../sheet/surface.ts): opened as a sheet the layer is unanchored, a modal dialog named by
 * `data-ax-sheet-label`, and `isSheet` tells the owner to move focus into it (SelectorBottomSheet).
 */
export class ComboboxLayerElement extends LayerElement {
  #sheet: SheetSurface | null = null;

  /** Latched as a bottom sheet for the current opening. */
  get isSheet(): boolean {
    return this.#sheet?.isSheet ?? false;
  }

  connectedCallback(): void {
    if (this.hasAttribute('data-ax-presentation')) {
      this.#sheet ??= createSheetSurface({
        layer: this,
        surface: () => this.querySelector<HTMLElement>(':scope > .ax-sheet-surface'),
        anchoredClass: this.getAttribute('data-ax-surface-class') ?? 'astryx-popover',
        triggers: () => (this.id ? [...this.ownerDocument.querySelectorAll<HTMLElement>(`[popovertarget="${CSS.escape(this.id)}"][aria-haspopup]`)] : []),
        anchoredHaspopup: () => 'listbox',
      });
      this.#sheet.connect();
    }
    super.connectedCallback();
  }

  disconnectedCallback(): void {
    this.#sheet?.disconnect();
    super.disconnectedCallback();
  }

  show(options: {anchor?: HTMLElement | null; source?: HTMLElement | null; reason?: OpenChangeReason} = {}): boolean {
    if (!this.isOpen && this.#sheet) {
      this.#sheet.latch();
      // A sheet is never anchored.
      if (this.#sheet.isSheet) return super.show({...options, anchor: null});
    }
    return super.show(options);
  }

  protected resolveAnchor(invoker: HTMLElement | null = null): HTMLElement | null {
    // The first hook of every open (the native invoker's too): choose the surface here.
    if (this.#sheet) {
      this.#sheet.latch();
      if (this.#sheet.isSheet) return null;
    }
    return super.resolveAnchor(invoker);
  }

  protected didOpen(): void {
    if (this.#sheet?.isSheet) this.#sheet.start();
  }

  protected willClose(): void {
    if (!this.#sheet) return;
    this.#sheet.stop();
    // The page scrolls again as the exit starts (useScrollLock(isOpen)).
    this.removeAttribute('data-ax-scroll-lock');
  }

  protected didClose(): void {
    this.#sheet?.closed();
  }

  protected escapeBehavior(): LayerEscapeBehavior | null {
    return this.getAttribute('data-ax-escape') === 'none' ? null : 'close';
  }

  protected outsidePressMode(): LayerOutsidePress {
    // A sheet covers the viewport: its own press beside the panel dismisses it.
    if (this.#sheet?.isSheet) return 'ignore';
    if (this.getAttribute('data-ax-outside-press') === 'dismiss') return 'dismiss';
    return this.getAttribute('popover') === 'auto' ? 'native' : 'ignore';
  }

  protected isInsidePress(path: ReadonlyArray<EventTarget>): boolean {
    if (super.isInsidePress(path)) return true;
    const ids = (this.getAttribute('data-ax-inside') ?? '').split(/\s+/).filter(Boolean);
    return ids.some((id) => {
      const el = this.ownerDocument.getElementById(id);
      return el != null && path.includes(el);
    });
  }
}

brandClass(ComboboxLayerElement, 'combobox-layer-element');
defineElement('ax-combobox-layer', ComboboxLayerElement);

/**
 * Find a listbox layer by id (the owner's `data-ax-layer`). Owners call this while connecting,
 * when inserted markup may not have upgraded the layer yet (it follows them): see upgradeNow.
 */
export function comboboxLayer(owner: Element, id: string | null): ComboboxLayerElement | null {
  const el = upgradeNow(id ? owner.ownerDocument.getElementById(id) : null);
  return el instanceof ComboboxLayerElement ? el : null;
}

/**
 * Keep a layer open while a control outside it is pressed (useKeepLayerOpenProps): the control
 * becomes the layer's invoker for the press, so the browser's light dismiss counts it as
 * inside; the attribute is removed before the click's activation could toggle the layer.
 * Returns the cleanup. Mark the buttons (or a wrapper around one) with `data-ax-keep-open`.
 */
export function keepLayerOpenFor(root: HTMLElement, layer: () => HTMLElement | null): () => void {
  const TEMP = 'data-ax-temp-invoker';
  const onPointerDown = (event: PointerEvent) => {
    const marked = isElement(event.target) ? event.target.closest<HTMLElement>('[data-ax-keep-open]') : null;
    // The marked node may be a wrapper (InputClearButton's slot): the invoker is its button.
    const control = isElement(event.target) ? event.target.closest<HTMLElement>('button') : null;
    const target = layer();
    if (!marked || !control || !marked.contains(control) || !target || !root.contains(control) || control.hasAttribute('popovertarget')) return;
    if (!target.matches(':popover-open') || !target.id) return;
    control.setAttribute('popovertarget', target.id);
    control.setAttribute(TEMP, '');
    const doc = control.ownerDocument;
    const end = () => {
      doc.removeEventListener('pointerup', end, true);
      doc.removeEventListener('pointercancel', end, true);
      // Light dismiss runs as the pointerup default action, after listeners.
      doc.defaultView?.setTimeout(() => {
        if (control.hasAttribute(TEMP)) {
          control.removeAttribute('popovertarget');
          control.removeAttribute(TEMP);
        }
      }, 0);
    };
    doc.addEventListener('pointerup', end, true);
    doc.addEventListener('pointercancel', end, true);
  };
  const onClickCapture = (event: MouseEvent) => {
    const control = isElement(event.target) ? event.target.closest<HTMLElement>(`[${TEMP}]`) : null;
    if (!control) return;
    control.removeAttribute('popovertarget');
    control.removeAttribute(TEMP);
  };
  root.addEventListener('pointerdown', onPointerDown, true);
  root.addEventListener('click', onClickCapture, true);
  return () => {
    root.removeEventListener('pointerdown', onPointerDown, true);
    root.removeEventListener('click', onClickCapture, true);
  };
}
