/**
 * `<ax-file-input>` — FileInput's surface (light DOM). Port of the behaviour in
 * @astryxdesign/core FileInput/FileInput.tsx: validateFiles (accept, maxSize, maxFiles),
 * handleFiles / handleClear / handleClick / handleKeyDown, the drag-and-drop handlers
 * (dropzone only; a disabled zone shows the no-drop cursor), useClickableContainer, the
 * selection announcement and the derived error status (FieldStatus / status icon cloned
 * from a server template, so every string stays server-translated).
 *
 * The native file input keeps the accepted files (DataTransfer), so native form submission
 * carries them and a form reset clears them (the element re-syncs).
 * Event: `astryx-change` `{value}` — File | File[] | null (Astryx onChange).
 */
import './runtime/disabledInteraction';
import {announce} from './runtime/announce';
import {emit, fillMessage, hasInteractiveAncestor, hasTextSelection, onFormReset} from './field';

const PH = '⁣message⁣';

function matchesAccept(file: File, accept: string): boolean {
  const accepted = accept.split(',').map((s) => s.trim().toLowerCase());
  return accepted.some((type) => {
    if (type.startsWith('.')) return file.name.toLowerCase().endsWith(type);
    if (type.endsWith('/*')) return file.type.startsWith(type.slice(0, -1));
    return file.type.toLowerCase() === type;
  });
}

export class FileInputElement extends HTMLElement {
  #files: File[] = [];
  #error: string | null = null;
  #errorNodes: Node[] = [];
  #dragOver = false;
  #trigger: HTMLButtonElement | null = null;
  #native: HTMLInputElement | null = null;
  #cleanup: Array<() => void> = [];

