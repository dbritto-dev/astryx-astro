/**
 * Server-side constants shared by NavHeadingMenu, NavHeadingMenuItem and the nav headings.
 * Port of @astryxdesign/core NavMenu/NavMenuContext.tsx: NavHeadingMenuContext's `size`
 * becomes the cascade key below; the close callbacks become attributes on the heading's popover
 * (elements/nav-menu.ts).
 */
export type NavHeadingMenuSize = 'sm' | 'md' | 'lg';

/** NavHeadingMenu stamps its size onto the items that leave it to the menu. */
export const NAV_HEADING_MENU_SIZE_KEY = 'nav-heading-menu-size';

/** The rows a key or typeahead can reach (NavHeadingMenu ENABLED_ITEM_SELECTOR). */
export const NAV_HEADING_MENU_ITEMS = '[role="menuitem"]:not([aria-disabled="true"])';
