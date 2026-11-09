import Typeahead from 'astryx-astro/components/Typeahead/Typeahead.astro';
import Demo from 'astryx-astro/components/Typeahead/Typeahead.demo.astro';
import demoSource from 'astryx-astro/components/Typeahead/Typeahead.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Form Controls/Typeahead',
  component: Typeahead,
  ...astryx('Typeahead'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Typeahead.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
