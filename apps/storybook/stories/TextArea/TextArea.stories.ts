import TextArea from 'astryx-astro/components/TextArea/TextArea.astro';
import Demo from 'astryx-astro/components/TextArea/TextArea.demo.astro';
import demoSource from 'astryx-astro/components/TextArea/TextArea.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Form Controls/Text Area',
  component: TextArea,
  ...astryx('TextArea'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (TextArea.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
