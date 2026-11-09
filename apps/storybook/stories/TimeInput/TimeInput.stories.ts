import TimeInput from 'astryx-astro/components/TimeInput/TimeInput.astro';
import Demo from 'astryx-astro/components/TimeInput/TimeInput.demo.astro';
import demoSource from 'astryx-astro/components/TimeInput/TimeInput.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Form Controls/Time Input',
  component: TimeInput,
  ...astryx('TimeInput'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (TimeInput.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
