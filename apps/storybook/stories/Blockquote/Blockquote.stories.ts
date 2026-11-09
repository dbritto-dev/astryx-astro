import Blockquote from 'astryx-astro/components/Blockquote/Blockquote.astro';
import Demo from 'astryx-astro/components/Blockquote/Blockquote.demo.astro';
import demoSource from 'astryx-astro/components/Blockquote/Blockquote.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Content/Blockquote',
  component: Blockquote,
  ...astryx('Blockquote'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Blockquote.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
