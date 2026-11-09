import Section from 'astryx-astro/components/Section/Section.astro';
import Demo from 'astryx-astro/components/Section/Section.demo.astro';
import demoSource from 'astryx-astro/components/Section/Section.demo.astro?raw';
import {expect} from 'storybook/test';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import SectionInCard from './SectionInCard.astro';
import inCardSource from './SectionInCard.astro?raw';
import SectionNested from './SectionNested.astro';
import nestedSource from './SectionNested.astro?raw';

const content =
  '<p style="margin:0;font-weight:var(--font-weight-semibold);color:var(--color-text-primary)">Billing</p>' +
  '<p style="margin:var(--spacing-1) 0 0;font-size:var(--font-size-sm);color:var(--color-text-secondary)">Invoices are sent on the first day of each month.</p>';

const meta = {
  title: 'Layout/Section',
  component: Section,
  ...astryx('Section'),
  args: {slots: {default: content}},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Section.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/** Inner padding of the painted element, in px. */
const paddingOf = (el: Element) => parseFloat(getComputedStyle(el).paddingInlineStart);

/** `variant="section"` (default): the surface background, with the theme's section padding. */
export const Default: Story = {
  play: async ({canvasElement}) => {
    await expect(paddingOf(canvasElement.querySelector('.astryx-section')!)).toBeGreaterThan(0);
  },
};

export const Muted: Story = {args: {variant: 'muted'}};

export const Transparent: Story = {args: {variant: 'transparent', dividers: ['top', 'bottom']}};

/** `dividers` draws a border on the named sides (`start` / `end` follow the writing direction). */
export const AllDividers: Story = {args: {variant: 'transparent', dividers: ['top', 'bottom', 'start', 'end']}};

/** An explicit `padding` step replaces the theme's section padding. */
export const Padding: Story = {
  args: {variant: 'muted', padding: 8},
  play: async ({canvasElement}) => {
    await expect(paddingOf(canvasElement.querySelector('.astryx-section')!)).toBe(32);
  },
};

/** Per-edge padding: `paddingInline`, `paddingBlockStart`, `paddingBlockEnd`. */
export const PaddingPerEdge: Story = {args: {variant: 'muted', paddingInline: 6, paddingBlockStart: 1, paddingBlockEnd: 3}};

/** Sized: a fixed `height` with a `maxWidth`, and a start divider. */
export const Sized: Story = {args: {variant: 'muted', height: 140, maxWidth: 320, dividers: ['start']}};

const inCardOptions = {controls: ['variant', 'dividers', 'padding', 'cardPadding'], source: inCardSource};

/** Inside a Card: the first and last Sections escape the card's padding to its edges. */
export const InCard = composed(SectionInCard, {
  args: {dividers: ['bottom']},
  play: async ({canvas, canvasElement}) => {
    const card = canvasElement.querySelector('.astryx-card')!.getBoundingClientRect();
    const first = canvas.getByTestId('first').getBoundingClientRect();
    const last = canvas.getByTestId('last').getBoundingClientRect();
    // Edge to edge, give or take the card's border.
    await expect(card.width - first.width).toBeLessThanOrEqual(2);
    await expect(first.top - card.top).toBeLessThanOrEqual(1);
    await expect(card.bottom - last.bottom).toBeLessThanOrEqual(1);
  },
}, inCardOptions);

/** The bleed works whatever padding the Card has (here `padding={8}`). */
export const InCardWithCardPadding = composed(SectionInCard, {args: {variant: 'muted', dividers: ['top', 'bottom'], cardPadding: 8}}, inCardOptions);

/** A Section's explicit `padding` propagates to a nested Section that sets none. */
export const NestedPadding = composed(SectionNested, {
  args: {padding: 6},
  play: async ({canvas}) => {
    const inner = canvas.getByTestId('inner').querySelector('.astryx-section')!;
    await expect(paddingOf(inner)).toBe(24);
  },
}, {controls: ['padding'], source: nestedSource});
