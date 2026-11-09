import CheckboxInput from 'astryx-astro/components/CheckboxInput/CheckboxInput.astro';
import Demo from 'astryx-astro/components/CheckboxInput/CheckboxInput.demo.astro';
import demoSource from 'astryx-astro/components/CheckboxInput/CheckboxInput.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Form Controls/Checkbox Input',
  component: CheckboxInput,
  ...astryx('CheckboxInput'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (CheckboxInput.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
