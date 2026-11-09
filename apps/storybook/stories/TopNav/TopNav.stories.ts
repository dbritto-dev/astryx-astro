import TopNav from 'astryx-astro/components/TopNav/TopNav.astro';
import Demo from 'astryx-astro/components/TopNav/TopNav.demo.astro';
import demoSource from 'astryx-astro/components/TopNav/TopNav.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Navigation/Top Nav',
  component: TopNav,
  ...astryx('TopNav'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (TopNav.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
