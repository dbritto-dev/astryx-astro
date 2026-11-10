import MediaTheme from 'astryx-astro/components/theme/MediaTheme.astro';
import Demo from 'astryx-astro/components/theme/MediaTheme.demo.astro';
import demoSource from 'astryx-astro/components/theme/MediaTheme.demo.astro?raw';
import {expect, waitFor} from 'storybook/test';
import {astryx, composed, overview, type Meta} from '../_lib/story';
import MediaThemeStory from './MediaThemeStory.astro';
import storySource from './MediaThemeStory.astro?raw';

const meta = {
  title: 'Utility/Media Theme',
  component: MediaTheme,
  ...astryx('MediaTheme'),
  args: {mode: 'dark'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (MediaTheme.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {controls: ['mode', 'fallback', 'surface'], source: storySource};
const context = (root: HTMLElement) => root.querySelector('.ax-media-theme')!;

/** `mode="dark"` on the inverted surface: text, icons and accents take the on-dark colors. */
export const Dark = composed(MediaThemeStory, {
  args: {mode: 'dark'},
  play: async ({canvas, canvasElement}) => {
    await expect(context(canvasElement)).toHaveAttribute('data-astryx-media', 'dark');
    await expect(getComputedStyle(canvas.getByTestId('title')).colorScheme).toBe('dark');
  },
}, options);

/** `mode="light"` on a pale surface. */
export const Light = composed(MediaThemeStory, {
  args: {mode: 'light', surface: '#f4f1ea'},
  play: async ({canvas, canvasElement}) => {
    await expect(context(canvasElement)).toHaveAttribute('data-astryx-media', 'light');
    await expect(getComputedStyle(canvas.getByTestId('title')).colorScheme).toBe('light');
  },
}, options);

/** `mode="auto"` measures the parent's surface: on a deep blue it picks the dark side. */
export const AutoOnDeepBlue = composed(MediaThemeStory, {
  args: {mode: 'auto', surface: '#0d2b52'},
  play: async ({canvasElement}) => {
    await waitFor(() => expect(context(canvasElement)).toHaveAttribute('data-astryx-media', 'dark'));
  },
}, options);

/** `mode="auto"` on a pale yellow: not the dark side. */
export const AutoOnPaleYellow = composed(MediaThemeStory, {
  args: {mode: 'auto', surface: '#fff3b0', fallback: 'dark'},
  play: async ({canvasElement}) => {
    await waitFor(() => expect(context(canvasElement)).not.toHaveAttribute('data-astryx-media', 'dark'));
  },
}, options);

/** `mode="auto"` over a gradient (a background-image cannot be measured): the `fallback` stays. */
export const AutoOverGradient = composed(MediaThemeStory, {
  args: {mode: 'auto', fallback: 'dark', surface: 'linear-gradient(135deg,#1d2b64,#f8cdda)'},
  play: async ({canvasElement}) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(context(canvasElement)).toHaveAttribute('data-astryx-media', 'dark');
  },
}, options);

/** `mode="off"`: the same element without a media context; the ambient theme applies. */
export const Off = composed(MediaThemeStory, {
  args: {mode: 'off', surface: 'var(--color-background-muted)'},
  play: async ({canvasElement}) => {
    await expect(context(canvasElement)).not.toHaveAttribute('data-astryx-media');
  },
}, options);
