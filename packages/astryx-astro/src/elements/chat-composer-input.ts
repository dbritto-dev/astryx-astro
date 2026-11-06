// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Port of @astryxdesign/core 0.7.9 src/Chat/ChatComposerInput.tsx,
// useChatComposerTokens.ts, useChatPasteAsToken.ts and ChatPastedTextToken.tsx.

/**
 * `<ax-chat-composer-input>` — the contenteditable chat input (light DOM; the server renders
 * the editor, the trigger layer and the templates, see components/Chat/ChatComposerInput.astro).
 *
 *  - Serialization: text nodes as text, `<br>` as "\n", a token span
 *    (`[data-astryx-token]`) as its `data-astryx-token-value`. A whitespace-only draft without
 *    tokens (or dictation ghost text) is empty ('').
 *  - Enter (no Shift, not composing) submits the trimmed draft: to the enclosing
 *    `<ax-chat-composer>` (`composer.submit()`), else as `astryx-submit` {value, tokens};
 *    then the draft clears. Shift+Enter is the browser's line break.
 *  - History: Enter-sent messages; ArrowUp at the very start recalls the previous one,
 *    ArrowDown at the very end steps forward (back to the saved draft); a recalled message is
 *    shown selected so repeated presses keep stepping.
 *  - Tokens: inserted at the caret as a non-editable span followed by an NBSP; Backspace in or
 *    after that NBSP removes both; a paste inside a token lands after it.
 *  - Paste: files → `astryx-files`; plain text → cancelable `astryx-paste` (Astryx onPaste), then
 *    paste-as-token (> 200 graphemes become a pasted-text token with a hover-card preview and
 *    Expand), else inserted as plain text. Drop: files → `astryx-files` (the drop never navigates).
 *  - Keys: the trigger menu first (elements/chat/triggerMenu.ts), then the cancelable
 *    `astryx-keydown` {event} seam (Astryx onKeyDown), then Backspace/Enter/history.
 *  - Disabled: not editable, aria-disabled, focusable; Enter/Space do nothing; the menu closes.
 *
 * Events: `astryx-change` {value}, `astryx-submit` {value, tokens} (standalone), `astryx-files`
 * {files}, `astryx-paste` {text, event}, `astryx-keydown` {event}, `astryx-query` (trigger
 * searches, see triggerMenu.ts).
 */
import './runtime/disabledInteraction';
import './runtime/modality';
import './runtime/tooltip';
import {comboboxLayer, type ComboboxLayerElement} from './runtime/combobox';
import {defineElement} from './runtime/layer';
import {isImeKeyEvent} from './runtime/dom';
import {characterCount} from '../lib/characters';
import {
  ensureCaretInside, getSelectionRangeInside, insertTextAtCursor, isSelectionAtEnd, isSelectionAtStart,
  placeCaretAtEnd, restoreSelectionRange, selectAll,
} from './chat/selection';
import {createTriggerMenu, type ClientToken, type ClientTrigger, type ResolvedTrigger, type TriggerMenu} from './chat/triggerMenu';

export type {ClientToken, ClientTrigger, TriggerItem, TriggerQueryDetail, TriggerSearchSource} from './chat/triggerMenu';
export {findActiveTrigger} from './chat/triggerMenu';

const Base: typeof HTMLElement = typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement;
const NBSP = ' ';
/** Astryx renders a badge token whose value is longer than this as a pasted-text token. */
const PASTED_TOKEN_LENGTH = 200;

export interface ChatSubmitToken {
  id: string;
  value: string;
  label?: string | number;
  variant?: string;
}

export interface ChatPasteAsToken {
  /** Return true when the paste became a token. */
  onPaste(event: ClipboardEvent, text: string): boolean;
}

interface ComposerLike extends HTMLElement {
  submit(value?: string, tokens?: ChatSubmitToken[]): void;
}

function serialize(node: Node): string {
  let result = '';
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) result += child.textContent ?? '';
    else if (child instanceof HTMLElement) {
      if (child.hasAttribute('data-astryx-token')) result += child.getAttribute('data-astryx-token-value') ?? '';
      else if (child.tagName === 'BR') result += '\n';
      else if (child.hasAttribute('data-astryx-dictation-interim')) continue;
      else result += serialize(child);
    }
  }
  return result;
}

