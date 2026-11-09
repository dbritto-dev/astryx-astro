import Link from 'astryx-astro/components/Link/Link.astro';
import Demo from 'astryx-astro/components/Link/Link.demo.astro';
import demoSource from 'astryx-astro/components/Link/Link.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Action/Link',
  component: Link,
  ...astryx('Link'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Link.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
