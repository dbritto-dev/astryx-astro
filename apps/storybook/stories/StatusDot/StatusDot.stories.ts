import StatusDot from 'astryx-astro/components/StatusDot/StatusDot.astro';
import Demo from 'astryx-astro/components/StatusDot/StatusDot.demo.astro';
import demoSource from 'astryx-astro/components/StatusDot/StatusDot.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Feedback & Status/Status Dot',
  component: StatusDot,
  ...astryx('StatusDot'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (StatusDot.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
