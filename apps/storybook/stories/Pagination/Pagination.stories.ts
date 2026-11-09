import Pagination from 'astryx-astro/components/Pagination/Pagination.astro';
import Demo from 'astryx-astro/components/Pagination/Pagination.demo.astro';
import demoSource from 'astryx-astro/components/Pagination/Pagination.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Navigation/Pagination',
  component: Pagination,
  ...astryx('Pagination'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Pagination.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
