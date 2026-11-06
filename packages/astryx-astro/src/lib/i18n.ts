/**
 * Server-side translation using Astryx's own ICU catalogs (src/locales, generated).
 *
 * Locale resolution, first match wins:
 *   1. a component's explicit `locale` prop (when it has one)
 *   2. `Astro.locals.astryxLocale` (set it in middleware for app-wide control)
 *   3. `Astro.currentLocale` (Astro i18n routing)
 *   4. 'en'
 * Missing keys fall back to English, then to the key itself, like Astryx's englishFallback.
 *
 * Client-side elements never translate: components render the strings they need into
 * data attributes or hidden templates on the server.
 */
import {IntlMessageFormat} from 'intl-messageformat';
import en from '../locales/en.json';

type Catalog = Record<string, string>;
const catalogs = import.meta.glob<Catalog>('../locales/*.json', {eager: true, import: 'default'});
const byLocale = new Map<string, Catalog>(
  Object.entries(catalogs).map(([path, cat]) => [path.split('/').pop()!.replace('.json', ''), cat]),
);
const english = en as Catalog;

/** BCP-47 tag → the closest shipped catalog ('es' → 'es-ES', 'pt' → 'pt-BR'). */
export function resolveCatalogLocale(locale: string | undefined): string {
  if (!locale) return 'en';
  if (byLocale.has(locale)) return locale;
  const lang = locale.split('-')[0].toLowerCase();
  if (lang === 'en') return 'en';
  for (const key of byLocale.keys()) if (key.split('-')[0].toLowerCase() === lang) return key;
  return 'en';
}

export interface AstroLike {
  currentLocale?: string | undefined;
  locals?: Record<string, unknown>;
}

export function resolveLocale(astro?: AstroLike, explicit?: string): string {
  return explicit ?? (astro?.locals?.astryxLocale as string | undefined) ?? astro?.currentLocale ?? 'en';
}

const cache = new Map<string, IntlMessageFormat>();

export type Translate = (key: string, values?: Record<string, unknown>) => string;

/** `const t = translator(Astro); t('@astryx.pagination.nextBy', {step: 2})` */
export function translator(astro?: AstroLike, explicitLocale?: string): Translate {
  const locale = resolveLocale(astro, explicitLocale);
  const catalogLocale = resolveCatalogLocale(locale);
  const catalog = byLocale.get(catalogLocale) ?? english;
  return (key, values) => {
    const message = catalog[key] ?? english[key];
    if (message === undefined) return key;
    const cacheKey = `${catalogLocale}\u0000${key}`;
    let fmt = cache.get(cacheKey);
    if (!fmt) {
      fmt = new IntlMessageFormat(message, catalog[key] ? locale : 'en');
      cache.set(cacheKey, fmt);
    }
    return String(fmt.format(values));
  };
}

/** Writing direction for a locale (Astryx getLocaleDirection). */
export function localeDirection(locale: string): 'ltr' | 'rtl' {
  return /^(ar|he|fa|ur|ps|sd|ug|yi|dv)(-|$)/i.test(locale) ? 'rtl' : 'ltr';
}
