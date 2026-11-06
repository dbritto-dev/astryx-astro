/**
 * RadioListContext + RadioListReasonContext (Astryx RadioList/RadioList.tsx,
 * RadioList/RadioListReasonContext.ts) as a subtree-scoped `Astro.locals` key
 * (lib/subtreeLocals.ts): RadioList renders its items with `renderWithLocals()`, so every
 * RadioListItem inside reads the group's name, value, size … and nothing outside does.
 * Layer-scoped (`layerScopedLocal()`): overlays inside the list render their content without it.
 */
import type {InputStatus} from '../Field/fieldProps';
import {layerScopedLocal} from '../../lib/subtreeLocals';

export type RadioListSize = 'sm' | 'md';

export interface RadioListContextValue {
  /** The `name` shared by the group's radios (htmlName, else generated). */
  name: string;
  /** The initially selected value ('' = none). */
  value: string;
  isDisabled: boolean;
  /** Whole group disabled with a disabledMessage: radios stay focusable (aria-disabled). */
  hasDisabledMessage: boolean;
  /** Explicit isRequired (native `required` on the radios). */
  isRequired: boolean;
  size: RadioListSize;
  status?: InputStatus;
  /** The disabled-reason tooltip id each radio adds to its aria-describedby. */
  reasonID?: string;
}

export const RADIO_LIST_LOCAL = layerScopedLocal('astryxRadioList');

export function readRadioListContext(astro: {locals?: object}): RadioListContextValue | null {
  const value = (astro.locals as Record<string, unknown> | undefined)?.[RADIO_LIST_LOCAL];
  return (value as RadioListContextValue | undefined) ?? null;
}
