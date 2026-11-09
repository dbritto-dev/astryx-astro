import Citation from 'astryx-astro/components/Citation/Citation.astro';
import Demo from 'astryx-astro/components/Citation/Citation.demo.astro';
import demoSource from 'astryx-astro/components/Citation/Citation.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Content/Citation',
  component: Citation,
  ...astryx('Citation'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Citation.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
