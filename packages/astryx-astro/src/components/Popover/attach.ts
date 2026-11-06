/**
 * Sibling mode for a Popover whose trigger a component renders itself (Astryx `anchorRef`):
 *
 *   const pop = attachPopover({label: 'Filters'});
 *   <button {...pop.trigger}>Filters</button>
 *   <Popover {...pop.layer} label="Filters"><Fragment slot="content">…</Fragment></Popover>
 *
 * `trigger` makes the button a native invoker (zero-JS open/close/Escape/light dismiss) with
 * the ARIA Popover.tsx attaches; the trigger is the anchor.
 */
import {layerId, mergeIds} from '../Layer/layer';

export function attachPopover(options: {id?: string; triggerId?: string; role?: 'dialog' | 'none'; isOpen?: boolean; controls?: string | null} = {}) {
  const id = options.id ?? layerId('ax-popover');
  const triggerId = options.triggerId ?? `${id}-trigger`;
  return {
    id,
    trigger: {
      id: triggerId,
      popovertarget: id,
      'aria-haspopup': options.role === 'none' ? 'true' : 'dialog',
      'aria-expanded': options.isOpen ? 'true' : 'false',
      'aria-controls': mergeIds(options.controls, id) ?? id,
    },
    layer: {id, for: triggerId},
  };
}
