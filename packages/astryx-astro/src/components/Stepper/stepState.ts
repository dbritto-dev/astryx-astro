/**
 * Pure step state, shared by Step.astro (server) and behaviors/stepper.ts (client, when
 * `activeStep` changes). Port of the derivations in @astryxdesign/core Stepper/Step.tsx:
 * progress from `activeStep`, the indicator (number badge / check / current ring / status
 * glyph / custom) and its colour, the status text, and each connector's fill and timing.
 */
export type StepProgress = 'completed' | 'in-progress' | 'not-started';
export type StepStatus = 'accent' | 'success' | 'warning' | 'error';
export type StepIndicatorPreset = 'auto' | 'number' | 'none';
export type StepGlyph = 'number' | 'check' | 'current' | 'success' | 'warning' | 'error' | 'custom';

export function progressOf(step: number, activeStep: number): StepProgress {
  return step === activeStep ? 'in-progress' : step < activeStep ? 'completed' : 'not-started';
}

export interface IndicatorInput {
  step: number;
  activeStep: number;
  status?: StepStatus | null;
  indicator: StepIndicatorPreset;
  isCustom: boolean;
  isDisabled: boolean;
}

export interface IndicatorState {
  progress: StepProgress;
  /** null: no indicator (`indicator="none"`). */
  kind: 'number' | 'icon' | null;
  glyph: StepGlyph | null;
  /** Colour treatment (the Astryx number- or icon- colour style it picks). */
  tone: string;
}

const STATUS_GLYPHS = new Set(['success', 'warning', 'error']);

export function indicatorState({step, activeStep, status, indicator, isCustom, isDisabled}: IndicatorInput): IndicatorState {
  const progress = progressOf(step, activeStep);
  const isActive = progress === 'in-progress';
  if (indicator === 'none' && !isCustom) return {progress, kind: null, glyph: null, tone: progress};
  const statusGlyph = indicator === 'auto' && !isCustom && !isActive && status != null && STATUS_GLYPHS.has(status)
    ? (status as 'success' | 'warning' | 'error')
    : null;
  const showNumber = !isCustom && statusGlyph == null && (indicator === 'number' || (indicator === 'auto' && progress === 'not-started'));
  if (showNumber) {
    const isReached = progress !== 'not-started';
    const tone = isDisabled ? 'disabled' : isReached && status != null ? status : progress;
    return {progress, kind: 'number', glyph: 'number', tone};
  }
  const glyph: StepGlyph = isCustom ? 'custom' : statusGlyph ?? (progress === 'completed' ? 'check' : 'current');
  const tone = isDisabled ? 'disabled' : isCustom ? (status ?? progress) : statusGlyph ?? progress;
  return {progress, kind: 'icon', glyph, tone};
}

/** Which status word reaches assistive technology ('completed' | 'warning' | 'error'), if any. */
export function statusWord(status: StepStatus | null | undefined, progress: StepProgress): 'completed' | 'warning' | 'error' | null {
  if (status === 'error') return 'error';
  if (status === 'warning') return 'warning';
  if (status === 'success' || progress === 'completed') return 'completed';
  return null;
}

/** Whether a connector is filled: `le` fills once the flow reaches the step, `lt` once it passes it. */
export function isFilled(rule: 'le' | 'lt', step: number, activeStep: number): boolean {
  return rule === 'le' ? step <= activeStep : step < activeStep;
}

/**
 * Transition timing for a segment covering [offset, offset + share) of span `span`: only a
 * single forward step animates, and only the span leaving the step it came from.
 */
export function fillTiming(span: number, offset: number, share: number, previous: number, next: number): {duration: string; delay: string} {
  if (next !== previous + 1 || span !== previous) return {duration: '0s', delay: '0s'};
  const slice = (factor: number) =>
    factor <= 0 ? '0s' : factor === 1 ? 'var(--duration-medium)' : `calc(var(--duration-medium) * ${Number(factor.toFixed(4))})`;
  return {duration: slice(share), delay: slice(offset)};
}

/** The local progress glyphs (not registry icons: progress, not outcome). */
export const CHECK_CIRCLE_SVG =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="currentColor"/><path d="M4.75 8.25 7 10.5l4.25-4.5" stroke="var(--color-background-surface)" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const CURRENT_SVG =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="8" r="4" fill="currentColor"/></svg>';

/** Shares of an on-track node-to-node span (Step.tsx OT_* constants). */
export const OT_ARRIVAL_SHARE_H = 0.5;
export const OT_ARRIVAL_SHARE_V = 0.3;
export const OT_RAIL_SHARE_OF_LEAVING = 0.25;
