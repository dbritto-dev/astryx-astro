import Dialog from 'astryx-astro/components/Dialog/Dialog.astro';
import Demo from 'astryx-astro/components/Dialog/Dialog.demo.astro';
import demoSource from 'astryx-astro/components/Dialog/Dialog.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Overlay/Dialog',
  component: Dialog,
  ...astryx('Dialog'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Dialog.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
