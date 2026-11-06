/**
 * Indicator registry — port of @astryxdesign/core Indicator/indicatorRegistry.ts,
 * useIndicator.ts and types.ts.
 *
 * Indicators are the decorative, stateful control visuals (the checkbox box, the radio
 * circle, the mark on a chosen option). The owning control keeps the input, role, name,
 * focus and keyboard; the indicator turns `state` into a picture (always aria-hidden).
 *
 * A theme replaces one by NAME (Astryx `defineTheme({indicators})`), and every component
 * that renders that name follows. Server-side the active theme is resolved like icons:
 * explicit `theme` → `Astro.locals.astryxTheme` → none (built-in defaults).
 *
 *   // middleware or layout frontmatter
 *   import {registerIndicatorTheme} from 'astryx-astro/components/Indicator/indicatorRegistry';
 *   import RadioIndicator from 'astryx-astro/components/Indicator/RadioIndicator.astro';
 *   registerIndicatorTheme('brand', {check: RadioIndicator});
 *
 * Owners render through <Indicator name="checkbox" …> (Indicator.astro), which resolves the
 * component here. A replacement is any Astro component accepting {@link IndicatorProps}
 * (state, size, isDisabled, the default slot as replacement content); it must render a
 * single aria-hidden root element whose border-radius the owner's focus ring follows.
 */
import CheckboxIndicator from './CheckboxIndicator.astro';
import CheckIndicator from './CheckIndicator.astro';
import RadioIndicator from './RadioIndicator.astro';

/** The indicator families, each mapped to the states it can express. */
export interface IndicatorFamilyMap {
  /** Is this one thing chosen? Radios, and the mark on a selected option. */
  singleSelection: 'unchecked' | 'checked';
  /** Which of these are chosen? Checkboxes, including the partial state. */
  multiSelection: 'unchecked' | 'checked' | 'indeterminate';
}
export type IndicatorFamily = keyof IndicatorFamilyMap & string;
export type IndicatorState<F extends IndicatorFamily = IndicatorFamily> = IndicatorFamilyMap[F];

/** Matches the control sizes of the owning inputs. */
export type IndicatorSize = 'sm' | 'md';

/** Which edge of its row an indicator sits on (owned by the host component). */
export type IndicatorPosition = 'start' | 'end';

/**
 * The named indicators a theme can replace, each mapped to its family. Augment to add
 * names; core ships no default for a name it does not know.
 */
export interface IndicatorMap {
  /** The mark on a chosen option — a checkmark by default. */
  check: 'singleSelection';
  /** The filled circle of a radio control. */
  radio: 'singleSelection';
  /** The box of a checkbox control, including its partial state. */
  checkbox: 'multiSelection';
}
export type IndicatorName = keyof IndicatorMap & string;
export type IndicatorNameOfFamily<F extends IndicatorFamily> = {
  [N in IndicatorName]: IndicatorMap[N] extends F ? N : never;
}[IndicatorName];

/** The names Astryx ships a default for. */
export type CoreIndicatorName = 'check' | 'checkbox' | 'radio';

/**
 * Props every indicator accepts. Decorative: no role, aria-label or tabindex — the
 * component emits aria-hidden="true" after the caller's attributes. Replacement content
 * (a pending Spinner, say) is the default slot, drawn INSTEAD of the state mark.
 */
export interface IndicatorProps<F extends IndicatorFamily = IndicatorFamily> {
  /** Which state to draw. The state space is fixed by the family. */
  state: IndicatorState<F>;
  /** @default 'md' */
  size?: IndicatorSize;
  /** Purely visual; the owner keeps the real disabled semantics. @default false */
  isDisabled?: boolean;
  class?: string;
  style?: string | Record<string, string | number | null | undefined>;
  [attr: `data-${string}`]: unknown;
}

/** An Astro component (what `.astro` files export). */
export type IndicatorComponent = ((...args: any[]) => unknown) & {isAstroComponentFactory?: boolean};

/** Theme overrides, keyed by indicator name. */
export type IndicatorRegistry = {[N in IndicatorName]?: IndicatorComponent};

/** The indicators Astryx ships. A theme's entries override these by name. */
export const defaultIndicators: Readonly<Record<CoreIndicatorName, IndicatorComponent>> = {
  check: CheckIndicator,
  checkbox: CheckboxIndicator,
  radio: RadioIndicator,
};

const themes = new Map<string, IndicatorRegistry>();

/**
 * Register (or replace) a theme's indicators — the `indicators` of an Astryx
 * `defineTheme()`. `registerIndicatorTheme('brand', {check: RadioIndicator})` turns every
 * single-selection mark rendered under the `brand` theme into a radio.
 */
export function registerIndicatorTheme(theme: string, indicators: IndicatorRegistry): void {
  themes.set(theme, {...indicators});
}

/** Forget every registered theme override. For tests. */
export function resetIndicators(): void {
  themes.clear();
}

/** Where resolution reads the active theme: an Astro global, a theme name, or none. */
export type IndicatorRegistrySource = {locals?: Record<string, unknown> | object} | string | null | undefined;

function themeName(source: IndicatorRegistrySource, explicit?: string | null): string | null {
  if (explicit !== undefined) return explicit;
  if (source == null) return null;
  if (typeof source === 'string') return source;
  const name = (source.locals as Record<string, unknown> | undefined)?.astryxTheme;
  return typeof name === 'string' && name !== '' ? name : null;
}

/**
 * Resolve an indicator by name: the active theme's override, else the built-in default.
 * An augmented name with no theme entry resolves to undefined; its package owns the
 * fallback (`getIndicator('brand-star', Astro) ?? BrandStar`).
 */
export function getIndicator(name: CoreIndicatorName, source?: IndicatorRegistrySource, explicitTheme?: string | null): IndicatorComponent;
export function getIndicator(name: IndicatorName, source?: IndicatorRegistrySource, explicitTheme?: string | null): IndicatorComponent | undefined;
export function getIndicator(name: IndicatorName, source?: IndicatorRegistrySource, explicitTheme?: string | null): IndicatorComponent | undefined {
  const theme = themeName(source, explicitTheme);
  const override = theme == null ? undefined : themes.get(theme)?.[name];
  return override ?? (defaultIndicators as Partial<Record<string, IndicatorComponent>>)[name];
}
