import Markdown from 'astryx-astro/components/Markdown/Markdown.astro';
import Demo from 'astryx-astro/components/Markdown/Markdown.demo.astro';
import demoSource from 'astryx-astro/components/Markdown/Markdown.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Content/Markdown',
  component: Markdown,
  ...astryx('Markdown'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Markdown.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