  get files(): File[] { return [...this.#files]; }
  get isDisabled() { return this.hasAttribute('data-ax-disabled'); }
  get isBusy() { return this.hasAttribute('data-ax-busy'); }
  get isSelectionDisabled() { return this.isDisabled || this.isBusy; }
  get #isDropzone() { return this.getAttribute('data-mode') === 'dropzone'; }
  get #isMultiple() { return this.hasAttribute('data-multiple'); }
  get #locale() { return this.getAttribute('data-locale') ?? 'en'; }

  connectedCallback() {
    const trigger = this.querySelector<HTMLButtonElement>('[data-ax-file-trigger]');
    const native = this.querySelector<HTMLInputElement>('[data-ax-file-native]');
    if (!trigger || !native) return;
    this.#trigger = trigger;
    this.#native = native;
    const on = <K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      target.addEventListener(type, fn as EventListener);
      this.#cleanup.push(() => target.removeEventListener(type, fn as EventListener));
    };

    // A FormLayout default made this field required: buttons ignore aria-required, so the
    // trigger is described by the visually hidden "Required" instead (FileInput FR).
    const requiredId = this.getAttribute('data-required-id');
    if (trigger.getAttribute('aria-required') === 'true' && requiredId) {
      trigger.removeAttribute('aria-required');
      this.#describe(requiredId, true);
    }

    on(trigger, 'click', () => this.open());
    on(trigger, 'keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      this.open();
    });
    // A label or description click activates the native input directly: blocked while
    // disabled or busy.
    on(native, 'click', (e) => { if (this.isSelectionDisabled) e.preventDefault(); });
    on(native, 'change', () => {
      const picked = Array.from(native.files ?? []);
      // A cancelled picker never changes the selection (Astryx's input is always empty, so a
      // cancel is a no-op there); an engine that clears on cancel gets the files back.
      if (picked.length === 0) { this.#restoreNativeFiles(); return; }
      this.#handleFiles(picked, false);
    });
    on(this, 'click', (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-ax-input-clear]')) { this.clear(e); return; }
      if (this.isSelectionDisabled || hasTextSelection(this)) return;
      if (target !== this && hasInteractiveAncestor(target, this)) return;
      this.open();
    });
    on(this, 'pointerdown', (e) => { if ((e.target as Element).closest?.('[data-ax-input-clear]')) e.preventDefault(); });

    const dragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.isSelectionDisabled) {
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
      } else if (this.#isDropzone) {
        this.#setDragOver(true);
      }
    };
    if (this.#isDropzone) {
      on(this, 'dragenter', dragOver);
      on(this, 'dragover', dragOver);
      on(this, 'dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Moving over the zone's own children fires dragleave too: only a real exit counts.
        if (e.relatedTarget instanceof Node && this.contains(e.relatedTarget)) return;
        this.#setDragOver(false);
      });
      on(this, 'drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.#setDragOver(false);
        if (this.isSelectionDisabled) return;
        const files = Array.from(e.dataTransfer?.files ?? []);
        if (files.length > 0) this.#handleFiles(files, true);
      });
    }
    this.#cleanup.push(onFormReset(native, () => {
      this.#files = [];
      this.#setError(null);
      this.#render();
    }));
    this.#render();
  }

  disconnectedCallback() {
    for (const fn of this.#cleanup) fn();
    this.#cleanup = [];
  }

  /** Open the file picker (no-op while disabled or busy). */
  open() {
    if (!this.isSelectionDisabled) this.#native?.click();
  }

  /** Remove the selection (the clear button); focus returns to the trigger. */
  clear(event?: MouseEvent) {
    event?.stopPropagation();
    this.#setError(null);
    this.#files = [];
    if (this.#native) this.#native.value = '';
    emit(this, 'astryx-change', {value: null});
    this.#render();
    const trigger = this.#trigger;
    if (!event || event.detail === 0) trigger?.focus();
    else requestAnimationFrame(() => trigger?.focus({preventScroll: true}));
  }

  #validate(files: File[]): {valid: File[]; errors: string[]} {
    const errors: string[] = [];
    let valid = files;
    const accept = this.getAttribute('data-accept');
    if (accept) {
      valid = valid.filter((file) => {
        const ok = matchesAccept(file, accept);
        if (!ok) errors.push(fillMessage(this.getAttribute('data-msg-invalid-type'), {fileName: file.name}));
        return ok;
      });
    }
    const maxSizeRaw = this.getAttribute('data-max-size');
    if (maxSizeRaw != null && maxSizeRaw !== '') {
      const maxSize = Number(maxSizeRaw);
      valid = valid.filter((file) => {
        if (file.size > maxSize) {
          errors.push(fillMessage(this.getAttribute('data-msg-max-size'), {fileName: file.name}));
          return false;
        }
        return true;
      });
    }
    const maxFilesRaw = this.getAttribute('data-max-files');
    if (this.#isMultiple && maxFilesRaw != null && maxFilesRaw !== '' && valid.length > Number(maxFilesRaw)) {
      errors.push(this.getAttribute('data-msg-max-files') ?? '');
      valid = valid.slice(0, Number(maxFilesRaw));
    }
    return {valid, errors};
  }

  #handleFiles(list: File[], fromDrop: boolean) {
    if (this.isSelectionDisabled) return;
    // A drop of several files into a single-file input keeps the first, as a picker would.
    const {valid, errors} = this.#validate(list);
    let error: string | null = null;
    if (errors.length > 0) {
      try { error = new Intl.ListFormat(this.#locale, {type: 'conjunction', style: 'narrow'}).format(errors); } catch { error = errors.join(', '); }
    }
    this.#setError(error);
    const kept = this.#isMultiple ? valid : valid.slice(0, 1);
    this.#files = kept;
    const native = this.#native!;
    if (kept.length === 0) {
      native.value = '';
    } else if (fromDrop || kept.length !== (native.files?.length ?? 0)) {
      try {
        const transfer = new DataTransfer();
        for (const file of kept) transfer.items.add(file);
        native.files = transfer.files;
      } catch { /* old engines: the form will not carry dropped files */ }
    }
    this.#render();
    emit(this, 'astryx-change', {value: kept.length === 0 ? null : this.#isMultiple ? kept : kept[0]});
    if (kept.length > 0 && errors.length === 0) {
      const message = kept.length === 1
        ? fillMessage(this.getAttribute('data-msg-selected-one'), {fileName: kept[0].name})
        : fillMessage(this.getAttribute('data-msg-selected-many'), {count: String(kept.length)});
      announce(message, {politeness: 'polite', from: this});
    }
  }

  #restoreNativeFiles() {
    const native = this.#native;
    if (!native || this.#files.length === 0) return;
    try {
      const transfer = new DataTransfer();
      for (const file of this.#files) transfer.items.add(file);
      native.files = transfer.files;
    } catch { /* keep the element state */ }
  }

  #setDragOver(on: boolean) {
    if (this.#dragOver === on) return;
    this.#dragOver = on;
    this.toggleAttribute('data-ax-drag-over', on);
    const placeholder = this.querySelector('[data-ax-file-placeholder]');
    if (placeholder && this.#isDropzone && this.#files.length === 0) {
      placeholder.textContent = on ? (this.getAttribute('data-drop-hint') ?? '') : (this.getAttribute('data-placeholder') ?? '');
    }
  }

  #describe(id: string, add: boolean) {
    const trigger = this.#trigger;
    if (!trigger) return;
    const ids = (trigger.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((x) => x && x !== id);
    if (add) ids.push(id);
    if (ids.length) trigger.setAttribute('aria-describedby', ids.join(' '));
    else trigger.removeAttribute('aria-describedby');
  }

  #setError(error: string | null) {
    if (error === this.#error) return;
    // A caller status wins over validation errors (statusProp ?? validationError).
    for (const node of this.#errorNodes) (node as ChildNode).remove();
    this.#errorNodes = [];
    const errorId = this.getAttribute('data-error-id');
    if (errorId) this.#describe(errorId, false);
    this.#error = error;
    if (this.hasAttribute('data-ax-has-status')) return;
    const trigger = this.#trigger;
    if (!error) {
      this.removeAttribute('data-status');
      trigger?.removeAttribute('aria-invalid');
      return;
    }
    const template = this.parentElement?.querySelector<HTMLTemplateElement>(':scope > template[data-ax-file-error-template]');
    if (!template) return;
    const content = template.content.cloneNode(true) as DocumentFragment;
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.textContent?.includes(PH)) n.textContent = n.textContent.split(PH).join(error);
    }
    const box = content.querySelector('[data-ax-file-error-box]');
    const icon = content.querySelector('[data-ax-file-error-icon]');
    if (icon) {
      const slot = this.querySelector('[data-ax-file-status-slot]');
      const nodes = Array.from(icon.childNodes);
      slot?.append(...nodes);
      if (slot) this.#errorNodes.push(...nodes);
    }
    if (box) {
      this.after(box);
      this.#errorNodes.push(box);
    } else {
      // Tooltip placement renders no box: speak the message on the field-status channel.
      announce(error, {politeness: 'assertive', from: this});
    }
    this.setAttribute('data-status', 'error');
    trigger?.setAttribute('aria-invalid', 'true');
    if (errorId) this.#describe(errorId, true);
  }

  #render() {
    const files = this.#files;
    const hasFiles = files.length > 0;
    const names = files.map((f) => f.name).join(', ');
    const placeholder = this.getAttribute('data-placeholder') ?? '';
    if (this.#isDropzone) {
      for (const el of this.querySelectorAll<HTMLElement>('[data-ax-file-empty]')) el.hidden = hasFiles;
      const nameEl = this.querySelector<HTMLElement>('[data-ax-file-names]');
      if (nameEl) { nameEl.hidden = !hasFiles; nameEl.textContent = names; }
      if (!hasFiles) {
        const ph = this.querySelector('[data-ax-file-placeholder]');
        if (ph) ph.textContent = this.#dragOver ? (this.getAttribute('data-drop-hint') ?? '') : placeholder;
      }
    } else {
      const text = this.querySelector<HTMLElement>('[data-ax-file-text]');
      if (text) {
        text.textContent = hasFiles ? names : placeholder;
        text.toggleAttribute('data-ax-has-files', hasFiles);
      }
    }
    const clear = this.querySelector<HTMLButtonElement>('[data-ax-input-clear]');
    if (clear) clear.hidden = !hasFiles;
    const label = this.getAttribute('data-label') ?? '';
    this.#trigger?.setAttribute('aria-label', hasFiles ? fillMessage(this.getAttribute('data-msg-trigger'), {fileNames: names}) : label);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-file-input')) {
  customElements.define('ax-file-input', FileInputElement);
}

declare global {
  interface HTMLElementTagNameMap { 'ax-file-input': FileInputElement }
}
