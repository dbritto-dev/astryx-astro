import DateInput from 'astryx-astro/components/DateInput/DateInput.astro';
import Demo from 'astryx-astro/components/DateInput/DateInput.demo.astro';
import demoSource from 'astryx-astro/components/DateInput/DateInput.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Form Controls/Date Input',
  component: DateInput,
  ...astryx('DateInput'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (DateInput.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
