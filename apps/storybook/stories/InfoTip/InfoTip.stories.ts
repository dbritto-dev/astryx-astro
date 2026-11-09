import InfoTip from 'astryx-astro/components/InfoTip/InfoTip.astro';
import Demo from 'astryx-astro/components/InfoTip/InfoTip.demo.astro';
import demoSource from 'astryx-astro/components/InfoTip/InfoTip.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing} from '../_lib/play';
import {astryx, overview, type Meta, type Story} from '../_lib/story';

const meta = {
  title: 'Feedback & Status/Info Tip',
  component: InfoTip,
  ...astryx('InfoTip'),
  args: {content: 'Editors can change this field; viewers cannot.'},
  parameters: {layout: 'centered'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (InfoTip.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const layer = (root: Element) => root.querySelector('[role="tooltip"]');

/**
 * Hover previews the help; a click pins it (`aria-expanded="true"`, announced once) until a
 * press outside; Enter pins and a second Enter closes; Escape closes a pinned tip.
 */
export const Default: Story = {
  play: async ({canvas, canvasElement, step}) => {
    const button = canvas.getByRole('button', {name: 'More information'});
    await expect(button).toHaveAttribute('aria-expanded', 'false');

    await step('Hover previews the help without pinning it', async () => {
      await userEvent.hover(button);
      await waitFor(() => expect(isShowing(layer(canvasElement))).toBe(true));
      await expect(layer(canvasElement)).toHaveTextContent('Editors can change this field; viewers cannot.');
      await expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    await step('A click pins it: it survives the pointer leaving and is announced', async () => {
      await userEvent.click(button);
      await waitFor(() => expect(button).toHaveAttribute('aria-expanded', 'true'));
      await userEvent.unhover(button);
      await new Promise((resolve) => setTimeout(resolve, 400));
      await expect(isShowing(layer(canvasElement))).toBe(true);
      await waitFor(() => expect(document.querySelector('[data-astryx-live-region="polite"]')).toHaveTextContent('Editors can change this field'));
    });

    await step('A press outside ends the pin', async () => {
      await userEvent.click(document.body);
      await waitFor(() => expect(isShowing(layer(canvasElement))).toBe(false));
      await expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    await step('Enter pins it, a second Enter closes it', async () => {
      button.focus();
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(button).toHaveAttribute('aria-expanded', 'true'));
      await expect(isShowing(layer(canvasElement))).toBe(true);
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(button).toHaveAttribute('aria-expanded', 'false'));
    });

    await step('Escape closes a pinned tip', async () => {
      await userEvent.keyboard(' ');
      await waitFor(() => expect(button).toHaveAttribute('aria-expanded', 'true'));
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(layer(canvasElement))).toBe(false));
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await expect(button).toHaveFocus();
    });
  },
};

/** A custom accessible name for the button. */
export const CustomLabel: Story = {
  args: {label: 'About this metric', content: '30-day rolling average of signed-in users.'},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('button', {name: 'About this metric'})).toBeVisible();
  },
};

/** 12px icon. */
export const ExtraSmall: Story = {args: {size: 'xsm'}};

/** 20px icon. */
export const Medium: Story = {args: {size: 'md'}};

/** 24px icon. */
export const Large: Story = {args: {size: 'lg'}};

/** Rich content in the `content` slot. */
export const ContentSlot: Story = {
  args: {label: 'About quota', content: '', slots: {content: '<strong>80%</strong> of your monthly quota is used.'}},
  play: async ({canvas, canvasElement}) => {
    const button = canvas.getByRole('button', {name: 'About quota'});
    button.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(isShowing(layer(canvasElement))).toBe(true));
    await expect(layer(canvasElement)!.querySelector('strong')).toHaveTextContent('80%');
  },
};
