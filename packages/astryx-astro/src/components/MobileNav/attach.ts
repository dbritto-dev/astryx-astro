/**
 * The trigger contract for a standalone MobileNav opened from a button you render (inside an
 * AppShell use MobileNavToggle instead):
 *
 *   const nav = attachMobileNav({id: 'site-nav'});
 *   <Button {...nav.trigger} label="Menu" icon="menu" isIconOnly />
 *   <MobileNav {...nav.layer} header="Navigation">…</MobileNav>
 *
 * The trigger is the drawer's native invoker (`command="show-modal"`): it opens with zero JS;
 * the drawer keeps its `aria-expanded` in sync.
 */
export interface AttachMobileNavOptions {
  /** The drawer (`<dialog>`) id. */
  id: string;
  /** An id for the trigger button. */
  triggerId?: string;
}

export function attachMobileNav(options: AttachMobileNavOptions) {
  const {id} = options;
  return {
    id,
    trigger: {
      type: 'button' as const,
      ...(options.triggerId ? {id: options.triggerId} : {}),
      commandfor: id,
      command: 'show-modal',
      'aria-haspopup': 'dialog' as const,
      'aria-expanded': 'false' as const,
      'aria-controls': id,
    },
    close: {type: 'button' as const, commandfor: id, command: 'close'},
    layer: {id},
  };
}
