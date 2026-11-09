import Card from 'astryx-astro/components/Card/Card.astro';
import Demo from 'astryx-astro/components/Card/Card.demo.astro';
import demoSource from 'astryx-astro/components/Card/Card.demo.astro?raw';
import {expect} from 'storybook/test';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import CardMatrix from './CardMatrix.astro';
import matrixSource from './CardMatrix.astro?raw';
import CardWithLayout from './CardWithLayout.astro';
import layoutSource from './CardWithLayout.astro?raw';

const title = '<p style="margin:0;font-weight:var(--font-weight-semibold);color:var(--color-text-primary)">Weekly digest</p>';
const body = (text: string) => `<p style="margin:var(--spacing-1) 0 0;font-size:var(--font-size-sm);color:var(--color-text-secondary)">${text}</p>`;

const meta = {
  title: 'Container/Card',
  component: Card,
  ...astryx('Card'),
  args: {maxWidth: 320, slots: {default: title + body('A summary of the projects you follow, every Monday.')}},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Card.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/** `variant="default"`: the only variant with a visible border; the theme's card padding. */
export const Default: Story = {};

export const Muted: Story = {args: {variant: 'muted'}};

/** `transparent`: no background and no border (the padding still applies). */
export const Transparent: Story = {args: {variant: 'transparent'}};

/** A tinted variant (one of the nine colours). */
export const Blue: Story = {args: {variant: 'blue'}};

/** `elevation="med"`: a resting shadow. */
export const Elevated: Story = {args: {elevation: 'med'}};

/** An explicit `padding` step replaces the theme's card padding. */
export const Padding: Story = {
  args: {padding: 8},
  play: async ({canvasElement}) => {
    // Spacing step 8 (32px; the theme may take its border out of it).
    await expect(parseFloat(getComputedStyle(canvasElement.querySelector('.astryx-card')!).paddingTop)).toBeGreaterThanOrEqual(30);
  },
};

/** A fixed `height` makes the content scroll inside the card. */
export const FixedHeight: Story = {
  args: {height: 140, slots: {default: title + Array.from({length: 8}, (_, i) => body(`Line ${i + 1} of a long card body.`)).join('')}},
  play: async ({canvasElement}) => {
    const card = canvasElement.querySelector<HTMLElement>('.astryx-card')!;
    await expect(card.getBoundingClientRect().height).toBe(140);
    await expect(card.scrollHeight).toBeGreaterThan(card.clientHeight);
  },
};

/** `width`, `maxWidth` and `minHeight`. */
export const Sized: Story = {args: {width: 240, minHeight: 160, maxWidth: undefined}};

/** Every `variant`: default, transparent, muted and the nine tints. */
export const VariantMatrix = composed(CardMatrix, {args: {matrix: 'variant'}}, {controls: ['matrix'], source: matrixSource});

/** Every `elevation`: none, low, med, high. */
export const ElevationMatrix = composed(CardMatrix, {args: {matrix: 'elevation'}}, {controls: ['matrix'], source: matrixSource});

/** Padding 0, 2, the theme's, 6 and 10. */
export const PaddingMatrix = composed(CardMatrix, {args: {matrix: 'padding'}}, {controls: ['matrix'], source: matrixSource});

/**
 * Composed with a Layout (header, scrolling content, footer) and with a full-bleed Divider: both
 * line up with the padding the Card publishes.
 */
export const WithLayoutAndBleed = composed(CardWithLayout, {
  play: async ({canvas}) => {
    const card = canvas.getByTestId('bleed-card').getBoundingClientRect();
    const divider = canvas.getByTestId('bleed').getBoundingClientRect();
    await expect(card.width - divider.width).toBeLessThanOrEqual(2);
  },
}, {controls: ['padding'], source: layoutSource});
