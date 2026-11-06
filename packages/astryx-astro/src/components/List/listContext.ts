/**
 * ListContext + ListMarkerScope (Astryx List/ListContext.tsx) as a subtree-scoped
 * `Astro.locals` key (lib/subtreeLocals.ts): List renders its items with `renderWithLocals()`,
 * so every ListItem inside reads the list's density, dividers, edge treatment and marker, and
 * nothing outside does. A nested List sets its own value for its own items.
 *
 * Layer-scoped, as in Astryx (createLayerScopedContext): the key is registered with
 * `layerScopedLocal()`, so a Popover, Dialog or other overlay inside a list item renders its
 * content without it (`renderLayerContent()`).
 */
import {layerScopedLocal} from '../../lib/subtreeLocals';

export type ListDensity = 'compact' | 'balanced' | 'spacious';
/** The public marker styles (`listStyle`). `decimal` renders an `<ol>`. */
export type ListStyle = 'none' | 'disc' | 'decimal' | 'circle';
/** Where each row's text, dividers and hover/selection backgrounds sit (contract #14). */
export type ListEdge = 'padded' | 'flush' | 'outset' | 'bleed';
/**
 * Every marker ListItem draws: the public styles plus the square, letter and roman markers
 * Markdown's nested lists use (internal, through `_ListMarkerScope.astro`).
 */
export type ListMarker = 'disc' | 'circle' | 'square' | 'decimal' | 'lower-alpha' | 'lower-roman';

/** A task item's state, drawn as a read-only checkbox in the marker's place. */
export interface ListTaskMarker {
  readonly isChecked: boolean;
  /** The checkbox's accessible name: the item's text. */
  readonly label: string;
}

export interface ListContextValue {
  density: ListDensity;
  hasDividers: boolean;
  edge: ListEdge;
  listStyle: ListStyle;
  /** Internal (ListMarkerScope): the marker items draw instead of `listStyle`'s. Ignored for `none`. */
  marker?: ListMarker;
  /** Internal (ListMarkerScope): draw a read-only checkbox instead of the marker. */
  task?: ListTaskMarker;
  /** Internal (ListMarkerScope): Markdown's outside-marker gutter for counters. */
  hasMarkerGutter?: boolean;
}

export const LIST_LOCAL = layerScopedLocal('astryxList');

export function readListContext(astro: {locals?: object}): ListContextValue | null {
  const value = (astro.locals as Record<string, unknown> | undefined)?.[LIST_LOCAL];
  return (value as ListContextValue | undefined) ?? null;
}
