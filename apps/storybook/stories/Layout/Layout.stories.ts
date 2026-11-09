import Layout from 'astryx-astro/components/Layout/Layout.astro';
import Demo from 'astryx-astro/components/Layout/Layout.demo.astro';
import demoSource from 'astryx-astro/components/Layout/Layout.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Layout/Layout',
  component: Layout,
  ...astryx('Layout'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Layout.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
