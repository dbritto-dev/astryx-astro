/**
 * <ax-segmented-control> — the radiogroup of SegmentedControl (light DOM; the element is the
 * painted `.astryx-segmented-control`). Port of @astryxdesign/core
 * SegmentedControl/SegmentedControl.tsx (selection-follows-focus, orderTabStop),
 * SegmentedControlItem.tsx (click selection), the fine-pointer path of
 * useSegmentedSelectionMotion.ts (lens slide on the segments' own transition timing) and
 * hooks/useKeyboardHint.tsx.
 *
 * Arrow / Home / End navigation comes from runtime/roving.ts (`data-astryx-roving`, tab stops
 * managed here: `data-astryx-roving-tabindex="false"`). Clicks on `aria-disabled` segments
 * never get here (runtime/disabledInteraction.ts).
 *
 * API: `value` (get/set; setting slides and fires nothing, like a new controlled value).
 * Event: `astryx-change` `{value}` — bubbles, composed, cancelable; dispatched before a user
 * selection applies, `preventDefault()` keeps the current value.
 *
 * Deferred (touch scope): the UIKit spring presentation, dragging the selected segment and
 * the reduced-motion ::after cross-fade of a finger's release.
 */
import {isImeKeyEvent} from './runtime/dom';

const SEGMENT = '[role="radio"][data-value]';
const ARROWS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
const HINT_MS = 3000;

/** The selected surface's paint, copied into the lens (Astryx SURFACE_PROPERTIES). */
const SURFACE = [
  'background-color', 'background-image', 'background-position', 'background-size', 'background-repeat',
  'background-origin', 'background-clip', 'box-shadow',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'backdrop-filter', '-webkit-backdrop-filter',
];
/** What the destination shows while the lens carries its surface (Astryx HIDDEN_SURFACE). */
const HIDDEN_SURFACE: ReadonlyArray<readonly [string, string]> = [
  ['background-color', 'transparent'], ['background-image', 'none'], ['box-shadow', 'none'],
  ['border-top-color', 'transparent'], ['border-right-color', 'transparent'],
  ['border-bottom-color', 'transparent'], ['border-left-color', 'transparent'],
  ['backdrop-filter', 'none'], ['-webkit-backdrop-filter', 'none'],
];
const lensVar = (prop: string) => `--_segmented-lens-${prop.replace(/^-+/, '')}`;

interface Box { x: number; y: number; width: number; height: number }

interface HintLayer extends HTMLElement {
  show(options?: {anchor?: HTMLElement | null}): boolean;
  hide(reason?: string): void;
  readonly isOpen: boolean;
}

function isSegmentDisabled(segment: Element): boolean {
  return segment.getAttribute('aria-disabled') === 'true';
}

function prefersReducedMotion(el: Element): boolean {
  return (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) ||
    el.closest('[data-astryx-reduced-motion]') != null;
}

export class SegmentedControlElement extends HTMLElement {
  #pressing = false;
  #hintDismissed = false;
  #hintTimer: ReturnType<typeof setTimeout> | null = null;
  #slide: {destination: HTMLElement; timer: ReturnType<typeof setTimeout>} | null = null;
  #cleanup: (() => void) | null = null;

  get segments(): HTMLElement[] {
    return [...this.querySelectorAll<HTMLElement>(SEGMENT)].filter((s) => s.closest('ax-segmented-control') === this);
  }

  get selectedSegment(): HTMLElement | null {
    return this.segments.find((s) => s.getAttribute('aria-checked') === 'true') ?? null;
  }

  get value(): string {
    return this.selectedSegment?.dataset.value ?? '';
  }

  set value(next: string) {
    const target = this.segments.find((s) => s.dataset.value === next) ?? null;
    this.#apply(target);
  }

  get isDisabled(): boolean {
    return this.getAttribute('aria-disabled') === 'true';
  }

