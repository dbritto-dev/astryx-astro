import Toast from 'astryx-astro/components/Toast/Toast.astro';
import Demo from 'astryx-astro/components/Toast/Toast.demo.astro';
import demoSource from 'astryx-astro/components/Toast/Toast.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Overlay/Toast',
  component: Toast,
  ...astryx('Toast'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Toast.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
