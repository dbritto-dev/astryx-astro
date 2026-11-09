import Tooltip from 'astryx-astro/components/Tooltip/Tooltip.astro';
import Demo from 'astryx-astro/components/Tooltip/Tooltip.demo.astro';
import demoSource from 'astryx-astro/components/Tooltip/Tooltip.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents} from '../_lib/play';
import {astryx, overview, type Meta, type Story} from '../_lib/story';

const meta = {
  title: 'Overlay/Tooltip',
  component: Tooltip,
  ...astryx('Tooltip'),
  // The first element of the default slot is the trigger.
  args: {content: 'Copies a link to this page', slots: {default: '<button type="button">Share</button>'}},
  parameters: {layout: 'centered'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Tooltip.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const layer = (root: Element) => root.querySelector('[role="tooltip"]');

/** Hover shows it after the delay and describes the trigger; leaving hides it; keyboard focus shows it; Escape hides it. */
export const Default: Story = {
  play: async ({canvas, canvasElement, step}) => {
    const trigger = canvas.getByRole('button', {name: 'Share'});
    const changes = recordEvents<{isOpen: boolean}>(canvasElement, 'astryx-open-change');
    await expect(trigger).toHaveAccessibleDescription('Copies a link to this page');
    await step('Hover shows, leaving hides', async () => {
      await userEvent.hover(trigger);
      await waitFor(() => expect(isShowing(layer(canvasElement))).toBe(true));
      await userEvent.unhover(trigger);
      await waitFor(() => expect(isShowing(layer(canvasElement))).toBe(false));
    });
    await step('Keyboard focus shows, Escape hides', async () => {
      await userEvent.tab();
      await expect(trigger).toHaveFocus();
      await waitFor(() => expect(isShowing(layer(canvasElement))).toBe(true));
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(layer(canvasElement))).toBe(false));
    });
    await expect(changes.map((e) => e.detail.isOpen)).toEqual([true, false, true, false]);
  },
};

export const Below: Story = {args: {placement: 'below'}};

export const End: Story = {args: {placement: 'end'}};

export const AlignStart: Story = {args: {placement: 'below', alignment: 'start'}};

/** Shown on load (`isDefaultOpen`), still dismissible. */
export const DefaultOpen: Story = {
  args: {isDefaultOpen: true},
  play: async ({canvasElement}) => {
    await waitFor(() => expect(isShowing(layer(canvasElement))).toBe(true));
  },
};

/** A text trigger gets the dashed hover indication. */
export const TextTrigger: Story = {
  args: {content: 'Annual recurring revenue', slots: {default: '<span tabindex="0">ARR</span>'}},
};

/** `isEnabled={false}`: no hover or focus trigger. */
export const NotEnabled: Story = {
  args: {isEnabled: false},
  play: async ({canvas, canvasElement}) => {
    await userEvent.hover(canvas.getByRole('button', {name: 'Share'}));
    await new Promise((resolve) => setTimeout(resolve, 400));
    await expect(isShowing(layer(canvasElement))).toBe(false);
  },
};
