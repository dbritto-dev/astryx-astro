/**
 * Avatar geometry and the cascade stamps that replace Astryx's AvatarSizeContext,
 * AvatarStatusLabelContext and AvatarGroupContext (lib/cascade.ts). Port of the pure parts
 * of @astryxdesign/core Avatar/Avatar.tsx (resolveSize, getInitials), Avatar/AvatarStatusDot.tsx
 * (resolveStatusDotSize, the shape glyph) and AvatarGroup/AvatarGroup.tsx (overlap).
 *
 * Every element whose rendering depends on the avatar size carries
 * `data-ax-avatar-part="<part>"` plus cascade markers:
 *  - `avatar-size`  — a status dot inside an Avatar's `status` slot; the Avatar stamps its
 *                     own numeric size (AvatarSizeContext) and reads the dot's label
 *                     (AvatarStatusLabelContext);
 *  - `avatar-group` — every avatar root, fallback plate, status dot part and overflow chip;
 *                     an AvatarGroup stamps its size, shape and overlap, which win over
 *                     the members' own props (Astryx: the group sizes members uniformly).
 * Sizes that CSS can derive (initials, default icon, status position) read the
 * `--_ax-avatar-size` custom property instead, so a stamp only rewrites that one value.
 */
import {firstCharacter} from '../../lib/characters';

export type AvatarNamedSize = 'xsm' | 'sm' | 'md' | 'lg' | 'xl';
export type AvatarNumericSize = 16 | 20 | 24 | 32 | 36 | 40 | 48 | 60 | 64 | 72 | 96 | 128 | 144 | 180;
export type AvatarSize = AvatarNamedSize | AvatarNumericSize;
export type AvatarShape = 'circle' | 'rounded' | 'square';

/** Named sizes → px (xsm 20, sm 24, md 36, lg 48, xl 128); numbers pass through. */
export function resolveSize(size: AvatarSize): number {
  if (typeof size === 'number') return size;
  switch (size) {
    case 'xsm': return 20;
    case 'sm': return 24;
    case 'lg': return 48;
    case 'xl': return 128;
    default: return 36;
  }
}

/** A blank string carries no identity: undefined for absent or whitespace-only. */
export function meaningful(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** A letter, digit or emoji can stand for a word; punctuation cannot. */
const INITIAL_CHARACTER = /[\p{L}\p{N}\p{Extended_Pictographic}\p{Regional_Indicator}]/u;

function initialCharacter(word: string): string {
  const index = word.search(INITIAL_CHARACTER);
  return index === -1 ? '' : firstCharacter(word.slice(index));
}

/**
 * First letter, digit or emoji (a whole grapheme) of the first and last words, skipping
 * leading punctuation and words without one. '' when no word yields an initial.
 *   getInitials('John Doe') → 'JD'; getInitials('Northwind Workbench (automation)') → 'NA'
 */
export function getInitials(name: string): string {
  const initials = name.trim().split(/\s+/).map(initialCharacter).filter((i) => i !== '');
  if (initials.length === 0) return '';
  if (initials.length === 1) return initials[0].toUpperCase();
  return (initials[0] + initials[initials.length - 1]).toUpperCase();
}

/** Group overlap: a quarter of the member size, rounded (AvatarGroup OVERLAP_RATIO). */
export function groupOverlap(numericSize: number): number {
  return Math.round(numericSize * 0.25);
}

// ── Status dot ──────────────────────────────────────────────────────────────

export type StatusDotTier = 'small' | 'medium' | 'large';
export type StatusDotGlyphShape = 'ring' | 'minus';

export interface StatusDotGeometry {
  dotSize: number;
  borderWidth: number;
  /** 0 at the small tier: no room for a legible icon. */
  iconSize: number;
  tier: StatusDotTier;
  /** The inner field the glyph is drawn into (dot minus both borders). */
  field: number;
  stroke: number;
}

const GLYPH_STROKE_WIDTH: Record<StatusDotTier, number> = {small: 1, medium: 1.5, large: 2};
const MINUS_BAR_SPAN = 0.75;

/** Discrete tiers: ≤36px → 10/1px, ≤72px → 20/2px (12px icon), else 32/4px (18px icon). */
export function statusDotGeometry(avatarSize: number): StatusDotGeometry {
  const base = avatarSize <= 36
    ? {dotSize: 10, borderWidth: 1, iconSize: 0, tier: 'small' as const}
    : avatarSize <= 72
      ? {dotSize: 20, borderWidth: 2, iconSize: 12, tier: 'medium' as const}
      : {dotSize: 32, borderWidth: 4, iconSize: 18, tier: 'large' as const};
  return {...base, field: base.dotSize - base.borderWidth * 2, stroke: GLYPH_STROKE_WIDTH[base.tier]};
}

const num = (n: number) => String(Math.round(n * 1000) / 1000);

/** Attribute values for each geometry-bearing part of a dot (also used for the first render). */
export function dotPartAttributes(part: string, g: StatusDotGeometry, hasIcon: boolean): Record<string, string | null> {
  const center = g.field / 2;
  switch (part) {
    case 'dot':
      return {'data-ax-tier': g.tier};
    case 'dot-icon':
      return {hidden: g.iconSize > 0 ? null : ''};
    case 'dot-glyph':
      return {
        viewBox: `0 0 ${num(g.field)} ${num(g.field)}`,
        width: num(g.field),
        height: num(g.field),
        hidden: hasIcon && g.iconSize > 0 ? '' : null,
      };
    case 'dot-ring':
      return {cx: num(center), cy: num(center), r: num((g.field - g.stroke) / 2), 'stroke-width': num(g.stroke)};
    case 'dot-minus':
      return {
        x1: num((g.field * (1 - MINUS_BAR_SPAN)) / 2 + g.stroke / 2),
        y1: num(center),
        x2: num((g.field * (1 + MINUS_BAR_SPAN)) / 2 - g.stroke / 2),
        y2: num(center),
        'stroke-width': num(g.stroke),
      };
    default:
      return {};
  }
}

/** Private size vars a dot part sets inline (themes can still restyle width/height). */
export function dotPartVars(part: string, g: StatusDotGeometry): Record<string, string> {
  if (part === 'dot') return {'--_ax-dot-size': `${g.dotSize}px`, '--_ax-dot-border': `${g.borderWidth}px`};
  if (part === 'dot-icon') return {'--_ax-dot-icon-size': `${g.iconSize}px`};
  return {};
}

// ── Attribute rewriting for stamps (ultrahtml attributes are raw, escaped HTML) ─────────

type Attrs = Record<string, string>;

const escapeAttr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (m, code: string) => {
    const lower = code.toLowerCase();
    if (lower === 'amp') return '&';
    if (lower === 'quot') return '"';
    if (lower === 'apos') return "'";
    if (lower === 'lt') return '<';
    if (lower === 'gt') return '>';
    if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith('#')) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return m;
  });
}

