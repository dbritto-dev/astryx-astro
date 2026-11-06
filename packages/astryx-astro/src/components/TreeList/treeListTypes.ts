/**
 * Port of @astryxdesign/core TreeList/TreeListTypes.ts. ReactNode fields become strings (or
 * per-item named slots on TreeList), `onClick` becomes `interactiveRole: 'button'` (listen for
 * `astryx-select`), `xstyle` / `className` become `class`.
 */
import type {AstroIconComponent, ExtendedIconName} from '../Icon/iconRegistry';
import type {StyleValue} from '../../lib/style';

export type TreeListDensity = 'compact' | 'balanced' | 'spacious';

/** Guide treatment; themes may add more (Astryx TreeListVariantMap). */
export type TreeListVariant = 'lineGuides' | 'noGuides' | (string & {});

export interface TreeListItemData {
  /** Unique id: the expansion key, `data-tree-id`, and the per-item slot suffix. */
  id: string;
  /** Primary label (or the `label:<id>` slot on TreeList). */
  label?: string;
  /** Secondary text below the label (describes the row). */
  description?: string;
  /** Leading content: an icon name / SVG string / Astro component (or the `start:<id>` slot). */
  startContent?: ExtendedIconName | AstroIconComponent;
  /** Trailing text (or the `end:<id>` slot, e.g. a Badge). */
  endContent?: string;
  /** Nested items; a non-empty array makes the row a parent with an expand toggle. */
  children?: TreeListItemData[];
  /** Astro stand-in for Astryx `onClick`: an invisible button row; listen for `astryx-select`. */
  interactiveRole?: 'button';
  /** Link destination (safeHref-checked): an invisible link; the whole row follows it. */
  href?: string;
  /** Link target (only with href). */
  target?: string;
  isDisabled?: boolean;
  isSelected?: boolean;
  /** Initially expanded (parents only). */
  isExpanded?: boolean;
  /** Class on the item's row element. */
  class?: string;
  /** Inline style on the item's row element. */
  style?: StyleValue;
}
