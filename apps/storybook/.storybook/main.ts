import type {StorybookConfig} from '@storybook-astro/framework';

// `storybook build` runs with NODE_ENV=production (dev: development, vitest: test).
const isStaticBuild = process.env.NODE_ENV === 'production';

const config: StorybookConfig = {
  stories: [
    '../stories/**/*.mdx',
    '../stories/**/*.stories.ts',
    // Hidden; makes the static build bundle every component <script> (see the file).
    ...(isStaticBuild ? ['./script-registry/ScriptRegistry.stories.ts'] : []),
  ],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-vitest'],
  framework: {
    name: '@storybook-astro/framework',
    options: {
      // `storybook build` pre-renders every story into astro-prerendered-stories.json (GitHub
      // Pages is static). `storybook dev` always renders on demand.
      renderMode: 'static',
      // Sanitizing exists for render servers that take requests from anyone (server mode). Here
      // every slot string is written in a story file or typed into a local dev Controls panel,
      // and slot HTML needs what the default allowlist strips (buttons, inputs, data-* hooks).
      sanitization: {enabled: false},
    },
  },
  // Browser-only annotations; preview.ts is also loaded by the server-side prerender.
  previewAnnotations: (entries = []) => [...entries, './.storybook/preview.browser.ts'],
  core: {disableTelemetry: true},
  viteFinal(config) {
    // Pre-bundle what the preview imports lazily, so Vite never discovers a dependency mid-run
    // and reloads the page (that reload aborts @storybook/addon-vitest test collection).
    config.optimizeDeps ??= {};
    config.optimizeDeps.include = [...(config.optimizeDeps.include ?? []), 'storybook/actions', 'storybook/test', '@storybook/addon-docs/blocks'];
    // The dependency scan reads code samples inside demos (CodeBlock.demo.astro shows
    // `import {useState} from 'react'`) and resolves them from astryx-astro, which has no React:
    // the scan fails and Vite optimizes on the fly instead. Resolve React from this app.
    config.resolve ??= {};
    config.resolve.dedupe = [...(config.resolve.dedupe ?? []), 'react', 'react-dom'];
    return config;
  },
};

export default config;
