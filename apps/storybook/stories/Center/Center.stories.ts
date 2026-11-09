import Center from 'astryx-astro/components/Center/Center.astro';
import Demo from 'astryx-astro/components/Center/Center.demo.astro';
import demoSource from 'astryx-astro/components/Center/Center.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Layout/Center',
  component: Center,
  ...astryx('Center'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Center.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
