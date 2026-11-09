import Table from 'astryx-astro/components/Table/Table.astro';
import Demo from 'astryx-astro/components/Table/Table.demo.astro';
import demoSource from 'astryx-astro/components/Table/Table.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Table & List/Table',
  component: Table,
  ...astryx('Table'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Table.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
