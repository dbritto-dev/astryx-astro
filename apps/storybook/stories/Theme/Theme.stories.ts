import Theme from 'astryx-astro/components/theme/Theme.astro';
import Demo from 'astryx-astro/components/theme/Theme.demo.astro';
import demoSource from 'astryx-astro/components/theme/Theme.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Utility/Theme',
  component: Theme,
  ...astryx('Theme'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Theme.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
