/**
 * CheckboxListContext (Astryx CheckboxList/CheckboxListContext.tsx) as a subtree-scoped
 * `Astro.locals` key (lib/subtreeLocals.ts): CheckboxList renders its items with
 * `renderWithLocals()`, so every CheckboxListItem inside reads the group's mode, values,
 * disabled / read-only / invalid state and the disabled reason's id.
 *
 * Cascade keys (lib/cascade.ts) the item's native checkbox enrols in:
 *  - `checkbox-list-item` — stamped by the item itself (`_CheckboxSlot.astro`): the form `value`
 *    (CheckboxInput's `value` is the checked state; a rich label's `aria-labelledby` is a prop);
 *  - `checkbox-list-reason` — stamped by the list: the disabled reason's id, appended after the
 *    row description Item stamps (`item-description`), as Astryx orders them;
 *  - `checkbox-list-state` + `checkbox-list-required` — stamped by the list in two passes (read
 *    every box's state, then write): native `required` on the first enabled box while none is
 *    checked (requiredGroup.ts on the server). A select-all item does not take part.
 * The locals key is layer-scoped (`layerScopedLocal()`): overlays render their content without it.
 */
import {layerScopedLocal} from '../../lib/subtreeLocals';

export interface CheckboxListContextValue {
  /** Collection mode: the list has a `value` array and owns the checked state. */
  isCollection: boolean;
  /** The initially checked values (collection mode). */
  values: readonly string[];
  isDisabled: boolean;
  /** Whole group disabled with a disabledMessage (the reason describes every checkbox). */
  hasDisabledMessage: boolean;
  disabledMessageID?: string;
  isReadOnly: boolean;
  /** An error status: every checkbox is aria-invalid. */
  isInvalid: boolean;
  /** isRequired: the first enabled box carries native `required` while none is checked. */
  isRequired: boolean;
  /** Port extension: the `name` every checkbox submits its value under. */
  htmlName?: string;
}

export const CHECKBOX_LIST_LOCAL = layerScopedLocal('astryxCheckboxList');
export const CHECKBOX_ITEM_KEY = 'checkbox-list-item';
export const CHECKBOX_REASON_KEY = 'checkbox-list-reason';
export const CHECKBOX_STATE_KEY = 'checkbox-list-state';
export const CHECKBOX_REQUIRED_KEY = 'checkbox-list-required';

export function readCheckboxListContext(astro: {locals?: object}): CheckboxListContextValue | null {
  const value = (astro.locals as Record<string, unknown> | undefined)?.[CHECKBOX_LIST_LOCAL];
  return (value as CheckboxListContextValue | undefined) ?? null;
}
