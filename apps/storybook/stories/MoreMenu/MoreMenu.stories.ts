import MoreMenu from 'astryx-astro/components/MoreMenu/MoreMenu.astro';
import Demo from 'astryx-astro/components/MoreMenu/MoreMenu.demo.astro';
import demoSource from 'astryx-astro/components/MoreMenu/MoreMenu.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Action/More Menu',
  component: MoreMenu,
  ...astryx('MoreMenu'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (MoreMenu.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
