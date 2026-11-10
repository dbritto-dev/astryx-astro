import SyntaxTheme from 'astryx-astro/components/theme/SyntaxTheme.astro';
import Demo from 'astryx-astro/components/theme/SyntaxTheme.demo.astro';
import demoSource from 'astryx-astro/components/theme/SyntaxTheme.demo.astro?raw';
import {expect} from 'storybook/test';
import {astryx, composed, overview, type Meta, knownA11y} from '../_lib/story';
import SyntaxThemeStory from './SyntaxThemeStory.astro';
import storySource from './SyntaxThemeStory.astro?raw';

const meta = {
  title: 'Utility/Syntax Theme',
  component: SyntaxTheme,
  ...astryx('SyntaxTheme', knownA11y({
    "color-contrast": "Third-party syntax palettes (Solarized, Dracula, Nord, Tokyo Night, Catppuccin) as Astryx ships them; colours are kept (docs/accessibility.md)."
  })),
  args: {theme: 'dracula'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (SyntaxTheme.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {controls: ['theme'], source: storySource};
const keyword = (root: HTMLElement) => getComputedStyle(root.querySelector('[data-testid="keyword"]')!).color;

/** `theme="dracula"`: a preset (styled by the package's syntax stylesheet). */
export const Dracula = composed(SyntaxThemeStory, {
  args: {theme: 'dracula'},
  play: async ({canvasElement}) => {
    await expect(canvasElement.querySelector('[data-astryx-syntax-theme]')).toHaveAttribute('data-astryx-syntax-theme', 'dracula');
    await expect(keyword(canvasElement)).toBe('rgb(255, 121, 198)');
  },
}, options);

/** `theme="github-light"`. */
export const GithubLight = composed(SyntaxThemeStory, {
  args: {theme: 'github-light'},
  play: async ({canvasElement}) => {
    await expect(keyword(canvasElement)).toBe('rgb(207, 34, 46)');
  },
}, options);

export const Nord = composed(SyntaxThemeStory, {args: {theme: 'nord'}}, options);

export const TokyoNight = composed(SyntaxThemeStory, {args: {theme: 'tokyo-night'}}, options);

export const SolarizedLight = composed(SyntaxThemeStory, {args: {theme: 'solarized-light'}}, options);

export const CatppuccinMocha = composed(SyntaxThemeStory, {args: {theme: 'catppuccin-mocha'}}, options);

/** A `defineSyntaxTheme()` object writes its tokens inline (light / dark pairs). */
export const CustomDefinition = composed(SyntaxThemeStory, {
  args: {theme: 'brand'},
  globals: {astryxMode: 'light'},
  play: async ({canvasElement}) => {
    await expect(canvasElement.querySelector('[data-astryx-syntax-theme]')).toHaveAttribute('data-astryx-syntax-theme', 'brand');
    await expect(keyword(canvasElement)).toBe('rgb(123, 44, 191)');
  },
}, options);
