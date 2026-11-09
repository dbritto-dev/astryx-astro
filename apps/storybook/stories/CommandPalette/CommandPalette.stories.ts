import CommandPalette from 'astryx-astro/components/CommandPalette/CommandPalette.astro';
import Demo from 'astryx-astro/components/CommandPalette/CommandPalette.demo.astro';
import demoSource from 'astryx-astro/components/CommandPalette/CommandPalette.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Overlay/Command Palette',
  component: CommandPalette,
  ...astryx('CommandPalette'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (CommandPalette.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
