import BottomSheetSwitcher from 'astryx-astro/components/BottomSheet/BottomSheetSwitcher.astro';
import Demo from 'astryx-astro/components/BottomSheet/BottomSheetSwitcher.demo.astro';
import demoSource from 'astryx-astro/components/BottomSheet/BottomSheetSwitcher.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Overlay/Bottom Sheet Switcher',
  component: BottomSheetSwitcher,
  ...astryx('BottomSheetSwitcher'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (BottomSheetSwitcher.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
