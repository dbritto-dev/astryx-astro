import Code from 'astryx-astro/components/Code/Code.astro';
import Demo from 'astryx-astro/components/Code/Code.demo.astro';
import demoSource from 'astryx-astro/components/Code/Code.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Content/Code',
  component: Code,
  ...astryx('Code'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Code.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
