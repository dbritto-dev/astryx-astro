/**
 * `<ax-drawer>` — the behaviour of Drawer: the Dialog lifecycle (elements/dialog.ts) with a
 * side-sheet host. Port of @astryxdesign/core Drawer/Drawer.tsx and
 * Drawer/useDrawerDialogPresence.ts:
 *
 * - `data-ax-modal` (hasScrim): `showModal()` — top layer, scrim (`::backdrop`), Tab contained,
 *   page scroll locked, a backdrop press closes for `purpose="info"`, toasts move inside.
 *   Without it: `popover="manual"` + `showPopover()` — a non-modal top-layer panel; the page
 *   stays interactive, Escape still closes through the shared stack, and the toast viewport
 *   re-enters the top layer above it (notifyTopLayerEntry).
 * - Exit: `data-ax-closing` slides the panel back to its edge; once the transform transition
 *   ends (or a backstop from the computed duration) the native host hides in the same task, so
 *   no frame paints the panel outside the top layer. The stack entry stays until then, so a
 *   second Escape cannot fall through. Focus returns after the host leaves; the popover host
 *   then dispatches the synthetic `close` its dialog path used to fire.
 * - Initial focus: `[data-autofocus]`, else the browser's focusing steps (the scrollable
 *   content area carries tabindex="-1", so a modal drawer focuses the panel body).
 *
 * Commands: modal `show-modal` / `close`; non-modal `show-popover` / `hide-popover` /
 * `toggle-popover` (and `close`). Same API and `astryx-open-change` event as `<ax-dialog>`.
 * Deferred (touch extra): holdEntranceInput.
 */
import {ModalHostElement, defineHost} from './dialog';

const EXIT_BACKSTOP_BUFFER_MS = 50;
const EXIT_FALLBACK_MS = 250;

function isPopoverShowing(el: Element): boolean {
  try {
    return el.matches(':popover-open');
  } catch {
    return false;
  }
}

function parseTimes(value: string): Array<number | null> {
  return value.split(',').map((part) => {
    const t = part.trim();
    const n = Number.parseFloat(t);
    if (!Number.isFinite(n)) return null;
    if (t.endsWith('ms')) return n;
    return t.endsWith('s') ? n * 1000 : null;
  });
}

/** The transform transition's duration + delay from computed CSS (readTransformTransitionMs). */
function transformTransitionMs(el: HTMLElement): number | null {
  const cs = getComputedStyle(el);
  const props = cs.transitionProperty.split(',').map((p) => p.trim());
  const durations = parseTimes(cs.transitionDuration);
  const delays = parseTimes(cs.transitionDelay);
  if (!props.length || !durations.length || !delays.length || durations.includes(null) || delays.includes(null)) return null;
  return props.reduce((longest, prop, i) => {
    if (prop !== 'transform' && prop !== 'all') return longest;
    return Math.max(longest, (durations[i % durations.length] ?? 0) + (delays[i % delays.length] ?? 0));
  }, 0);
}

export class DrawerElement extends ModalHostElement {
  get isModal(): boolean {
    return this.hasAttribute('data-ax-modal');
  }

  protected isHostOpen(dialog: HTMLDialogElement): boolean {
    return this.isModal ? dialog.open : isPopoverShowing(dialog) || dialog.open;
  }

  protected showHost(dialog: HTMLDialogElement): void {
    if (this.isModal) dialog.showModal();
    else if (typeof dialog.showPopover === 'function') dialog.showPopover();
    else dialog.show();
  }

  protected hideHost(dialog: HTMLDialogElement): void {
    if (!this.isModal && typeof dialog.hidePopover === 'function') {
      if (isPopoverShowing(dialog)) dialog.hidePopover();
      this.#owesClose = true;
      return;
    }
    if (dialog.open) dialog.close();
  }

  #owesClose = false;

  protected runExit(dialog: HTMLDialogElement, done: () => void): () => void {
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = () => {
      finished = true;
      if (timer != null) clearTimeout(timer);
      dialog.removeEventListener('transitionend', onEnd);
    };
    const finish = () => {
      if (finished) return;
      stop();
      done();
    };
    // Only the panel's own transform ends the exit (a cancelled entry transition does not).
    const onEnd = (event: TransitionEvent) => {
      if (event.target === dialog && event.propertyName === 'transform') finish();
    };
    dialog.addEventListener('transitionend', onEnd);
    timer = setTimeout(finish, (transformTransitionMs(dialog) ?? EXIT_FALLBACK_MS) + EXIT_BACKSTOP_BUFFER_MS);
    return stop;
  }

  protected commandAction(command: string, dialog: HTMLDialogElement): 'show' | 'hide' | 'toggle' | null {
    if (this.isModal) return super.commandAction(command, dialog);
    switch (command) {
      case 'show-popover':
        return 'show';
      case 'hide-popover':
      case 'close':
        return 'hide';
      case 'toggle-popover':
        return 'toggle';
      default:
        return null;
    }
  }

  protected didClose(): void {
    const dialog = this.dialog;
    if (!this.#owesClose || !dialog) return;
    this.#owesClose = false;
    // After the focus return, as the task-queued native `close` would be.
    dialog.dispatchEvent(new Event('close'));
  }
}

defineHost('ax-drawer', DrawerElement);
