import Lightbox from 'astryx-astro/components/Lightbox/Lightbox.astro';
import Demo from 'astryx-astro/components/Lightbox/Lightbox.demo.astro';
import demoSource from 'astryx-astro/components/Lightbox/Lightbox.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Overlay/Lightbox',
  component: Lightbox,
  ...astryx('Lightbox'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Lightbox.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
