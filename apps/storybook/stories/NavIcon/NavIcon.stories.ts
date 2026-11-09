import NavIcon from 'astryx-astro/components/NavIcon/NavIcon.astro';
import Demo from 'astryx-astro/components/NavIcon/NavIcon.demo.astro';
import demoSource from 'astryx-astro/components/NavIcon/NavIcon.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Navigation/Nav Icon',
  component: NavIcon,
  ...astryx('NavIcon'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (NavIcon.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
