/**
 * Server-side icon registry and resolvers — port of @astryxdesign/core
 * Icon/globalIconRegistry.tsx, Icon/useIcon.ts and the slot types of Icon/index.ts.
 *
 *   import {registerIcons, registerIconTheme, resolveComponentIcon} from 'astryx-astro/components/Icon/iconRegistry';
 *
 * Resolution of a semantic name (`resolveIcon`), first source that answers wins — the
 * same order as Astryx's selectIconEntry:
 *   1. the active theme's entry   (shipped themes: Lucide; custom: registerIconTheme())
 *   2. the process-wide registry  (registerIcons())
 *   3. the built-in default       (defaultIcons.ts)
 * A nullish static entry falls through; a function entry is final (its `null` draws
 * nothing). An icon passed directly to <Icon> (SVG string, Astro component, slot) skips
 * resolution entirely.
 *
 * Active theme (server-side): <Icon theme> prop → `Astro.locals.astryxTheme` → none.
 * Set the request theme once in middleware, matching the `data-astryx-theme` you render on
 * <html>:
 *   // src/middleware.ts
 *   export const onRequest = (ctx, next) => { ctx.locals.astryxTheme = 'neutral'; return next(); };
 * With no theme, Icon draws the built-in defaults (Astryx without a <Theme>). Icons are
 * server-rendered: switching `data-astryx-theme` in the browser restyles them (color,
 * size tokens) but does not swap their artwork. All seven shipped themes share one Lucide
 * set, so switching between them changes no glyph.
 *
 * Entries are SVG strings (1em-based, like Astryx registry artwork), Astro components
 * (`import Logo from './logo.svg'`, `@lucide/astro` icons — rendered with
 * width="1em" height="1em" aria-hidden="true"), or a pure synchronous function of
 * `{size, variant}` returning either. A function receives the size Icon knows when it
 * renders (explicit `size`, else 'md'); a size an owner stamps later (cascade `icon-size`)
 * only changes the CSS box, which 1em artwork follows.
 */

import {defaultIcons} from './defaultIcons.ts';
import {lucideIcons, shippedThemeNames} from './themeIcons.ts';

// =============================================================================
// Types
// =============================================================================

/** Semantic icon names used by Astryx components (functional purpose, not artwork). */
export type IconName =
  | 'close' | 'chevronDown' | 'chevronLeft' | 'chevronRight' | 'chevronsLeft' | 'chevronsRight'
  | 'check' | 'success' | 'error' | 'warning' | 'info' | 'calendar' | 'clock' | 'externalLink'
  | 'menu' | 'moreHorizontal' | 'search' | 'upload' | 'arrowUp' | 'arrowDown' | 'arrowsUpDown'
  | 'funnel' | 'eyeSlash' | 'viewColumns' | 'copy' | 'checkDouble' | 'wrench' | 'stop' | 'microphone';

/** A namespaced extension key, `'<namespace>:<name>'` (e.g. `'numberInput:stepperDown'`). */
export type NamespacedIconName = `${string}:${string}`;

/** A built-in name or any string key a library registers. */
export type ExtendedIconName = IconName | (string & {});

export type IconSize = 'xsm' | 'sm' | 'md' | 'lg';

export type IconColor =
  | 'primary' | 'secondary' | 'tertiary' | 'disabled' | 'accent' | 'info' | 'success' | 'error'
  | 'warning' | 'inherit' | 'blue' | 'red' | 'green' | 'gray' | 'cyan' | 'teal' | 'yellow'
  | 'orange' | 'pink' | 'purple';

/**
 * Icon variant names an application uses. Astryx defines none; augment it:
 *   declare module 'astryx-astro/components/Icon/iconRegistry' { interface IconVariantMap { filled: true } }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation point
export interface IconVariantMap {}
export type IconVariant = keyof IconVariantMap & string;

/** An Astro component (what `.astro` files and `*.svg` imports export). */
export type AstroIconComponent = ((...args: any[]) => unknown) & {isAstroComponentFactory?: boolean};

/** Rendered artwork: SVG markup or an Astro component. */
export type IconGlyph = string | AstroIconComponent;

/** What Icon asks a function entry for. */
export type IconRequest<Variant extends string = IconVariant> = Readonly<{size: IconSize; variant?: Variant}>;

