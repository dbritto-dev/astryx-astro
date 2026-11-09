import Section from 'astryx-astro/components/Section/Section.astro';
import Demo from 'astryx-astro/components/Section/Section.demo.astro';
import demoSource from 'astryx-astro/components/Section/Section.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Layout/Section',
  component: Section,
  ...astryx('Section'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Section.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
