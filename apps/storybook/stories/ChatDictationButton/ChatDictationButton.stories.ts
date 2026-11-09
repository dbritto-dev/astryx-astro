import ChatDictationButton from 'astryx-astro/components/Chat/ChatDictationButton.astro';
import Demo from 'astryx-astro/components/Chat/ChatDictationButton.demo.astro';
import demoSource from 'astryx-astro/components/Chat/ChatDictationButton.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import ChatDictationButtonStory from './ChatDictationButtonStory.astro';
import storySource from './ChatDictationButtonStory.astro?raw';

const meta = {
  title: 'Chat/Chat Dictation Button',
  component: ChatDictationButton,
  ...astryx('ChatDictationButton'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (ChatDictationButton.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/** Whether this browser has the Web Speech API (the stories adapt: Chrome and Safari do, Firefox does not). */
const hasSpeechRecognition = () => 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;

/** Idle: a ghost microphone button named "Start dictation"; hidden where the browser has no speech recognition. */
export const Default: Story = {
  play: async ({canvasElement}) => {
    const host = await upgraded<HTMLElement>(canvasElement, 'ax-chat-dictation-button');
    const button = host.querySelector('button')!;
    if (!hasSpeechRecognition()) {
      await waitFor(() => expect(host).not.toBeVisible());
      return;
    }
    await waitFor(() => expect(button).toBeEnabled());
    await expect(host).toBeVisible();
    await expect(button).toHaveAccessibleName('Start dictation');
    await expect(host.querySelector('.ax-chat-dictation-bars')).not.toBeVisible();
  },
};

export const Small: Story = {args: {size: 'sm', isHiddenWhenUnsupported: false}};

/** `isHiddenWhenUnsupported={false}`: always shown; disabled where the browser has no speech recognition. */
export const KeptWhenUnsupported: Story = {
  args: {isHiddenWhenUnsupported: false},
  play: async ({canvasElement}) => {
    const host = await upgraded<HTMLElement>(canvasElement, 'ax-chat-dictation-button');
    const button = host.querySelector('button')!;
    await expect(host).toBeVisible();
    await expect(button).toHaveAccessibleName('Start dictation');
    if (hasSpeechRecognition()) await waitFor(() => expect(button).toBeEnabled());
    else await expect(button).toBeDisabled();
  },
};

/** `label` overrides the accessible name in both states. */
export const CustomLabel: Story = {
  args: {label: 'Voice note', isHiddenWhenUnsupported: false},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('button', {name: 'Voice note'})).toBeVisible();
  },
};

/** A stand-in for the Web Speech API, so the play never touches the microphone. */
class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = '';
  continuous = true;
  interimResults = true;
  onstart?: () => void;
  onend?: () => void;
  onresult?: (event: unknown) => void;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {
    setTimeout(() => this.onstart?.(), 0);
  }
  stop() {
    setTimeout(() => this.onend?.(), 0);
  }
  abort() {
    setTimeout(() => this.onend?.(), 0);
  }
  emit(transcript: string, isFinal: boolean) {
    const result = Object.assign([{transcript}], {isFinal});
    this.onresult?.({resultIndex: 0, results: Object.assign([result], {length: 1})});
  }
}

/** Install FakeRecognition and a microphone that is never available while `run` runs. */
async function withFakeSpeech(run: () => Promise<void>) {
  const recognition = Object.getOwnPropertyDescriptor(window, 'SpeechRecognition');
  const media = navigator.mediaDevices;
  const getUserMedia = media ? Object.getOwnPropertyDescriptor(media, 'getUserMedia') : undefined;
  Object.defineProperty(window, 'SpeechRecognition', {value: FakeRecognition, configurable: true, writable: true});
  if (media) Object.defineProperty(media, 'getUserMedia', {value: () => Promise.reject(new Error('no microphone in stories')), configurable: true});
  try {
    await run();
  } finally {
    if (recognition) Object.defineProperty(window, 'SpeechRecognition', recognition);
    else delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    if (media) {
      if (getUserMedia) Object.defineProperty(media, 'getUserMedia', getUserMedia);
      else delete (media as unknown as Record<string, unknown>).getUserMedia;
    }
  }
}

/**
 * In a composer it dictates into the composer's input. The play drives it with a stand-in
 * for the Web Speech API (real recognition needs a microphone): listening swaps the icon for
 * level bars and the name to "Stop dictation", interim results show as ghost text, a final
 * result is inserted into the draft, and stopping returns to idle. Not covered: real speech,
 * the volume-reactive bars and the start/stop sounds.
 */
export const InComposer = composed(
  ChatDictationButtonStory,
  {
    play: async ({canvasElement, step}) => {
      const host = await upgraded<HTMLElement>(canvasElement, 'ax-chat-dictation-button');
      const input = await upgraded<HTMLElement & {value: string}>(canvasElement, 'ax-chat-composer-input');
      const button = host.querySelector('button')!;
      if (!hasSpeechRecognition()) {
        await waitFor(() => expect(host).not.toBeVisible());
        return;
      }
      await waitFor(() => expect(button).toBeEnabled());
      const events: string[] = [];
      for (const type of ['astryx-dictation-start', 'astryx-transcript', 'astryx-dictation-result', 'astryx-dictation-end']) {
        canvasElement.addEventListener(type, (event) => {
          const detail = (event as CustomEvent<{transcript?: string; isFinal?: boolean}>).detail;
          events.push([type, detail?.transcript ?? '', detail?.isFinal ?? ''].join(':'));
        });
      }
      const interim = () => input.querySelector('[data-astryx-dictation-interim]');

      await withFakeSpeech(async () => {
        await step('Starting listens: "Stop dictation", bars replace the microphone', async () => {
          await userEvent.click(button);
          await waitFor(() => expect(button).toHaveAccessibleName('Stop dictation'));
          await expect(host.querySelector('.ax-chat-dictation-bars')).toBeVisible();
          await expect(button.querySelector('[data-ax-chat-icon="microphone"]')).not.toBeVisible();
          await expect(FakeRecognition.last?.lang).toBe('en');
        });

        await step('Interim results are ghost text; a final result goes into the draft', async () => {
          FakeRecognition.last!.emit('hello wor', false);
          await waitFor(() => expect(interim()).toHaveTextContent('hello wor'));
          await expect(input.value).toBe('');
          FakeRecognition.last!.emit('hello world', true);
          await waitFor(() => expect(input.value).toBe('hello world '));
          await expect(interim()?.textContent ?? '').toBe('');
        });

        await step('Stopping returns to idle', async () => {
          await userEvent.click(button);
          await waitFor(() => expect(button).toHaveAccessibleName('Start dictation'));
          await expect(host.querySelector('.ax-chat-dictation-bars')).not.toBeVisible();
          await expect(interim()).toBeNull();
        });
      });

      await expect(events).toEqual([
        'astryx-dictation-start::',
        'astryx-transcript:hello wor:false',
        'astryx-dictation-result:hello world:',
        'astryx-transcript:hello world:true',
        'astryx-dictation-end::',
      ]);
    },
  },
  {controls: ['size', 'isHiddenWhenUnsupported'], source: storySource},
);
