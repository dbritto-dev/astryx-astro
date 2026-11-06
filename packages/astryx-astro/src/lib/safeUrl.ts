/**
 * Navigation safety (Astryx utils/safeUrl.ts, navigation-destinations FR1–8).
 * Run on the server for every rendered href. A rejected destination renders as an inert
 * element (no href) — not a disabled control.
 */
function normalizeUrl(url: string): string {
  // eslint-disable-next-line no-control-regex
  return url.replace(/[\x00-\x1f\x7f]/g, '').trim();
}

function comparableUrl(normalized: string): string {
  return normalized.toLowerCase().replace(/^([a-z][a-z\d+.-]*:) +/, '$1');
}

/** Returns the normalized URL, or null for blocked schemes (javascript:, vbscript:, data:text/html). */
export function sanitizeUrl(url: string): string | null {
  const normalized = normalizeUrl(url);
  const lower = comparableUrl(normalized);
  if (lower.startsWith('javascript:') || lower.startsWith('vbscript:') || lower.startsWith('data:text/html')) return null;
  return normalized;
}

export function isSafeUrl(url: string): boolean {
  return sanitizeUrl(url) !== null;
}

/** href for an <a>: the sanitized URL, or undefined when missing or blocked. */
export function safeHref(href: string | URL | null | undefined): string | undefined {
  if (href == null) return undefined;
  return sanitizeUrl(String(href)) ?? undefined;
}
