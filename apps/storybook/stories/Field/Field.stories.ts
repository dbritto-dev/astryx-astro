import Field from 'astryx-astro/components/Field/Field.astro';
import Demo from 'astryx-astro/components/Field/Field.demo.astro';
import demoSource from 'astryx-astro/components/Field/Field.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Form Controls/Field',
  component: Field,
  ...astryx('Field'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Field.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
