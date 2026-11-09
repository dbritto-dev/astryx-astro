import AppShell from 'astryx-astro/components/AppShell/AppShell.astro';
import Demo from 'astryx-astro/components/AppShell/AppShell.demo.astro';
import demoSource from 'astryx-astro/components/AppShell/AppShell.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Layout/App Shell',
  component: AppShell,
  ...astryx('AppShell'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (AppShell.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
