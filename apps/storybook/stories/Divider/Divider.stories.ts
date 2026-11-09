import Divider from 'astryx-astro/components/Divider/Divider.astro';
import Demo from 'astryx-astro/components/Divider/Divider.demo.astro';
import demoSource from 'astryx-astro/components/Divider/Divider.demo.astro?raw';
import {expect} from 'storybook/test';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import DividerFullBleed from './DividerFullBleed.astro';
import fullBleedSource from './DividerFullBleed.astro?raw';
import DividerVertical from './DividerVertical.astro';
import verticalSource from './DividerVertical.astro?raw';

const meta = {
  title: 'Layout/Divider',
  component: Divider,
  ...astryx('Divider'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Divider.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/** Horizontal, subtle (`--color-border`): a separator with no name. */
export const Default: Story = {
  play: async ({canvas}) => {
    const separator = canvas.getByRole('separator');
    await expect(separator).toHaveAttribute('aria-orientation', 'horizontal');
    await expect(separator).toHaveAccessibleName('');
  },
};

/** `variant="strong"` (`--color-border-emphasized`). */
export const Strong: Story = {args: {variant: 'strong'}};

/** A centred label names the separator (through aria-labelledby: a separator takes no name from content). */
export const WithLabel: Story = {
  args: {label: 'or'},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('separator', {name: 'or'})).toBeVisible();
  },
};

export const StrongWithLabel: Story = {args: {label: 'Continue with', variant: 'strong'}};

/** Numeric zero is a label (empty strings and booleans are not). */
export const ZeroLabel: Story = {
  args: {label: 0},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('separator', {name: '0'})).toBeVisible();
  },
};

/** The `label` slot: rich label content, still the separator's name. */
export const LabelSlot: Story = {
  args: {slots: {label: '<strong>Today</strong>'}},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('separator', {name: 'Today'})).toBeVisible();
  },
};

/** An explicit `aria-label` wins over the visible label. */
export const AriaLabelOverride: Story = {
  args: {label: 'or', 'aria-label': 'Sign-in options'},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('separator', {name: 'Sign-in options'})).toBeVisible();
  },
};

const verticalOptions = {controls: ['variant', 'label'], source: verticalSource};

/** `orientation="vertical"` between toolbar actions; the last one is labelled. */
export const Vertical = composed(DividerVertical, {
  args: {label: 'or'},
  play: async ({canvas}) => {
    const separators = canvas.getAllByRole('separator');
    await expect(separators).toHaveLength(3);
    for (const separator of separators) await expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    await expect(canvas.getByRole('separator', {name: 'or'})).toBeVisible();
    // A vertical divider fills the row's height.
    await expect(separators[0].getBoundingClientRect().height).toBe(40);
  },
}, verticalOptions);

export const VerticalStrong = composed(DividerVertical, {args: {variant: 'strong'}}, verticalOptions);

const fullBleedOptions = {controls: ['variant', 'padding', 'orientation'], source: fullBleedSource};

/** `isFullBleed` escapes the Card's padding to touch both edges; the default divider stays inside it. */
export const FullBleed = composed(DividerFullBleed, {
  play: async ({canvas, canvasElement}) => {
    const card = canvasElement.querySelector('.astryx-card')!.getBoundingClientRect();
    const bleed = canvas.getByTestId('bleed').getBoundingClientRect();
    const contained = canvas.getByTestId('contained').getBoundingClientRect();
    // Edge to edge (give or take the card's border); the default divider stays inside the padding.
    await expect(card.width - bleed.width).toBeLessThanOrEqual(2);
    await expect(contained.width).toBeLessThan(bleed.width - 16);
  },
}, fullBleedOptions);

/** A vertical `isFullBleed` divider reaches the Card's top and bottom edges. */
export const FullBleedVertical = composed(DividerFullBleed, {
  args: {orientation: 'vertical'},
  play: async ({canvas, canvasElement}) => {
    const card = canvasElement.querySelector('.astryx-card')!.getBoundingClientRect();
    const separator = canvas.getByRole('separator', {name: 'Section break'}).getBoundingClientRect();
    // Top to bottom edge (give or take the card's border), past the 64px row it sits in.
    await expect(card.height - separator.height).toBeLessThanOrEqual(2);
    await expect(separator.height).toBeGreaterThan(64);
  },
}, fullBleedOptions);
