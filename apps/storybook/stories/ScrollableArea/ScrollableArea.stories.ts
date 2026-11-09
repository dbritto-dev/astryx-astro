import ScrollableArea from 'astryx-astro/components/ScrollableArea/ScrollableArea.astro';
import Demo from 'astryx-astro/components/ScrollableArea/ScrollableArea.demo.astro';
import demoSource from 'astryx-astro/components/ScrollableArea/ScrollableArea.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import ScrollableAreaInCard from './ScrollableAreaInCard.astro';
import inCardSource from './ScrollableAreaInCard.astro?raw';

const frame = 'border:1px solid var(--color-border);border-radius:var(--radius-element)';
const row = 'margin:0;padding:var(--spacing-1-5) 0;border-bottom:1px solid var(--color-border);font-size:var(--font-size-sm)';
const rows = (n: number, text: (i: number) => string) => Array.from({length: n}, (_, i) => `<p style="${row}">${text(i + 1)}</p>`).join('');
const chip = 'flex:none;padding:var(--spacing-2) var(--spacing-3);border-radius:var(--radius-inner);background:var(--color-accent-muted);color:var(--color-text-accent);font-size:var(--font-size-sm)';
const chips = `<div style="display:flex;gap:var(--spacing-2)">${Array.from({length: 16}, (_, i) => `<span style="${chip}">Tag ${i + 1}</span>`).join('')}</div>`;
const cell = 'padding:var(--spacing-1) var(--spacing-3);border:1px solid var(--color-border);white-space:nowrap';
const sheet = `<table style="border-collapse:collapse;font-size:var(--font-size-sm)">${Array.from(
  {length: 12},
  (_, r) => `<tr>${Array.from({length: 12}, (_, c) => `<td style="${cell}">R${r + 1} C${c + 1}</td>`).join('')}</tr>`,
).join('')}</table>`;

const meta = {
  title: 'Layout/Scrollable Area',
  component: ScrollableArea,
  ...astryx('ScrollableArea'),
  args: {
    label: 'Activity history',
    height: 180,
    padding: 3,
    style: frame,
    slots: {default: rows(14, (i) => `Event ${i}: deployment finished`)},
  },
} satisfies Meta;
export default meta;

/** Every example from the docs page (ScrollableArea.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const area = (root: HTMLElement) => upgraded<HTMLElement>(root, 'ax-scrollable-area');
/** Wait a couple of frames so the element's scroll and resize observers have reported. */
const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

/**
 * `axis="block"` (default), overflowing: a named group in the tab order. Scrolling updates the
 * edge flags (`data-scroll-block-start|end`) that descendants can style against.
 */
export const Default: Story = {
  play: async ({canvas, canvasElement, step}) => {
    const viewport = await area(canvasElement);
    await step('An overflowing viewport is a named tab stop', async () => {
      await waitFor(() => expect(viewport).toHaveAttribute('tabindex', '0'));
      await expect(canvas.getByRole('group', {name: 'Activity history'})).toBe(viewport);
      await expect(viewport).toHaveAttribute('data-scrollable-block', 'true');
      await userEvent.tab();
      await expect(viewport).toHaveFocus();
    });
    await step('At rest it reports the start edge only', async () => {
      await expect(viewport).toHaveAttribute('data-scroll-block-start', 'true');
      await expect(viewport).not.toHaveAttribute('data-scroll-block-end');
      // The inline axis does not scroll: it reports both edges.
      await expect(viewport).toHaveAttribute('data-scroll-inline-start', 'true');
      await expect(viewport).toHaveAttribute('data-scroll-inline-end', 'true');
    });
    await step('Scrolled to the end it reports the end edge', async () => {
      viewport.scrollTop = viewport.scrollHeight;
      await waitFor(() => expect(viewport).toHaveAttribute('data-scroll-block-end', 'true'));
      await expect(viewport).not.toHaveAttribute('data-scroll-block-start');
    });
    await step('Mid-scroll it reports neither edge', async () => {
      viewport.scrollTop = 40;
      await waitFor(() => expect(viewport).not.toHaveAttribute('data-scroll-block-end'));
      await expect(viewport).not.toHaveAttribute('data-scroll-block-start');
    });
  },
};

