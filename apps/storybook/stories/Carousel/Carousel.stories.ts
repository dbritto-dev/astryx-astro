import Carousel from 'astryx-astro/components/Carousel/Carousel.astro';
import Demo from 'astryx-astro/components/Carousel/Carousel.demo.astro';
import demoSource from 'astryx-astro/components/Carousel/Carousel.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Container/Carousel',
  component: Carousel,
  ...astryx('Carousel'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Carousel.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
