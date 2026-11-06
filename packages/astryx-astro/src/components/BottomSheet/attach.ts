/**
 * The trigger contract for a BottomSheet opened from a button you render (see Dialog/attach.ts
 * and Drawer/attach.ts; Astryx sheets are controlled and render no trigger):
 *
 *   const filters = attachBottomSheet({id: 'filters'});
 *   <Button {...filters.trigger} label="Filters" />
 *   <BottomSheet {...filters.layer} label="Filters">…<Button {...filters.close} label="Done" /></BottomSheet>
 *
 * Modal sheets use `command="show-modal"` / `close`; non-modal ones (`hasScrim={false}`)
 * `toggle-popover` / `hide-popover`. Pass the same `hasScrim` to both. Zero JS opens and
 * closes the sheet natively; `<ax-bottom-sheet>` takes the commands over when it loads (the
 * invoker becomes the opener focus returns to).
 */
import {layerId} from '../Layer/layer';

export interface AttachBottomSheetOptions {
  /** The sheet (`<dialog>`) id. @default generated */
  id?: string;
  /** An id for the trigger button. */
  triggerId?: string;
  /** Match the BottomSheet's `hasScrim`. @default true */
  hasScrim?: boolean;
}

export function attachBottomSheet(options: AttachBottomSheetOptions = {}) {
  const id = options.id ?? layerId('ax-bottom-sheet');
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
