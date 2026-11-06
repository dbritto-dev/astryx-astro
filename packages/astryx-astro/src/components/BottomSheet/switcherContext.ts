/**
 * BottomSheetSwitcherContext (Astryx BottomSheet/BottomSheetSwitcherContext.ts) as a
 * subtree-scoped `Astro.locals` key (lib/subtreeLocals.ts): `astryxBottomSheetSwitcher`.
 * The switcher renders its slot with it; each BottomSheet reads it (sheetId → open state,
 * modality, the switcher's dialog class/style) and resets it to null around its own content,
 * so a sheet nested in a step is standalone unless it opens a switcher of its own.
 */
export interface SwitcherContext {
  activeSheet: string | null;
  hasScrim: boolean;
  /** The switcher's `class` / `style`: applied to every step's `<dialog>`. */
  dialogClass?: string;
  dialogStyle?: string;
}
