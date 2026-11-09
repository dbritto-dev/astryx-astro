import Outline from 'astryx-astro/components/Outline/Outline.astro';
import Demo from 'astryx-astro/components/Outline/Outline.demo.astro';
import demoSource from 'astryx-astro/components/Outline/Outline.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Navigation/Outline',
  component: Outline,
  ...astryx('Outline'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Outline.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
