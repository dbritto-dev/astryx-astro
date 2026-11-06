/** Style helpers for .astro components. */

export type StyleValue = string | Record<string, string | number | null | undefined | false> | null | undefined | false;

const kebab = (prop: string) => (prop.startsWith('--') ? prop : prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`));

/** Serialize one style value (string or object) to a CSS declaration string. */
export function styleToString(style: StyleValue): string {
  if (!style) return '';
  if (typeof style === 'string') return style.trim().replace(/;$/, '');
  return Object.entries(style)
    .filter(([, v]) => v !== null && v !== undefined && v !== false && v !== '')
    .map(([k, v]) => `${kebab(k)}:${v}`)
    .join(';');
}

/**
 * Merge component-computed styles with the consumer's `style` prop (consumer last, so it wins).
 * Returns undefined when empty so Astro omits the attribute.
 */
export function mergeStyles(...styles: StyleValue[]): string | undefined {
  const out = styles.map(styleToString).filter(Boolean).join(';');
  return out || undefined;
}

/** Convert a numeric size prop to CSS (numbers are px), pass strings through. */
export function cssSize(value: number | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'number' ? `${value}px` : value;
}

/** Spacing step → token (`2` → `var(--spacing-2)`, `0.5` → `var(--spacing-0-5)`). */
export function spacing(step: number | string | undefined): string | undefined {
  if (step === undefined) return undefined;
  if (typeof step === 'string') return step;
  return `var(--spacing-${String(step).replace('.', '-')})`;
}
