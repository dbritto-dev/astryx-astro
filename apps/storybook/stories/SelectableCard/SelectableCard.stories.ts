import SelectableCard from 'astryx-astro/components/SelectableCard/SelectableCard.astro';
import Demo from 'astryx-astro/components/SelectableCard/SelectableCard.demo.astro';
import demoSource from 'astryx-astro/components/SelectableCard/SelectableCard.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Container/Selectable Card',
  component: SelectableCard,
  ...astryx('SelectableCard'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (SelectableCard.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
