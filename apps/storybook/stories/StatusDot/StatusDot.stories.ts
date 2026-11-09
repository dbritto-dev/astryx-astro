import StatusDot from 'astryx-astro/components/StatusDot/StatusDot.astro';
import Demo from 'astryx-astro/components/StatusDot/StatusDot.demo.astro';
import demoSource from 'astryx-astro/components/StatusDot/StatusDot.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import StatusDotMatrix from './StatusDotMatrix.astro';
import matrixSource from './StatusDotMatrix.astro?raw';

const meta = {
  title: 'Feedback & Status/Status Dot',
  component: StatusDot,
  ...astryx('StatusDot'),
  args: {variant: 'success', label: 'Online'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (StatusDot.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/** Every variant plain, pulsing and with an icon, each next to its visible text. */
export const Matrix = composed(StatusDotMatrix, {}, {source: matrixSource});

/** An image named by its label, never a tab stop. */
export const Default: Story = {
  play: async ({canvas}) => {
    const dot = canvas.getByRole('img', {name: 'Online'});
    await expect(dot).not.toHaveAttribute('tabindex');
    await expect(dot).toHaveAttribute('data-variant', 'success');
  },
};

export const Warning: Story = {args: {variant: 'warning', label: 'Degraded'}};

export const ErrorVariant: Story = {args: {variant: 'error', label: 'Offline'}};

export const Accent: Story = {args: {variant: 'accent', label: 'Selected'}};

export const Neutral: Story = {args: {variant: 'neutral', label: 'Idle'}};

/** Pulses to show activity (no animation under prefers-reduced-motion). */
export const Pulsing: Story = {args: {label: 'Live', isPulsing: true}};

/** A distinct icon per status, drawn in the variant's ink, so status does not rely on colour alone. */
export const WithIcon: Story = {args: {variant: 'success', label: 'Verified', icon: 'check'}};

/** Custom SVG markup in the `icon` slot. */
export const IconSlot: Story = {
  args: {
    variant: 'error',
    label: 'Failed',
    slots: {icon: '<svg viewBox="0 0 8 8" width="8" height="8" fill="currentColor"><rect x="3.25" y="1.5" width="1.5" height="5" rx="0.75"></rect></svg>'},
  },
};

/** A tooltip explains the status on hover and describes the dot. */
export const WithTooltip: Story = {
  args: {tooltip: 'Connected to the build server'},
  parameters: {layout: 'centered'},
  play: async ({canvas, canvasElement}) => {
    const dot = canvas.getByRole('img', {name: 'Online'});
    const tooltip = canvasElement.querySelector('[role="tooltip"]');
    await expect(dot).toHaveAccessibleDescription('Connected to the build server');
    await userEvent.hover(dot);
    await waitFor(() => expect(isShowing(tooltip)).toBe(true));
    await userEvent.unhover(dot);
    await waitFor(() => expect(isShowing(tooltip)).toBe(false));
  },
};
