import Skeleton from 'astryx-astro/components/Skeleton/Skeleton.astro';
import Demo from 'astryx-astro/components/Skeleton/Skeleton.demo.astro';
import demoSource from 'astryx-astro/components/Skeleton/Skeleton.demo.astro?raw';
import {expect} from 'storybook/test';
import {astryx, composed, frame, overview, type Meta, type Story} from '../_lib/story';
import SkeletonMatrix from './SkeletonMatrix.astro';
import matrixSource from './SkeletonMatrix.astro?raw';
import SkeletonProfile from './SkeletonProfile.astro';
import profileSource from './SkeletonProfile.astro?raw';

const meta = {
  title: 'Feedback & Status/Skeleton',
  component: Skeleton,
  ...astryx('Skeleton'),
  args: {width: 240, height: 20},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Skeleton.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/** A decorative placeholder (hidden from assistive technology); the pulse starts after 1 s. */
export const Default: Story = {
  play: async ({canvasElement}) => {
    const skeleton = canvasElement.querySelector<HTMLElement>('.astryx-skeleton')!;
    await expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    await expect(skeleton.getBoundingClientRect().width).toBe(240);
    await expect(skeleton.getBoundingClientRect().height).toBe(20);
  },
};

/** A circle, for an avatar. */
export const Rounded: Story = {args: {width: 48, height: 48, radius: 'rounded'}};

/** No radius. */
export const Square: Story = {args: {width: 72, height: 48, radius: 'none'}};

/** Every radius step, staggered by `index`. */
export const Radii = composed(SkeletonMatrix, {}, {source: matrixSource});

/** The default size, 100% × 100%, fills its container. */
export const FillsContainer: Story = {
  args: {width: '100%', height: '100%'},
  decorators: [frame({width: 420, height: 96})],
  play: async ({canvasElement}) => {
    const skeleton = canvasElement.querySelector<HTMLElement>('.astryx-skeleton')!;
    await expect(skeleton.getBoundingClientRect().width).toBe(420);
    await expect(skeleton.getBoundingClientRect().height).toBe(96);
  },
};

/** A loading profile row: an avatar and three staggered lines in a region marked busy. */
export const ProfilePlaceholder = composed(
  SkeletonProfile,
  {
    play: async ({canvas}) => {
      await expect(canvas.getByRole('group', {name: 'Loading profile'})).toHaveAttribute('aria-busy', 'true');
    },
  },
  {source: profileSource},
);
