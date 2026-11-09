import ProgressBar from 'astryx-astro/components/ProgressBar/ProgressBar.astro';
import Demo from 'astryx-astro/components/ProgressBar/ProgressBar.demo.astro';
import demoSource from 'astryx-astro/components/ProgressBar/ProgressBar.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Feedback & Status/Progress Bar',
  component: ProgressBar,
  ...astryx('ProgressBar'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (ProgressBar.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
