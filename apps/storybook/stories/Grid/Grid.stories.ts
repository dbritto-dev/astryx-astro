import Grid from 'astryx-astro/components/Grid/Grid.astro';
import Demo from 'astryx-astro/components/Grid/Grid.demo.astro';
import demoSource from 'astryx-astro/components/Grid/Grid.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Layout/Grid',
  component: Grid,
  ...astryx('Grid'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Grid.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
