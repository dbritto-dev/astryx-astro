import ProgressBar from 'astryx-astro/components/ProgressBar/ProgressBar.astro';
import Demo from 'astryx-astro/components/ProgressBar/ProgressBar.demo.astro';
import demoSource from 'astryx-astro/components/ProgressBar/ProgressBar.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import ProgressBarFormatted from './ProgressBarFormatted.astro';
import formattedSource from './ProgressBarFormatted.astro?raw';
import ProgressBarMatrix from './ProgressBarMatrix.astro';
import matrixSource from './ProgressBarMatrix.astro?raw';

const meta = {
  title: 'Feedback & Status/Progress Bar',
  component: ProgressBar,
  ...astryx('ProgressBar'),
  args: {label: 'Upload progress', value: 75},
} satisfies Meta;
export default meta;

/** Every example from the docs page (ProgressBar.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/** Every variant with a value, with marks, indeterminate and disabled. */
export const Matrix = composed(ProgressBarMatrix, {}, {source: matrixSource});

/** A progressbar named by its visible label, with its value, range and value text. */
export const Default: Story = {
  play: async ({canvas}) => {
    const bar = canvas.getByRole('progressbar', {name: 'Upload progress'});
    await expect(bar).toHaveAttribute('aria-valuenow', '75');
    await expect(bar).toHaveAttribute('aria-valuemin', '0');
    await expect(bar).toHaveAttribute('aria-valuemax', '100');
    await expect(bar).toHaveAttribute('aria-valuetext', '75%');
  },
};

/** The formatted value next to the label. */
export const WithValueLabel: Story = {
  args: {hasValueLabel: true},
  play: async ({canvas}) => {
    await expect(canvas.getByText('75%')).toBeVisible();
  },
};

export const Success: Story = {args: {variant: 'success', label: 'Backup complete', value: 100, hasValueLabel: true}};

export const ErrorVariant: Story = {args: {variant: 'error', label: 'Storage used', value: 96, hasValueLabel: true}};

/** The label is visually hidden and still names the bar. */
export const LabelHidden: Story = {
  args: {isLabelHidden: true, value: 40},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('progressbar', {name: 'Upload progress'})).toHaveAttribute('aria-valuenow', '40');
  },
};

/** An animated bar with no value: it exposes none of the aria-value attributes. */
export const Indeterminate: Story = {
  args: {label: 'Loading results', isIndeterminate: true, hasValueLabel: true},
  play: async ({canvas}) => {
    const bar = canvas.getByRole('progressbar', {name: 'Loading results'});
    for (const attribute of ['aria-valuenow', 'aria-valuemin', 'aria-valuemax', 'aria-valuetext']) {
      await expect(bar).not.toHaveAttribute(attribute);
    }
    await expect(canvas.queryByText('%', {exact: false})).toBeNull();
  },
};

/** Disabled colours for a canceled operation; the value stays. */
export const Disabled: Story = {
  args: {label: 'Canceled', value: 30, isDisabled: true, hasValueLabel: true},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('progressbar', {name: 'Canceled'})).toHaveAttribute('aria-valuenow', '30');
  },
};

/** A value above `max` is clamped. */
export const Clamped: Story = {
  args: {label: 'Over the max', value: 140, hasValueLabel: true},
  play: async ({canvas}) => {
    const bar = canvas.getByRole('progressbar', {name: 'Over the max'});
    await expect(bar).toHaveAttribute('aria-valuenow', '100');
    await expect(bar).toHaveAttribute('aria-valuetext', '100%');
  },
};

/** `formatValueLabel` formats the value label and aria-valuetext ("3.2 GB / 5 GB"). */
export const CustomFormat = composed(
  ProgressBarFormatted,
  {
    args: {value: 3.2, max: 5},
    play: async ({canvas}) => {
      const bar = canvas.getByRole('progressbar', {name: 'Disk usage'});
      await expect(bar).toHaveAttribute('aria-valuetext', '3.2 GB / 5 GB');
      await expect(bar).toHaveAttribute('aria-valuemax', '5');
      await expect(canvas.getByText('3.2 GB / 5 GB')).toBeVisible();
    },
  },
  {controls: ['value', 'max'], source: formattedSource},
);

/** Target marks: focusable ticks named by their label, which shows in a tooltip on hover and keyboard focus. */
export const WithMarks: Story = {
  args: {
    label: 'Fundraiser',
    value: 45,
    hasValueLabel: true,
    marks: [
      {value: 25, label: 'Q1 target: 25%'},
      {value: 80, label: 'Goal: 80%'},
    ],
  },
  play: async ({canvas, canvasElement, step}) => {
    const q1 = canvas.getByRole('img', {name: 'Q1 target: 25%'});
    const goal = canvas.getByRole('img', {name: 'Goal: 80%'});
    // Marks sit outside the progressbar.
    await expect(canvas.getByRole('progressbar').contains(goal)).toBe(false);
    await expect(q1).toHaveAttribute('data-placement', 'fill');
    await expect(goal).toHaveAttribute('data-placement', 'track');
    const tipOf = (mark: Element) => document.getElementById(mark.getAttribute('data-ax-tooltip') ?? '');

    await step('Keyboard focus shows the mark label', async () => {
      await userEvent.tab();
      await expect(q1).toHaveFocus();
      await waitFor(() => expect(isShowing(tipOf(q1))).toBe(true));
      await expect(q1).toHaveAccessibleDescription('Q1 target: 25%');
      await userEvent.tab();
      await expect(goal).toHaveFocus();
      await waitFor(() => expect(isShowing(tipOf(goal))).toBe(true));
    });

    await step('Hover shows it too', async () => {
      goal.blur();
      await waitFor(() => expect(isShowing(tipOf(goal))).toBe(false));
      await userEvent.hover(q1);
      await waitFor(() => expect(isShowing(tipOf(q1))).toBe(true));
    });
    await expect(canvasElement.querySelectorAll('[role="img"]')).toHaveLength(2);
  },
};
