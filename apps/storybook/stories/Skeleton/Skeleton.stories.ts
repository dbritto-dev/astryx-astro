import Skeleton from 'astryx-astro/components/Skeleton/Skeleton.astro';
import Demo from 'astryx-astro/components/Skeleton/Skeleton.demo.astro';
import demoSource from 'astryx-astro/components/Skeleton/Skeleton.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Feedback & Status/Skeleton',
  component: Skeleton,
  ...astryx('Skeleton'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Skeleton.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
