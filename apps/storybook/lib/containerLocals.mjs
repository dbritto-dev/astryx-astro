/**
 * Default `Astro.locals` for every Storybook render.
 *
 * An Astro app sets request locals in middleware (apps/docs/src/middleware.ts sets
 * `astryxTheme`), and astryx-astro components read them: Icon and Indicator resolve artwork
 * from `Astro.locals.astryxTheme`, translated strings from `astryxLocale`. Storybook renders
 * through the Astro Container API instead, one `renderToString()` per story, slot component
 * and decorator, with no middleware and no way to pass `locals` (@storybook-astro/framework
 * 1.15). Without them Icon draws the built-in default glyphs instead of the theme's Lucide
 * set, so stories would not match the docs site.
 *
 * This Vite plugin gives every container render default locals through the container's own
 * public `renderToResponse(component, {locals})` option (renderToString calls it), by
 * appending a small wrapper to `astro/container`. It runs in every pipeline that renders
 * Astro (dev SSR server, static prerender, addon-vitest) because the framework loads
 * `vite.plugins` from astro.config.mjs into each of them and keeps `astro` in Vite's SSR
 * graph. Locals a caller passes still win.
 *
 * The values match the docs middleware: the neutral icon set (all seven shipped themes map
 * the same Lucide icons, so the client-side theme switch is exact), and English strings.
 * Other locales are pre-rendered per story with <InternationalizationProvider> in a story
 * wrapper (see STORIES.md).
 */
export const storybookLocals = Object.freeze({astryxTheme: 'neutral', astryxLocale: 'en'});

const CONTAINER_MODULE = /[\\/]astro[\\/]dist[\\/]container[\\/]index\.js$/;
const CONTAINER_CLASS = 'export class experimental_AstroContainer';

export default function containerLocals(locals = storybookLocals) {
  return {
    name: 'astryx-storybook:container-locals',
    transform(code, id) {
      if (!CONTAINER_MODULE.test(id.split('?')[0])) return null;
      // Fail the build rather than silently render stories without locals if Astro changes.
      if (!code.includes(CONTAINER_CLASS)) {
        this.error(`astro/container no longer declares \`${CONTAINER_CLASS}\`; update apps/storybook/lib/containerLocals.mjs`);
      }
      return `${code}
;{
  const proto = experimental_AstroContainer.prototype;
  const renderToResponse = proto.renderToResponse;
  proto.renderToResponse = function (component, options = {}) {
    return renderToResponse.call(this, component, {...options, locals: {...${JSON.stringify(locals)}, ...options.locals}});
  };
}
`;
    },
  };
}
