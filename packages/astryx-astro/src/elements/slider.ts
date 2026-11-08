/**
 * `<ax-slider>` — the row of Slider (light DOM, wraps the server markup).
 * Port of the behaviour in @astryxdesign/core Slider/Slider.tsx: updateValue (snap, clamp,
 * minStepsBetweenThumbs), handlePointerDown / Move / Up (mouse track press, coincident thumbs,
 * the drag's owning pointer, lostpointercapture), handleKeyDown (APG keys, RTL), the keyboard
 * focus ring gate, the value tooltip held open while dragged, and onChange / onChangeEnd.
 * A press on a thumb drags it from where it was grabbed for every pointer (the role of
 * useSliderTouch's pan; UISlider's lift, coast and springs are deferred), a finger's or pen's
 * tap on the track sets the value when it lifts.
 *
 * Config (server-rendered on the element): data-ax-min / -max / -step / -min-steps,
 * data-ax-range, data-orientation, data-disabled, data-ax-initial (JSON), data-ax-format-table
 * (JSON: value → formatted string, from a server `formatValue`), data-ax-format-options +
 * data-ax-locale (Intl.NumberFormat), data-ax-valuetext.
 *
 * Events (bubbling, composed): `astryx-change` `{value}` when the value changes,
 * `astryx-change-end` `{value}` when a drag ends and after each handled key.
 */
import './runtime/disabledInteraction';
import {isRtl} from './runtime/dom';
import {getModality} from './runtime/modality';
import {emit, onFormReset} from './field';
import {clamp, constrainRange, getPercent, snapToStep, travelFraction} from '../components/Slider/sliderMath';

type SliderValue = number | [number, number];

interface Drag {
  pointerId: number;
  thumb: number;
  /** A press on a thumb: the value offset between the pointer and the thumb it grabbed. */
  grab: number | null;
  /** A press on two coincident thumbs: the pointer's value until the first movement. */
  coincidentPress: number | null;
  /** The drag began on coincident thumbs: it may hand itself to the other thumb. */
  coincidentOrigin: boolean;
}

const isApplePlatform = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
const isPrimaryClick = (event: PointerEvent) => event.button === 0 && !(event.ctrlKey && isApplePlatform());
const TAP_SLOP = 10;

export class SliderElement extends HTMLElement {
  #values: number[] = [];
  #initial: number[] = [];
  #control: HTMLElement | null = null;
  #drag: Drag | null = null;
  #tap: {pointerId: number; x: number; y: number} | null = null;
  #formatter: Intl.NumberFormat | null = null;
  #table: Record<string, string> | null = null;
  #cleanup: Array<() => void> = [];

  // ── config ────────────────────────────────────────────────────────────────
  get min(): number { return Number(this.getAttribute('data-ax-min') ?? 0); }
  get max(): number { return Number(this.getAttribute('data-ax-max') ?? 100); }
  get step(): number { return Number(this.getAttribute('data-ax-step') ?? 1); }
  get minStepsBetweenThumbs(): number { return Number(this.getAttribute('data-ax-min-steps') ?? 0); }
  get isRange(): boolean { return this.hasAttribute('data-ax-range'); }
  get isHorizontal(): boolean { return this.getAttribute('data-orientation') !== 'vertical'; }
  get isDisabled(): boolean { return this.hasAttribute('data-disabled'); }

