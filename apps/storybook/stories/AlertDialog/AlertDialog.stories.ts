import AlertDialog from 'astryx-astro/components/AlertDialog/AlertDialog.astro';
import Demo from 'astryx-astro/components/AlertDialog/AlertDialog.demo.astro';
import demoSource from 'astryx-astro/components/AlertDialog/AlertDialog.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Overlay/Alert Dialog',
  component: AlertDialog,
  ...astryx('AlertDialog'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (AlertDialog.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
