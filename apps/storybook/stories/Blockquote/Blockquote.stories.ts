import Blockquote from 'astryx-astro/components/Blockquote/Blockquote.astro';
import Demo from 'astryx-astro/components/Blockquote/Blockquote.demo.astro';
import demoSource from 'astryx-astro/components/Blockquote/Blockquote.demo.astro?raw';
import {expect} from 'storybook/test';
import {astryx, frame, overview, type Meta, type Story} from '../_lib/story';

const meta = {
  title: 'Content/Blockquote',
  component: Blockquote,
  ...astryx('Blockquote'),
  args: {slots: {default: 'Design is not just what it looks like and feels like. Design is how it works.'}},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Blockquote.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/** A semantic `<blockquote>` with no attribution. */
export const Default: Story = {
  play: async ({canvasElement}) => {
    const quote = canvasElement.querySelector('blockquote')!;
    await expect(quote).toHaveTextContent('Design is how it works.');
    await expect(quote.querySelector('cite')).toBeNull();
  },
};

/** `cite` renders the attribution in a bare `<cite>` after the quote, never in a `<footer>` (no contentinfo landmark). */
export const WithCite: Story = {
  args: {cite: 'Dieter Rams', slots: {default: 'Good design is as little design as possible.'}},
  play: async ({canvas, canvasElement}) => {
    const cite = canvasElement.querySelector('blockquote > cite')!;
    await expect(cite).toHaveTextContent('Dieter Rams');
    await expect(canvasElement.querySelector('footer')).toBeNull();
    await expect(canvas.queryByRole('contentinfo')).toBeNull();
  },
};

/** Rich attribution in the `cite` slot, and several paragraphs in the quote. */
export const CiteSlot: Story = {
  args: {
    slots: {
      default:
        '<p style="margin:0">Simplicity is a great virtue but it requires hard work to achieve it and education to appreciate it.</p>' +
        '<p style="margin:var(--spacing-2) 0 0">And to make matters worse: complexity sells better.</p>',
      cite: '<a href="/talks/on-the-nature-of-computing-science" style="color:inherit">Edsger W. Dijkstra</a>, 1984',
    },
  },
  play: async ({canvas}) => {
    await expect(canvas.getByRole('link', {name: 'Edsger W. Dijkstra'}).closest('cite')).not.toBeNull();
  },
};

/** A long unbroken word wraps inside a narrow column instead of overflowing. */
export const Narrow: Story = {
  args: {cite: 'A narrow column', slots: {default: 'A_long_unbroken_identifier_that_wraps_instead_of_overflowing_the_quote'}},
  decorators: [frame({width: 240})],
  play: async ({canvasElement}) => {
    const quote = canvasElement.querySelector('blockquote')!;
    await expect(quote.scrollWidth).toBeLessThanOrEqual(quote.clientWidth);
  },
};
