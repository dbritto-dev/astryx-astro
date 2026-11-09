import Timer from 'astryx-astro/components/Timer/Timer.astro';
import Demo from 'astryx-astro/components/Timer/Timer.demo.astro';
import demoSource from 'astryx-astro/components/Timer/Timer.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Content/Timer',
  component: Timer,
  ...astryx('Timer'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Timer.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
