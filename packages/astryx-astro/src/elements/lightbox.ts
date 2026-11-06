/**
 * <ax-lightbox> — the behaviour of Lightbox (port of @astryxdesign/core Lightbox/Lightbox.tsx
 * state, effects and handlers, Lightbox/useLightbox.tsx triggers, Layer/useLayerDismissal.ts,
 * hooks/useFocusTrap.ts useFocusRegionContainment). Light DOM, `display: contents`: it wraps
 * the server-rendered `<dialog class="astryx-lightbox">` and owns the open state and index.
 *
 * Reads: `data-ax-media` (JSON: src, alt, caption, type, announce), `data-ax-index`,
 * `data-ax-open="true"` (open on connect; reflected), `data-ax-zoom`, `data-ax-autoplay`,
 * translated `data-ax-viewer-label`, `data-ax-zoomed-in`, `data-ax-zoomed-out`.
 * API: open(index?), close(), isOpen, index, next(), prev().
 * Events: astryx-open-change {isOpen}, astryx-index-change {index}.
 */
import {announce} from './runtime/announce';
import {registerLayer, shouldDismissOnCloseRequest} from './runtime/layerStack';
import {returnFocusForLastInput} from './runtime/modality';
import {tabbables} from './runtime/dom';

interface Item {
  src: string;
  alt: string;
  caption: string;
  type: 'image' | 'video';
  announce: string;
}

/** Pan per arrow press while zoomed: the image moves opposite to the arrow, like scrolling. */
const KEYBOARD_PAN_STEP = 50;
const KEYBOARD_PAN_OFFSETS: Record<string, [number, number]> = {
  ArrowLeft: [KEYBOARD_PAN_STEP, 0],
  ArrowRight: [-KEYBOARD_PAN_STEP, 0],
  ArrowUp: [0, KEYBOARD_PAN_STEP],
  ArrowDown: [0, -KEYBOARD_PAN_STEP],
};

const isRtlElement = (el: Element | null) => el != null && getComputedStyle(el).direction === 'rtl';

export class AxLightbox extends HTMLElement {
  #items: Item[] = [];
  #index = 0;
  #zoom = 1;
  #pan = {x: 0, y: 0};
  #dragging = false;
  #didDrag = false;
  #dragStart = {x: 0, y: 0, panX: 0, panY: 0};
  #opener: HTMLElement | null = null;
  #unregister: (() => void) | null = null;
  #wired = false;

  get dialog(): HTMLDialogElement | null {
    return this.querySelector<HTMLDialogElement>(':scope > dialog');
  }

  get isOpen(): boolean {
    return this.dialog?.open ?? false;
  }

  get index(): number {
    return this.#index;
  }
  set index(value: number) {
    this.#setIndex(value, false);
  }

