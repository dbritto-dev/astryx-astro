/**
 * Theme hooks — the public styling contract shared with Astryx themes.
 *
 * Mirrors @astryxdesign/core `utils/themeProps.ts` + `naming.ts`: every component
 * renders a stable `astryx-<kebab-name>` class plus `data-*` attributes for its
 * themeable props, so generated theme CSS such as
 * `.astryx-button[data-variant="destructive"] { … }` applies unchanged.
 */

export type ClassValue = string | number | boolean | undefined | null;
export type ClassProps = Record<string, ClassValue>;
export type DataAttributes = Record<`data-${string}`, string>;

/** `fooBar` → `data-foo-bar` (same rule as Astryx's themeDataAttributeName). */
export function dataAttributeName(prop: string): `data-${string}` {
  return `data-${prop.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;
}

/** `TextInput` | `text-input` → `astryx-text-input`. */
export function stableClassName(component: string): string {
  const kebab = component
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
  return `astryx-${kebab}`;
}

export function dataAttributes(props?: ClassProps): DataAttributes {
  const attrs: DataAttributes = {};
  if (!props) return attrs;
  for (const [prop, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    attrs[dataAttributeName(prop)] = value === true ? '' : String(value);
  }
  return attrs;
}

/**
 * Spread onto a component's root element:
 *   <button {...themeProps('button', {variant, size})} class={cx(themeClass, className)}>
 * Returns the `astryx-*` class separately so it can be merged with consumer classes.
 */
export function themeProps(component: string, props?: ClassProps): {themeClass: string; attrs: DataAttributes} {
  return {themeClass: stableClassName(component), attrs: dataAttributes(props)};
}

/** Minimal class joiner (accepts the same shapes as Astro's class:list for strings/arrays). */
export function cx(...values: Array<ClassValue | ClassValue[]>): string {
  const out: string[] = [];
  for (const v of values.flat()) {
    if (v == null || v === false || v === true || v === '') continue;
    out.push(String(v));
  }
  return out.join(' ');
}
