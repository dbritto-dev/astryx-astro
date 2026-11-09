import TextInput from 'astryx-astro/components/TextInput/TextInput.astro';
import Demo from 'astryx-astro/components/TextInput/TextInput.demo.astro';
import demoSource from 'astryx-astro/components/TextInput/TextInput.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Form Controls/Text Input',
  component: TextInput,
  ...astryx('TextInput'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (TextInput.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
