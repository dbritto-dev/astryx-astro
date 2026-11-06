/** Shared prop types, mirroring @astryxdesign/core (utils/types.ts, Layer/useLayer.tsx). */

export type ComponentSize = 'sm' | 'md' | 'lg';
export type SizeValue = number | string;
export type Elevation = 'none' | 'low' | 'med' | 'high';
export type SpacingStep = 0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10;

/** Layer placement relative to its anchor. */
export type LayerPlacement = 'above' | 'below' | 'start' | 'end';
/** Alignment along the placement axis. */
export type LayerAlignment = 'start' | 'center' | 'end';
export type TooltipPlacement = LayerPlacement;

export type StatusType = 'error' | 'warning' | 'success';
