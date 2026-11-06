/**
 * The tooltip attachment contract for components that own their trigger element (Button's
 * `tooltip="…"` prop, IconButton's label tooltip, a Field's status icon …).
 *
 * One call gives the attributes for the trigger and the props for the sibling layer:
 *
 *   ---
 *   import Tooltip from '../Tooltip/Tooltip.astro';
 *   import {attachTooltip} from '../Tooltip/attach';
 *   const tip = tooltip ? attachTooltip({describedBy: rest['aria-describedby']}) : null;
 *   ---
 *   <button {...rest} {...tip?.trigger}>…</button>
 *   {tip && <Tooltip {...tip.layer} content={tooltip} placement={tooltipPlacement} />}
 *
 * `trigger` carries `aria-describedby` (merged with the caller's) and `data-ax-tooltip`, so
 * the description is in the server HTML and the delegated runtime finds the layer; `layer`
 * is `{id}`: a `<Tooltip>` with no children renders only the layer (sibling mode). Render it
 * right after the trigger, outside any `<button>`/`<a>`. A disabled control that shows a
 * tooltip must use `aria-disabled="true"` (contract #2), not `disabled`, so it still gets
 * hover and focus.
 */
import {layerId, mergeIds} from '../Layer/layer';

export interface TooltipAttachment {
  id: string;
  /** Spread onto the trigger element. */
  trigger: {'aria-describedby': string; 'data-ax-tooltip': string};
  /** Spread onto `<Tooltip>` (with `content` and any placement/delay props). */
  layer: {id: string};
}

export function attachTooltip(options: {id?: string; describedBy?: string | null} = {}): TooltipAttachment {
  const id = options.id ?? layerId('ax-tooltip');
  return {
    id,
    trigger: {'aria-describedby': mergeIds(options.describedBy, id) ?? id, 'data-ax-tooltip': id},
    layer: {id},
  };
}

/** The same contract for a HoverCard on a trigger a component owns. */
export function attachHoverCard(options: {id?: string; describedBy?: string | null; label?: string} = {}) {
  const id = options.id ?? layerId('ax-hover-card');
  const trigger: Record<string, string> = {'data-ax-hover-card': id};
  if (options.label) trigger['aria-haspopup'] = 'dialog';
  else trigger['aria-describedby'] = mergeIds(options.describedBy, id) ?? id;
  return {id, trigger, layer: {id}};
}
