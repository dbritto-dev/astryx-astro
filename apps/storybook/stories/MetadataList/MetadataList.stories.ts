import MetadataList from 'astryx-astro/components/MetadataList/MetadataList.astro';
import Demo from 'astryx-astro/components/MetadataList/MetadataList.demo.astro';
import demoSource from 'astryx-astro/components/MetadataList/MetadataList.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Table & List/Metadata List',
  component: MetadataList,
  ...astryx('MetadataList'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (MetadataList.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
