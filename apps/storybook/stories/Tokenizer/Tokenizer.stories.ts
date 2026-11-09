import Tokenizer from 'astryx-astro/components/Tokenizer/Tokenizer.astro';
import Demo from 'astryx-astro/components/Tokenizer/Tokenizer.demo.astro';
import demoSource from 'astryx-astro/components/Tokenizer/Tokenizer.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Form Controls/Tokenizer',
  component: Tokenizer,
  ...astryx('Tokenizer'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Tokenizer.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
