import ChatLayout from 'astryx-astro/components/Chat/ChatLayout.astro';
import Demo from 'astryx-astro/components/Chat/Chat.demo.astro';
import demoSource from 'astryx-astro/components/Chat/Chat.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Chat/Chat',
  component: ChatLayout,
  ...astryx('Chat'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Chat.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
