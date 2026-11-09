import VisuallyHidden from 'astryx-astro/components/VisuallyHidden/VisuallyHidden.astro';
import Demo from 'astryx-astro/components/VisuallyHidden/VisuallyHidden.demo.astro';
import demoSource from 'astryx-astro/components/VisuallyHidden/VisuallyHidden.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Utility/VisuallyHidden',
  component: VisuallyHidden,
  ...astryx('VisuallyHidden'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (VisuallyHidden.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
