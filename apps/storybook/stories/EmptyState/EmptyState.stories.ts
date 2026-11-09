import EmptyState from 'astryx-astro/components/EmptyState/EmptyState.astro';
import Demo from 'astryx-astro/components/EmptyState/EmptyState.demo.astro';
import demoSource from 'astryx-astro/components/EmptyState/EmptyState.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Content/Empty State',
  component: EmptyState,
  ...astryx('EmptyState'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (EmptyState.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
