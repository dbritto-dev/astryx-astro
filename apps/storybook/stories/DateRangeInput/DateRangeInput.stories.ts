import DateRangeInput from 'astryx-astro/components/DateRangeInput/DateRangeInput.astro';
import Demo from 'astryx-astro/components/DateRangeInput/DateRangeInput.demo.astro';
import demoSource from 'astryx-astro/components/DateRangeInput/DateRangeInput.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Form Controls/Date Range Input',
  component: DateRangeInput,
  ...astryx('DateRangeInput'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (DateRangeInput.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