/** Content that fits: no tab stop, nothing scrolls, both block edges reported. */
export const ContentFits: Story = {
  args: {label: 'Short list', slots: {default: rows(3, (i) => `Item ${i}`)}},
  play: async ({canvasElement}) => {
    const viewport = await area(canvasElement);
    await frames();
    await expect(viewport).not.toHaveAttribute('tabindex');
    await expect(viewport).not.toHaveAttribute('data-scrollable-block');
    await expect(viewport).toHaveAttribute('data-scroll-block-start', 'true');
    await expect(viewport).toHaveAttribute('data-scroll-block-end', 'true');
  },
};

/** `axis="inline"`: a row of tags that scrolls sideways (per-axis padding). */
export const InlineAxis: Story = {
  args: {label: 'Tags', axis: 'inline', height: undefined, maxWidth: 360, padding: undefined, paddingInline: 3, paddingBlock: 2, slots: {default: chips}},
  play: async ({canvasElement}) => {
    const viewport = await area(canvasElement);
    await waitFor(() => expect(viewport).toHaveAttribute('data-scrollable-inline', 'true'));
    await expect(viewport).toHaveAttribute('tabindex', '0');
    viewport.scrollLeft = viewport.scrollWidth;
    await waitFor(() => expect(viewport).toHaveAttribute('data-scroll-inline-end', 'true'));
    await expect(viewport).not.toHaveAttribute('data-scroll-inline-start');
  },
};

/** `axis="both"` with `role="region"` and `overscroll="contain"`: a spreadsheet-like grid. */
export const BothAxesRegion: Story = {
  args: {label: 'Spreadsheet', axis: 'both', role: 'region', overscroll: 'contain', height: 160, padding: 0, maxWidth: 480, slots: {default: sheet}},
  play: async ({canvas, canvasElement}) => {
    const viewport = await area(canvasElement);
    await expect(canvas.getByRole('region', {name: 'Spreadsheet'})).toBe(viewport);
    await waitFor(() => expect(viewport).toHaveAttribute('data-scrollable-inline', 'true'));
    await expect(viewport).toHaveAttribute('data-scrollable-block', 'true');
    // Scroll gestures stop at the viewport's edges instead of scrolling the page.
    await expect(getComputedStyle(viewport).overscrollBehaviorY).toBe('contain');
  },
};

/** `stickyContainment="always"`: a viewport that fits stays the containing block of a sticky heading. */
export const StickyContainment: Story = {
  args: {
    label: 'Pinned list',
    stickyContainment: 'always',
    height: 140,
    padding: undefined,
    paddingInlineStart: 2,
    paddingInlineEnd: 2,
    slots: {
      default:
        '<p style="position:sticky;top:0;margin:0;padding:var(--spacing-1) 0;background:var(--color-background-surface);font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold)">Sticky heading</p>' +
        rows(8, (i) => `Pinned row ${i}`),
    },
  },
};

/** `isFullBleed` inside a Card: the viewport reaches the card's edges while its content keeps the padding. */
export const FullBleedInCard = composed(ScrollableAreaInCard, {
  play: async ({canvas, canvasElement}) => {
    const card = canvasElement.querySelector('.astryx-card')!.getBoundingClientRect();
    const viewport = canvas.getByRole('group', {name: 'Code sample'}).getBoundingClientRect();
    await expect(card.width - viewport.width).toBeLessThanOrEqual(2);
  },
}, {controls: ['isFullBleed', 'padding'], source: inCardSource});

/** The same sample without `isFullBleed`: it stays inside the card's padding. */
export const InsetInCard = composed(ScrollableAreaInCard, {args: {isFullBleed: false}}, {controls: ['isFullBleed', 'padding'], source: inCardSource});