  get thumbs(): HTMLElement[] {
    return [...(this.#control?.querySelectorAll<HTMLElement>(':scope > .ax-slider-travel > [role="slider"]') ?? [])];
  }

  /** The value: a number, or `[start, end]` in range mode. */
  get value(): SliderValue {
    return this.isRange ? [this.#values[0], this.#values[1]] : this.#values[0];
  }
  set value(next: SliderValue) {
    const list = Array.isArray(next) ? next : [next];
    this.#values = list.slice(0, this.isRange ? 2 : 1).map((v) => clamp(Number(v), this.min, this.max));
    if (this.isRange && this.#values.length < 2) this.#values.push(this.#values[0]);
    this.#render();
  }

  connectedCallback() {
    const control = this.querySelector<HTMLElement>(':scope > .astryx-slider-control');
    if (!control) return;
    this.#control = control;
    try { this.#initial = JSON.parse(this.getAttribute('data-ax-initial') ?? '[]'); } catch { this.#initial = []; }
    if (this.#initial.length === 0) this.#initial = this.thumbs.map((thumb) => Number(thumb.getAttribute('aria-valuenow') ?? this.min));
    this.#values = [...this.#initial];
    try { this.#table = JSON.parse(this.getAttribute('data-ax-format-table') ?? 'null'); } catch { this.#table = null; }
    const options = this.getAttribute('data-ax-format-options');
    if (options) {
      try { this.#formatter = new Intl.NumberFormat(this.getAttribute('data-ax-locale') ?? undefined, JSON.parse(options)); } catch { this.#formatter = null; }
    }

    const listen = <K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, fn: (event: HTMLElementEventMap[K]) => void) => {
      target.addEventListener(type, fn as EventListener);
      this.#cleanup.push(() => target.removeEventListener(type, fn as EventListener));
    };
    listen(control, 'pointerdown', (e) => this.#onPointerDown(e));
    listen(control, 'pointermove', (e) => this.#onPointerMove(e));
    listen(control, 'pointerup', (e) => this.#onPointerUp(e));
    listen(control, 'pointercancel', (e) => { this.#tap = null; this.#endDrag(e.pointerId); });
    listen(control, 'lostpointercapture', (e) => this.#endDrag(e.pointerId));
    listen(control, 'keydown', (e) => this.#onKeyDown(e));
    listen(control, 'focusin', (e) => {
      const thumb = this.#thumbOf(e.target);
      // A focused disabled thumb still shows the ring (AST-085 FR6).
      if (thumb) thumb.toggleAttribute('data-ax-keyboard-focus', getModality(thumb) === 'keyboard');
    });
    listen(control, 'focusout', (e) => this.#thumbOf(e.target)?.removeAttribute('data-ax-keyboard-focus'));

    const first = this.querySelector<HTMLInputElement>('input[data-ax-slider-input]') ?? this.thumbs[0];
    if (first instanceof HTMLInputElement) {
      this.#cleanup.push(onFormReset(first, () => { this.#values = [...this.#initial]; this.#render(); }));
    } else {
      // No hidden inputs (no htmlName): still follow a reset of the enclosing form.
      const onReset = (event: Event) => {
        if (event.target instanceof HTMLFormElement && event.target.contains(this)) setTimeout(() => { this.#values = [...this.#initial]; this.#render(); }, 0);
      };
      this.ownerDocument.addEventListener('reset', onReset, true);
      this.#cleanup.push(() => this.ownerDocument.removeEventListener('reset', onReset, true));
    }
    this.#render();
  }

  disconnectedCallback() {
    for (const fn of this.#cleanup.splice(0)) fn();
    this.#drag = null;
    this.#tap = null;
  }

  // ── value model (updateValue) ─────────────────────────────────────────────
  #constrain(index: number, raw: number, snap = true, from: readonly number[] = this.#values): number[] {
    const {min, max, step} = this;
    const next = clamp(snap ? snapToStep(raw, min, step) : raw, min, max);
    if (!this.isRange) return [next];
    return constrainRange(from, index, next, {min, max, step, minStepsBetweenThumbs: this.minStepsBetweenThumbs});
  }

  #update(index: number, raw: number, snap = true, from: readonly number[] = this.#values): number[] {
    if (this.isDisabled) return this.#values;
    const next = this.#constrain(index, raw, snap, from);
    const changed = next.some((v, i) => v !== this.#values[i]);
    this.#values = next;
    if (changed) {
      this.#render();
      emit(this, 'astryx-change', {value: this.value});
    }
    return next;
  }

  #fireChangeEnd() {
    emit(this, 'astryx-change-end', {value: this.value});
  }

  // ── geometry ──────────────────────────────────────────────────────────────
  /** The pointer's position along the travel as a 0–1 fraction (unsnapped). */
  #fractionAt(clientX: number, clientY: number): number {
    const control = this.#control;
    if (!control) return 0;
    const rect = control.getBoundingClientRect();
    const fraction = this.isHorizontal
      ? travelFraction(isRtl(control) ? rect.right - clientX : clientX - rect.left, rect.width)
      : 1 - travelFraction(clientY - rect.top, rect.height);
    return clamp(fraction, 0, 1);
  }

  #rawAt(clientX: number, clientY: number): number {
    return this.min + this.#fractionAt(clientX, clientY) * (this.max - this.min);
  }

  #valueAt(clientX: number, clientY: number): number {
    return clamp(snapToStep(this.#rawAt(clientX, clientY), this.min, this.step), this.min, this.max);
  }

  #closestThumb(value: number): number {
    if (!this.isRange) return 0;
    const [v0, v1] = this.#values;
    return Math.abs(value - v0) <= Math.abs(value - v1) ? 0 : 1;
  }

  #thumbOf(target: EventTarget | null): HTMLElement | null {
    const thumb = target instanceof Element ? target.closest<HTMLElement>('[role="slider"]') : null;
    return thumb && this.#control?.contains(thumb) ? thumb : null;
  }

  // ── pointer ───────────────────────────────────────────────────────────────
  #onPointerDown(event: PointerEvent) {
    if (this.isDisabled || !isPrimaryClick(event)) return;
    const control = this.#control!;
    const thumbs = this.thumbs;
    const pressedThumb = this.#thumbOf(event.target);
    const pressedIndex = pressedThumb ? thumbs.indexOf(pressedThumb) : -1;
    if (pressedIndex < 0 && (event.pointerType === 'touch' || event.pointerType === 'pen')) {
      // A finger's or a pen's tap on the track sets the value when it lifts.
      this.#tap = {pointerId: event.pointerId, x: event.clientX, y: event.clientY};
      return;
    }
    event.preventDefault();
    if (this.#drag) return;

    const markEl = (event.target as Element).closest<HTMLElement>('[data-mark-value]');
    const pointerValue = this.#valueAt(event.clientX, event.clientY);
    const newVal = pressedIndex < 0 && markEl ? Number(markEl.dataset.markValue) : pointerValue;
    const values = this.#values;
    const isCoincident = this.isRange && values[0] === values[1];
    let thumbIndex = pressedIndex >= 0 ? pressedIndex : this.#closestThumb(newVal);
    const parks = isCoincident && (pressedIndex >= 0 || newVal === values[0]);
    if (parks && pressedIndex < 0) thumbIndex = 1;
    if (isCoincident && !parks) thumbIndex = newVal > values[0] ? 1 : 0;
    this.#drag = {
      pointerId: event.pointerId,
      thumb: thumbIndex,
      grab: pressedIndex >= 0 ? this.#rawAt(event.clientX, event.clientY) - values[thumbIndex] : null,
      coincidentPress: parks ? pointerValue : null,
      coincidentOrigin: parks,
    };
    this.#press(thumbIndex);
    // A thumb press leaves the value where it is; a track press moves the thumb there.
    if (pressedIndex < 0 && !parks) this.#update(thumbIndex, newVal);
    const thumb = thumbs[thumbIndex];
    thumb?.focus();
    thumb?.removeAttribute('data-ax-keyboard-focus');
    try { control.setPointerCapture(event.pointerId); } catch { /* the pointer is gone */ }
  }

  #onPointerMove(event: PointerEvent) {
    const drag = this.#drag;
    if (!drag || event.pointerId !== drag.pointerId || this.isDisabled) {
      if (this.#tap && event.pointerId === this.#tap.pointerId && Math.hypot(event.clientX - this.#tap.x, event.clientY - this.#tap.y) > TAP_SLOP) this.#tap = null;
      return;
    }
    const raw = drag.grab != null ? this.#rawAt(event.clientX, event.clientY) - drag.grab : this.#rawAt(event.clientX, event.clientY);
    const newVal = clamp(snapToStep(raw, this.min, this.step), this.min, this.max);
    if (drag.coincidentPress !== null) {
      const pointerValue = this.#valueAt(event.clientX, event.clientY);
      if (pointerValue === drag.coincidentPress) return;
      // The first movement from a press on coincident thumbs picks the thumb that can travel
      // that way; the drag then follows the pointer from the thumbs' shared value.
      const towardUpper = pointerValue > drag.coincidentPress;
      drag.coincidentPress = null;
      drag.grab = null;
      this.#handTo(towardUpper ? 1 : 0);
      this.#update(drag.thumb, pointerValue);
      return;
    }
    if (drag.coincidentOrigin) {
      const current = this.#values;
      const dragging = drag.thumb;
      const other = dragging === 0 ? 1 : 0;
      if ((dragging === 0 && newVal > current[1]) || (dragging === 1 && newVal < current[0])) {
        const from = [...current];
        from[dragging] = current[other];
        this.#handTo(other);
        this.#update(other, newVal, true, from);
        return;
      }
    }
    this.#update(drag.thumb, newVal);
  }

  #onPointerUp(event: PointerEvent) {
    const tap = this.#tap;
    if (tap && event.pointerId === tap.pointerId) {
      this.#tap = null;
      if (this.isDisabled) return;
      const mark = this.ownerDocument.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-mark-value]');
      const value = mark && this.#control?.contains(mark) ? Number(mark.dataset.markValue) : this.#valueAt(event.clientX, event.clientY);
      const index = this.#closestThumb(value);
      this.#update(index, value);
      const thumb = this.thumbs[index];
      thumb?.focus();
      this.#fireChangeEnd();
      return;
    }
    this.#endDrag(event.pointerId);
  }

  #handTo(index: number) {
    const drag = this.#drag;
    if (!drag || drag.thumb === index) return;
    drag.thumb = index;
    this.#press(index);
    const thumb = this.thumbs[index];
    thumb?.focus();
    thumb?.removeAttribute('data-ax-keyboard-focus');
  }

  #endDrag(pointerId: number) {
    const drag = this.#drag;
    if (!drag || drag.pointerId !== pointerId) return;
    this.#drag = null;
    const control = this.#control;
    if (control?.hasPointerCapture(pointerId)) {
      try { control.releasePointerCapture(pointerId); } catch { /* already released */ }
    }
    this.#press(null);
    this.#fireChangeEnd();
  }

  /** Pressed paint + the value tooltip held open for the dragged thumb (Astryx `isOpen`). */
  #press(index: number | null) {
    this.thumbs.forEach((thumb, i) => {
      thumb.toggleAttribute('data-ax-pressed', i === index);
      const tip = this.#tooltipOf(thumb);
      if (!tip) return;
      if (index === null) {
        if (!tip.hasAttribute('data-ax-controlled')) return;
        tip.removeAttribute('data-ax-controlled');
        const keepsOpen = thumb.matches(':hover') || (thumb.matches(':focus-visible') && thumb.hasAttribute('data-ax-keyboard-focus'));
        if (!keepsOpen) tip.setAttribute('data-ax-open', 'false');
        return;
      }
      tip.setAttribute('data-ax-controlled', '');
      tip.setAttribute('data-ax-open', String(i === index));
    });
  }

  #tooltipOf(thumb: HTMLElement): HTMLElement | null {
    const id = thumb.getAttribute('data-ax-tooltip');
    return id ? this.ownerDocument.getElementById(id) : null;
  }

  // ── keyboard ──────────────────────────────────────────────────────────────
  #onKeyDown(event: KeyboardEvent) {
    const thumb = this.#thumbOf(event.target);
    if (!thumb || this.isDisabled) return;
    const index = this.thumbs.indexOf(thumb);
    if (index < 0) return;
    // A keypress after a mouse drag brings the ring back; a bare modifier or a chord does not.
    if (event.key !== 'Shift' && !event.metaKey && !event.altKey && !event.ctrlKey && getModality(thumb) === 'keyboard') {
      thumb.setAttribute('data-ax-keyboard-focus', '');
    }
    const {min, max, step} = this;
    const current = this.#values[index];
    const towardMax = this.isHorizontal && isRtl(this.#control) ? 'ArrowLeft' : 'ArrowRight';
    const towardMin = towardMax === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
    let next: number;
    switch (event.key) {
      case towardMax: case 'ArrowUp': next = current + step; break;
      case towardMin: case 'ArrowDown': next = current - step; break;
      case 'PageUp': next = current + step * 10; break;
      case 'PageDown': next = current - step * 10; break;
      case 'Home': next = min; break;
      case 'End': next = max; break;
      default: return;
    }
    event.preventDefault();
    const toBound = event.key === 'Home' || event.key === 'End';
    this.#update(index, next, !toBound);
    this.#fireChangeEnd();
  }

  // ── render ────────────────────────────────────────────────────────────────
  #format(v: number): string {
    const fromTable = this.#table?.[String(v)];
    if (fromTable != null) return fromTable;
    return this.#formatter ? this.#formatter.format(v) : String(v);
  }

  #render() {
    const control = this.#control;
    if (!control) return;
    const {min, max, step} = this;
    const values = this.#values;
    const percent = (v: number) => getPercent(v, min, max);
    const minGap = this.minStepsBetweenThumbs * step;
    const hasValueText = this.hasAttribute('data-ax-valuetext');
    this.thumbs.forEach((thumb, i) => {
      const v = values[i];
      if (v == null) return;
      thumb.style.setProperty('--_slider-progress', String(percent(v) / 100));
      thumb.setAttribute('aria-valuenow', String(v));
      if (this.isRange) {
        thumb.setAttribute('aria-valuemin', String(i === 1 ? clamp(values[0] + minGap, min, max) : min));
        thumb.setAttribute('aria-valuemax', String(i === 0 ? clamp(values[1] - minGap, min, max) : max));
      }
      if (hasValueText) thumb.setAttribute('aria-valuetext', this.#format(v));
      const tip = this.#tooltipOf(thumb);
      const content = tip?.querySelector('.ax-tooltip-content');
      if (content && content.textContent !== this.#format(v)) content.textContent = this.#format(v);
    });
    const fillStart = this.isRange ? percent(values[0]) / 100 : 0;
    const fillEnd = percent(values[this.isRange ? 1 : 0]) / 100;
    for (const part of control.querySelectorAll<HTMLElement>('.ax-slider-fill-mover, .ax-slider-fill')) {
      part.style.setProperty('--_slider-fill-start', String(fillStart));
      part.style.setProperty('--_slider-fill-end', String(fillEnd));
    }
    if (this.isRange) control.style.setProperty('--_slider-spread', String(max > min ? (values[1] - values[0]) / (max - min) : 1));
    for (const mark of control.querySelectorAll<HTMLElement>('.ax-slider-mark[data-mark-value]')) {
      const v = Number(mark.dataset.markValue);
      const filled = this.isRange ? v >= values[0] && v <= values[1] : v <= values[0];
      mark.toggleAttribute('data-ax-filled', filled);
    }
    const text = this.querySelector<HTMLElement>(':scope > [data-ax-slider-text]');
    if (text) text.textContent = this.isRange ? `${this.#format(values[0])} – ${this.#format(values[1])}` : this.#format(values[0]);
    this.querySelectorAll<HTMLInputElement>(':scope > input[data-ax-slider-input]').forEach((input, i) => {
      if (values[i] != null) input.value = String(values[i]);
    });
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-slider')) {
  customElements.define('ax-slider', SliderElement);
}

declare global {
  interface HTMLElementTagNameMap { 'ax-slider': SliderElement }
}
