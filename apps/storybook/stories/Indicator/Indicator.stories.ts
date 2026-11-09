import Indicator from 'astryx-astro/components/Indicator/Indicator.astro';
import Demo from 'astryx-astro/components/Indicator/Indicator.demo.astro';
import demoSource from 'astryx-astro/components/Indicator/Indicator.demo.astro?raw';
import Spinner from 'astryx-astro/components/Spinner/Spinner.astro';
import {expect} from 'storybook/test';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import IndicatorMatrix from './IndicatorMatrix.astro';
import matrixSource from './IndicatorMatrix.astro?raw';
import IndicatorThemeReplacement from './IndicatorThemeReplacement.astro';
import replacementSource from './IndicatorThemeReplacement.astro?raw';

const meta = {
  title: 'Form Controls/Indicator',
  component: Indicator,
  ...astryx('Indicator'),
  args: {name: 'checkbox', state: 'checked'},
  parameters: {layout: 'centered'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Indicator.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/** Every built-in indicator × state × size, enabled and disabled. */
export const Matrix = composed(IndicatorMatrix, {parameters: {layout: 'padded'}}, {source: matrixSource});

/** Decorative: hidden from assistive technology (the owning control carries role, name and state). */
export const CheckboxChecked: Story = {
  play: async ({canvasElement}) => {
    await expect(canvasElement.querySelector('.astryx-checkbox-indicator')).toHaveAttribute('aria-hidden', 'true');
  },
};

export const CheckboxUnchecked: Story = {args: {state: 'unchecked'}};

export const CheckboxIndeterminate: Story = {args: {state: 'indeterminate'}};

export const Radio: Story = {args: {name: 'radio'}};

export const RadioUnchecked: Story = {args: {name: 'radio', state: 'unchecked'}};

/** The single-selection mark (draws nothing while unchecked). */
export const Check: Story = {args: {name: 'check'}};

export const Small: Story = {args: {size: 'sm'}};

/** Purely visual; the owner keeps the disabled semantics. */
export const Disabled: Story = {args: {isDisabled: true}};

/** Busy content in the default slot (a Spinner) replaces the mark. */
export const Busy: Story = {
  args: {slots: {default: {component: Spinner, props: {size: 'sm', shade: 'inherit', 'aria-hidden': 'true'}}}},
};

/** A theme's replacement indicator through the registry (`registerIndicatorTheme` + `theme`). */
export const ThemeReplacement = composed(IndicatorThemeReplacement, {}, {source: replacementSource});
