import Kbd from 'astryx-astro/components/Kbd/Kbd.astro';
import Demo from 'astryx-astro/components/Kbd/Kbd.demo.astro';
import demoSource from 'astryx-astro/components/Kbd/Kbd.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Content/Kbd',
  component: Kbd,
  ...astryx('Kbd'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Kbd.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
