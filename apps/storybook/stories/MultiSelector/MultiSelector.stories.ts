import MultiSelector from 'astryx-astro/components/MultiSelector/MultiSelector.astro';
import Demo from 'astryx-astro/components/MultiSelector/MultiSelector.demo.astro';
import demoSource from 'astryx-astro/components/MultiSelector/MultiSelector.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Form Controls/Multi Selector',
  component: MultiSelector,
  ...astryx('MultiSelector'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (MultiSelector.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
