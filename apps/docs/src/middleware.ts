import {defineMiddleware} from 'astro:middleware';

// Server-side theme for icon resolution (Icon reads Astro.locals.astryxTheme). The docs
// switch theme CSS in the browser; icon artwork is server-rendered with the neutral set.
export const onRequest = defineMiddleware((context, next) => {
  (context.locals as Record<string, unknown>).astryxTheme ??= 'neutral';
  return next();
});
