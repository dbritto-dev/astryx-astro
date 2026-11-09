import Popover from 'astryx-astro/components/Popover/Popover.astro';
import Demo from 'astryx-astro/components/Popover/Popover.demo.astro';
import demoSource from 'astryx-astro/components/Popover/Popover.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Overlay/Popover',
  component: Popover,
  ...astryx('Popover'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Popover.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
