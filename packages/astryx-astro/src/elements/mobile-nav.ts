/**
 * `<ax-mobile-nav>` — the behaviour of MobileNav: the native-dialog lifecycle of Dialog / Drawer
 * (elements/dialog.ts ModalHostElement: `showModal()`, the shared Escape stack and `cancel`,
 * the start-and-end backdrop press, Tab containment, scroll lock, the modal outlet, focus return)
 * with MobileNav's drawer. Port of @astryxdesign/core MobileNav/MobileNav.tsx and the drawer half
 * of AppShell/useCloseMobileDrawerOnActivate.ts.
 *
 * - `data-ax-side="auto"`: as it opens, the drawer takes the edge of the viewport half its opener
 *   sits in (`data-side` on the dialog, the theme hook); `start` / `end` are fixed.
 * - The dialog is the transparent full-viewport layer, so a press beside the panel is a press on
 *   the backdrop: it closes (purpose info) when it starts and ends there.
 * - Exit: `data-ax-closing` slides the panel back to its edge; the dialog closes in the task the
 *   panel's transform transition ends (or a backstop from its computed duration), then focus
 *   returns to the opener.
 * - Navigation: a click on a `[data-ax-navigate]` row inside (not disabled) dispatches
 *   `astryx-navigate` {href, event} from the row (bubbling, composed); any `astryx-navigate` that
 *   reaches the dialog closes the drawer (Astryx closeMobileNav after a drawer row's onClick).
 * - `aria-expanded` on every `[aria-controls~=<dialog id>][aria-expanded]` (the toggles) follows
 *   the open state.
 * Same API and `astryx-open-change` event as `<ax-dialog>`.
 *
 * Deferred (touch extra): holdEntranceInput.
 */
import {ModalHostElement, defineHost} from './dialog';
import {focusForLastInput} from './runtime/modality';

const EXIT_BACKSTOP_BUFFER_MS = 50;
const EXIT_FALLBACK_MS = 250;

export interface NavigateDetail {
  href: string | null;
  event: MouseEvent;
}

function transformMs(el: HTMLElement): number | null {
  const cs = getComputedStyle(el);
  const parse = (v: string) => v.split(',').map((p) => {
    const t = p.trim();
    const n = Number.parseFloat(t);
    if (!Number.isFinite(n)) return null;
    return t.endsWith('ms') ? n : t.endsWith('s') ? n * 1000 : null;
  });
  const props = cs.transitionProperty.split(',').map((p) => p.trim());
  const durations = parse(cs.transitionDuration);
  const delays = parse(cs.transitionDelay);
  if (durations.includes(null) || delays.includes(null)) return null;
  return props.reduce((max, prop, i) => (prop === 'transform' || prop === 'all'
    ? Math.max(max, (durations[i % durations.length] ?? 0) + (delays[i % delays.length] ?? 0))
    : max), 0);
}

export class MobileNavElement extends ModalHostElement {
  #off: Array<() => void> = [];

  /** The sliding panel. */
  get panel(): HTMLElement | null {
    return this.dialog?.querySelector<HTMLElement>(':scope > .ax-mobile-nav-drawer') ?? null;
  }

  protected didConnect(): void {
    const dialog = this.dialog;
    if (!dialog) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const row = target?.closest<HTMLElement>('[data-ax-navigate]');
      if (!row || row.closest('dialog') !== dialog) return;
      if (row.matches(':disabled, [aria-disabled="true"]')) return;
      row.dispatchEvent(new CustomEvent<NavigateDetail>('astryx-navigate', {
        bubbles: true, composed: true, detail: {href: row.getAttribute('href'), event},
      }));
    };
    const onNavigate = () => { if (this.isOpen) this.hide('api'); };
    dialog.addEventListener('click', onClick);
    dialog.addEventListener('astryx-navigate', onNavigate);
    this.#off.push(() => dialog.removeEventListener('click', onClick), () => dialog.removeEventListener('astryx-navigate', onNavigate));
    this.#syncTriggers(false);
  }

  protected didDisconnect(): void {
    for (const off of this.#off.splice(0)) off();
  }

  protected willShow(dialog: HTMLDialogElement, opener: HTMLElement | null): void {
    const side = this.getAttribute('data-ax-side');
    if (side !== 'auto') {
      if (side === 'start' || side === 'end') dialog.setAttribute('data-side', side);
      return;
    }
    if (!opener || opener === opener.ownerDocument.body) return;
    const rect = opener.getBoundingClientRect();
    const view = opener.ownerDocument.defaultView ?? window;
    const isLeftHalf = rect.left + rect.width / 2 < view.innerWidth / 2;
    // Physical halves map onto logical edges: in RTL the left half is the inline end.
    const isRtl = getComputedStyle(dialog).direction === 'rtl';
    dialog.setAttribute('data-side', isLeftHalf !== isRtl ? 'start' : 'end');
  }

  /** `[data-autofocus]` first, else the panel (tabindex="-1"; Astryx: "focuses the drawer, not the close button"). */
  protected focusInitial(dialog: HTMLDialogElement): void {
    const auto = this.ownElement(dialog, '[data-autofocus]');
    const panel = this.panel;
    if (auto) focusForLastInput(auto);
    else if (panel && !panel.contains(dialog.ownerDocument.activeElement)) focusForLastInput(panel, {preventScroll: true});
  }

  protected runExit(dialog: HTMLDialogElement, done: () => void): () => void {
    const panel = this.panel ?? dialog;
    let finished = false;
    const stop = () => {
      finished = true;
      clearTimeout(timer);
      panel.removeEventListener('transitionend', onEnd);
    };
    const finish = () => {
      if (finished) return;
      stop();
      done();
    };
    const onEnd = (event: TransitionEvent) => {
      if (event.target === panel && event.propertyName === 'transform') finish();
    };
    panel.addEventListener('transitionend', onEnd);
    const timer = setTimeout(finish, (transformMs(panel) ?? EXIT_FALLBACK_MS) + EXIT_BACKSTOP_BUFFER_MS);
    return stop;
  }

  protected didOpen(): void {
    this.#syncTriggers(true);
  }

  protected didClose(): void {
    this.#syncTriggers(false);
  }

  #syncTriggers(open: boolean): void {
    const id = this.dialog?.id;
    if (!id) return;
    for (const t of this.ownerDocument.querySelectorAll(`[aria-controls~="${CSS.escape(id)}"][aria-expanded]`)) {
      t.setAttribute('aria-expanded', String(open));
    }
  }
}

defineHost('ax-mobile-nav', MobileNavElement);
