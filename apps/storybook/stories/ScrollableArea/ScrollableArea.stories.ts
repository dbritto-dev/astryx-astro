import ScrollableArea from 'astryx-astro/components/ScrollableArea/ScrollableArea.astro';
import Demo from 'astryx-astro/components/ScrollableArea/ScrollableArea.demo.astro';
import demoSource from 'astryx-astro/components/ScrollableArea/ScrollableArea.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Layout/Scrollable Area',
  component: ScrollableArea,
  ...astryx('ScrollableArea'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (ScrollableArea.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
