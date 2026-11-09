import DropdownMenu from 'astryx-astro/components/DropdownMenu/DropdownMenu.astro';
import Demo from 'astryx-astro/components/DropdownMenu/DropdownMenu.demo.astro';
import demoSource from 'astryx-astro/components/DropdownMenu/DropdownMenu.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Action/Dropdown Menu',
  component: DropdownMenu,
  ...astryx('DropdownMenu'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (DropdownMenu.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
