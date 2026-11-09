import Theme from 'astryx-astro/components/theme/Theme.astro';
import Demo from 'astryx-astro/components/theme/Theme.demo.astro';
import demoSource from 'astryx-astro/components/theme/Theme.demo.astro?raw';
import {expect} from 'storybook/test';
import {astryx, composed, overview, type Meta} from '../_lib/story';
import ThemeMatrix from './ThemeMatrix.astro';
import matrixSource from './ThemeMatrix.astro?raw';
import ThemeStory from './ThemeStory.astro';
import storySource from './ThemeStory.astro?raw';

const meta = {
  title: 'Utility/Theme',
  component: Theme,
  ...astryx('Theme'),
  args: {theme: 'butter'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Theme.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {controls: ['theme', 'mode', 'nestedTheme', 'nestedMode'], source: storySource};
type Canvas = {getByTestId: (id: string) => HTMLElement};
const accent = (el: Element) => getComputedStyle(el.querySelector('.astryx-button[data-variant="primary"], button')!).backgroundColor;

/**
 * `theme="butter"` on a subtree: its own tokens and body font, next to the page theme. The default
 * `mode="system"` follows the OS preference, not the page's mode. The story's Theme is nested under the page's request theme, so it
 * never rewrites `<html>`.
 */
export const Butter = composed(ThemeStory, {
  args: {theme: 'butter'},
  play: async ({canvas}) => {
    const wrapper = canvas.getByTestId('theme-card').closest('[data-astryx-theme]')!;
    await expect(wrapper).toHaveAttribute('data-astryx-theme', 'butter');
    await expect(wrapper).not.toHaveAttribute('data-theme');
    await expect(getComputedStyle(wrapper).display).toBe('contents');
    await expect(accent(canvas.getByTestId('theme-card'))).not.toBe(accent(canvas.getByTestId('page-card')));
    await expect(document.documentElement).not.toHaveAttribute('data-astryx-theme', 'butter');
  },
}, options);

/** `mode="dark"`: the subtree resolves the dark side whatever the page mode. */
export const MatchaDark = composed(ThemeStory, {
  args: {theme: 'matcha', mode: 'dark'},
  play: async ({canvas}) => {
    const wrapper = canvas.getByTestId('theme-card').closest('[data-astryx-theme]')!;
    await expect(wrapper).toHaveAttribute('data-theme', 'dark');
    await expect(getComputedStyle(canvas.getByTestId('theme-card')).colorScheme).toBe('dark');
  },
}, options);

/** `mode="light"`: the light side even when the page is dark. */
export const GothicLight = composed(ThemeStory, {
  args: {theme: 'gothic', mode: 'light'},
  globals: {astryxMode: 'dark'},
  play: async ({canvas}) => {
    await expect(getComputedStyle(canvas.getByTestId('theme-card')).colorScheme).toBe('light');
  },
}, options);

/** A nested Theme starts its own scope: the inner theme's tokens apply inside it. */
export const Nested = composed(ThemeStory, {
  args: {theme: 'butter', nestedTheme: 'gothic', nestedMode: 'dark'},
  play: async ({canvas}) => {
    const outer = canvas.getByTestId('theme-card');
    const inner = canvas.getByTestId('nested-card');
    await expect(inner.closest('[data-astryx-theme]')).toHaveAttribute('data-astryx-theme', 'gothic');
    await expect(getComputedStyle(inner).colorScheme).toBe('dark');
    await expect(accent(inner)).not.toBe(accent(outer));
  },
}, options);

/** The seven shipped themes, light. */
export const AllThemesLight = composed(ThemeMatrix, {args: {mode: 'light'}}, {controls: ['mode'], source: matrixSource});

/** The seven shipped themes, dark. */
export const AllThemesDark = composed(ThemeMatrix, {args: {mode: 'dark'}}, {controls: ['mode'], source: matrixSource});
