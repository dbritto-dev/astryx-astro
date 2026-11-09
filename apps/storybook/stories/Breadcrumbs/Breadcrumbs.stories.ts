import Breadcrumbs from 'astryx-astro/components/Breadcrumbs/Breadcrumbs.astro';
import Demo from 'astryx-astro/components/Breadcrumbs/Breadcrumbs.demo.astro';
import demoSource from 'astryx-astro/components/Breadcrumbs/Breadcrumbs.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Navigation/Breadcrumbs',
  component: Breadcrumbs,
  ...astryx('Breadcrumbs'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Breadcrumbs.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
