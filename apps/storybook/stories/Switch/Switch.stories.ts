import Switch from 'astryx-astro/components/Switch/Switch.astro';
import Demo from 'astryx-astro/components/Switch/Switch.demo.astro';
import demoSource from 'astryx-astro/components/Switch/Switch.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Form Controls/Switch',
  component: Switch,
  ...astryx('Switch'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Switch.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
