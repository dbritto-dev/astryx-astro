import Text from 'astryx-astro/components/Text/Text.astro';
import Demo from 'astryx-astro/components/Text/Text.demo.astro';
import demoSource from 'astryx-astro/components/Text/Text.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Content/Text',
  component: Text,
  ...astryx('Text'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Text.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
