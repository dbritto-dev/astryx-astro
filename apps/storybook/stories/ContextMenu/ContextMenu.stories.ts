import ContextMenu from 'astryx-astro/components/ContextMenu/ContextMenu.astro';
import Demo from 'astryx-astro/components/ContextMenu/ContextMenu.demo.astro';
import demoSource from 'astryx-astro/components/ContextMenu/ContextMenu.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Action/Context Menu',
  component: ContextMenu,
  ...astryx('ContextMenu'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (ContextMenu.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
