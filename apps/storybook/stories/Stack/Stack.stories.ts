import Stack from 'astryx-astro/components/Stack/Stack.astro';
import Demo from 'astryx-astro/components/Stack/Stack.demo.astro';
import demoSource from 'astryx-astro/components/Stack/Stack.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Layout/Stack',
  component: Stack,
  ...astryx('Stack'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Stack.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
