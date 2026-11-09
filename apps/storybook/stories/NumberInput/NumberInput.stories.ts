import NumberInput from 'astryx-astro/components/NumberInput/NumberInput.astro';
import Demo from 'astryx-astro/components/NumberInput/NumberInput.demo.astro';
import demoSource from 'astryx-astro/components/NumberInput/NumberInput.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Form Controls/Number Input',
  component: NumberInput,
  ...astryx('NumberInput'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (NumberInput.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