/** A theme or registered entry: artwork, or a pure synchronous function of the request. */
export type IconEntry<Variant extends string = IconVariant> =
  | IconGlyph
  | null
  | undefined
  | ((request: IconRequest<Variant>) => IconGlyph | null | undefined);

/**
 * Themeable icons components own, by slot (`<component-kebab>-<semantic-role>`). `true` =
 * stateless; otherwise the readonly state the component passes. Augment for new slots.
 */
export interface ComponentIconSlotMap {
  /** CodeBlock's copy button. `copied` is true while the copied feedback shows. */
  'code-block-copy': {readonly copied: boolean};
  /** A Timestamp hover card row's copy button. */
  'timestamp-copy': {readonly copied: boolean};
  /** A sortable Table column's sort indicator. */
  'table-sort-indicator': {readonly direction: 'ascending' | 'descending' | 'none'};
  /** A Table row's expansion toggle. */
  'table-row-expand': {readonly expanded: boolean};
}
export type ComponentIconSlotName = keyof ComponentIconSlotMap & string;

/** A partial request for a slot's icon; a missing field keeps the component's own value. */
export type ComponentIconRequest<Variant extends string = IconVariant> = Readonly<{
  icon?: IconName | null;
  variant?: Variant;
  size?: IconSize;
}>;

/** A theme's value for a slot: a name, `null` (hide), a request, or a pure function of state. */
export type ComponentIconValue<State = unknown, Variant extends string = IconVariant> =
  | IconName
  | null
  | ComponentIconRequest<Variant>
  | ((state: Readonly<State>) => ComponentIconRequest<Variant> | null | undefined);

export type ComponentIconMap<Variant extends string = IconVariant> = {
  [Slot in ComponentIconSlotName]?: ComponentIconSlotMap[Slot] extends true
    ? IconName | null | ComponentIconRequest<Variant>
    : ComponentIconValue<ComponentIconSlotMap[Slot], Variant>;
};

export type ComponentIconSlotState<Slot extends ComponentIconSlotName> =
  ComponentIconSlotMap[Slot] extends true ? undefined : Readonly<ComponentIconSlotMap[Slot]>;

/** What a component renders for a slot when the theme maps nothing. */
export type ComponentIconFallback =
  | IconName
  | null
  | Readonly<{icon: IconName | null; variant?: IconVariant; size?: IconSize}>;

/** A slot resolved to what the component renders through <Icon>. */
export type ResolvedComponentIcon = Readonly<{icon: IconName | null; variant?: string; size?: IconSize}>;

/** The icon part of an Astryx `defineTheme()`: what a theme contributes server-side. */
export interface IconThemeDefinition {
  icons?: Partial<Record<ExtendedIconName, IconEntry<any>>>;
  componentIcons?: Partial<Record<string, unknown>>;
  /** Variant names the theme's entries can receive (`defineTheme({iconVariants})`). */
  iconVariants?: readonly string[];
}

/** Where resolution reads the active theme: an Astro global, a theme name, or none. */
export type IconThemeSource =
  | {locals?: Record<string, unknown> | object}
  | string
  | null
  | undefined;

// =============================================================================
// Theme + process-wide registries
// =============================================================================

const themes = new Map<string, IconThemeDefinition>(
  shippedThemeNames.map((name) => [name, {icons: lucideIcons}]),
);
let globalRegistry: Record<string, IconEntry<any>> = {};

/**
 * Register (or replace) a theme's icon definition — the `icons`, `componentIcons` and
 * `iconVariants` of an Astryx `defineTheme()`. Use it for a custom theme compiled with the
 * Astryx CLI, or to replace a shipped theme's set:
 *   registerIconTheme('brand', {icons: {...lucideIcons, close: BrandClose}});
 */
export function registerIconTheme(name: string, definition: IconThemeDefinition): void {
  themes.set(name, definition);
}

/** The registered icon definition for a theme name, if any. */
export function getIconTheme(name: string | null | undefined): IconThemeDefinition | null {
  return name == null ? null : (themes.get(name) ?? null);
}

