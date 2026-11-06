/**
 * `<ax-alert-dialog>` — the behaviour of AlertDialog: `<ax-dialog>` (elements/dialog.ts) plus
 * the confirmation row of @astryxdesign/core AlertDialog/AlertDialog.tsx.
 *
 * - At 640px and below the destructive action moves above Cancel in the DOM (visual, DOM and
 *   tab order stay aligned) and the row becomes the vertical, stretched, non-wrapping Stack
 *   Astryx renders there; wider, Cancel then the action, horizontal, end-aligned, wrapping.
 *   Server markup is the wide layout; without JS a CSS media query stacks it visually.
 * - Cancel is `[data-autofocus]` (least destructive) and a native `command="close"` invoker.
 * - A click on the action dispatches `astryx-action` (bubbles; Astryx `onAction`). The dialog
 *   does not close itself: call `hide()` when the work settles.
 * - `actionLoading` (Astryx `isActionLoading`) swaps the action for the server-rendered loading
 *   Button kept in `<template data-ax-alert-action-alt>`, keeping focus on it.
 *
 * Deferred (touch extra): the slide-across press group over the two actions.
 */
import './runtime/disabledInteraction';
import '../behaviors/buttonLive';
import '../behaviors/spinnerRotor';
import {DialogElement, defineHost} from './dialog';

const SMALL_SCREEN_QUERY = '(max-width: 640px)';

export class AlertDialogElement extends DialogElement {
  #media: MediaQueryList | null = null;
  #onMedia = () => this.#applyLayout();
  #onClick = (event: Event) => {
    const action = (event.target as Element | null)?.closest?.('[data-ax-alert-action]');
    if (!action || !this.dialog?.contains(action) || action.getAttribute('aria-disabled') === 'true') return;
    this.dispatchEvent(new CustomEvent('astryx-action', {bubbles: true, composed: true}));
  };

  protected didConnect(): void {
    this.#media = typeof matchMedia === 'function' ? matchMedia(SMALL_SCREEN_QUERY) : null;
    this.#media?.addEventListener('change', this.#onMedia);
    this.dialog?.addEventListener('click', this.#onClick);
    this.#applyLayout();
  }

  protected didDisconnect(): void {
    this.#media?.removeEventListener('change', this.#onMedia);
    this.#media = null;
    this.dialog?.removeEventListener('click', this.#onClick);
  }

  #row(): HTMLElement | null {
    return this.dialog?.querySelector<HTMLElement>('[data-ax-alert-actions]') ?? null;
  }

  /** Whether the action shows its spinner (Astryx `isActionLoading`). */
  get actionLoading(): boolean {
    return this.#row()?.querySelector('[data-ax-alert-action]')?.getAttribute('aria-busy') === 'true';
  }

  set actionLoading(value: boolean) {
    const row = this.#row();
    const current = row?.querySelector<HTMLElement>('[data-ax-alert-action]');
    const template = this.dialog?.querySelector<HTMLTemplateElement>('template[data-ax-alert-action-alt]');
    if (!row || !current || !template || this.actionLoading === value) return;
    const alt = template.content.querySelector<HTMLElement>('[data-ax-alert-action]');
    if (!alt) return;
    const hadFocus = current.contains(this.ownerDocument.activeElement);
    current.replaceWith(alt);
    template.content.append(current);
    if (hadFocus) alt.focus({preventScroll: true});
  }

  #applyLayout() {
    const row = this.#row();
    if (!row) return;
    const small = this.#media?.matches ?? false;
    const cancel = row.querySelector<HTMLElement>(':scope > [data-ax-alert-cancel]');
    const action = row.querySelector<HTMLElement>(':scope > [data-ax-alert-action]');
    // Stack(direction, hAlign, wrap) as Astryx renders it for each width.
    row.setAttribute('data-direction', small ? 'vertical' : 'horizontal');
    row.setAttribute('data-wrap', small ? 'nowrap' : 'wrap');
    if (small) {
      row.removeAttribute('data-main-align');
      row.setAttribute('data-cross-align', 'stretch');
    } else {
      row.setAttribute('data-main-align', 'end');
      row.removeAttribute('data-cross-align');
    }
    row.toggleAttribute('data-ax-stacked', small);
    if (!cancel || !action) return;
    const [firstEl, secondEl] = small ? [action, cancel] : [cancel, action];
    if (row.firstElementChild === firstEl) return;
    const active = this.ownerDocument.activeElement as HTMLElement | null;
    const keep = active && (firstEl.contains(active) || secondEl.contains(active)) ? active : null;
    row.prepend(firstEl);
    firstEl.after(secondEl);
    keep?.focus({preventScroll: true});
  }
}

defineHost('ax-alert-dialog', AlertDialogElement);
