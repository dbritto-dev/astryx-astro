import Indicator from 'astryx-astro/components/Indicator/Indicator.astro';
import Demo from 'astryx-astro/components/Indicator/Indicator.demo.astro';
import demoSource from 'astryx-astro/components/Indicator/Indicator.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Form Controls/Indicator',
  component: Indicator,
  ...astryx('Indicator'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Indicator.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
