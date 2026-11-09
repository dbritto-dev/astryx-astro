import Layer from 'astryx-astro/components/Layer/Layer.astro';
import Demo from 'astryx-astro/components/Layer/Layer.demo.astro';
import demoSource from 'astryx-astro/components/Layer/Layer.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Utility/Layer',
  component: Layer,
  ...astryx('Layer'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Layer.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
