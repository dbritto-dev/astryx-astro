import Drawer from 'astryx-astro/components/Drawer/Drawer.astro';
import Demo from 'astryx-astro/components/Drawer/Drawer.demo.astro';
import demoSource from 'astryx-astro/components/Drawer/Drawer.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Overlay/Drawer',
  component: Drawer,
  ...astryx('Drawer'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Drawer.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
