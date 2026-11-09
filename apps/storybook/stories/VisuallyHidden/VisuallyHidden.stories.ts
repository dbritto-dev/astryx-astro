import VisuallyHidden from 'astryx-astro/components/VisuallyHidden/VisuallyHidden.astro';
import Demo from 'astryx-astro/components/VisuallyHidden/VisuallyHidden.demo.astro';
import demoSource from 'astryx-astro/components/VisuallyHidden/VisuallyHidden.demo.astro?raw';
import {expect} from 'storybook/test';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import VisuallyHiddenStory from './VisuallyHiddenStory.astro';
import storySource from './VisuallyHiddenStory.astro?raw';

const meta = {
  title: 'Utility/VisuallyHidden',
  component: VisuallyHidden,
  ...astryx('VisuallyHidden'),
  args: {slots: {default: 'Only screen readers hear this sentence.'}},
} satisfies Meta;
export default meta;

/** Every example from the docs page (VisuallyHidden.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/**
 * A `<span>` in the accessibility tree but not on screen (the canvas looks empty on purpose).
 * `class` and `style` are never applied, so it cannot be un-hidden by accident.
 */
export const Default: Story = {
  args: {style: 'position:static;width:auto;height:auto', class: 'visible'},
  play: async ({canvasElement}) => {
    const node = canvasElement.querySelector<HTMLElement>('.ax-visually-hidden')!;
    await expect(node.localName).toBe('span');
    await expect(node).toHaveTextContent('Only screen readers hear this sentence.');
    await expect(node).not.toHaveAttribute('style');
    await expect(node).not.toHaveClass('visible');
    const box = node.getBoundingClientRect();
    await expect(box.width * box.height).toBeLessThanOrEqual(1);
  },
};

/** `as="div"` with `aria-live="polite"` and `role="status"`: a hidden live region. */
export const LiveRegion: Story = {
  args: {as: 'div', 'aria-live': 'polite', role: 'status', slots: {default: 'Moved “Write docs” to Done'}},
  play: async ({canvas}) => {
    const region = canvas.getByRole('status');
    await expect(region.localName).toBe('div');
    await expect(region).toHaveAttribute('aria-live', 'polite');
    await expect(region).toHaveTextContent('Moved “Write docs” to Done');
  },
};

/** The accessible name of an icon-only button, and extra context after visible text. */
export const InContext = composed(VisuallyHiddenStory, {
  play: async ({canvas}) => {
    await expect(canvas.getByRole('button', {name: 'Close dialog'})).toBeVisible();
    await expect(canvas.getByTestId('total')).toHaveTextContent('Order total: $42.00, including tax and shipping');
  },
}, {source: storySource});
