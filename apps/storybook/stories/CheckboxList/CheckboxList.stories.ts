import CheckboxList from 'astryx-astro/components/CheckboxList/CheckboxList.astro';
import Demo from 'astryx-astro/components/CheckboxList/CheckboxList.demo.astro';
import demoSource from 'astryx-astro/components/CheckboxList/CheckboxList.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Form Controls/Checkbox List',
  component: CheckboxList,
  ...astryx('CheckboxList'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (CheckboxList.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
