import Token from 'astryx-astro/components/Token/Token.astro';
import Demo from 'astryx-astro/components/Token/Token.demo.astro';
import demoSource from 'astryx-astro/components/Token/Token.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Content/Token',
  component: Token,
  ...astryx('Token'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Token.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
