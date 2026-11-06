/**
 * Stepper → Step render context (Astryx StepperContext / StepperInternalContext).
 *
 * A Step's whole markup depends on its Stepper (orientation, indicator position, activeStep,
 * density), which attribute stamping (lib/cascade.ts) cannot express. The Stepper renders its
 * slot inside `stepperContext.run(ctx, …)`; Steps read `stepperContext.getStore()` while they
 * render. AsyncLocalStorage follows the async render chain, so sibling Steppers rendered in
 * parallel never see each other's context, and nested Steppers shadow their parent.
 * Server-only (imported from frontmatter).
 */
import {AsyncLocalStorage} from 'node:async_hooks';

export interface StepperRenderContext {
  activeStep: number;
  orientation: 'horizontal' | 'vertical';
  indicatorPosition: 'separated' | 'on-track';
  density: 'compact' | 'balanced' | 'spacious';
  /** Astryx `onStepClick != null`: steps render buttons. */
  isNonLinear: boolean;
  locale?: string;
}

export const stepperContext = new AsyncLocalStorage<StepperRenderContext>();
