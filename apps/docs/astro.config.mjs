import {defineConfig} from 'astro/config';

export default defineConfig({
  site: 'https://dbritto-dev.github.io',
  base: process.env.DOCS_BASE ?? '/',
  // Component styles live in global, layered CSS files (see packages/astryx-astro/AGENTS.md),
  // so the docs only use scoped styles for their own chrome.
  scopedStyleStrategy: 'where',
  vite: {
    server: {fs: {allow: ['..', '../..']}},
  },
});
