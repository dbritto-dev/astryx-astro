/**
 * Unique id per render — the stand-in for React's useId. Counted on `Astro.locals`, so ids are
 * unique within a request and deterministic for a given page.
 */
const fallbackLocals: Record<string, unknown> = {};

export function uid(astro: {locals?: unknown}, prefix: string): string {
  const locals = (astro.locals ?? fallbackLocals) as Record<string, unknown>;
  const n = ((locals.__astryxUid as number | undefined) ?? 0) + 1;
  locals.__astryxUid = n;
  return `${prefix}-${n}`;
}
