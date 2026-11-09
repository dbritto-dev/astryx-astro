import Spinner from 'astryx-astro/components/Spinner/Spinner.astro';
import Demo from 'astryx-astro/components/Spinner/Spinner.demo.astro';
import demoSource from 'astryx-astro/components/Spinner/Spinner.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Feedback & Status/Spinner',
  component: Spinner,
  ...astryx('Spinner'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Spinner.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
