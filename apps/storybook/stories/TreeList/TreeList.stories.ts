import TreeList from 'astryx-astro/components/TreeList/TreeList.astro';
import Demo from 'astryx-astro/components/TreeList/TreeList.demo.astro';
import demoSource from 'astryx-astro/components/TreeList/TreeList.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Table & List/Tree List',
  component: TreeList,
  ...astryx('TreeList'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (TreeList.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
