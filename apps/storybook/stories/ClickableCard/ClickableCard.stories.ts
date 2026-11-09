import ClickableCard from 'astryx-astro/components/ClickableCard/ClickableCard.astro';
import Demo from 'astryx-astro/components/ClickableCard/ClickableCard.demo.astro';
import demoSource from 'astryx-astro/components/ClickableCard/ClickableCard.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Container/Clickable Card',
  component: ClickableCard,
  ...astryx('ClickableCard'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (ClickableCard.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