const fillMessage = (template: string | undefined, values: Record<string, string>) =>
  (template ?? '').replace(/⁣([a-zA-Z]+)⁣/g, (_, name: string) => values[name] ?? '');

let tokenCounter = 0;
let layerCounter = 0;

/**
 * Port of useChatPasteAsToken: pastes longer than `threshold` (graphemes) become a token.
 * Assign the result to `input.pasteAsToken`.
 */
export function createChatPasteAsToken({input, threshold = 200, toToken}: {
  input: ChatComposerInputElement;
  threshold?: number;
  toToken?: (text: string) => ClientToken;
}): ChatPasteAsToken {
  return {
    onPaste(_event, text) {
      if (characterCount(text) <= threshold) return false;
      const token = toToken ? toToken(text) : {value: text, label: input.pastedLabel(text), variant: 'neutral'};
      input.insertTokenSilently(token);
      return true;
    },
  };
}

export class ChatComposerInputElement extends Base {
  #editable: HTMLElement | null = null;
  #placeholder: HTMLElement | null = null;
  #menu: TriggerMenu | null = null;
  #history: string[] = [];
  #historyIndex = -1;
  #draft = '';
  #isEmpty = true;
  #tokens = new Map<string, {span: HTMLElement; token: ClientToken}>();
  #clientTriggers: ClientTrigger[] = [];
  #pasteAsToken: ChatPasteAsToken | null | undefined = undefined;
  #changeVersion = 0;
  #cleanup: Array<() => void> = [];

