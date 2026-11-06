/**
 * Root theme helpers for layouts.
 *
 * Astryx's root `<Theme>` writes `data-astryx-theme` and `data-theme` (unless `system`) onto
 * `<html>` from an effect; for SSR it asks apps to put them on `<html>` themselves so the
 * first paint is right. In Astro the layout owns `<html>`, so do that there and tell server
 * components which theme is active (Icon resolves theme icons from it):
 *
 *   // src/middleware.ts
 *   export const onRequest = (ctx, next) => { ctx.locals.astryxTheme = 'neutral'; return next(); };
 *
 *   // layout
 *   import {themeRootAttributes} from 'astryx-astro/components/theme/themeRoot';
 *   import 'astryx-astro/astryx.css';
 *   import 'astryx-astro/themes/neutral.css';
 *   <html lang="en" {...themeRootAttributes('neutral', 'system')}>
 *
 * A `<Theme>` with no `<Theme>` above it and no request theme (`Astro.locals.astryxTheme`)
 * is a root Theme: it also syncs the attributes onto `<html>` with a tiny inline script, as
 * Astryx's useRootThemeSync does (browser chrome, scrollbars and the canvas follow the mode).
 */
export type ThemeMode = 'light' | 'dark' | 'system';

/** A theme name, or a built theme object (anything with a `name`). */
export type ThemeInput = string | {name: string};

export const themeName = (theme: ThemeInput): string => (typeof theme === 'string' ? theme : theme.name);

/** Attributes for `<html>`: `data-astryx-theme`, and `data-theme` unless the mode is `system`. */
export function themeRootAttributes(theme: ThemeInput, mode: ThemeMode = 'system'): Record<string, string | undefined> {
  return {'data-astryx-theme': themeName(theme), 'data-theme': mode === 'system' ? undefined : mode};
}