/** Replace (or add) custom properties in a style attribute, keeping everything else. */
export function setStyleVars(style: string | undefined, vars: Record<string, string>): string {
  let out = style ?? '';
  for (const [name, value] of Object.entries(vars)) {
    const re = new RegExp(`(^|;)\\s*${name.replace(/[-]/g, '\\-')}\\s*:[^;]*`);
    out = re.test(out) ? out.replace(re, `$1${name}:${value}`) : `${name}:${value}${out ? ';' + out : ''}`;
  }
  return escapeAttr(decodeEntities(out));
}

function applyAttributes(attrs: Attrs, values: Record<string, string | null>) {
  for (const [key, value] of Object.entries(values)) {
    if (value == null) delete attrs[key];
    else attrs[key] = escapeAttr(value);
  }
}

/** Stamp a status-dot part for an avatar of `numericSize` px. */
export function stampDotPart(attrs: Attrs, numericSize: number): void {
  const part = attrs['data-ax-avatar-part'];
  const g = statusDotGeometry(numericSize);
  applyAttributes(attrs, dotPartAttributes(part, g, 'data-ax-has-icon' in attrs));
  const vars = dotPartVars(part, g);
  if (Object.keys(vars).length) attrs.style = setStyleVars(attrs.style, vars);
}

export interface AvatarGroupStamp {
  size: AvatarSize;
  shape: AvatarShape;
  numericSize: number;
  overlap: number;
}

/** Stamp any avatar part with an AvatarGroup's size, shape and overlap. */
export function stampGroupPart(attrs: Attrs, tag: string, group: AvatarGroupStamp): void {
  const part = attrs['data-ax-avatar-part'];
  const sizeVars = {'--_ax-avatar-size': `${group.numericSize}px`, '--_avatar-group-overlap': `${-group.overlap}px`};
  switch (part) {
    case 'root':
      attrs['data-size'] = String(group.size);
      attrs['data-shape'] = group.shape;
      attrs['data-ax-grouped'] = '';
      attrs.style = setStyleVars(attrs.style, sizeVars);
      // The group owns a single roving tab stop: no tooltip tab stop on static members.
      if (tag === 'div') delete attrs.tabindex;
      return;
    case 'fallback':
      attrs['data-size'] = String(group.size);
      return;
    case 'overflow':
      attrs['data-size'] = String(group.size);
      attrs['data-shape'] = group.shape;
      attrs.style = setStyleVars(attrs.style, sizeVars);
      return;
    default:
      if (part?.startsWith('dot')) stampDotPart(attrs, group.numericSize);
  }
}
