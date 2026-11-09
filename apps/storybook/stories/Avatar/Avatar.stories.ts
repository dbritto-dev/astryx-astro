import Avatar from 'astryx-astro/components/Avatar/Avatar.astro';
import Demo from 'astryx-astro/components/Avatar/Avatar.demo.astro';
import demoSource from 'astryx-astro/components/Avatar/Avatar.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Content/Avatar',
  component: Avatar,
  ...astryx('Avatar'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Avatar.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
