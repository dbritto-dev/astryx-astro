import IconButton from 'astryx-astro/components/IconButton/IconButton.astro';
import Demo from 'astryx-astro/components/IconButton/IconButton.demo.astro';
import demoSource from 'astryx-astro/components/IconButton/IconButton.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Action/Icon Button',
  component: IconButton,
  ...astryx('IconButton'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (IconButton.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
