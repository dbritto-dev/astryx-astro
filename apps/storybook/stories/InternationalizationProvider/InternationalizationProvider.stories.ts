import InternationalizationProvider from 'astryx-astro/components/i18n/InternationalizationProvider.astro';
import Demo from 'astryx-astro/components/i18n/InternationalizationProvider.demo.astro';
import demoSource from 'astryx-astro/components/i18n/InternationalizationProvider.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Utility/Internationalization Provider',
  component: InternationalizationProvider,
  ...astryx('InternationalizationProvider'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (InternationalizationProvider.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