/**
 * Register icons process-wide (Astryx `registerIcons`). Call once at startup, e.g. in
 * middleware or a layout's frontmatter. A theme that maps the same name still wins (every
 * shipped theme maps all 29 built-in names): override a theme's artwork with
 * `registerIconTheme`. Libraries may register their own namespaced keys.
 */
export function registerIcons(icons: Partial<Record<ExtendedIconName, IconEntry>>): void {
  globalRegistry = {...globalRegistry, ...icons};
}

/** Reset the process-wide registry (and restore the shipped theme sets). For tests. */
export function resetIcons(): void {
  globalRegistry = {};
  themes.clear();
  for (const name of shippedThemeNames) themes.set(name, {icons: lucideIcons});
}

/** The active theme name: an explicit name wins, else `Astro.locals.astryxTheme`. */
export function resolveIconThemeName(source: IconThemeSource, explicit?: string | null): string | null {
  if (explicit !== undefined) return explicit;
  if (source == null) return null;
  if (typeof source === 'string') return source;
  const locals = source.locals as Record<string, unknown> | undefined;
  const name = locals?.astryxTheme;
  return typeof name === 'string' && name !== '' ? name : null;
}

// =============================================================================
// Resolution
// =============================================================================

export function isAstroIconComponent(value: unknown): value is AstroIconComponent {
  return typeof value === 'function' && (value as AstroIconComponent).isAstroComponentFactory === true;
}

function isNamespacedKey(name: string): boolean {
  return name.includes(':');
}

interface IconSelection {
  entry: IconEntry<any>;
  /** Every list a requested variant must be in for the entry to receive it. */
  variantLists: ReadonlyArray<ReadonlyArray<string> | undefined>;
}

function selectIconEntry(name: string, theme: IconThemeDefinition | null, fallback?: IconGlyph | null): IconSelection {
  const activeVariants = theme?.iconVariants;
  const themeEntry = theme?.icons?.[name];
  if (theme != null && themeEntry != null) return {entry: themeEntry, variantLists: [activeVariants, activeVariants]};
  const globalEntry = globalRegistry[name];
  if (globalEntry != null) return {entry: globalEntry, variantLists: [activeVariants]};
  return {entry: (defaultIcons as Record<string, string | undefined>)[name] ?? fallback, variantLists: []};
}

function readIconEntry({entry, variantLists}: IconSelection, {size, variant}: IconRequest<string>): IconGlyph | null {
  if (typeof entry !== 'function' || isAstroIconComponent(entry)) return (entry as IconGlyph | null | undefined) ?? null;
  const receivable = variant !== undefined && variantLists.length > 0 && variantLists.every((list) => list?.includes(variant) === true);
  return (entry as (r: IconRequest<string>) => IconGlyph | null | undefined)(receivable ? {size, variant} : {size}) ?? null;
}

const PUBLIC_READ_REQUEST: IconRequest<never> = {size: 'md'};

/**
 * Resolve a key for an Icon render: Icon passes the size it resolved and the variant it
 * was asked for. Returns null when nothing draws.
 */
export function resolveIcon(
  name: ExtendedIconName,
  source: IconThemeSource,
  request: IconRequest<string>,
  explicitTheme?: string | null,
): IconGlyph | null {
  const theme = getIconTheme(resolveIconThemeName(source, explicitTheme));
  return readIconEntry(selectIconEntry(name, theme), request);
}

/** Get an icon by name (function entries read at size md). Astryx `getIcon` / `useIcon`. */
export function getIcon(name: ExtendedIconName, source?: IconThemeSource): IconGlyph | null {
  return resolveIcon(name, source, PUBLIC_READ_REQUEST);
}

/** Resolve a library key with a caller-supplied default (Astryx `getExtendedIcon`). */
export function getExtendedIcon(name: ExtendedIconName, fallback?: IconGlyph | null, source?: IconThemeSource): IconGlyph | null {
  const theme = getIconTheme(resolveIconThemeName(source));
  return readIconEntry(selectIconEntry(name, theme, fallback), PUBLIC_READ_REQUEST);
}