  connectedCallback(): void {
    const editable = this.querySelector<HTMLElement>(':scope > [data-ax-chat-editable]');
    if (!editable) return;
    this.#editable = editable;
    this.#placeholder = this.querySelector<HTMLElement>(':scope > .ax-chat-input-placeholder');
    this.#isEmpty = this.#placeholder ? !this.#placeholder.hidden : serialize(editable).trim() === '';
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      editable.addEventListener(type, fn as EventListener);
      this.#cleanup.push(() => editable.removeEventListener(type, fn as EventListener));
    };
    on('input', () => this.#handleInput());
    on('click', () => { if (!this.isDisabled && this.#menu?.isActive()) this.#menu.handleInput(); });
    on('keydown', (e) => this.#handleKeyDown(e));
    on('paste', (e) => this.#handlePaste(e));
    on('dragover', (e) => { if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) e.preventDefault(); });
    on('drop', (e) => this.#handleDrop(e));
    // Expand on a pasted-text token's hover card.
    const onExpand = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest?.('[data-ax-chat-expand]');
      const span = button?.closest<HTMLElement>('[data-astryx-token-id]');
      if (span && this.contains(span)) this.expandToken(span.getAttribute('data-astryx-token-id') ?? '');
    };
    this.addEventListener('click', onExpand);
    this.#cleanup.push(() => this.removeEventListener('click', onExpand));
    this.#setupMenu();
  }

  disconnectedCallback(): void {
    for (const fn of this.#cleanup.splice(0)) fn();
    this.#menu?.destroy();
    this.#menu = null;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** The editable element (the textbox / combobox). */
  get editable(): HTMLElement | null { return this.#editable; }

  /** The serialized draft ('' when empty). Setting it replaces the draft (no change event). */
  get value(): string {
    const editable = this.#editable;
    if (!editable) return '';
    const text = serialize(editable);
    return text.trim().length === 0 && !this.#hasTokens() ? '' : text;
  }

  set value(next: string) {
    const editable = this.#editable;
    if (!editable) return;
    next = next ?? '';
    if (serialize(editable) === next) return;
    const wasFocused = document.activeElement === editable;
    editable.textContent = next;
    // textContent collapses a caret inside to offset 0: put it after the new content.
    if (wasFocused) placeCaretAtEnd(editable);
    this.#setEmpty(next.length === 0);
    this.#pruneTokens();
  }

  /** Whether the draft is empty (the placeholder shows). */
  get isEmpty(): boolean { return this.#isEmpty; }

  get isDisabled(): boolean { return this.hasAttribute('data-ax-disabled'); }

  set isDisabled(next: boolean) {
    const editable = this.#editable;
    this.toggleAttribute('data-ax-disabled', !!next);
    if (editable) {
      // Explicit in both states: losing editability must not lose focus.
      editable.setAttribute('contenteditable', next ? 'false' : 'true');
      if (next) editable.setAttribute('aria-disabled', 'true');
      else editable.removeAttribute('aria-disabled');
    }
    // Reset also cancels pending searches, so late results cannot reopen the menu.
    if (next) this.#menu?.reset();
    this.#menu?.syncAria(!!next);
  }

  /** Client trigger configs, merged with the server's by `character`. */
  get triggers(): ClientTrigger[] { return this.#resolvedTriggers(); }

  set triggers(list: ClientTrigger[]) {
    this.#clientTriggers = Array.isArray(list) ? list : [];
    this.#menu?.reset();
    this.#setupMenu();
    this.#menu?.syncAria(this.isDisabled);
  }

  /** Paste-as-token behaviour: `null` disables it; default from `data-ax-paste-threshold`. */
  get pasteAsToken(): ChatPasteAsToken | null {
    if (this.#pasteAsToken !== undefined) return this.#pasteAsToken;
    const raw = this.getAttribute('data-ax-paste-threshold');
    if (raw === 'off') return null;
    return createChatPasteAsToken({input: this, threshold: Number(raw ?? 200) || 200});
  }

  set pasteAsToken(next: ChatPasteAsToken | null | false) {
    this.#pasteAsToken = next === false ? null : next;
  }

  /** Focus the editor, keeping a caret the user already has (else after the draft). */
  focus(options?: FocusOptions): void {
    const editable = this.#editable;
    if (!editable) return;
    const existing = getSelectionRangeInside(editable);
    editable.focus(options);
    if (existing) restoreSelectionRange(existing);
    else placeCaretAtEnd(editable);
  }

  /** Focus with the caret after the draft (the composer's click-to-focus). */
  focusAtEnd(): void {
    const editable = this.#editable;
    if (!editable) return;
    editable.focus();
    placeCaretAtEnd(editable);
  }

  getValue(): string {
    return this.#editable ? serialize(this.#editable) : '';
  }

  /** Tokens in the draft, in order. */
  getTokens(): ChatSubmitToken[] {
    const editable = this.#editable;
    if (!editable) return [];
    return [...editable.querySelectorAll<HTMLElement>('[data-astryx-token]')].map((span) => {
      const id = span.getAttribute('data-astryx-token-id') ?? '';
      const token = this.#tokens.get(id)?.token as {label?: string | number; variant?: string} | undefined;
      return {id, value: span.getAttribute('data-astryx-token-value') ?? '', label: token?.label, variant: token?.variant};
    });
  }

  /** Insert a token at the caret; returns its id. Emits `astryx-change`. */
  insertToken(token: ClientToken): string | undefined {
    if (this.isDisabled) return undefined;
    const id = this.insertTokenSilently(token);
    this.#emitChange();
    return id;
  }

  /** Insert plain text at the caret. Emits `astryx-change`. */
  insertText(text: string): void {
    if (this.isDisabled || !this.#editable) return;
    insertTextAtCursor(this.#editable, text);
    this.#emitChange();
  }

  /** Replace a token with its serialized text. */
  expandToken(id: string): void {
    const editable = this.#editable;
    const entry = this.#tokens.get(id);
    if (this.isDisabled || !editable || !entry) return;
    const {span} = entry;
    const text = document.createTextNode(span.getAttribute('data-astryx-token-value') ?? '');
    const next = span.nextSibling;
    if (next?.nodeType === Node.TEXT_NODE && next.textContent === NBSP) next.remove();
    span.replaceWith(text);
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.setStartAfter(text);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    this.#tokens.delete(id);
    this.#emitChange();
  }

  /** The translated pasted-text label ("3 lines, 812 chars"), grapheme-counted. */
  pastedLabel(text: string): string {
    const locale = this.getAttribute('data-ax-locale') ?? 'en';
    const lines = text.split('\n').length;
    const chars = characterCount(text);
    let map: Record<string, Record<string, string>> = {};
    try { map = JSON.parse(this.getAttribute('data-ax-pasted-label') ?? '{}'); } catch { /* none */ }
    const select = (n: number) => { try { return new Intl.PluralRules(locale).select(n); } catch { return 'other'; } };
    const forms = (lines === 1 ? map['=1'] : undefined) ?? map[select(lines)] ?? map.other ?? {};
    const fmt = (n: number) => { try { return new Intl.NumberFormat(locale).format(n); } catch { return String(n); } };
    return fillMessage(forms[select(chars)] ?? forms.other, {lines: fmt(lines), chars: fmt(chars)}) || `${chars}`;
  }

  /** Insert a token without emitting (paths that emit once themselves). */
  insertTokenSilently(token: ClientToken): string | undefined {
    const editable = this.#editable;
    if (!editable) return undefined;
    const selection = ensureCaretInside(editable);
    if (!selection || selection.rangeCount === 0) return undefined;
    const range = selection.getRangeAt(0);
    const span = document.createElement('span');
    const id = `token-${Date.now().toString(36)}-${(++tokenCounter).toString(36)}`;
    span.className = 'ax-chat-token';
    span.setAttribute('data-astryx-token', '');
    span.setAttribute('data-astryx-token-value', token.value);
    span.setAttribute('data-astryx-token-id', id);
    span.contentEditable = 'false';
    this.#renderToken(span, token);
    range.deleteContents();
    range.insertNode(span);
    const space = document.createTextNode(NBSP);
    span.after(space);
    const next = document.createRange();
    next.setStartAfter(space);
    next.collapse(true);
    selection.removeAllRanges();
    selection.addRange(next);
    this.#tokens.set(id, {span, token});
    return id;
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  #hasTokens(): boolean {
    return this.#editable?.querySelector('[data-astryx-token], [data-astryx-dictation-interim]') != null;
  }

  #setEmpty(isEmpty: boolean) {
    this.#isEmpty = isEmpty;
    if (this.#placeholder) this.#placeholder.hidden = !isEmpty;
  }

  #pruneTokens() {
    for (const [id, {span}] of this.#tokens) if (!this.#editable?.contains(span)) this.#tokens.delete(id);
  }

  #emitChange() {
    const editable = this.#editable;
    if (this.isDisabled || !editable) return;
    const text = serialize(editable);
    // A browser may leave a trailing <br> when everything is deleted ("\n").
    const trimmedEmpty = text.trim().length === 0 && !this.#hasTokens();
    const value = trimmedEmpty ? '' : text;
    this.#setEmpty(trimmedEmpty);
    this.#changeVersion++;
    this.dispatchEvent(new CustomEvent('astryx-change', {detail: {value}, bubbles: true, composed: true}));
    this.#pruneTokens();
  }

  #template(selector: string): HTMLTemplateElement | null {
    return this.querySelector<HTMLTemplateElement>(`:scope > template${selector}`);
  }

  #renderToken(span: HTMLElement, token: ClientToken) {
    if ('render' in token && typeof token.render === 'function') {
      const out = token.render();
      if (typeof out === 'string') span.innerHTML = out;
      else span.append(out);
      return;
    }
    if ('html' in token && typeof token.html === 'string') {
      span.innerHTML = token.html;
      return;
    }
    const badge = token as {value: string; label?: string | number; variant?: string; icon?: string | Node};
    const pastedTemplate = this.#template('[data-ax-pasted-template]');
    if (pastedTemplate && this.pasteAsToken !== null && characterCount(badge.value) > PASTED_TOKEN_LENGTH) {
      span.append(this.#pastedToken(pastedTemplate, badge.value));
      return;
    }
    const tpl = this.#template('[data-ax-token-template]');
    const el = (tpl?.content.firstElementChild?.cloneNode(true) as HTMLElement | undefined) ?? document.createElement('span');
    const label = badge.label != null ? String(badge.label) : '';
    el.setAttribute('data-variant', badge.variant ?? 'neutral');
    el.toggleAttribute('data-has-label', label !== '');
    if (label !== '') el.setAttribute('title', label);
    else el.removeAttribute('title');
    const labelEl = el.querySelector('.ax-badge-label');
    if (labelEl) labelEl.textContent = label;
    else el.textContent = label;
    if (badge.icon != null) {
      const icon = typeof badge.icon === 'string' ? document.createRange().createContextualFragment(badge.icon) : badge.icon;
      el.prepend(icon);
    }
    span.append(el);
  }

  /** ChatPastedTextToken: a Badge with a hover-card preview and Expand. */
  #pastedToken(template: HTMLTemplateElement, text: string): DocumentFragment {
    const fragment = template.content.cloneNode(true) as DocumentFragment;
    const layer = fragment.querySelector<HTMLElement>('ax-hover-card');
    const id = `ax-chat-pasted-${(++layerCounter).toString(36)}-${Date.now().toString(36)}`;
    const old = layer?.id;
    if (layer) layer.id = id;
    const label = this.pastedLabel(text);
    for (const el of fragment.querySelectorAll<HTMLElement>('[data-ax-hover-card]')) {
      el.setAttribute('data-ax-hover-card', id);
      const described = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((x) => x && x !== old);
      el.setAttribute('aria-describedby', [...described, id].join(' '));
      if (el.classList.contains('astryx-badge')) {
        el.setAttribute('title', label);
        const labelEl = el.querySelector('.ax-badge-label');
        if (labelEl) labelEl.textContent = label;
      }
    }
    const preview = fragment.querySelector('.ax-chat-pasted-text');
    if (preview) preview.textContent = text;
    const meta = fragment.querySelector('.ax-chat-pasted-meta');
    if (meta) meta.textContent = label;
    return fragment;
  }

  #resolvedTriggers(): ResolvedTrigger[] {
    const out: ResolvedTrigger[] = [];
    for (const tpl of this.querySelectorAll<HTMLTemplateElement>(':scope > template[data-ax-trigger]')) {
      const character = tpl.getAttribute('data-ax-trigger') ?? '';
      if (!character) continue;
      out.push({
        character,
        staticRows: tpl.hasAttribute('data-ax-static') ? [...tpl.content.children].filter((c): c is HTMLElement => c instanceof HTMLElement) : null,
        hasMultiWordQuery: tpl.hasAttribute('data-ax-multi-word'),
        menuLabel: tpl.getAttribute('data-ax-menu-label') ?? undefined,
        loadingText: tpl.getAttribute('data-ax-loading-text') ?? undefined,
        emptySearchText: tpl.getAttribute('data-ax-empty-text') ?? undefined,
      });
    }
    for (const client of this.#clientTriggers) {
      const existing = out.find((t) => t.character === client.character);
      const defined = Object.fromEntries(Object.entries(client).filter(([, v]) => v !== undefined));
      if (existing) Object.assign(existing, defined);
      else out.push({staticRows: null, ...client});
    }
    return out;
  }

  /** The trigger layer: the server's, or one built for client-only triggers. */
  #ensureLayer(): ComboboxLayerElement | null {
    const existing = comboboxLayer(this, this.getAttribute('data-ax-layer'));
    if (existing) return existing;
    const editable = this.#editable;
    if (!editable || this.#resolvedTriggers().length === 0) return null;
    const n = (++layerCounter).toString(36);
    if (!editable.id) editable.id = `ax-chat-input-c${n}`;
    const layer = document.createElement('ax-combobox-layer') as ComboboxLayerElement;
    layer.id = `ax-chat-trigger-layer-c${n}`;
    layer.setAttribute('popover', 'manual');
    layer.className = 'ax-layer ax-layer-motion ax-popover-layer ax-chat-trigger-layer';
    layer.setAttribute('data-astryx-layer-root', '');
    layer.setAttribute('data-placement', 'above');
    layer.setAttribute('data-align', 'start');
    layer.setAttribute('data-ax-outside-press', 'dismiss');
    layer.setAttribute('data-ax-inside', editable.id);
    layer.setAttribute('style', '--_astryx-layer-clearance:var(--spacing-1)');
    const surface = document.createElement('div');
    surface.className = 'astryx-popover ax-chat-trigger-surface';
    const listbox = document.createElement('div');
    listbox.id = `ax-chat-trigger-menu-c${n}`;
    listbox.setAttribute('role', 'listbox');
    listbox.className = 'astryx-trigger-menu';
    surface.append(listbox);
    layer.append(surface);
    editable.after(layer);
    this.setAttribute('data-ax-layer', layer.id);
    return layer;
  }

  #setupMenu() {
    if (this.#menu || !this.#editable) return;
    const layer = this.#ensureLayer();
    const listbox = layer?.querySelector<HTMLElement>('[role="listbox"]');
    if (!layer || !listbox) return;
    this.#menu = createTriggerMenu({
      host: this,
      editable: this.#editable,
      layer,
      listbox,
      triggers: () => this.#resolvedTriggers(),
      debounceMs: () => Number(this.getAttribute('data-ax-debounce') ?? 150),
      defaults: {
        menuLabel: this.getAttribute('data-ax-menu-label') ?? 'Suggestions',
        loadingText: this.getAttribute('data-ax-loading-text') ?? 'Searching…',
      },
      insert: (result) => {
        if (typeof result === 'string') {
          if (this.#editable) insertTextAtCursor(this.#editable, result);
        } else {
          this.insertTokenSilently(result);
        }
      },
      emitChange: () => this.#emitChange(),
    });
    this.#menu.syncAria(this.isDisabled);
  }

  #submitTarget(): ComposerLike | null {
    const composer = this.closest('ax-chat-composer') as ComposerLike | null;
    return composer && typeof composer.submit === 'function' ? composer : null;
  }

  #handleInput() {
    if (this.isDisabled) return;
    this.#emitChange();
    this.#menu?.handleInput();
  }

  #handleKeyDown(e: KeyboardEvent) {
    const editable = this.#editable;
    if (!editable) return;
    if (this.isDisabled) {
      if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
      return;
    }
    if (this.#menu?.handleKeyDown(e)) return;

    // Consumer seam (Astryx onKeyDown): runs before the built-in Enter/history handling.
    const seam = new CustomEvent('astryx-keydown', {detail: {event: e}, bubbles: true, composed: true, cancelable: true});
    this.dispatchEvent(seam);
    if (seam.defaultPrevented || e.defaultPrevented) return;

    if (e.key === 'Backspace') {
      const selection = window.getSelection();
      if (selection && selection.isCollapsed && selection.rangeCount > 0) {
        let {startContainer, startOffset} = selection.getRangeAt(0);
        // A caret placed after the token's trailing space (insertToken) sits on the editor
        // between nodes; read it as the end of that text node.
        const before = startContainer.nodeType === Node.ELEMENT_NODE && startOffset > 0 ? startContainer.childNodes[startOffset - 1] : null;
        if (before?.nodeType === Node.TEXT_NODE) {
          startContainer = before;
          startOffset = before.textContent?.length ?? 0;
        }
        const previous = startContainer.previousSibling;
        const afterToken = startContainer.nodeType === Node.TEXT_NODE && previous instanceof HTMLElement && previous.hasAttribute('data-astryx-token');
        // At offset 0 right after a token the browser removes the token itself.
        if (afterToken && !(startOffset === 0) && startContainer.textContent === NBSP && startOffset <= 1) {
          e.preventDefault();
          const parent = startContainer.parentNode;
          if (parent) {
            parent.removeChild(startContainer);
            parent.removeChild(previous);
          }
          this.#emitChange();
          return;
        }
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      // Never submit mid-composition: an IME commits a candidate with Enter.
      if (isImeKeyEvent(e)) return;
      e.preventDefault();
      const text = serialize(editable).trim();
      if (!text) return;
      if (this.#hasHistory()) {
        this.#history.push(text);
        this.#historyIndex = -1;
        this.#draft = '';
      }
      // Submitting ends any trigger query (and forgets an Escape on it).
      this.#menu?.reset();
      const tokens = this.getTokens();
      const composer = this.#submitTarget();
      if (composer) composer.submit(text, tokens);
      else this.dispatchEvent(new CustomEvent('astryx-submit', {detail: {value: text, tokens}, bubbles: true, composed: true}));
      editable.textContent = '';
      this.#setEmpty(true);
      this.#tokens.clear();
      this.#changeVersion++;
      this.dispatchEvent(new CustomEvent('astryx-change', {detail: {value: ''}, bubbles: true, composed: true}));
      return;
    }

    if (this.#hasHistory() && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      // A caret we never placed (focus by other means): place it where focus() would have.
      ensureCaretInside(editable);
      const isCollapsed = window.getSelection()?.isCollapsed ?? true;
      const atStart = isSelectionAtStart(editable);
      const atEnd = isSelectionAtEnd(editable);
      const canPrev = atStart && (isCollapsed || atEnd);
      const canNext = atEnd && (isCollapsed || atStart);
      if (e.key === 'ArrowUp' ? !canPrev : !canNext) return;
      const text = serialize(editable);
      const history = this.#history;
      if (history.length === 0) return;
      if (e.key === 'ArrowUp') {
        if (this.#historyIndex === -1) this.#draft = text;
        const index = this.#historyIndex === -1 ? history.length - 1 : Math.max(0, this.#historyIndex - 1);
        this.#historyIndex = index;
        editable.textContent = history[index];
        selectAll(editable);
        this.#emitChange();
        e.preventDefault();
      } else if (this.#historyIndex !== -1) {
        const index = this.#historyIndex + 1;
        if (index >= history.length) {
          this.#historyIndex = -1;
          editable.textContent = this.#draft;
          if (this.#draft) selectAll(editable);
        } else {
          this.#historyIndex = index;
          editable.textContent = history[index];
          selectAll(editable);
        }
        this.#emitChange();
        e.preventDefault();
      }
    }
  }

  #hasHistory(): boolean {
    return this.getAttribute('data-ax-history') !== 'false';
  }

  #handlePaste(e: ClipboardEvent) {
    const editable = this.#editable;
    if (this.isDisabled) {
      e.preventDefault();
      return;
    }
    if (!editable || !e.clipboardData) return;
    const selection = ensureCaretInside(editable);
    // A paste inside a token lands after it (and its trailing space).
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const tokenEl = range ? (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)?.closest<HTMLElement>('[data-astryx-token]') : null;
    if (selection && tokenEl && editable.contains(tokenEl)) {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      const space = tokenEl.nextSibling;
      const next = document.createRange();
      if (space && space.nodeType === Node.TEXT_NODE) next.setStartAfter(space);
      else next.setStartAfter(tokenEl);
      next.collapse(true);
      selection.removeAllRanges();
      selection.addRange(next);
      insertTextAtCursor(editable, text);
      this.#emitChange();
      return;
    }
    const files = Array.from(e.clipboardData.files ?? []);
    if (files.length > 0) {
      e.preventDefault();
      this.dispatchEvent(new CustomEvent('astryx-files', {detail: {files}, bubbles: true, composed: true}));
      return;
    }
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    // Consumer first refusal (Astryx onPaste): preventDefault() = handled.
    const version = this.#changeVersion;
    const claim = new CustomEvent('astryx-paste', {detail: {text, event: e}, bubbles: true, composed: true, cancelable: true});
    this.dispatchEvent(claim);
    if (claim.defaultPrevented) {
      if (this.#changeVersion === version) this.#emitChange();
      return;
    }
    if (this.pasteAsToken?.onPaste(e, text)) {
      this.#emitChange();
      return;
    }
    insertTextAtCursor(editable, text);
    this.#emitChange();
  }

  #handleDrop(e: DragEvent) {
    if (this.isDisabled) {
      e.preventDefault();
      return;
    }
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    // A file drop navigates by default; the input owns the drop target.
    e.preventDefault();
    this.dispatchEvent(new CustomEvent('astryx-files', {detail: {files}, bubbles: true, composed: true}));
  }
}

defineElement('ax-chat-composer-input', ChatComposerInputElement);

declare global {
  interface HTMLElementTagNameMap {
    'ax-chat-composer-input': ChatComposerInputElement;
  }
}
