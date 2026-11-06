// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Ported from @astryxdesign/core 0.7.9 src/Selector/types.ts, optionShape.ts,
// selectableOptionEntries.ts and utils.ts (shared with MultiSelector, as in Astryx).
/**
 * Selector / MultiSelector option data. `icon` takes what Icon takes (a semantic name, an SVG
 * string, an Astro component); `description` is text (markup goes through the `option`
 * render slot). `action` (MultiSelector grid rows, spec:AST-058) is not rendered by this
 * port yet.
 */
import type {AstroIconComponent, ExtendedIconName} from '../Icon/iconRegistry';

export interface SelectorOptionData {
  value: string;
  /** Kept a string: search filtering and type-ahead lowercase it. @default value */
  label?: string;
  description?: string;
  disabled?: boolean;
  icon?: ExtendedIconName | AstroIconComponent;
  /** Not rendered yet (MultiSelector grid rows are deferred); warns in development. */
  action?: unknown;
}

export interface SelectorDivider {
  type: 'divider';
}

export interface SelectorSection {
  type: 'section';
  title?: string;
  options: Array<string | SelectorOptionData>;
}

/** A plain string, option data, a divider, or a section. */
export type SelectorOptionType = string | SelectorOptionData | SelectorDivider | SelectorSection;

export function isOptionData(option: SelectorOptionType): option is SelectorOptionData | string {
  return typeof option === 'string' || !('type' in option);
}

export function isDivider(option: SelectorOptionType): option is SelectorDivider {
  return typeof option === 'object' && 'type' in option && option.type === 'divider';
}

export function isSection(option: SelectorOptionType): option is SelectorSection {
  return typeof option === 'object' && 'type' in option && option.type === 'section';
}

export function normalizeOption(option: string | SelectorOptionData): SelectorOptionData & {label: string} {
  if (typeof option === 'string') return {value: option, label: option};
  return {...option, label: option.label ?? option.value};
}

/** Every selectable option, sections flattened, dividers skipped. */
export function getSelectableOptions(options: SelectorOptionType[]): Array<SelectorOptionData & {label: string}> {
  const out: Array<SelectorOptionData & {label: string}> = [];
  for (const option of options) {
    if (isOptionData(option)) out.push(normalizeOption(option));
    else if (isSection(option)) for (const opt of option.options) out.push(normalizeOption(opt));
  }
  return out;
}

/** One rendered row of the list, in display order (the listbox structure the server writes). */
export type OptionRow =
  | {kind: 'option'; option: SelectorOptionData & {label: string}; index: number}
  | {kind: 'divider'; key: number}
  | {kind: 'section'; key: number; title?: string; options: Array<{option: SelectorOptionData & {label: string}; index: number}>};

/** The list structure with flat indexes (ids are `${listboxId}-item-${index}`). */
export function optionRows(options: SelectorOptionType[]): OptionRow[] {
  const rows: OptionRow[] = [];
  let index = 0;
  options.forEach((option, key) => {
    if (isDivider(option)) rows.push({kind: 'divider', key});
    else if (isSection(option)) {
      rows.push({kind: 'section', key, title: option.title, options: option.options.map((o) => ({option: normalizeOption(o), index: index++}))});
    } else if (isOptionData(option)) rows.push({kind: 'option', option: normalizeOption(option), index: index++});
  });
  return rows;
}
