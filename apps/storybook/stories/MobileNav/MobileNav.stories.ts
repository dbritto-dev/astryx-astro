import MobileNav from 'astryx-astro/components/MobileNav/MobileNav.astro';
import Demo from 'astryx-astro/components/MobileNav/MobileNav.demo.astro';
import demoSource from 'astryx-astro/components/MobileNav/MobileNav.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Navigation/Mobile Nav',
  component: MobileNav,
  ...astryx('MobileNav'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (MobileNav.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
