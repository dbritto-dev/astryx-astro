/**
 * The trigger contract for a Drawer opened from a button you render (see Dialog/attach.ts):
 *
 *   const details = attachDrawer({id: 'details', hasScrim: false});
 *   <button {...details.trigger}>Details</button>
 *   <Drawer {...details.layer} hasScrim={false} label="Details">…</Drawer>
 *
 * Modal drawers use `command="show-modal"` / `close`; non-modal ones (`hasScrim={false}`)
 * `toggle-popover` / `hide-popover`, so a second press closes them and the invoker exposes the
 * expanded state natively. Pass the same `hasScrim` to both.
 */
import {layerId} from '../Layer/layer';

export interface AttachDrawerOptions {
  /** The drawer (`<dialog>`) id. @default generated */
  id?: string;
  /** An id for the trigger button. */
  triggerId?: string;
  /** Match the Drawer's `hasScrim`. @default true */
  hasScrim?: boolean;
}

export function attachDrawer(options: AttachDrawerOptions = {}) {
  const id = options.id ?? layerId('ax-drawer');
  const modal = options.hasScrim !== false;
  return {
    id,
    trigger: {
      type: 'button' as const,
      ...(options.triggerId ? {id: options.triggerId} : {}),
      commandfor: id,
      command: modal ? 'show-modal' : 'toggle-popover',
      'aria-haspopup': 'dialog' as const,
    },
    close: {type: 'button' as const, commandfor: id, command: modal ? 'close' : 'hide-popover'},
    layer: {id},
  };
}
