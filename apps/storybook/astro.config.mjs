import {defineConfig} from 'astro/config';
import astryx from 'astryx-astro/integration';
import containerLocals from './lib/containerLocals.mjs';

/**
 * @storybook-astro/framework reads this file for every render pipeline (dev, the static
 * prerender, addon-vitest): its integrations, `vite.plugins`, `scopedStyleStrategy` and
 * `compressHTML`. The prerender server is built with `configFile: false`, so other options only
 * reach it through an integration's `updateConfig()`.
 */
const storybookRendering = {
  name: 'astryx-storybook',
  hooks: {
    // Astro annotates elements with `data-astro-source-file="<absolute path>"` for its dev
    // toolbar whenever it renders in `serve` mode, which the prerender does. Stories must not
    // publish build-machine paths, and Storybook has no dev toolbar.
    'astro:config:setup': ({updateConfig}) => updateConfig({devToolbar: {enabled: false}}),
  },
};

export default defineConfig({
  // As apps/docs: demos' scoped <style> blocks compile to :where() selectors.
  scopedStyleStrategy: 'where',
  devToolbar: {enabled: false},
  integrations: [astryx(), storybookRendering],
  vite: {
    plugins: [containerLocals()],
    server: {fs: {allow: ['..', '../..']}},
  },
});
