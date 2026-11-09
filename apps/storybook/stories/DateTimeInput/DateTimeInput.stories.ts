import DateTimeInput from 'astryx-astro/components/DateTimeInput/DateTimeInput.astro';
import Demo from 'astryx-astro/components/DateTimeInput/DateTimeInput.demo.astro';
import demoSource from 'astryx-astro/components/DateTimeInput/DateTimeInput.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Form Controls/Date Time Input',
  component: DateTimeInput,
  ...astryx('DateTimeInput'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (DateTimeInput.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
