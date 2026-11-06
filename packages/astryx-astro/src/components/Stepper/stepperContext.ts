/**
 * Stepper → Step render context (Astryx StepperContext / StepperInternalContext).
 *
 * A Step's whole markup depends on its Stepper (orientation, indicator position, activeStep,
 * density), which attribute stamping (lib/cascade.ts) cannot express. The Stepper renders its
 * slot with the subtree-scoped `Astro.locals.astryxStepper` (lib/subtreeLocals.ts
 * `renderWithLocals`); Steps read it with `readStepperContext(Astro)` while they render.
 * Sibling Steppers rendered in parallel never see each other's context, and nested Steppers
 * shadow their parent. Layer-scoped, as in Astryx (createLayerScopedContext): overlays inside
 * a Stepper render their content without it. Server-only (imported from frontmatter).
 */
import {layerScopedLocal} from '../../lib/subtreeLocals';

export interface StepperRenderContext {
  activeStep: number;
  orientation: 'horizontal' | 'vertical';
  indicatorPosition: 'separated' | 'on-track';
  density: 'compact' | 'balanced' | 'spacious';
  /** Astryx `onStepClick != null`: steps render buttons. */
  isNonLinear: boolean;
  locale?: string;
}

export const STEPPER_LOCAL = layerScopedLocal('astryxStepper');

export function readStepperContext(astro: {locals?: object}): StepperRenderContext | null {
  const value = (astro.locals as Record<string, unknown> | undefined)?.[STEPPER_LOCAL];
  return (value as StepperRenderContext | undefined) ?? null;
}
