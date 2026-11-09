import Slider from 'astryx-astro/components/Slider/Slider.astro';
import Demo from 'astryx-astro/components/Slider/Slider.demo.astro';
import demoSource from 'astryx-astro/components/Slider/Slider.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Form Controls/Slider',
  component: Slider,
  ...astryx('Slider'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Slider.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
