/**
 * Server-side helpers shared by the DropdownMenu family, MoreMenu and ContextMenu.
 * Ports of @astryxdesign/core DropdownMenu/DropdownMenuContext.tsx (the menu size and the
 * radio group's selection, as cascade keys), DropdownMenu/menuWidth.ts +
 * Layer/clampInlineSize.ts, and the data types of DropdownMenu/DropdownMenu.tsx.
 *
 * Cascade keys (lib/cascade.ts), stamped by the menu root (DropdownMenu, ContextMenu) over its
 * rendered rows — compound or data-driven, flyouts included — before it seals the content:
 *   dropdown-menu-size          every row (`data-size`, Astryx `menuSize` from DropdownMenuContext)
 *   dropdown-menu-control-size  checkbox / radio indicators (`data-size` on the indicator and
 *                               its parts: sm in a sm menu, else md)
 *   dropdown-menu-flyout        a sub-menu's flyout (`data-astryx-layer-root` once the root has
 *                               stamped through it: the flyout re-provides the menu context)
 * and by DropdownMenuRadioGroup over its own radios:
 *   dropdown-menu-radio-group   `aria-checked` (value match) + the group's close policy
 */
import {stamp, seal} from '../../lib/cascade';
import type {ComponentSize} from '../../lib/types';
import type {AstroIconComponent, ExtendedIconName} from '../Icon/iconRegistry';

export const MENU_SIZE_KEY = 'dropdown-menu-size';
export const MENU_CONTROL_SIZE_KEY = 'dropdown-menu-control-size';
export const MENU_FLYOUT_KEY = 'dropdown-menu-flyout';
export const MENU_RADIO_GROUP_KEY = 'dropdown-menu-radio-group';

export type DropdownMenuSize = ComponentSize;

type Attrs = Record<string, string>;
interface ElementNode {type: number; name: string; attributes: Attrs; children?: ElementNode[]}

function setSizeDeep(node: ElementNode, size: string): void {
  if ('data-size' in node.attributes) node.attributes['data-size'] = size;
  for (const child of node.children ?? []) if (child.type === 1) setSizeDeep(child, size);
}

/** Menu root: stamp the menu size through every row (flyouts included), then end every cascade. */
export async function stampMenuContent(html: string, size: DropdownMenuSize): Promise<string> {
  const control = size === 'sm' ? 'sm' : 'md';
  const stamped = await stamp(html, {
    [MENU_SIZE_KEY]: (a) => { a['data-size'] = size; },
    [MENU_CONTROL_SIZE_KEY]: (a, _tag, node) => { a['data-size'] = control; setSizeDeep(node as unknown as ElementNode, control); },
    [MENU_FLYOUT_KEY]: (a) => { a['data-astryx-layer-root'] = ''; },
  });
  return seal(stamped);
}

/** DropdownMenuRadioGroup: check the radio whose value matches; carry the close policy. */
export function stampRadioGroup(html: string, value: string | undefined, hasCloseOnSelect: boolean): Promise<string> {
  return stamp(html, MENU_RADIO_GROUP_KEY, (a) => {
    a['aria-checked'] = String(value !== undefined && a['data-value'] === value);
    if (!hasCloseOnSelect) a['data-ax-close-on-select'] = 'false';
  });
}

const INTRINSIC = new Set(['auto', 'contain', 'fit-content', 'inherit', 'initial', 'max-content', 'min-content', 'revert', 'revert-layer', 'stretch', 'unset']);

/**
 * menuWidth.ts: intrinsic and CSS-wide keywords are the preferred inline size (they cannot go
 * inside `min()`); lengths are a minimum width clamped to the viewport cap (spec:AST-059 FR7).
 */
export function resolveMenuWidth(menuWidth: number | string | undefined | null): {mode: 'inline' | 'min'; value: string} | null {
  if (menuWidth == null || menuWidth === '' || menuWidth === 0) return null;
  if (typeof menuWidth === 'string') {
    const v = menuWidth.trim().toLowerCase();
    if (INTRINSIC.has(v) || v.startsWith('fit-content(')) return {mode: 'inline', value: menuWidth.trim()};
  }
  const length = typeof menuWidth === 'number' ? `${menuWidth}px` : menuWidth.trim();
  return {mode: 'min', value: `min(${length}, var(--_ax-max-inline-size))`};
}

// ── Data mode (DropdownMenuOption) ─────────────────────────────────────────────────────

export type MenuIcon = ExtendedIconName | AstroIconComponent;

/**
 * Trailing content of a data row: text, or `{keys}` for a keyboard shortcut rendered with
 * `<Kbd keys>` (the Astro stand-in for Astryx's ReactNode `endContent`).
 */
export type DropdownMenuEndContent = string | {keys: string};

/** One action or destination row (Astryx DropdownMenuItemData minus `onClick`). */
export interface DropdownMenuItemData {
  /** Stable identity, rendered as `data-id` (Astryx: the React key) so `astryx-select` listeners can tell rows apart. */
  id?: string;
  label: string;
  icon?: MenuIcon;
  description?: string;
  endContent?: DropdownMenuEndContent;
  isDisabled?: boolean;
  variant?: 'default' | 'destructive';
  /** @default true */
  hasCloseOnSelect?: boolean;
  href?: string;
  target?: '_blank' | '_self';
  rel?: string;
  /** Nested entries: the row becomes a sub-menu (a flyout). */
  items?: DropdownMenuOption[];
}

export interface DropdownMenuDividerData {
  type: 'divider';
}

export interface DropdownMenuSection {
  type: 'section';
  id?: string;
  title?: string;
  items: DropdownMenuItemData[];
}

export type DropdownMenuOption = DropdownMenuItemData | DropdownMenuDividerData | DropdownMenuSection;

/** Split rendered HTML into its markup and its `<script>` tags (ContextMenu's lazy template). */
export function splitScripts(html: string): {markup: string; scripts: string} {
  const scripts: string[] = [];
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (tag) => { scripts.push(tag); return ''; });
  return {markup, scripts: scripts.join('')};
}