  connectedCallback(): void {
    const onClick = (e: MouseEvent) => {
      const segment = (e.target as Element | null)?.closest<HTMLElement>(SEGMENT);
      if (!segment || !this.segments.includes(segment) || e.defaultPrevented) return;
      if (this.isDisabled || isSegmentDisabled(segment)) return;
      if (segment.getAttribute('aria-checked') !== 'true') this.#select(segment);
    };
    const onPointerDown = () => {
      this.#pressing = true;
    };
    const onPointerEnd = () => {
      // The click that follows the release still sees the press.
      setTimeout(() => { this.#pressing = false; }, 0);
    };
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      this.#maybeShowHint(e);
      if (this.isDisabled) return;
      // Selection follows focus only for moves within the group; Tab-in stays a pure focus move.
      if (!(e.relatedTarget instanceof Node) || !this.contains(e.relatedTarget)) return;
      // A press commits through its click.
      if (this.#pressing) return;
      const segment = target.closest<HTMLElement>(SEGMENT);
      if (!segment || isSegmentDisabled(segment)) return;
      if (segment.getAttribute('aria-checked') !== 'true') this.#select(segment);
    };
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget;
      const hint = this.#hint();
      if (!hint?.isOpen) return;
      if (next instanceof HTMLElement && this.contains(next)) {
        if (!this.#hintDismissed) hint.show({anchor: next});
        return;
      }
      this.#dismissHint();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isImeKeyEvent(e)) return;
      if (ARROWS.has(e.key) && this.#hint()?.isOpen) this.#dismissHint();
    };
    this.addEventListener('click', onClick);
    this.addEventListener('pointerdown', onPointerDown);
    this.addEventListener('pointerup', onPointerEnd);
    this.addEventListener('pointercancel', onPointerEnd);
    this.addEventListener('focusin', onFocusIn);
    this.addEventListener('focusout', onFocusOut);
    this.addEventListener('keydown', onKeyDown);
    this.#syncTabStop();
    this.#cleanup = () => {
      this.removeEventListener('click', onClick);
      this.removeEventListener('pointerdown', onPointerDown);
      this.removeEventListener('pointerup', onPointerEnd);
      this.removeEventListener('pointercancel', onPointerEnd);
      this.removeEventListener('focusin', onFocusIn);
      this.removeEventListener('focusout', onFocusOut);
      this.removeEventListener('keydown', onKeyDown);
    };
  }

  disconnectedCallback(): void {
    this.#cleanup?.();
    this.#cleanup = null;
    this.#finishSlide();
    if (this.#hintTimer) clearTimeout(this.#hintTimer);
  }

  /** A user selection: ask first (cancelable `astryx-change`), then apply. */
  #select(segment: HTMLElement): void {
    const value = segment.dataset.value ?? '';
    const proceed = this.dispatchEvent(new CustomEvent('astryx-change', {detail: {value}, bubbles: true, composed: true, cancelable: true}));
    if (proceed) this.#apply(segment);
  }

  /** Move the selection to `segment` (null: none), sliding the lens from the old one. */
  #apply(segment: HTMLElement | null): void {
    const previous = this.selectedSegment;
    if (previous === segment) return;
    const canSlide = previous != null && segment != null && !this.isDisabled && !prefersReducedMotion(this) && this.isConnected;
    const from = canSlide ? this.#currentLensBox() ?? this.#boxOf(previous) : null;
    if (canSlide && !this.#slide) this.#copyPaint(previous);
    for (const s of this.segments) {
      const selected = s === segment;
      const disabled = isSegmentDisabled(s);
      s.setAttribute('aria-checked', String(selected));
      if (selected) s.setAttribute('data-selected', 'selected');
      else s.removeAttribute('data-selected');
      s.classList.toggle('ax-overlay-bg', !selected && !disabled);
    }
    this.#syncTabStop();
    if (canSlide && from) this.#slideTo(segment, from);
  }

  /** orderTabStop: the selected segment, else the first not disabled on its own, else the first. */
  #syncTabStop(): void {
    const segments = this.segments;
    const stop = segments.find((s) => s.getAttribute('aria-checked') === 'true') ??
      segments.find((s) => !s.hasAttribute('data-astryx-segment-disabled')) ?? segments[0];
    for (const s of segments) {
      const value = s === stop ? '0' : '-1';
      if (s.getAttribute('tabindex') !== value) s.setAttribute('tabindex', value);
    }
  }

  // ── Lens ───────────────────────────────────────────────────────────────

  /** A segment's box in the track's padding-box coordinates. */
  #boxOf(el: HTMLElement): Box {
    const track = this.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return {x: r.left - track.left - this.clientLeft, y: r.top - track.top - this.clientTop, width: r.width, height: r.height};
  }

  /** Where the lens is on screen while a slide runs (interrupting it starts from there). */
  #currentLensBox(): Box | null {
    if (!this.#slide) return null;
    const s = getComputedStyle(this, '::before');
    const box = {x: parseFloat(s.left), y: parseFloat(s.top), width: parseFloat(s.width), height: parseFloat(s.height)};
    return Object.values(box).every(Number.isFinite) ? box : null;
  }

