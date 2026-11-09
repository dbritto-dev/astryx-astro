import Selector from 'astryx-astro/components/Selector/Selector.astro';
import Demo from 'astryx-astro/components/Selector/Selector.demo.astro';
import demoSource from 'astryx-astro/components/Selector/Selector.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Form Controls/Selector',
  component: Selector,
  ...astryx('Selector'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Selector.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
