import ChatDictationButton from 'astryx-astro/components/Chat/ChatDictationButton.astro';
import Demo from 'astryx-astro/components/Chat/ChatDictationButton.demo.astro';
import demoSource from 'astryx-astro/components/Chat/ChatDictationButton.demo.astro?raw';
import {astryx, overview, type Meta} from '../_lib/story';

const meta = {
  title: 'Chat/Chat Dictation Button',
  component: ChatDictationButton,
  ...astryx('ChatDictationButton'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (ChatDictationButton.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
