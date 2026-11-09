import ButtonGroup from 'astryx-astro/components/ButtonGroup/ButtonGroup.astro';
import Demo from 'astryx-astro/components/ButtonGroup/ButtonGroup.demo.astro';
import demoSource from 'astryx-astro/components/ButtonGroup/ButtonGroup.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Action/Button Group',
  component: ButtonGroup,
  ...astryx('ButtonGroup'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (ButtonGroup.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
