/**
 * Button's context-free cascades (lib/cascade.ts) — the keys a provider stamps.
 *
 * Astryx resolves Button size as explicit `size` → nearest SizeContext provider
 * (ButtonGroup, Toolbar, InputGroup …) → 'md' (SizeContext/useSize), and gives the
 * `icon` slot an owner default of sm for sm/md buttons and md for lg
 * (IconDefaultSizeProvider). Astro has no context, so:
 *
 *   'size'             on the Button root, only when `size` is not explicit. The root
 *                      always renders its effective `data-size` ('md' without a provider).
 *   'button-icon-size' on the default-sized Icons of the `icon` slot, only when the
 *                      Button's size is not explicit. Button has already stamped them with
 *                      the owner default for its own effective size; a provider that changes
 *                      the Button's size must restamp them to follow (sm/md → sm, lg → md).
 *   'button-group'     on every Button root: ButtonGroup's context (orientation, disabled).
 *
 * A size provider stamps both in one pass with `buttonSizeStampers()`:
 *   const html = await stamp(await Astro.slots.render('default'), {...buttonSizeStampers(size)});
 * `buttonSizeStampers(null)` is a null provider (consumes both markers, keeps 'md').
 *
 * ToggleButton passes Button its own keys ('toggle-group-size' / 'toggle-group-icon-size'):
 * in Astryx a ToggleButton always hands Button a resolved size, so SizeContext providers
 * never reach it; only its ToggleButtonGroup does.
 */
import {ELEMENT_NODE, parse, render, walk} from 'ultrahtml';
import type {ComponentSize} from '../../lib/types';
import type {IconSize} from '../Icon/iconRegistry';

const ATTR = 'data-ax-inherit';

export const BUTTON_SIZE_KEY = 'size';
export const BUTTON_ICON_SIZE_KEY = 'button-icon-size';
/**
 * Group membership (Astryx useButtonGroup): every Button root enrols; only ButtonGroup stamps
 * it (orientation, group-disabled), see ButtonGroup/groupCascade.ts.
 */
export const BUTTON_GROUP_KEY = 'button-group';

/** Astryx iconSizeByButtonSize: the owner default of the icon slot. */
export const ICON_SIZE_BY_BUTTON_SIZE: Record<ComponentSize, IconSize> = {sm: 'sm', md: 'sm', lg: 'md'};

type Attrs = Record<string, string>;
type Apply = ((attrs: Attrs, tag: string) => void) | null;

export interface ButtonCascadeKeys {
  /** Key on the Button root (its `data-size`). */
  size: string;
  /** Key on the default-sized Icons of the icon slot (their `data-size`). */
  iconSize: string;
}

export const DEFAULT_BUTTON_CASCADE_KEYS: ButtonCascadeKeys = {size: BUTTON_SIZE_KEY, iconSize: BUTTON_ICON_SIZE_KEY};

/** Stampers for a size provider: Button roots and their slot icons in one `stamp()` pass. */
export function buttonSizeStampers(
  size: ComponentSize | null | undefined,
  keys: ButtonCascadeKeys = DEFAULT_BUTTON_CASCADE_KEYS,
): Record<string, Apply> {
  if (size == null) return {[keys.size]: null, [keys.iconSize]: null};
  return {
    [keys.size]: (a) => { a['data-size'] = size; },
    [keys.iconSize]: (a) => { a['data-size'] = ICON_SIZE_BY_BUTTON_SIZE[size]; },
  };
}

/**
 * Owner default for the icon slot (Astryx IconDefaultSizeProvider): every Icon that did
 * not set `size` gets `iconSize`. With `reenrolKey`, the stamped Icons stay enrolled under
 * that key (the Button's own size is inherited, so a provider may still change it).
 */
export async function stampIconSlot(html: string, iconSize: IconSize, reenrolKey?: string): Promise<string> {
  if (!html || !html.includes(ATTR)) return html;
  const ast = parse(html);
  await walk(ast, (node) => {
    if (node.type !== ELEMENT_NODE) return;
    const attrs = node.attributes as Attrs;
    const marker = attrs[ATTR];
    if (!marker) return;
    const keys = marker.split(/\s+/);
    if (!keys.includes('icon-size')) return;
    attrs['data-size'] = iconSize;
    const remaining = keys.filter((k) => k !== 'icon-size');
    if (reenrolKey) remaining.push(reenrolKey);
    if (remaining.length) attrs[ATTR] = remaining.join(' ');
    else delete attrs[ATTR];
  });
  return render(ast);
}
