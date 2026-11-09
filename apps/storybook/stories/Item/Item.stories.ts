import Item from 'astryx-astro/components/Item/Item.astro';
import Demo from 'astryx-astro/components/Item/Item.demo.astro';
import demoSource from 'astryx-astro/components/Item/Item.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Table & List/Item',
  component: Item,
  ...astryx('Item'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Item.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
