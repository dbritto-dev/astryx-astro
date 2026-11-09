import List from 'astryx-astro/components/List/List.astro';
import Demo from 'astryx-astro/components/List/List.demo.astro';
import demoSource from 'astryx-astro/components/List/List.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Table & List/List',
  component: List,
  ...astryx('List'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (List.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
