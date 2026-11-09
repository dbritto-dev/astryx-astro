import Timestamp from 'astryx-astro/components/Timestamp/Timestamp.astro';
import Demo from 'astryx-astro/components/Timestamp/Timestamp.demo.astro';
import demoSource from 'astryx-astro/components/Timestamp/Timestamp.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Content/Timestamp',
  component: Timestamp,
  ...astryx('Timestamp'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Timestamp.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
