import RadioList from 'astryx-astro/components/RadioList/RadioList.astro';
import Demo from 'astryx-astro/components/RadioList/RadioList.demo.astro';
import demoSource from 'astryx-astro/components/RadioList/RadioList.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Form Controls/Radio List',
  component: RadioList,
  ...astryx('RadioList'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (RadioList.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
