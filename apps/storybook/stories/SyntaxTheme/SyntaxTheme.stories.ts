import SyntaxTheme from 'astryx-astro/components/theme/SyntaxTheme.astro';
import Demo from 'astryx-astro/components/theme/SyntaxTheme.demo.astro';
import demoSource from 'astryx-astro/components/theme/SyntaxTheme.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Utility/Syntax Theme',
  component: SyntaxTheme,
  ...astryx('SyntaxTheme'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (SyntaxTheme.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
