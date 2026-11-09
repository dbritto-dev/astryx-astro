import Badge from 'astryx-astro/components/Badge/Badge.astro';
import Demo from 'astryx-astro/components/Badge/Badge.demo.astro';
import demoSource from 'astryx-astro/components/Badge/Badge.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Feedback & Status/Badge',
  component: Badge,
  ...astryx('Badge'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Badge.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
