import Banner from 'astryx-astro/components/Banner/Banner.astro';
import Demo from 'astryx-astro/components/Banner/Banner.demo.astro';
import demoSource from 'astryx-astro/components/Banner/Banner.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Feedback & Status/Banner',
  component: Banner,
  ...astryx('Banner'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Banner.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
