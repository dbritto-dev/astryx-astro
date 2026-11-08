/**
 * <ax-resizable> — the ResizeHandle root: a window splitter that owns one resize region.
 * Port of @astryxdesign/core Resizable/createResizable.ts (the framework-free region core)
 * and Resizable/resizeGesture.ts (pointer, keyboard and double-click input), with the parts
 * of ResizeHandle.tsx / resizablePane.ts that tie a handle to the pane beside it.
 *
 * Reads its region from `data-config` (ResizableConfig JSON) and its handle settings from
 * data-direction, data-reversed, aria-disabled, data-pill-placement, data-collapsed-label,
 * data-controls. Sizes the pane (inline width, or height when vertical), holds it collapsed
 * (`inert`, `aria-hidden`, `data-collapsed`; `data-zero-width` on a LayoutPanel) and keeps the
 * separator's ARIA, `data-resizing`, `data-pill-side` and the grab-zone length in sync.
 *
 * API: `size`, `isCollapsed` (settable), `collapse()`, `expand()`, `resize(px)`.
 * Events (bubbling, composed): `astryx-size-change` {size}, `astryx-collapse-change` {isCollapsed}.
 */
import {
  DEFAULT_COLLAPSED_SIZE,
  DEFAULT_MIN,
  DEFAULT_SIZE_FALLBACK,
  KEYBOARD_LARGE_STEP,
  KEYBOARD_STEP,
  SERVER_BASIS,
  clampSize,
  dependsOnBasis,
  loadPersistedState,
  measureContentBox,
  parseSize,
  persistState,
  resolveBound,
  separatorAttributes,
  type PersistedResizableState,
  type ResizableConfig,
  type ResizableDirection,
} from '../components/Resizable/resizableModel';

interface GestureState {
  size: number;
  isCollapsed: boolean;
  minPx: number;
  maxPx: number;
  snaps: number[];
  collapsedSize: number;
  collapsible: boolean;
}

function parseConfig(raw: string | null): ResizableConfig | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed != null ? (parsed as ResizableConfig) : null;
  } catch {
    return null;
  }
}

/** The snap point `count` points away from the size in `direction`, within the bounds. */
function adjacentSnapPoint(state: GestureState, direction: 1 | -1, count: number): number {
  const points = [...new Set(state.snaps.map((p) => Math.min(state.maxPx, Math.max(state.minPx, p))))].sort((a, b) => a - b);
  const {size} = state;
  const ahead = direction > 0 ? points.filter((p) => p > size) : points.filter((p) => p < size).reverse();
  if (ahead.length === 0) return size;
  return ahead[Math.min(count, ahead.length) - 1];
}

class AxResizable extends HTMLElement {
  static observedAttributes = ['data-config', 'aria-disabled', 'data-direction', 'data-reversed'];

  #opts: ResizableConfig | null = null;
  #connected = false;
  #persisted: PersistedResizableState | null = null;
  #persistedKey: string | undefined;

  // Percentage basis
  #containerElement: HTMLElement | null = null;
  #observedDirection: ResizableDirection | null = null;
  #containerBasis: number | null = null;
  #containerRO: ResizeObserver | null = null;
  #observingViewport = false;

  // Gesture
  #gestureBasis: number | null = null;
  #gestureActive = false;
  #dragStartSize = 0;
  #drag: {pointerId: number; startPos: number; rtl: number; target: Element | null} | null = null;

  // Selection
  #initialDefault: {px: number; isFinal: boolean} | null = null;
  #chosenSize: number | null | undefined = undefined;
  #committedBounds: {min: number; max: number} | null = null;
  #uncontrolledIsCollapsed = false;
  #derived = {size: 0, isCollapsed: false, min: DEFAULT_MIN, max: Infinity, effectiveMax: undefined as number | undefined, isBasisMeasured: true};
  #written: {key: string; size: number; isCollapsed: boolean} | null = null;
  #mustWrite = false;
  #concealed: HTMLElement | null = null;
  #cleanup: Array<() => void> = [];

  // ── Public API ──────────────────────────────────────────────────────────
  get size(): number {
    return this.#derived.isCollapsed ? 0 : this.#derived.size;
  }

