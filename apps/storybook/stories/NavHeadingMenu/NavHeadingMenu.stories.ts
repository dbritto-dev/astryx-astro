import NavHeadingMenu from 'astryx-astro/components/NavMenu/NavHeadingMenu.astro';
import Demo from 'astryx-astro/components/NavMenu/NavHeadingMenu.demo.astro';
import demoSource from 'astryx-astro/components/NavMenu/NavHeadingMenu.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Navigation/Nav Heading Menu',
  component: NavHeadingMenu,
  ...astryx('NavHeadingMenu'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (NavHeadingMenu.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
