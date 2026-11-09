import Overlay from 'astryx-astro/components/Overlay/Overlay.astro';
import Demo from 'astryx-astro/components/Overlay/Overlay.demo.astro';
import demoSource from 'astryx-astro/components/Overlay/Overlay.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Overlay/Overlay',
  component: Overlay,
  ...astryx('Overlay'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Overlay.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
