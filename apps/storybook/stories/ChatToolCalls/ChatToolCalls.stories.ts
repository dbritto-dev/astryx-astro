import ChatToolCalls from 'astryx-astro/components/Chat/ChatToolCalls.astro';
import Demo from 'astryx-astro/components/Chat/ChatToolCalls.demo.astro';
import demoSource from 'astryx-astro/components/Chat/ChatToolCalls.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Chat/Chat Tool Calls',
  component: ChatToolCalls,
  ...astryx('ChatToolCalls'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (ChatToolCalls.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
