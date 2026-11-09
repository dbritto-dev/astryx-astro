import CodeBlock from 'astryx-astro/components/CodeBlock/CodeBlock.astro';
import Demo from 'astryx-astro/components/CodeBlock/CodeBlock.demo.astro';
import demoSource from 'astryx-astro/components/CodeBlock/CodeBlock.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Content/Code Block',
  component: CodeBlock,
  ...astryx('CodeBlock'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (CodeBlock.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
