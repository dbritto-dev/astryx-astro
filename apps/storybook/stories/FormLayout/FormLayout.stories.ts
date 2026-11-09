import FormLayout from 'astryx-astro/components/FormLayout/FormLayout.astro';
import Demo from 'astryx-astro/components/FormLayout/FormLayout.demo.astro';
import demoSource from 'astryx-astro/components/FormLayout/FormLayout.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Layout/Form Layout',
  component: FormLayout,
  ...astryx('FormLayout'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (FormLayout.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
