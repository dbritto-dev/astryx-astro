import Thumbnail from 'astryx-astro/components/Thumbnail/Thumbnail.astro';
import Demo from 'astryx-astro/components/Thumbnail/Thumbnail.demo.astro';
import demoSource from 'astryx-astro/components/Thumbnail/Thumbnail.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Content/Thumbnail',
  component: Thumbnail,
  ...astryx('Thumbnail'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Thumbnail.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
