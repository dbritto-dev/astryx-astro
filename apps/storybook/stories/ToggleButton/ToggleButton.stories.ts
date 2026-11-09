import ToggleButton from 'astryx-astro/components/ToggleButton/ToggleButton.astro';
import Demo from 'astryx-astro/components/ToggleButton/ToggleButton.demo.astro';
import demoSource from 'astryx-astro/components/ToggleButton/ToggleButton.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Action/Toggle Button',
  component: ToggleButton,
  ...astryx('ToggleButton'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (ToggleButton.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
