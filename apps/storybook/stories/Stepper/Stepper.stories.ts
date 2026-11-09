import Stepper from 'astryx-astro/components/Stepper/Stepper.astro';
import Demo from 'astryx-astro/components/Stepper/Stepper.demo.astro';
import demoSource from 'astryx-astro/components/Stepper/Stepper.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Navigation/Stepper',
  component: Stepper,
  ...astryx('Stepper'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Stepper.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
