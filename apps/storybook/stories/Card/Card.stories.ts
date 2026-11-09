import Card from 'astryx-astro/components/Card/Card.astro';
import Demo from 'astryx-astro/components/Card/Card.demo.astro';
import demoSource from 'astryx-astro/components/Card/Card.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Container/Card',
  component: Card,
  ...astryx('Card'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Card.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
