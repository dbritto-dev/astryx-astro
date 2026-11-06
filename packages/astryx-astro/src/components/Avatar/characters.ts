/**
 * Grapheme-aware string helpers — port of @astryxdesign/core utils/characters.ts
 * (characterCount, firstCharacter, truncateCharacters): measure and cut user-visible
 * strings the way a person reads them, so an emoji, flag or joined sequence is never
 * split. Uses Intl.Segmenter (grapheme granularity), with a code-point fallback.
 */
const segmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter(undefined, {granularity: 'grapheme'})
  : null;

function splitCharacters(str: string): string[] {
  if (segmenter) return Array.from(segmenter.segment(str), (s) => s.segment);
  return Array.from(str);
}

/** Number of user-perceived characters (replacement for `.length`). */
export function characterCount(str: string): number {
  if (segmenter) {
    let count = 0;
    for (const _ of segmenter.segment(str)) count++;
    return count;
  }
  return Array.from(str).length;
}

/** The first user-perceived character, or '' (replacement for `.charAt(0)`). */
export function firstCharacter(str: string): string {
  if (segmenter) {
    const first = segmenter.segment(str)[Symbol.iterator]().next();
    return first.done ? '' : first.value.segment;
  }
  const codePoint = str.codePointAt(0);
  return codePoint == null ? '' : String.fromCodePoint(codePoint);
}

/** At most `max` characters, ellipsis included (replacement for `slice(0, n) + '…'`). */
export function truncateCharacters(str: string, max: number, ellipsis = '…'): string {
  const chars = splitCharacters(str);
  if (chars.length <= max) return str;
  const keep = Math.max(max - characterCount(ellipsis), 0);
  return chars.slice(0, keep).join('') + ellipsis;
}
