/**
 * Type-to-select. Port of @astryxdesign/core utils/typeaheadMatch.ts (pure, verbatim
 * semantics: locale-independent fold of case, combining marks, six stroked letters and
 * Turkish ı/İ; marked input prefers an exact match) and hooks/useTypeahead.ts (buffer with a
 * 750ms reset, repeat-a-letter cycles, a single letter starts after the current item, Space
 * only extends an active buffer, chords and IME keys ignored).
 *
 * Framework-free and SSR-safe. Menus, listboxes and comboboxes compose it with roving.ts:
 *   const ta = createTypeahead({getItemLabels, onMatch: (i) => roving.focusItem(i), getCurrentIndex});
 *   el.addEventListener('keydown', (e) => { if (ta.onKeyDown(e)) e.preventDefault(); });
 */

const COMBINING_MARKS = /[̀-ͯ]/g;
const STROKED: Readonly<Record<string, string>> = {
  đ: 'd', Đ: 'd', ł: 'l', Ł: 'l', ø: 'o', Ø: 'o', ħ: 'h', Ħ: 'h', ŧ: 't', Ŧ: 't', ƀ: 'b', Ƀ: 'b', ı: 'i',
};
const STROKED_CHARS = /[đĐłŁøØħĦŧŦƀɃı]/g;
const MARKED_CHARS = /[đĐłŁøØħĦŧŦƀɃıİ]/;

/** Fold text for type-to-select (no case, no marks, stroked letters and ı as base letters). */
export function foldForTypeahead(text: string): string {
  return text.normalize('NFD').replace(COMBINING_MARKS, '').replace(STROKED_CHARS, (c) => STROKED[c] ?? c).normalize('NFC').toLowerCase();
}

/**
 * The buffer after one more key; null when the key is not a letter to jump to (a lone
 * combining mark typed first). The same letter again cycles: the buffer stays that letter.
 */
export function nextTypeaheadBuffer(buffer: string, key: string): string | null {
  if (buffer.length === 0 && key !== ' ' && foldForTypeahead(key).length === 0) return null;
  const repeat = buffer.length > 0 && buffer.split('').every((c) => foldForTypeahead(c) === foldForTypeahead(key));
  return repeat ? key : buffer + key;
}

function exactFold(text: string): string {
  return text.normalize('NFC').replace(/I/g, 'ı').replace(/İ/g, 'i').toLowerCase();
}

function hasMark(typed: string): boolean {
  return MARKED_CHARS.test(typed) || /[̀-ͯ]/.test(typed.normalize('NFD'));
}

/** Whether `label` starts with `typed` under the fold (`exact`: unfolded, Turkish pairing). */
export function typeaheadPrefixMatch(label: string, typed: string, exact = false): boolean {
  const trimmed = label.trim();
  if (exact) return exactFold(trimmed).startsWith(exactFold(typed));
  const folded = foldForTypeahead(typed);
  if (folded.length === 0) return false;
  return foldForTypeahead(trimmed).startsWith(folded);
}

/** The next index in `order` whose label matches; an exact match wins for marked input. */
export function findTypeaheadMatch(order: ReadonlyArray<number>, getLabel: (index: number) => string | null | undefined, typed: string): number {
  const passes = hasMark(typed) ? [true, false] : [false];
  for (const exact of passes) {
    for (const index of order) {
      const label = getLabel(index);
      if (label != null && typeaheadPrefixMatch(label, typed, exact)) return index;
    }
  }
  return -1;
}

export interface TypeaheadOptions {
  /** In-DOM-order labels; null/empty marks a slot that never matches (indexes stay 1:1). */
  getItemLabels: () => ReadonlyArray<string | null | undefined>;
  onMatch: (index: number) => void;
  /** The current item, so repeated letters cycle; negative = none. */
  getCurrentIndex?: () => number;
  /** @default 750 */
  resetMs?: number;
  isDisabled?: (index: number) => boolean;
}

export interface Typeahead {
  /** Returns true when it handled a printable key (the caller then preventDefaults). */
  onKeyDown: (event: KeyboardEvent) => boolean;
  reset: () => void;
}

function isComposing(e: KeyboardEvent) {
  return e.isComposing === true || e.keyCode === 229;
}

function isPrintable(e: KeyboardEvent) {
  // Alt alone is allowed: Option+letter composes a character on macOS.
  return e.key.length === 1 && !e.ctrlKey && !e.metaKey && !isComposing(e) && e.key !== ' ';
}

export function createTypeahead(options: TypeaheadOptions): Typeahead {
  let buffer = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reset = () => {
    buffer = '';
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
  const scheduleReset = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { buffer = ''; timer = undefined; }, options.resetMs ?? 750);
  };
  const onKeyDown = (e: KeyboardEvent): boolean => {
    const spaceMidType = e.key === ' ' && !e.ctrlKey && !e.metaKey && !isComposing(e) && buffer.length > 0;
    if (!isPrintable(e) && !spaceMidType) return false;
    const next = nextTypeaheadBuffer(buffer, e.key);
    if (next == null) return false;
    const labels = options.getItemLabels();
    if (labels.length === 0) return false;
    buffer = next;
    scheduleReset();
    const current = options.getCurrentIndex?.() ?? -1;
    const count = labels.length;
    const hasCurrent = current >= 0;
    const start = hasCurrent ? current : 0;
    // A single letter starts AFTER the current item (native <select>, APG getIndexByLetter).
    const offset = hasCurrent && next.length === 1 ? 1 : 0;
    const order: number[] = [];
    for (let i = 0; i < count; i++) {
      const index = (start + offset + i + count) % count;
      if (!options.isDisabled?.(index)) order.push(index);
    }
    const match = findTypeaheadMatch(order, (i) => labels[i], next);
    if (match >= 0) options.onMatch(match);
    return true;
  };
  return {onKeyDown, reset};
}
