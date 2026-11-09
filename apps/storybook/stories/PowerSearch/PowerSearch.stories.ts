import PowerSearch from 'astryx-astro/components/PowerSearch/PowerSearch.astro';
import Demo from 'astryx-astro/components/PowerSearch/PowerSearch.demo.astro';
import demoSource from 'astryx-astro/components/PowerSearch/PowerSearch.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Form Controls/Power Search',
  component: PowerSearch,
  ...astryx('PowerSearch'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (PowerSearch.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
