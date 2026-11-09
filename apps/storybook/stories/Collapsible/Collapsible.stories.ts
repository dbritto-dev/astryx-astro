import Collapsible from 'astryx-astro/components/Collapsible/Collapsible.astro';
import Demo from 'astryx-astro/components/Collapsible/Collapsible.demo.astro';
import demoSource from 'astryx-astro/components/Collapsible/Collapsible.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Container/Collapsible',
  component: Collapsible,
  ...astryx('Collapsible'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Collapsible.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
