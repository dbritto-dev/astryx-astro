import InputGroup from 'astryx-astro/components/InputGroup/InputGroup.astro';
import Demo from 'astryx-astro/components/InputGroup/InputGroup.demo.astro';
import demoSource from 'astryx-astro/components/InputGroup/InputGroup.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Form Controls/Input Group',
  component: InputGroup,
  ...astryx('InputGroup'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (InputGroup.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
