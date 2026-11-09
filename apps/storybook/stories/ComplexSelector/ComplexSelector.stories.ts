import ComplexSelector from 'astryx-astro/components/ComplexSelector/ComplexSelector.astro';
import Demo from 'astryx-astro/components/ComplexSelector/ComplexSelector.demo.astro';
import demoSource from 'astryx-astro/components/ComplexSelector/ComplexSelector.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Form Controls/Complex Selector',
  component: ComplexSelector,
  ...astryx('ComplexSelector'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (ComplexSelector.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
