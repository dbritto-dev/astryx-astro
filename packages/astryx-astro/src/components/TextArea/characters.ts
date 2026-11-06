/**
 * Grapheme-aware counting — port of @astryxdesign/core utils/characters.ts (characterCount,
 * firstCharacter, truncateCharacters). One emoji, flag or accented letter is one character,
 * which is what TextArea's counter shows and what callers should validate against.
 * Shared by the server render and `<ax-text-area>`. (A candidate for src/lib: Avatar,
 * PowerSearch and Table use it in Astryx too.)
 */
const characterSegmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter(undefined, {granularity: 'grapheme'})
  : null;

function splitCharacters(str: string): string[] {
  if (characterSegmenter) return [...characterSegmenter.segment(str)].map((s) => s.segment);
  return [...str];
}

/** User-perceived characters in `str` (replacement for `.length`). */
export function characterCount(str: string): number {
  return str === '' ? 0 : splitCharacters(str).length;
}

/** The first user-perceived character, or ''. */
export function firstCharacter(str: string): string {
  if (characterSegmenter) {
    const first = characterSegmenter.segment(str)[Symbol.iterator]().next();
    return first.done ? '' : first.value.segment;
  }
  const codePoint = str.codePointAt(0);
  return codePoint == null ? '' : String.fromCodePoint(codePoint);
}

/** At most `max` characters, ellipsis included. */
export function truncateCharacters(str: string, max: number, ellipsis = '…'): string {
  const characters = splitCharacters(str);
  if (characters.length <= max) return str;
  const keep = Math.max(max - characterCount(ellipsis), 0);
  return characters.slice(0, keep).join('') + ellipsis;
}
