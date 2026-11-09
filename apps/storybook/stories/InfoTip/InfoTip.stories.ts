import InfoTip from 'astryx-astro/components/InfoTip/InfoTip.astro';
import Demo from 'astryx-astro/components/InfoTip/InfoTip.demo.astro';
import demoSource from 'astryx-astro/components/InfoTip/InfoTip.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Feedback & Status/Info Tip',
  component: InfoTip,
  ...astryx('InfoTip'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (InfoTip.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
