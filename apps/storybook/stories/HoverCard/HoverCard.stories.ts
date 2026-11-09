import HoverCard from 'astryx-astro/components/HoverCard/HoverCard.astro';
import Demo from 'astryx-astro/components/HoverCard/HoverCard.demo.astro';
import demoSource from 'astryx-astro/components/HoverCard/HoverCard.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Overlay/Hover Card',
  component: HoverCard,
  ...astryx('HoverCard'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (HoverCard.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
