import Badge from 'astryx-astro/components/Badge/Badge.astro';
import Demo from 'astryx-astro/components/Badge/Badge.demo.astro';
import demoSource from 'astryx-astro/components/Badge/Badge.demo.astro?raw';
import Icon from 'astryx-astro/components/Icon/Icon.astro';
import {expect} from 'storybook/test';
import {astryx, composed, frame, overview, type Meta, type Story} from '../_lib/story';
import BadgeMatrix from './BadgeMatrix.astro';
import matrixSource from './BadgeMatrix.astro?raw';

const meta = {
  title: 'Feedback & Status/Badge',
  component: Badge,
  ...astryx('Badge'),
  args: {label: 'Active'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Badge.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/** Every variant (semantic, colour and the theme's `gray`) with a label, an icon and a count. */
export const Matrix = composed(BadgeMatrix, {}, {source: matrixSource});

/** Neutral. A text label is also the `title`, so the full text stays reachable when it truncates. */
export const Default: Story = {
  play: async ({canvas}) => {
    await expect(canvas.getByText('Active').closest('.astryx-badge')).toHaveAttribute('title', 'Active');
  },
};

/** Semantic variants use solid fills. */
export const Success: Story = {args: {variant: 'success', label: 'Deployed', icon: 'check'}};

export const ErrorVariant: Story = {args: {variant: 'error', label: 'Failed', icon: 'error'}};

export const Warning: Story = {args: {variant: 'warning', label: 'Degraded'}};

export const Info: Story = {args: {variant: 'info', label: 'Beta'}};

/** Colour variants use tinted fills, for categories. */
export const Purple: Story = {args: {variant: 'purple', label: 'Design'}};

/** A theme-defined variant: any string is reflected as `data-variant` (the neutral theme styles `gray`). */
export const ThemeVariant: Story = {
  args: {variant: 'gray', label: 'Archived'},
  play: async ({canvas}) => {
    await expect(canvas.getByText('Archived').closest('.astryx-badge')).toHaveAttribute('data-variant', 'gray');
  },
};

/** A number label. */
export const Count: Story = {
  args: {variant: 'info', label: 3},
  play: async ({canvas}) => {
    await expect(canvas.getByText('3').closest('.astryx-badge')).toHaveAttribute('title', '3');
  },
};

/** An Icon in the `icon` slot (a configured component). */
export const IconSlot: Story = {
  args: {variant: 'warning', label: 'Degraded', slots: {icon: {component: Icon, props: {icon: 'warning', size: 'sm'}}}},
};

/** Rich content in the `label` slot: no `title`, as in Astryx. */
export const LabelSlot: Story = {
  args: {variant: 'purple', label: '', slots: {label: '<strong>Design</strong> team'}},
  play: async ({canvasElement}) => {
    const badge = canvasElement.querySelector('.astryx-badge')!;
    await expect(badge).toHaveTextContent('Design team');
    await expect(badge).not.toHaveAttribute('title');
  },
};

/** A label longer than its container ends in an ellipsis; the `title` keeps the full text. */
export const Truncated: Story = {
  args: {variant: 'teal', label: 'A long category label that will not fit'},
  decorators: [frame({width: 160})],
  play: async ({canvasElement}) => {
    const label = canvasElement.querySelector<HTMLElement>('.ax-badge-label')!;
    await expect(label.scrollWidth).toBeGreaterThan(label.clientWidth);
    await expect(canvasElement.querySelector('.astryx-badge')).toHaveAttribute('title', 'A long category label that will not fit');
  },
};
