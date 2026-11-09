import AvatarGroup from 'astryx-astro/components/AvatarGroup/AvatarGroup.astro';
import Demo from 'astryx-astro/components/AvatarGroup/AvatarGroup.demo.astro';
import demoSource from 'astryx-astro/components/AvatarGroup/AvatarGroup.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Content/Avatar Group',
  component: AvatarGroup,
  ...astryx('AvatarGroup'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (AvatarGroup.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
