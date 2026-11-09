import Tooltip from 'astryx-astro/components/Tooltip/Tooltip.astro';
import Demo from 'astryx-astro/components/Tooltip/Tooltip.demo.astro';
import demoSource from 'astryx-astro/components/Tooltip/Tooltip.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Overlay/Tooltip',
  component: Tooltip,
  ...astryx('Tooltip'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Tooltip.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
