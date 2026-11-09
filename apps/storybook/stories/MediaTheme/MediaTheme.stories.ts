import MediaTheme from 'astryx-astro/components/theme/MediaTheme.astro';
import Demo from 'astryx-astro/components/theme/MediaTheme.demo.astro';
import demoSource from 'astryx-astro/components/theme/MediaTheme.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Utility/Media Theme',
  component: MediaTheme,
  ...astryx('MediaTheme'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (MediaTheme.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
