import Toolbar from 'astryx-astro/components/Toolbar/Toolbar.astro';
import Demo from 'astryx-astro/components/Toolbar/Toolbar.demo.astro';
import demoSource from 'astryx-astro/components/Toolbar/Toolbar.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Action/Toolbar',
  component: Toolbar,
  ...astryx('Toolbar'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Toolbar.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
