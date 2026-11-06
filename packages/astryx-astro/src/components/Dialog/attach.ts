/**
 * The trigger contract for a Dialog / AlertDialog a component (or page) opens from its own
 * button. Astryx dialogs are controlled (`isOpen` + `onOpenChange`) and render no trigger; here
 * the trigger is a native invoker, so opening and closing work with zero JS and the dialog
 * element (elements/dialog.ts) takes the same `command` events over when it loads:
 *
 *   const dlg = attachDialog({id: 'delete-dialog'});
 *   <button {...dlg.trigger}>Delete…</button>
 *   <Dialog {...dlg.layer}>…<button {...dlg.close}>Done</button></Dialog>
 *
 * `trigger` = `{type, commandfor, command: 'show-modal', aria-haspopup: 'dialog'}`; the invoker
 * becomes the entry origin and focus returns to it. `close` = a `command="close"` invoker for a
 * custom close control (DialogHeader's close button and AlertDialog's Cancel are wired already).
 * Imperatively: `document.getElementById(id).closest('ax-dialog, ax-alert-dialog').show()`.
 */
import {layerId} from '../Layer/layer';

export interface AttachDialogOptions {
  /** The dialog id. @default generated */
  id?: string;
  /** An id for the trigger button. */
  triggerId?: string;
}

export function attachDialog(options: AttachDialogOptions = {}) {
  const id = options.id ?? layerId('ax-dialog');
  return {
    id,
    trigger: {
      type: 'button' as const,
      ...(options.triggerId ? {id: options.triggerId} : {}),
      commandfor: id,
      command: 'show-modal',
      'aria-haspopup': 'dialog' as const,
    },
    close: {type: 'button' as const, commandfor: id, command: 'close'},
    layer: {id},
  };
}
