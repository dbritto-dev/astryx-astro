import BottomSheet from 'astryx-astro/components/BottomSheet/BottomSheet.astro';
import Demo from 'astryx-astro/components/BottomSheet/BottomSheet.demo.astro';
import demoSource from 'astryx-astro/components/BottomSheet/BottomSheet.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Overlay/Bottom Sheet',
  component: BottomSheet,
  ...astryx('BottomSheet'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (BottomSheet.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
