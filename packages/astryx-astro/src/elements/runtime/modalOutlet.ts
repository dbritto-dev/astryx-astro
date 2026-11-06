/**
 * Modal outlets — where a passive global host (the toast viewport) lives while a native modal
 * is open. Port of @astryxdesign/core Layer/modalOutlet.ts (spec:AST-003 FR18).
 *
 * A native modal makes everything outside it inert and paints over every earlier top-layer
 * element, so the toast viewport moves into the latest open modal's `<dialog>` to stay visible
 * and operable, and back out when it closes. Every modal surface (Dialog, AlertDialog, a modal
 * Drawer, and later BottomSheet, Lightbox, MobileNav, CommandPalette) supplies its `<dialog>`
 * right after `showModal()` and withdraws it when it closes or starts its exit.
 *
 * A non-modal top-layer surface (a `popover="manual"` Drawer) blocks nothing, so it is not an
 * outlet, but it enters the top layer above hosts shown before it: it calls
 * `notifyTopLayerEntry()` and hosts re-enter the top layer in place.
 *
 * Listeners run synchronously, so a host leaves a modal in the same task the modal closes.
 * One registry per document (duplicate bundles share it through a global symbol).
 * SSR-safe: nothing touches the DOM.
 *
 * Shared candidate: this belongs in src/elements/runtime/ next to layerStack.ts.
 */

export type ModalOutletChange = 'outlet' | 'entry';
type Listener = (change: ModalOutletChange) => void;

interface Registry {
  outlets: HTMLDialogElement[];
  listeners: Set<Listener>;
}

const KEY = Symbol.for('astryx-astro/modal-outlet/v1');

function registry(): Registry {
  const holder = globalThis as typeof globalThis & {[KEY]?: Registry};
  if (!holder[KEY]) Object.defineProperty(holder, KEY, {value: {outlets: [], listeners: new Set()}});
  return holder[KEY]!;
}

function notify(change: ModalOutletChange): void {
  for (const listener of [...registry().listeners]) listener(change);
}

/**
 * Supply `dialog` (an open native modal) as the latest outlet. Call it after `showModal()`.
 * Returns the withdraw function (idempotent).
 */
export function supplyModalOutlet(dialog: HTMLDialogElement): () => void {
  const {outlets} = registry();
  const at = outlets.indexOf(dialog);
  if (at !== -1) outlets.splice(at, 1);
  outlets.push(dialog);
  notify('outlet');
  return () => withdrawModalOutlet(dialog);
}

/** Withdraw `dialog`: it closed, started its exit, or left the document. */
export function withdrawModalOutlet(dialog: HTMLDialogElement): void {
  const {outlets} = registry();
  const at = outlets.indexOf(dialog);
  if (at === -1) return;
  outlets.splice(at, 1);
  notify('outlet');
}

/** The latest open modal outlet, or null. Outlets that left the document are skipped. */
export function getActiveModalOutlet(): HTMLDialogElement | null {
  const {outlets} = registry();
  for (let i = outlets.length - 1; i >= 0; i--) {
    const dialog = outlets[i];
    if (dialog.isConnected && dialog.open) return dialog;
  }
  return null;
}

/** Call `listener` whenever the latest outlet may have changed or a surface entered the top layer. */
export function subscribeModalOutlets(listener: Listener): () => void {
  const {listeners} = registry();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A non-modal surface was just shown into the top layer above the global hosts. */
export function notifyTopLayerEntry(): void {
  notify('entry');
}