  get isCollapsed(): boolean {
    return this.#derived.isCollapsed;
  }

  set isCollapsed(value: boolean) {
    if (!this.#opts) return;
    if (this.#isControlled()) {
      this.#opts = {...this.#opts, isCollapsed: Boolean(value)};
      this.#commit();
    } else if (value) this.collapse();
    else this.expand();
  }

  collapse(): void {
    if (!this.#opts || !this.#collapsible() || this.#derived.isCollapsed) return;
    this.#setCollapsed(true);
    this.#commit();
    this.#emitCollapse(true);
    this.#emitSize(0);
  }

  expand(): void {
    if (!this.#opts) return;
    const was = this.#derived.isCollapsed;
    this.#setCollapsed(false);
    this.#commit();
    if (was) this.#emitCollapse(false);
    this.#emitSize(this.#derived.size);
  }

  resize(next: number): void {
    if (!this.#opts || !Number.isFinite(next) || next < 0) return;
    const clamped = clampSize(next, this.#derived.min, this.#derived.max, this.#snaps());
    const was = this.#derived.isCollapsed;
    this.#chosenSize = clamped;
    this.#setCollapsed(false);
    this.#commit();
    if (was) this.#emitCollapse(false);
    this.#emitSize(clamped);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────
  connectedCallback() {
    this.#connected = true;
    this.#opts = parseConfig(this.getAttribute('data-config'));
    if (this.#opts) {
      this.#persistedKey = this.#opts.autoSaveId;
      this.#persisted = this.#persistedKey ? loadPersistedState(this.#persistedKey) : null;
      this.#uncontrolledIsCollapsed = this.#persisted?.isCollapsed ?? this.#opts.defaultIsCollapsed ?? false;
    }
    const grabTargets = [
      this.querySelector<HTMLElement>(':scope > .ax-resize-handle-hit'),
      this.querySelector<HTMLElement>(':scope > .astryx-resize-handle-pill'),
    ].filter((el): el is HTMLElement => el != null);
    const down = (e: PointerEvent) => this.#pointerDown(e);
    const move = (e: PointerEvent) => this.#pointerMove(e);
    const up = (e: PointerEvent) => this.#pointerUp(e);
    const cancel = (e: PointerEvent) => this.#pointerCancel(e);
    for (const el of grabTargets) {
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', cancel);
      el.addEventListener('lostpointercapture', cancel);
    }
    const key = (e: KeyboardEvent) => this.#keyDown(e);
    const dbl = () => this.#doubleClick();
    this.addEventListener('keydown', key);
    this.addEventListener('dblclick', dbl);
    this.#cleanup.push(() => {
      for (const el of grabTargets) {
        el.removeEventListener('pointerdown', down);
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', cancel);
        el.removeEventListener('lostpointercapture', cancel);
      }
      this.removeEventListener('keydown', key);
      this.removeEventListener('dblclick', dbl);
    });
    this.#commit();
  }

  disconnectedCallback() {
    this.#interrupt();
    this.#endGesture();
    this.#connected = false;
    for (const fn of this.#cleanup.splice(0)) fn();
    this.#containerRO?.disconnect();
    this.#containerRO = null;
    this.#containerElement = null;
    if (this.#observingViewport) {
      window.removeEventListener('resize', this.#onViewportResize);
      this.#observingViewport = false;
    }
    // A pane this handle held collapsed opens when the handle goes.
    this.#release();
  }

  attributeChangedCallback(name: string, oldValue: string | null, value: string | null) {
    if (!this.#connected || oldValue === value) return;
    if (name === 'data-config') {
      this.#opts = parseConfig(value);
      if (this.#opts?.autoSaveId !== this.#persistedKey) {
        this.#persistedKey = this.#opts?.autoSaveId;
        this.#persisted = this.#persistedKey ? loadPersistedState(this.#persistedKey) : null;
      }
    }
    this.#commit();
  }

  // ── Settings ────────────────────────────────────────────────────────────
  #direction(): ResizableDirection {
    return this.getAttribute('data-direction') === 'vertical' ? 'vertical' : 'horizontal';
  }
  #isReversed() {
    return this.hasAttribute('data-reversed');
  }
  #isDisabled() {
    return this.getAttribute('aria-disabled') === 'true' || this.#opts == null;
  }
  #collapsible() {
    return this.#opts?.collapsible ?? false;
  }
  #isControlled() {
    return this.#opts?.isCollapsed !== undefined && this.#opts?.isCollapsed !== null;
  }
  #snaps(): number[] {
    return this.#opts?.snaps ?? [];
  }
  #setCollapsed(value: boolean) {
    if (!this.#isControlled()) this.#uncontrolledIsCollapsed = value;
  }

  #emitSize(size: number) {
    this.dispatchEvent(new CustomEvent('astryx-size-change', {bubbles: true, composed: true, detail: {size}}));
  }
  #emitCollapse(isCollapsed: boolean) {
    this.dispatchEvent(new CustomEvent('astryx-collapse-change', {bubbles: true, composed: true, detail: {isCollapsed}}));
  }

  // ── Basis ───────────────────────────────────────────────────────────────
  #onViewportResize = () => this.#commit();

  #observation() {
    const o = this.#opts ?? {};
    const boundsDependOnBasis = dependsOnBasis(parseSize(o.minSize)) || dependsOnBasis(parseSize(o.maxSize));
    const defaultNeedsInitialBasis = this.#persisted?.size == null && dependsOnBasis(parseSize(o.defaultSize)) && this.#initialDefault?.isFinal !== true;
    const hasContainer = o.container != null && o.container !== '';
    return {
      hasContainer,
      container: hasContainer && (boundsDependOnBasis || defaultNeedsInitialBasis),
      viewport: !hasContainer && boundsDependOnBasis,
    };
  }

  #resolveContainer(): HTMLElement | null {
    const selector = this.#opts?.container;
    if (!selector) return null;
    try {
      return (this.closest(selector) as HTMLElement | null) ?? document.querySelector<HTMLElement>(selector);
    } catch {
      return null;
    }
  }

  #syncObservation() {
    const needs = this.#observation();
    const element = needs.container ? this.#resolveContainer() : null;
    if (element !== this.#containerElement || this.#observedDirection !== this.#direction()) {
      this.#containerRO?.disconnect();
      this.#containerRO = null;
      this.#containerElement = element;
      this.#containerBasis = null;
      this.#observedDirection = this.#direction();
      if (element != null) {
        // Measure now for this computation; later entries recommit.
        this.#containerBasis = measureContentBox(element, this.#direction());
        let first = true;
        this.#containerRO = new ResizeObserver(([entry]) => {
          this.#containerBasis = measureContentBox(element, this.#direction(), entry);
          if (first) {
            first = false;
            return;
          }
          this.#commit();
        });
        this.#containerRO.observe(element);
      }
    }
    const watchViewport = needs.viewport;
    if (watchViewport && !this.#observingViewport) {
      window.addEventListener('resize', this.#onViewportResize);
      this.#observingViewport = true;
    } else if (!watchViewport && this.#observingViewport) {
      window.removeEventListener('resize', this.#onViewportResize);
      this.#observingViewport = false;
    }
  }

  #liveBasis(): number {
    const needs = this.#observation();
    if (!needs.hasContainer) return window.innerWidth;
    return this.#containerBasis != null && this.#containerBasis > 0 ? this.#containerBasis : SERVER_BASIS;
  }

  // ── Region state ───────────────────────────────────────────────────────
  #compute() {
    const o = this.#opts ?? {};
    const needs = this.#observation();
    const positive = this.#containerBasis != null && this.#containerBasis > 0;
    const liveBasis = needs.hasContainer ? (positive ? (this.#containerBasis as number) : SERVER_BASIS) : window.innerWidth;
    const isBasisMeasured = needs.container ? positive : true;
    const basis = this.#gestureBasis ?? liveBasis;
    const snaps = this.#snaps();
    const min = resolveBound(o.minSize, basis, DEFAULT_MIN);
    const max = resolveBound(o.maxSize, basis, Infinity);
    // A basis-dependent default resolves ONCE into pixels, final once its basis is real.
    if (this.#initialDefault == null || !this.#initialDefault.isFinal) {
      this.#initialDefault = {px: resolveBound(o.defaultSize, basis, DEFAULT_SIZE_FALLBACK), isFinal: isBasisMeasured};
    }
    const defaultPx = this.#initialDefault.px;
    if (this.#chosenSize === undefined) {
      this.#chosenSize = this.#persisted?.size ?? (isBasisMeasured ? clampSize(defaultPx, min, max, snaps) : null);
    }
    if (isBasisMeasured && this.#chosenSize == null) this.#chosenSize = clampSize(defaultPx, min, max, snaps);
    // A re-resolved bound clamps the selection once the basis is final and no gesture holds it.
    if (isBasisMeasured && this.#gestureBasis == null
      && (this.#committedBounds == null || this.#committedBounds.min !== min || this.#committedBounds.max !== max)) {
      this.#committedBounds = {min, max};
      if (this.#chosenSize != null) this.#chosenSize = clampSize(this.#chosenSize, min, max, snaps);
    }
    const size = clampSize(this.#chosenSize ?? defaultPx, min, max, snaps);
    const isCollapsed = this.#collapsible() && (this.#isControlled() ? Boolean(o.isCollapsed) : this.#uncontrolledIsCollapsed);
    // The maximum the handle REPORTS: a configured one, or the measured extent.
    const measuredForMax = needs.hasContainer
      ? (positive && needs.container ? this.#containerBasis : null)
      : (this.#direction() === 'vertical' ? window.innerHeight : window.innerWidth);
    const effectiveMax = max !== Infinity ? max : measuredForMax == null ? undefined : Math.max(measuredForMax, isCollapsed ? min : size);
    this.#derived = {size, isCollapsed, min, max, effectiveMax, isBasisMeasured};
  }

  #commit() {
    if (!this.#connected) return;
    if (this.#opts) {
      for (let pass = 0; pass < 3; pass++) {
        const before = this.#observation();
        this.#syncObservation();
        this.#compute();
        const after = this.#observation();
        if (before.container === after.container && before.viewport === after.viewport) break;
      }
      this.#persist();
    }
    this.#render();
  }

  #persist() {
    const key = this.#opts?.autoSaveId;
    if (!key || !this.#derived.isBasisMeasured || this.#gestureActive) return;
    const next = {key, size: this.#derived.size, isCollapsed: this.#derived.isCollapsed};
    const w = this.#written;
    if (this.#mustWrite || w == null || w.key !== next.key || w.size !== next.size || w.isCollapsed !== next.isCollapsed) {
      this.#mustWrite = false;
      this.#written = next;
      persistState(key, {size: next.size, isCollapsed: next.isCollapsed});
    }
  }

  // ── Paint: ARIA, handle state, pane ────────────────────────────────────
  #set(el: Element, name: string, value: string | null | undefined) {
    if (value == null) {
      if (el.hasAttribute(name)) el.removeAttribute(name);
    } else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  }

  #pane(): HTMLElement | null {
    const id = this.getAttribute('data-controls');
    // The pane: `controls`, else the panel an overlay handle sits in, else the sibling
    // before the handle (after it when reversed).
    const el = id
      ? document.getElementById(id)
      : this.getAttribute('data-position') === 'overlay'
        ? this.parentElement
        : this.#isReversed() ? this.nextElementSibling : this.previousElementSibling;
    return el instanceof HTMLElement ? el : null;
  }

  #render() {
    const direction = this.#direction();
    const disabled = this.getAttribute('aria-disabled') === 'true';
    const d = this.#derived;
    const value = this.#opts
      ? {size: d.isCollapsed ? 0 : d.size, minPx: d.min, maxPx: d.effectiveMax, isCollapsed: d.isCollapsed,
        collapsedText: this.getAttribute('data-collapsed-label') ?? 'Collapsed'}
      : undefined;
    const aria = separatorAttributes(direction, disabled, value);
    this.#set(this, 'aria-orientation', aria['aria-orientation']);
    this.#set(this, 'aria-valuenow', aria['aria-valuenow']?.toString());
    this.#set(this, 'aria-valuemin', aria['aria-valuemin']?.toString());
    this.#set(this, 'aria-valuemax', aria['aria-valuemax']?.toString());
    this.#set(this, 'aria-valuetext', aria['aria-valuetext']);
    if (!this.#opts) return;

    // Pill side (auto: the pane side, flipped while collapsed).
    const placement = this.getAttribute('data-pill-placement') ?? 'auto';
    const panelSide = this.#isReversed() ? 'end' : 'start';
    const side = placement !== 'auto' ? placement : d.isCollapsed ? (panelSide === 'start' ? 'end' : 'start') : panelSide;
    this.#set(this, 'data-pill-side', side);

    // The grab zone reaches at most half of an open pane.
    const size = d.isCollapsed ? 0 : d.size;
    const paneLength = d.isCollapsed || size <= 0 ? undefined : size;
    this.#set(this, 'data-pane-length', paneLength != null ? '' : null);
    const hit = this.querySelector<HTMLElement>(':scope > .ax-resize-handle-hit');
    if (hit) {
      const prop = direction === 'horizontal' ? 'width' : 'height';
      hit.style.removeProperty(direction === 'horizontal' ? 'height' : 'width');
      if (paneLength != null && this.getAttribute('data-position') !== 'overlay') hit.style.setProperty(prop, `min(var(--spacing-4), ${paneLength}px)`);
      else hit.style.removeProperty(prop);
    }

    // The pane: its size, and collapsed it is inert and hidden (focus moves here first).
    const pane = this.#pane();
    if (!pane) return;
    pane.style.setProperty(direction === 'vertical' ? 'height' : 'width', `${size}px`);
    if (pane.classList.contains('astryx-layout-panel')) this.#set(pane, 'data-zero-width', size === 0 ? '' : null);
    if (this.#concealed && this.#concealed !== pane) this.#release();
    if (d.isCollapsed) {
      const active = document.activeElement;
      if (active instanceof HTMLElement && pane.contains(active)) this.focus({preventScroll: true});
      pane.inert = true;
      this.#set(pane, 'aria-hidden', 'true');
      this.#set(pane, 'data-collapsed', '');
      this.#concealed = pane;
    } else if (this.#concealed === pane || pane.hasAttribute('data-collapsed')) {
      this.#concealed = pane;
      this.#release();
    }
  }

  #release() {
    const pane = this.#concealed;
    if (!pane) return;
    this.#concealed = null;
    pane.inert = false;
    pane.removeAttribute('aria-hidden');
    pane.removeAttribute('data-collapsed');
  }

  // ── Gesture model (createResizable's model) ────────────────────────────
  #state(): GestureState {
    const d = this.#derived;
    return {
      size: d.isCollapsed ? 0 : d.size,
      isCollapsed: d.isCollapsed,
      minPx: d.min,
      maxPx: d.max,
      snaps: this.#snaps(),
      collapsedSize: this.#opts?.collapsedSize ?? DEFAULT_COLLAPSED_SIZE,
      collapsible: this.#collapsible(),
    };
  }

  #start() {
    this.#gestureBasis = this.#liveBasis();
    this.#gestureActive = true;
    this.#dragStartSize = this.#derived.isCollapsed ? 0 : this.#derived.size;
  }

  #move(delta: number) {
    const raw = this.#dragStartSize + delta;
    const collapsedSize = this.#opts?.collapsedSize ?? DEFAULT_COLLAPSED_SIZE;
    if (this.#collapsible() && raw < collapsedSize) {
      if (!this.#derived.isCollapsed) {
        this.#setCollapsed(true);
        this.#commit();
        this.#emitCollapse(true);
        this.#emitSize(0);
      }
      return;
    }
    const reopens = this.#derived.isCollapsed && raw >= collapsedSize;
    if (reopens) this.#setCollapsed(false);
    const clamped = clampSize(raw, this.#derived.min, this.#derived.max, this.#snaps());
    this.#chosenSize = clamped;
    this.#commit();
    if (reopens) this.#emitCollapse(false);
    this.#emitSize(clamped);
  }

  #endGesture() {
    if (!this.#gestureActive) return;
    this.#gestureBasis = null;
    this.#gestureActive = false;
    this.#mustWrite = true;
    this.#commit();
  }

  #step(delta: number) {
    this.#start();
    this.#move(delta);
    this.#endGesture();
  }

  /** Collapse an open pane, or restore a collapsed one to its size before collapsing. */
  #toggleCollapse() {
    if (this.#derived.isCollapsed) this.expand();
    else this.collapse();
  }

  // ── Input (resizeGesture.ts) ───────────────────────────────────────────
  #rtl(): number {
    return getComputedStyle(this).direction === 'rtl' ? -1 : 1;
  }

  #clearDrag() {
    const ending = this.#drag;
    this.#drag = null;
    const target = ending?.target;
    if (ending && target?.hasPointerCapture(ending.pointerId)) target.releasePointerCapture(ending.pointerId);
    if (ending) {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    this.removeAttribute('data-resizing');
  }

  #pointerDown(e: PointerEvent) {
    if (this.#isDisabled() || this.#drag != null) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as Element | null;
    target?.setPointerCapture(e.pointerId);
    const horizontal = this.#direction() === 'horizontal';
    this.#drag = {pointerId: e.pointerId, startPos: horizontal ? e.clientX : e.clientY, rtl: horizontal ? this.#rtl() : 1, target};
    this.setAttribute('data-resizing', '');
    this.#start();
    document.body.style.cursor = horizontal ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }

  #pointerMove(e: PointerEvent) {
    const drag = this.#drag;
    if (drag == null || drag.pointerId !== e.pointerId) return;
    const position = this.#direction() === 'horizontal' ? e.clientX : e.clientY;
    const sign = this.#isReversed() ? -1 : 1;
    this.#move((position - drag.startPos) * drag.rtl * sign);
  }

  #pointerUp(e: PointerEvent) {
    if (this.#drag?.pointerId !== e.pointerId) return;
    this.#clearDrag();
    this.#endGesture();
  }

  /** pointercancel and lostpointercapture: the drag ends without completing. */
  #pointerCancel(e: PointerEvent) {
    if (this.#drag?.pointerId !== e.pointerId) return;
    this.#clearDrag();
    this.#endGesture();
  }

  #interrupt() {
    if (this.#drag == null) return;
    this.#clearDrag();
    this.#endGesture();
  }

  #keyDown(e: KeyboardEvent) {
    if (this.#isDisabled()) return;
    const state = this.#state();
    const horizontal = this.#direction() === 'horizontal';
    const sign = this.#isReversed() ? -1 : 1;
    const keyStep = e.shiftKey ? KEYBOARD_LARGE_STEP : KEYBOARD_STEP;
    const rtl = horizontal ? this.#rtl() : 1;
    const grows = (key: string) =>
      (key === 'ArrowRight' || key === 'ArrowDown' ? 1 : key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 0) * (horizontal ? rtl : 1) * sign > 0;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowUp': {
        e.preventDefault();
        if (state.isCollapsed) {
          // Only the grow arrow opens it, one step above its minimum (or at the threshold).
          if (grows(e.key)) this.#step(Math.max(state.minPx + keyStep, state.collapsedSize));
          break;
        }
        if (state.snaps.length > 0) {
          this.#step(adjacentSnapPoint(state, grows(e.key) ? 1 : -1, e.shiftKey ? 2 : 1) - state.size);
          break;
        }
        const direction = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
        this.#step(direction * keyStep * (horizontal ? rtl : 1) * sign);
        break;
      }
      case 'Home':
        e.preventDefault();
        this.#step(state.minPx - state.size);
        break;
      case 'End':
        e.preventDefault();
        // Only a configured maximum is the region's own limit.
        if (state.maxPx !== Infinity) this.#step(state.maxPx - state.size);
        break;
      case 'Enter':
        e.preventDefault();
        if (state.collapsible) this.#toggleCollapse();
        break;
    }
  }

  #doubleClick() {
    if (this.#isDisabled() || !this.#collapsible()) return;
    this.#toggleCollapse();
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-resizable')) {
  customElements.define('ax-resizable', AxResizable);
}

declare global {
  interface HTMLElementTagNameMap {
    'ax-resizable': AxResizable;
  }
}

export {AxResizable};
