import SegmentedControl from 'astryx-astro/components/SegmentedControl/SegmentedControl.astro';
import Demo from 'astryx-astro/components/SegmentedControl/SegmentedControl.demo.astro';
import demoSource from 'astryx-astro/components/SegmentedControl/SegmentedControl.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Action/Segmented Control',
  component: SegmentedControl,
  ...astryx('SegmentedControl'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (SegmentedControl.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
