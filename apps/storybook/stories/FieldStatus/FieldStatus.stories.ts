import FieldStatus from 'astryx-astro/components/FieldStatus/FieldStatus.astro';
import Demo from 'astryx-astro/components/FieldStatus/FieldStatus.demo.astro';
import demoSource from 'astryx-astro/components/FieldStatus/FieldStatus.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Form Controls/Field Status',
  component: FieldStatus,
  ...astryx('FieldStatus'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (FieldStatus.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