  #copyPaint(from: HTMLElement): void {
    const style = getComputedStyle(from);
    for (const prop of SURFACE) this.style.setProperty(lensVar(prop), style.getPropertyValue(prop));
    // The segments' own transition carries the theme's duration and easing.
    this.style.setProperty('--_ax-lens-duration', style.transitionDuration.split(',')[0]?.trim() || '');
    this.style.setProperty('--_ax-lens-easing', style.transitionTimingFunction.split(/,(?![^(]*\))/)[0]?.trim() || '');
  }

  #place(box: Box): void {
    this.style.setProperty('--_segmented-lens-left', `${box.x}px`);
    this.style.setProperty('--_segmented-lens-top', `${box.y}px`);
    this.style.setProperty('--_segmented-lens-width', `${box.width}px`);
    this.style.setProperty('--_segmented-lens-height', `${box.height}px`);
  }

  #hideSurface(segment: HTMLElement): void {
    for (const [prop, value] of HIDDEN_SURFACE) segment.style.setProperty(prop, value, 'important');
    segment.style.setProperty('transition-property', 'color', 'important');
  }

  #showSurface(segment: HTMLElement): void {
    for (const [prop] of HIDDEN_SURFACE) segment.style.removeProperty(prop);
    // The surface lands at once (the lens was it); give the transition back next frame.
    void getComputedStyle(segment).backgroundColor;
    requestAnimationFrame(() => {
      if (this.#slide?.destination !== segment) segment.style.removeProperty('transition-property');
    });
  }

  #slideTo(destination: HTMLElement, from: Box): void {
    const previous = this.#slide;
    if (previous) {
      clearTimeout(previous.timer);
      if (previous.destination !== destination) {
        for (const [prop] of HIDDEN_SURFACE) previous.destination.style.removeProperty(prop);
        previous.destination.style.removeProperty('transition-property');
      }
    }
    // Every segment's surface change is instant while the lens is on screen (Astryx "stills").
    for (const s of this.segments) if (s !== destination) s.style.setProperty('transition-property', 'color', 'important');
    this.#hideSurface(destination);
    this.removeAttribute('data-ax-lens');
    this.#place(from);
    this.style.setProperty('--_segmented-lens-visibility', 'visible');
    void getComputedStyle(this, '::before').left;
    this.setAttribute('data-ax-lens', 'slide');
    this.#place(this.#boxOf(destination));
    const duration = parseFloat(getComputedStyle(this, '::before').transitionDuration) * 1000 || 0;
    const timer = setTimeout(() => this.#finishSlide(), duration + 60);
    this.#slide = {destination, timer};
    const onEnd = (e: TransitionEvent) => {
      if (e.target !== this || e.pseudoElement !== '::before' || (e.propertyName !== 'left' && e.propertyName !== 'width')) return;
      if (this.#slide?.timer !== timer) return;
      this.removeEventListener('transitionend', onEnd);
      this.#finishSlide();
    };
    this.addEventListener('transitionend', onEnd);
  }

  #finishSlide(): void {
    const slide = this.#slide;
    if (!slide) return;
    clearTimeout(slide.timer);
    this.#slide = null;
    this.#showSurface(slide.destination);
    this.style.setProperty('--_segmented-lens-visibility', 'hidden');
    this.removeAttribute('data-ax-lens');
    requestAnimationFrame(() => {
      if (this.#slide) return;
      for (const s of this.segments) if (s !== slide.destination) s.style.removeProperty('transition-property');
    });
  }

  // ── Keyboard hint ──────────────────────────────────────────────────────

  #hint(): HintLayer | null {
    return this.querySelector<HintLayer>(':scope > [data-ax-keyboard-hint]');
  }

  #maybeShowHint(e: FocusEvent): void {
    const hint = this.#hint();
    const target = e.target as HTMLElement;
    if (!hint || this.#hintDismissed || this.isDisabled || typeof hint.show !== 'function') return;
    if (!target.matches(':focus-visible')) return;
    if (e.relatedTarget instanceof Node && this.contains(e.relatedTarget)) return;
    hint.show({anchor: target});
    if (this.#hintTimer) clearTimeout(this.#hintTimer);
    this.#hintTimer = setTimeout(() => this.#dismissHint(), HINT_MS);
  }

  #dismissHint(): void {
    this.#hintDismissed = true;
    if (this.#hintTimer) clearTimeout(this.#hintTimer);
    this.#hintTimer = null;
    const hint = this.#hint();
    if (hint?.isOpen) hint.hide('api');
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-segmented-control')) {
  customElements.define('ax-segmented-control', SegmentedControlElement);
}

declare global {
  interface HTMLElementTagNameMap {
    'ax-segmented-control': SegmentedControlElement;
  }
}
