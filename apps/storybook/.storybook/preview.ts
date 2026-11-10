/**
 * Preview annotations shared by the browser and the static prerender.
 *
 * @storybook-astro/framework loads this file on the server too (to compose global decorators
 * and parameters while pre-rendering), so it must not touch `document` or `window` at import
 * time. Browser-only annotations live in ./preview.browser.ts (added in main.ts).
 */
import 'astryx-astro/astryx.css';
import 'astryx-astro/themes/neutral.css';
import 'astryx-astro/themes/butter.css';
import 'astryx-astro/themes/chocolate.css';
import 'astryx-astro/themes/gothic.css';
import 'astryx-astro/themes/matcha.css';
import 'astryx-astro/themes/stone.css';
import 'astryx-astro/themes/y2k.css';
import 'astryx-astro/themes/neutral.fonts.css';
import 'astryx-astro/themes/butter.fonts.css';
import 'astryx-astro/themes/chocolate.fonts.css';
import 'astryx-astro/themes/gothic.fonts.css';
import 'astryx-astro/themes/matcha.fonts.css';
import 'astryx-astro/themes/stone.fonts.css';
import 'astryx-astro/themes/y2k.fonts.css';
import './preview.css';
import type {AstroRenderer} from '@storybook-astro/framework';
import type {ProjectAnnotations} from 'storybook/internal/types';
import {themeRootAttributes, type ThemeMode} from 'astryx-astro/components/theme/themeRoot';

/** The seven published Astryx themes (`data-astryx-theme` values of astryx-astro/themes/*.css). */
const themes = ['neutral', 'butter', 'chocolate', 'gothic', 'matcha', 'stone', 'y2k'];

/**
 * Theme and mode are applied in the browser, on the preview's <html>, exactly as a layout does
 * with `themeRootAttributes()`, so they work on the pre-rendered static build. Server-rendered
 * output does not depend on them: every shipped theme maps the same Lucide icon set and no
 * indicator overrides, and stories render with `astryxTheme: 'neutral'` (lib/containerLocals.mjs).
 */
function applyTheme(theme: string, mode: ThemeMode) {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(themeRootAttributes(theme, mode))) {
    if (value == null) root.removeAttribute(name);
    else root.setAttribute(name, value);
  }
}

const preview: ProjectAnnotations<AstroRenderer> = {
  tags: ['autodocs'],

  globalTypes: {
    astryxTheme: {
      description: 'Astryx theme (data-astryx-theme on <html>)',
      toolbar: {title: 'Theme', icon: 'paintbrush', items: themes.map((value) => ({value, title: value})), dynamicTitle: true},
    },
    astryxMode: {
      description: 'Color mode (data-theme on <html>; system follows prefers-color-scheme)',
      toolbar: {
        title: 'Mode',
        icon: 'mirror',
        items: [
          {value: 'system', title: 'System', icon: 'browser'},
          {value: 'light', title: 'Light', icon: 'sun'},
          {value: 'dark', title: 'Dark', icon: 'moon'},
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {astryxTheme: 'neutral', astryxMode: 'system'},

  parameters: {
    layout: 'padded',
    options: {
      storySort: {
        order: ['Introduction', 'Layout', 'Content', 'Action', 'Form Controls', 'Container', 'Feedback & Status', 'Navigation', 'Overlay', 'Table & List', 'Chat', 'Utility'],
      },
    },
    // The static build pre-renders each story once: Controls could not change it, so the panel
    // is hidden there (and the docs page shows a read-only props table, see preview.browser.ts).
    // `storybook dev` renders on demand and keeps them.
    controls: {disable: import.meta.env.PROD, expanded: true},
    // Themes own the canvas background (preview.css); the backgrounds toolbar would fight them.
    backgrounds: {disable: true},
    // An axe violation fails the story's test. Findings kept on purpose (Astryx's colours,
    // WCAG-exempt disabled text, naming axe misreads) are turned off per story with knownA11y(),
    // each with its reason: packages/astryx-astro/docs/accessibility.md.
    a11y: {test: 'error'},
    docs: {codePanel: true},
  },

  beforeEach({globals}) {
    applyTheme(String(globals.astryxTheme ?? 'neutral'), (globals.astryxMode ?? 'system') as ThemeMode);
  },
};

export default preview;
