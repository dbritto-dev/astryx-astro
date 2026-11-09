import SideNav from 'astryx-astro/components/SideNav/SideNav.astro';
import Demo from 'astryx-astro/components/SideNav/SideNav.demo.astro';
import demoSource from 'astryx-astro/components/SideNav/SideNav.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Navigation/Side Nav',
  component: SideNav,
  ...astryx('SideNav'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (SideNav.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
