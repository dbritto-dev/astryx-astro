import Icon from 'astryx-astro/components/Icon/Icon.astro';
import Demo from 'astryx-astro/components/Icon/Icon.demo.astro';
import demoSource from 'astryx-astro/components/Icon/Icon.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Content/Icon',
  component: Icon,
  ...astryx('Icon'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Icon.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
