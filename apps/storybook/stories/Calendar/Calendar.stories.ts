import Calendar from 'astryx-astro/components/Calendar/Calendar.astro';
import Demo from 'astryx-astro/components/Calendar/Calendar.demo.astro';
import demoSource from 'astryx-astro/components/Calendar/Calendar.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Form Controls/Calendar',
  component: Calendar,
  ...astryx('Calendar'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Calendar.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