/** Every built-in name → artwork for a theme (Astryx `getIconRegistry`). */
export function getIconRegistry(source?: IconThemeSource): Readonly<Record<IconName, IconGlyph | null>> {
  const theme = getIconTheme(resolveIconThemeName(source));
  const names = new Set([...Object.keys(defaultIcons), ...Object.keys(theme?.icons ?? {})]);
  const registry: Record<string, IconGlyph | null> = {};
  for (const name of names) {
    if (isNamespacedKey(name)) continue;
    registry[name] = readIconEntry(selectIconEntry(name, theme), PUBLIC_READ_REQUEST);
  }
  return registry as Record<IconName, IconGlyph | null>;
}

/** The 29 built-in semantic names, in Astryx's declaration order. */
export const iconNames = Object.keys(defaultIcons).filter((n) => !isNamespacedKey(n)) as IconName[];

// =============================================================================
// Component icon slots
// =============================================================================

const ICON_SIZES: ReadonlySet<unknown> = new Set(['xsm', 'sm', 'md', 'lg']);

function isIconName(value: unknown): value is IconName {
  return typeof value === 'string' && !isNamespacedKey(value) && Object.hasOwn(defaultIcons, value);
}

const warned = new Set<string>();
function warnMalformedRequest(slot: string, problem: string): void {
  if (!import.meta.env?.DEV) return;
  const key = `${slot}:${problem}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[astryx Icon] componentIcons["${slot}"] ${problem}. The component keeps its own value for that field.`);
}

function applyComponentIconRequest(
  slot: string,
  fallback: ResolvedComponentIcon,
  request: unknown,
  theme: IconThemeDefinition | null,
): ResolvedComponentIcon {
  if (request === undefined) return fallback;
  if (request === null) return {...fallback, icon: null};
  if (typeof request !== 'object' || Array.isArray(request)) {
    warnMalformedRequest(slot, `returned ${JSON.stringify(request)}, which is not a request`);
    return fallback;
  }
  const {icon, variant, size} = request as Record<string, unknown>;
  let resolved = fallback;
  if (icon === null || isIconName(icon)) resolved = {...resolved, icon};
  else if (icon !== undefined) warnMalformedRequest(slot, `requests the unknown icon ${JSON.stringify(icon)}`);
  if (typeof variant === 'string' && theme?.iconVariants?.includes(variant)) resolved = {...resolved, variant};
  else if (variant !== undefined) warnMalformedRequest(slot, `requests the variant ${JSON.stringify(variant)}, which the theme does not list`);
  if (ICON_SIZES.has(size)) resolved = {...resolved, size: size as IconSize};
  else if (size !== undefined) warnMalformedRequest(slot, `requests the unsupported size ${JSON.stringify(size)}`);
  return resolved;
}

/**
 * Resolve a component's themeable icon slot (Astryx `resolveComponentIcon` /
 * `useComponentIcon`): the active theme's `componentIcons[slot]` adjusts the component's
 * own fallback. Caller-supplied icon content wins before this, so don't call it then.
 *
 *   const copy = resolveComponentIcon('code-block-copy', {copied: false}, 'copy', Astro);
 *   {copy.icon && <Icon icon={copy.icon} size={copy.size} variant={copy.variant} />}
 *
 * For a state that changes on the client, resolve every state on the server and render
 * each (toggle with data-* / CSS).
 */
export function resolveComponentIcon<Slot extends ComponentIconSlotName>(
  slot: Slot,
  state: ComponentIconSlotState<Slot>,
  fallback: ComponentIconFallback,
  source: IconThemeSource,
): ResolvedComponentIcon {
  const own: ResolvedComponentIcon = fallback === null || typeof fallback === 'string' ? {icon: fallback} : fallback;
  const theme = getIconTheme(resolveIconThemeName(source));
  const value = theme?.componentIcons?.[slot];
  if (value === undefined) return own;
  if (typeof value === 'function') {
    const result: unknown = (value as (s: unknown) => unknown)(state);
    if (typeof result === 'string') {
      warnMalformedRequest(slot, `returned ${JSON.stringify(result)}, which is not a request`);
      return own;
    }
    return applyComponentIconRequest(slot, own, result, theme);
  }
  if (typeof value === 'string') return applyComponentIconRequest(slot, own, {icon: value}, theme);
  return applyComponentIconRequest(slot, own, value, theme);
}

export {defaultIcons, lucideIcons};
