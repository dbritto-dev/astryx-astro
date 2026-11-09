import TabList from 'astryx-astro/components/TabList/TabList.astro';
import Demo from 'astryx-astro/components/TabList/TabList.demo.astro';
import demoSource from 'astryx-astro/components/TabList/TabList.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Navigation/Tab List',
  component: TabList,
  ...astryx('TabList'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (TabList.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
