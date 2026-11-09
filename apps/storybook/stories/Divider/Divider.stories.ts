import Divider from 'astryx-astro/components/Divider/Divider.astro';
import Demo from 'astryx-astro/components/Divider/Divider.demo.astro';
import demoSource from 'astryx-astro/components/Divider/Divider.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Layout/Divider',
  component: Divider,
  ...astryx('Divider'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Divider.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
