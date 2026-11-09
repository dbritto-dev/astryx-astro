import ResizeHandle from 'astryx-astro/components/Resizable/ResizeHandle.astro';
import Demo from 'astryx-astro/components/Resizable/Resizable.demo.astro';
import demoSource from 'astryx-astro/components/Resizable/Resizable.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Layout/Resizable',
  component: ResizeHandle,
  ...astryx('Resizable'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Resizable.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