  connectedCallback(): void {
    try {
      this.#items = JSON.parse(this.getAttribute('data-ax-media') ?? '[]') as Item[];
    } catch {
      this.#items = [];
    }
    this.#index = Math.max(0, Math.min(Number(this.getAttribute('data-ax-index') ?? 0) || 0, this.#items.length - 1));
    const dialog = this.dialog;
    if (!dialog || this.#wired) return;
    this.#wired = true;
    dialog.addEventListener('click', this);
    dialog.addEventListener('keydown', this);
    dialog.addEventListener('cancel', this);
    dialog.addEventListener('dblclick', this);
    dialog.addEventListener('pointerdown', this);
    if (this.getAttribute('data-ax-open') === 'true' && !dialog.open) queueMicrotask(() => this.open(this.#index));
  }

  disconnectedCallback(): void {
    const dialog = this.dialog;
    this.#wired = false;
    this.#unregister?.();
    this.#unregister = null;
    this.#stopDrag();
    if (!dialog) return;
    for (const type of ['click', 'keydown', 'cancel', 'dblclick', 'pointerdown']) dialog.removeEventListener(type, this);
    // Removed while open: focus the removal lost goes back to the opener.
    if (this.#opener?.isConnected && !this.ownerDocument.activeElement?.closest('dialog')) returnFocusForLastInput(this.#opener);
  }

  // ── API ───────────────────────────────────────────────────────────────────

  open(index?: number): void {
    const dialog = this.dialog;
    if (!dialog || this.#items.length === 0) return;
    // useLightbox's open(i) sets the index it renders with: no index-change event.
    if (index != null) this.#setIndex(index, false);
    if (dialog.open) return;
    const active = this.ownerDocument.activeElement;
    this.#opener = active instanceof HTMLElement && active !== this.ownerDocument.body ? active : null;
    dialog.showModal();
    this.#unregister?.();
    this.#unregister = registerLayer({
      element: dialog,
      escape: 'close',
      outsidePress: 'ignore',
      isPresent: () => dialog.open,
      dismiss: () => this.close(),
    });
    this.#reflect(true);
    this.#syncMedia();
    if (this.hasAttribute('data-ax-autoplay')) void this.#video()?.play().catch(() => undefined);
    this.dispatchEvent(new CustomEvent('astryx-open-change', {detail: {isOpen: true}, bubbles: true, composed: true}));
  }

  close(): void {
    const dialog = this.dialog;
    if (!dialog?.open) return;
    this.#video()?.pause();
    this.#stopDrag();
    dialog.close();
    this.#unregister?.();
    this.#unregister = null;
    this.#reflect(false);
    if (this.#opener?.isConnected) returnFocusForLastInput(this.#opener);
    this.dispatchEvent(new CustomEvent('astryx-open-change', {detail: {isOpen: false}, bubbles: true, composed: true}));
  }

  next(): void {
    if (this.#index < this.#items.length - 1) this.#setIndex(this.#index + 1);
  }

  prev(): void {
    if (this.#index > 0) this.#setIndex(this.#index - 1);
  }

  // ── Events ────────────────────────────────────────────────────────────────

  handleEvent(event: Event): void {
    switch (event.type) {
      case 'cancel':
        // The platform's own close request (back gesture, a close watcher): answer it with the
        // stack's rules. A cancel bubbling from inside (a file picker) is not one.
        if (event.target !== this.dialog) return;
        event.preventDefault();
        if (shouldDismissOnCloseRequest(this.dialog!)) this.close();
        return;
      case 'click':
        this.#onClick(event as MouseEvent);
        return;
      case 'keydown':
        this.#onKeyDown(event as KeyboardEvent);
        return;
      case 'dblclick':
        if ((event.target as Element).closest('.ax-lightbox-image-wrapper')) this.#toggleZoom();
        return;
      case 'pointerdown':
        this.#onPointerDown(event as PointerEvent);
        return;
      case 'pointermove': {
        const e = event as PointerEvent;
        this.#didDrag = true;
        this.#pan = {x: this.#dragStart.panX + e.clientX - this.#dragStart.x, y: this.#dragStart.panY + e.clientY - this.#dragStart.y};
        this.#applyZoom();
        return;
      }
      case 'pointerup':
        this.#stopDrag();
        return;
    }
  }

  #onClick(e: MouseEvent) {
    const dialog = this.dialog!;
    const action = (e.target as Element).closest<HTMLButtonElement>('[data-ax-lightbox-action]');
    if (action && dialog.contains(action)) {
      if (action.disabled) return;
      const kind = action.dataset.axLightboxAction;
      if (kind === 'close') this.close();
      else if (kind === 'prev') this.prev();
      else if (kind === 'next') this.next();
      return;
    }
    // Backdrop: the transparent dialog and the full-size container around the media. A pan
    // drag that ends over it still clicks their common ancestor: ignore that click.
    if (this.#didDrag) {
      this.#didDrag = false;
      return;
    }
    if (e.target === dialog || (e.target as Element).classList?.contains('ax-lightbox-container')) this.close();
  }

  #onKeyDown(e: KeyboardEvent) {
    const dialog = this.dialog!;
    if (e.key === 'Tab') {
      this.#containTab(e);
      return;
    }
    const item = this.#items[this.#index];
    const zoomable = this.hasAttribute('data-ax-zoom') && item?.type !== 'video';
    const wrapper = (e.target as Element).closest('.ax-lightbox-image-wrapper');
    if (zoomable && wrapper && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      this.#toggleZoom();
      return;
    }
    if (zoomable) {
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        this.#setZoom(2);
        return;
      }
      if (e.key === '-') {
        e.preventDefault();
        this.#setZoom(1);
        return;
      }
      if (this.#zoom > 1 && KEYBOARD_PAN_OFFSETS[e.key] !== undefined) {
        e.preventDefault();
        const [dx, dy] = KEYBOARD_PAN_OFFSETS[e.key];
        this.#pan = {x: this.#pan.x + dx, y: this.#pan.y + dy};
        this.#applyZoom();
        return;
      }
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      // Gallery arrows follow the rendered direction: in RTL Next sits on the left.
      const towardEnd = (e.key === 'ArrowRight') !== isRtlElement(dialog);
      if (towardEnd) this.next();
      else this.prev();
    }
  }

  /** useFocusRegionContainment: Tab never leaves the viewer for the browser's own UI. */
  #containTab(e: KeyboardEvent) {
    const list = tabbables(this.dialog!);
    if (list.length === 0) return;
    const first = list[0];
    const last = list[list.length - 1];
    const active = this.ownerDocument.activeElement;
    if (e.shiftKey && (active === first || !this.dialog!.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !this.dialog!.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  }

  #onPointerDown(e: PointerEvent) {
    if (this.#zoom <= 1 || !this.hasAttribute('data-ax-zoom')) return;
    if (!(e.target as Element).closest('.ax-lightbox-image-wrapper')) return;
    this.#dragging = true;
    this.#didDrag = false;
    this.#dragStart = {x: e.clientX, y: e.clientY, panX: this.#pan.x, panY: this.#pan.y};
    window.addEventListener('pointermove', this);
    window.addEventListener('pointerup', this);
    this.#applyZoom();
  }

  #stopDrag() {
    if (!this.#dragging) return;
    this.#dragging = false;
    window.removeEventListener('pointermove', this);
    window.removeEventListener('pointerup', this);
    this.#applyZoom();
  }

  // ── Zoom ──────────────────────────────────────────────────────────────────

  #toggleZoom() {
    this.#setZoom(this.#zoom === 1 ? 2 : 1);
  }

  #setZoom(next: number) {
    const item = this.#items[this.#index];
    if (!this.hasAttribute('data-ax-zoom') || item?.type === 'video' || next === this.#zoom) return;
    this.#zoom = next;
    this.#pan = {x: 0, y: 0};
    this.#applyZoom();
    const message = this.getAttribute(next > 1 ? 'data-ax-zoomed-in' : 'data-ax-zoomed-out');
    if (message) announce(message, {from: this.dialog});
  }

  #applyZoom() {
    const wrapper = this.querySelector<HTMLElement>('.ax-lightbox-image-wrapper');
    const img = wrapper?.querySelector<HTMLElement>('img');
    if (!wrapper) return;
    const zoomed = this.#zoom > 1;
    if (wrapper.hasAttribute('data-ax-zoomable')) wrapper.setAttribute('aria-pressed', String(zoomed));
    wrapper.toggleAttribute('data-ax-zoomed', zoomed);
    wrapper.toggleAttribute('data-ax-dragging', this.#dragging);
    if (img) {
      img.toggleAttribute('data-ax-dragging', this.#dragging);
      img.style.transform = zoomed ? `scale(${this.#zoom}) translate(${this.#pan.x / this.#zoom}px, ${this.#pan.y / this.#zoom}px)` : '';
    }
  }

  // ── Gallery ───────────────────────────────────────────────────────────────

  #setIndex(value: number, emit = true) {
    const clamped = Math.max(0, Math.min(Math.trunc(value) || 0, this.#items.length - 1));
    if (clamped === this.#index) return;
    this.#index = clamped;
    this.setAttribute('data-ax-index', String(clamped));
    // A new item starts unzoomed.
    this.#zoom = 1;
    this.#pan = {x: 0, y: 0};
    this.#syncMedia();
    // Announce moves during an open session only (the dialog's name already names the item).
    if (this.isOpen) announce(this.#items[clamped].announce, {from: this.dialog});
    if (emit) this.dispatchEvent(new CustomEvent('astryx-index-change', {detail: {index: clamped}, bubbles: true, composed: true}));
  }

  #video(): HTMLVideoElement | null {
    return this.querySelector('.ax-lightbox-image-wrapper video');
  }

  /** Write the current item into the server-rendered markup. */
  #syncMedia() {
    const dialog = this.dialog;
    const item = this.#items[this.#index];
    if (!dialog || !item) return;
    dialog.setAttribute('aria-label', item.alt || this.getAttribute('data-ax-viewer-label') || '');
    const wrapper = dialog.querySelector<HTMLElement>('.ax-lightbox-image-wrapper');
    if (wrapper) {
      const isVideo = item.type === 'video';
      const zoomTarget = this.hasAttribute('data-ax-zoom') && !isVideo;
      let media = wrapper.querySelector<HTMLImageElement | HTMLVideoElement>('img, video');
      const want = isVideo ? 'VIDEO' : 'IMG';
      if (!media || media.tagName !== want) {
        media?.remove();
        if (isVideo) {
          const video = this.ownerDocument.createElement('video');
          video.controls = true;
          video.preload = 'metadata';
          video.className = 'ax-lightbox-video';
          media = video;
        } else {
          const img = this.ownerDocument.createElement('img');
          img.draggable = false;
          img.className = 'ax-lightbox-image';
          media = img;
        }
        wrapper.append(media);
      }
      if (media.getAttribute('src') !== item.src) media.setAttribute('src', item.src);
      if (isVideo) media.setAttribute('aria-label', item.alt);
      else (media as HTMLImageElement).alt = item.alt;
      if (zoomTarget) {
        wrapper.setAttribute('role', 'button');
        wrapper.setAttribute('tabindex', '0');
        wrapper.setAttribute('aria-label', wrapper.getAttribute('data-ax-zoom-label') ?? '');
        wrapper.setAttribute('data-ax-zoomable', '');
      } else {
        for (const a of ['role', 'tabindex', 'aria-label', 'aria-pressed', 'data-ax-zoomable']) wrapper.removeAttribute(a);
      }
      this.#applyZoom();
    }
    const caption = dialog.querySelector<HTMLElement>('.ax-lightbox-caption');
    if (caption) {
      caption.textContent = item.caption;
      caption.hidden = !item.caption;
    }
    const counter = dialog.querySelector('.ax-lightbox-counter');
    if (counter) counter.textContent = `${this.#index + 1} / ${this.#items.length}`;
    // Prev/Next stay mounted and disable at the ends (focus is never dropped by an unmount).
    for (const nav of dialog.querySelectorAll<HTMLButtonElement>('.ax-lightbox-nav')) {
      const enabled = nav.dataset.side === 'prev' ? this.#index > 0 : this.#index < this.#items.length - 1;
      const hadFocus = this.ownerDocument.activeElement === nav;
      nav.disabled = !enabled;
      nav.toggleAttribute('data-ax-disabled', !enabled);
      // A disabled button drops focus to <body>: keep it in the viewer, on the other nav button.
      if (hadFocus && !enabled) dialog.querySelector<HTMLButtonElement>(`.ax-lightbox-nav:not([data-side="${nav.dataset.side}"])`)?.focus();
    }
  }

  #reflect(open: boolean) {
    this.setAttribute('data-ax-open', String(open));
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-lightbox')) customElements.define('ax-lightbox', AxLightbox);

// useLightbox triggers: one delegated listener for every `[data-ax-lightbox]` on the page.
if (typeof document !== 'undefined' && !(window as unknown as {__axLightboxTriggers?: boolean}).__axLightboxTriggers) {
  (window as unknown as {__axLightboxTriggers?: boolean}).__axLightboxTriggers = true;
  const openFrom = (trigger: HTMLElement) => {
    const box = document.getElementById(trigger.getAttribute('data-ax-lightbox') ?? '') as AxLightbox | null;
    if (!box || typeof box.open !== 'function') return;
    const index = trigger.getAttribute('data-ax-lightbox-index');
    box.open(index != null ? Number(index) : 0);
  };
  document.addEventListener('click', (e) => {
    const trigger = (e.target as Element | null)?.closest?.<HTMLElement>('[data-ax-lightbox]');
    if (!trigger || trigger.closest('dialog.astryx-lightbox')) return;
    if (trigger.getAttribute('aria-disabled') === 'true' || (trigger as HTMLButtonElement).disabled) return;
    openFrom(trigger);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const trigger = (e.target as Element | null)?.closest?.<HTMLElement>('[data-ax-lightbox]');
    if (!trigger || trigger !== e.target || trigger.tagName === 'BUTTON' || trigger.tagName === 'A') return;
    e.preventDefault();
    openFrom(trigger);
  });
}
