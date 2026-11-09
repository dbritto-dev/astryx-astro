import LinkProvider from 'astryx-astro/components/LinkProvider/LinkProvider.astro';
import Demo from 'astryx-astro/components/LinkProvider/LinkProvider.demo.astro';
import demoSource from 'astryx-astro/components/LinkProvider/LinkProvider.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Utility/Link Provider',
  component: LinkProvider,
  ...astryx('LinkProvider'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (LinkProvider.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
