import Button from 'astryx-astro/components/Button/Button.astro';
import Demo from 'astryx-astro/components/Button/Button.demo.astro';
import demoSource from 'astryx-astro/components/Button/Button.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Action/Button',
  component: Button,
  ...astryx('Button'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Button.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
