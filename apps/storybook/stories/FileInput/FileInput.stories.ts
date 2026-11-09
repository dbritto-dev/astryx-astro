import FileInput from 'astryx-astro/components/FileInput/FileInput.astro';
import Demo from 'astryx-astro/components/FileInput/FileInput.demo.astro';
import demoSource from 'astryx-astro/components/FileInput/FileInput.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Form Controls/File Input',
  component: FileInput,
  ...astryx('FileInput'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (FileInput.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
