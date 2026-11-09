import OverflowList from 'astryx-astro/components/OverflowList/OverflowList.astro';
import Demo from 'astryx-astro/components/OverflowList/OverflowList.demo.astro';
import demoSource from 'astryx-astro/components/OverflowList/OverflowList.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Table & List/Overflow List',
  component: OverflowList,
  ...astryx('OverflowList'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (OverflowList.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
