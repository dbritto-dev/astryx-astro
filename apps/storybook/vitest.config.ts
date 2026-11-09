/**
 * `pnpm -F storybook test`: every story becomes a Vitest browser test (@storybook/addon-vitest).
 * Each story renders through the framework's dev pipeline (Astro Container API, the same
 * locals and script ordering as `storybook dev`), its play function runs, and addon-a11y runs
 * axe on it (`parameters.a11y.test: 'todo'` reports violations without failing).
 *
 * Chrome comes from CHROME_PATH (default /usr/bin/google-chrome) so no Playwright browser
 * download is needed. The static build is verified separately: `pnpm -F storybook verify`.
 * The hidden script-registry story is only part of `storybook build` (see .storybook/main.ts).
 */
import {storybookTest} from '@storybook/addon-vitest/vitest-plugin';
import {playwright} from '@vitest/browser-playwright';
import {defineConfig} from 'vitest/config';

export default defineConfig({
  plugins: [storybookTest({configDir: '.storybook'})],
  test: {
    name: 'storybook',
    testTimeout: 30_000,
    // test-results/vitest.json carries addon-a11y's axe results: `pnpm -F storybook a11y` sums them up.
    reporters: ['default', 'json'],
    outputFile: {json: 'test-results/vitest.json'},
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: {executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox']},
      }),
      instances: [{browser: 'chromium'}],
    },
  },
});
