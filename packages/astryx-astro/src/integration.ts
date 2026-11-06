/**
 * Astro integration for astryx-astro.
 *
 *   // astro.config.mjs
 *   import astryx from 'astryx-astro/integration';
 *   export default defineConfig({integrations: [astryx()]});
 *
 * Why: the components load their client modules (`src/elements/*.ts`) from the package
 * source. In `astro dev`, Vite pre-bundles anything an app imports directly (for example
 * `import {toast} from 'astryx-astro/elements/toast'`) into a separate copy, so the app and
 * the components would talk to two instances of the same runtime. Excluding the package from
 * dependency pre-bundling keeps one instance. Production builds are unaffected either way.
 */
import type {AstroIntegration} from 'astro';

export default function astryx(): AstroIntegration {
  return {
    name: 'astryx-astro',
    hooks: {
      'astro:config:setup': ({updateConfig}) => {
        updateConfig({vite: {optimizeDeps: {exclude: ['astryx-astro']}}});
      },
    },
  };
}
