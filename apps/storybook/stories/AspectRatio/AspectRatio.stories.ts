import AspectRatio from 'astryx-astro/components/AspectRatio/AspectRatio.astro';
import Demo from 'astryx-astro/components/AspectRatio/AspectRatio.demo.astro';
import demoSource from 'astryx-astro/components/AspectRatio/AspectRatio.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Layout/Aspect Ratio',
  component: AspectRatio,
  ...astryx('AspectRatio'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (AspectRatio.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
