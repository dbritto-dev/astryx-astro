// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Ported verbatim from @astryxdesign/core 0.7.9 src/Chat/chatComposerSelection.ts.

/**
 * Selection helpers for the contentEditable chat input. A programmatic `focus()` is never
 * trusted to place the caret (Chromium collapses it to offset 0 — the start of the draft,
 * where ArrowUp recalls history):
 * - `placeCaretAtEnd` states the caret outright (the shell's click-to-focus);
 * - `getSelectionRangeInside` + `restoreSelectionRange` let the imperative `focus()` keep a
 *   caret the user already had (read before focusing);
 * - `ensureCaretInside` is the weaker fallback for callers that only need *a* Range (paste,
 *   imperative insertion): it respects an existing caret and creates one at the end otherwise.
 */

/** The current Selection's range when it lies inside `editable` (cloned), or null. */
export function getSelectionRangeInside(editable: HTMLElement): Range | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!editable.contains(range.startContainer) || !editable.contains(range.endContainer)) return null;
  return range.cloneRange();
}

/** Make `range` the current Selection again. */
export function restoreSelectionRange(range: Range): void {
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Collapse the Selection to the very end of `editable`, replacing whatever it held. */
export function placeCaretAtEnd(editable: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection) return false;
  const range = document.createRange();
  range.selectNodeContents(editable);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

/** Ensure the Selection has a Range inside `editable` (a caret at the end when it has none). */
export function ensureCaretInside(editable: HTMLElement): Selection | null {
  const selection = window.getSelection();
  if (!selection) return null;
  if (selection.rangeCount > 0) {
    const existing = selection.getRangeAt(0);
    if (editable.contains(existing.startContainer)) return selection;
  }
  const range = document.createRange();
  range.selectNodeContents(editable);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

/** Whether the selection's start boundary sits at the very beginning of `editable`. */
export function isSelectionAtStart(editable: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  return isBoundaryAtEdge(editable, range.startContainer, range.startOffset, 'start');
}

/** Whether the selection's end boundary sits at the very end of `editable`. */
export function isSelectionAtEnd(editable: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  return isBoundaryAtEdge(editable, range.endContainer, range.endOffset, 'end');
}

function isBoundaryAtEdge(editable: HTMLElement, container: Node, offset: number, edge: 'start' | 'end'): boolean {
  if (!editable.contains(container) || !isAtNodeEdge(container, offset, edge)) return false;
  for (let node: Node | null = container; node && node !== editable;) {
    if (hasContentSibling(node, edge)) return false;
    node = node.parentNode;
  }
  return true;
}

function isAtNodeEdge(node: Node, offset: number, edge: 'start' | 'end'): boolean {
  if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
    return edge === 'start' ? offset === 0 : offset === (node.nodeValue?.length ?? 0);
  }
  return edge === 'start' ? offset === 0 : offset === node.childNodes.length;
}

function hasContentSibling(node: Node, edge: 'start' | 'end'): boolean {
  for (let sibling = edge === 'start' ? node.previousSibling : node.nextSibling; sibling; sibling = edge === 'start' ? sibling.previousSibling : sibling.nextSibling) {
    // Elements (including <br> and tokens) are content even without text; empty text and comments are not.
    if (sibling.nodeType === Node.ELEMENT_NODE || (sibling.nodeType === Node.TEXT_NODE && sibling.nodeValue !== '')) return true;
  }
  return false;
}

/** Insert plain text at the current selection, scoped to `editable`. */
export function insertTextAtCursor(editable: HTMLElement, text: string): boolean {
  const selection = ensureCaretInside(editable);
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

/** Select everything in `editable` (a recalled history entry is shown selected). */
export function selectAll(el: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  selection.removeAllRanges();
  selection.addRange(range);
}
