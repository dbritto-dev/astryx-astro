import type {SpacingStep} from './types';
import {spacing} from './style';

export interface PaddingProps {
  padding?: SpacingStep;
  paddingInline?: SpacingStep;
  paddingInlineStart?: SpacingStep;
  paddingInlineEnd?: SpacingStep;
  paddingBlock?: SpacingStep;
  paddingBlockStart?: SpacingStep;
  paddingBlockEnd?: SpacingStep;
}

/**
 * Astryx per-edge padding resolution (edge prop → axis prop → `padding`) as private,
 * non-inheriting custom properties (registered in styles/shared.css). Component CSS reads
 * them, e.g. `padding-inline-start: var(--_ax-pis, 0)`, so consumer CSS can still override.
 */
export function paddingVars(p: PaddingProps): Record<string, string | undefined> {
  return {
    '--_ax-pis': spacing(p.paddingInlineStart ?? p.paddingInline ?? p.padding),
    '--_ax-pie': spacing(p.paddingInlineEnd ?? p.paddingInline ?? p.padding),
    '--_ax-pbs': spacing(p.paddingBlockStart ?? p.paddingBlock ?? p.padding),
    '--_ax-pbe': spacing(p.paddingBlockEnd ?? p.paddingBlock ?? p.padding),
  };
}

/** Pulls padding props out of a props object so the rest can be spread as attributes. */
export function splitPadding<T extends PaddingProps>(props: T): [PaddingProps, Omit<T, keyof PaddingProps>] {
  const {padding, paddingInline, paddingInlineStart, paddingInlineEnd, paddingBlock, paddingBlockStart, paddingBlockEnd, ...rest} = props;
  return [{padding, paddingInline, paddingInlineStart, paddingInlineEnd, paddingBlock, paddingBlockStart, paddingBlockEnd}, rest];
}
