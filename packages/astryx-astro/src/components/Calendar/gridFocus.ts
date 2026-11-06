// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Ported from @astryxdesign/core 0.7.9 src/hooks/useGridFocus.ts (+ hooks/isRtlElement.ts).

/**
 * `createGridFocus(grid, options)` — 2-D keyboard navigation for a WAI-ARIA grid, the
 * framework-free face of Astryx `useGridFocus` (architecture map §3: `grid-focus`).
 *
 * - Arrows move between cells (ArrowLeft/Right swap under a computed `direction: rtl`);
 *   Home/End move within the row, Ctrl/Cmd+Home/End to the first/last cell of the grid;
 *   PageUp/PageDown call back with the key event (so Shift can mean a year).
 * - Every cell matched by `cellSelector` counts for the geometry (disabled and empty ones
 *   too); a move that lands on a cell `isCellFocusable` rejects continues in the same
 *   direction; running off an edge calls `onNavigateBefore` / `onNavigateAfter`.
 * - `hasRovingTabIndex`: exactly one focus target carries `tabindex="0"` (an existing one is
 *   honoured, so the server markup seeds it); `syncTabStops()` repairs it after the DOM
 *   changes and `handleFocus` keeps it on whatever took focus.
 * A handled key is `preventDefault()`ed and `stopPropagation()`ed, as in Astryx.
 */
export interface GridFocusOptions {
  columns: number;
  cellSelector?: string;
  isCellFocusable?: (cell: HTMLElement) => boolean;
  getFocusTarget?: (cell: HTMLElement) => HTMLElement | null;
  onNavigateBefore?: (column: number, offset: number) => void;
  onNavigateAfter?: (column: number, offset: number) => void;
  onPageUp?: (event: KeyboardEvent) => void;
  onPageDown?: (event: KeyboardEvent) => void;
  hasRovingTabIndex?: boolean;
}

export interface GridFocus {
  handleKeyDown: (event: KeyboardEvent) => void;
  handleFocus: () => void;
  syncTabStops: () => void;
  focusCell: (index: number) => void;
  focusFirst: () => void;
  focusLast: () => void;
}

const isRtlElement = (el: Element | null) => el != null && getComputedStyle(el).direction === 'rtl';

export function createGridFocus(grid: HTMLElement, options: GridFocusOptions): GridFocus {
  const {
    columns,
    cellSelector = 'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    isCellFocusable,
    getFocusTarget,
    onNavigateBefore,
    onNavigateAfter,
    onPageUp,
    onPageDown,
    hasRovingTabIndex = false,
  } = options;

  const getCells = (): HTMLElement[] => Array.from(grid.querySelectorAll<HTMLElement>(cellSelector));
  const cellFocusable = (cell: HTMLElement | undefined) => (cell ? (isCellFocusable ? isCellFocusable(cell) : true) : false);
  const resolveFocusTarget = (cell: HTMLElement | undefined) => (cell ? (getFocusTarget ? getFocusTarget(cell) : cell) : null);
  const setTabIndex = (el: HTMLElement, value: 0 | -1) => {
    if (el.getAttribute('tabindex') !== String(value)) el.setAttribute('tabindex', String(value));
  };
  const getFocusTargets = () =>
    getCells()
      .filter((cell) => cellFocusable(cell))
      .map((cell) => resolveFocusTarget(cell))
      .filter((el): el is HTMLElement => el !== null);

  const syncTabStops = () => {
    if (!hasRovingTabIndex) return;
    const targets = getFocusTargets();
    if (targets.length === 0) return;
    const current = targets.find((el) => el.getAttribute('tabindex') === '0');
    const tabbable = current ?? targets[0];
    for (const el of targets) setTabIndex(el, el === tabbable ? 0 : -1);
    // A cell that stopped being focusable can still hold the stop; it never stays tabbable.
    for (const cell of getCells()) {
      const el = cellFocusable(cell) ? null : resolveFocusTarget(cell);
      if (el != null) setTabIndex(el, -1);
    }
  };

  const focusTarget = (target: HTMLElement | null) => {
    if (!target) return;
    if (hasRovingTabIndex) for (const el of getFocusTargets()) setTabIndex(el, el === target ? 0 : -1);
    target.focus();
  };
  const focusCellWithStop = (cell: HTMLElement | undefined) => {
    const target = resolveFocusTarget(cell);
    if (!target) return false;
    focusTarget(target);
    return true;
  };
  const getCurrentIndex = () => {
    const active = grid.ownerDocument.activeElement;
    return getCells().findIndex((cell) => cell === active || cell.contains(active));
  };
  const findFocusableInDirection = (cells: HTMLElement[], startIndex: number, step: number) => {
    let index = startIndex;
    while (index >= 0 && index < cells.length) {
      if (cellFocusable(cells[index])) return index;
      index += step;
    }
    return -1;
  };
  const focusCell = (index: number) => {
    const cells = getCells();
    if (cells.length === 0) return;
    const clamped = Math.max(0, Math.min(index, cells.length - 1));
    let target = findFocusableInDirection(cells, clamped, 1);
    if (target === -1) target = findFocusableInDirection(cells, clamped, -1);
    if (target !== -1) focusCellWithStop(cells[target]);
  };
  const focusFirst = () => {
    const cells = getCells();
    const index = findFocusableInDirection(cells, 0, 1);
    if (index !== -1) focusCellWithStop(cells[index]);
  };
  const focusLast = () => {
    const cells = getCells();
    const index = findFocusableInDirection(cells, cells.length - 1, -1);
    if (index !== -1) focusCellWithStop(cells[index]);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const cells = getCells();
    if (cells.length === 0) return;
    const currentIndex = getCurrentIndex();
    if (currentIndex === -1) return;
    const currentRow = Math.floor(currentIndex / columns);
    const currentCol = currentIndex % columns;
    const totalRows = Math.ceil(cells.length / columns);
    let handled = true;
    let key = e.key;
    if ((key === 'ArrowLeft' || key === 'ArrowRight') && isRtlElement(grid)) key = key === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
    switch (key) {
      case 'ArrowRight': {
        const target = findFocusableInDirection(cells, currentIndex + 1, 1);
        if (target !== -1) focusCellWithStop(cells[target]);
        else onNavigateAfter?.((currentCol + 1) % columns, 1);
        break;
      }
      case 'ArrowLeft': {
        const target = findFocusableInDirection(cells, currentIndex - 1, -1);
        if (target !== -1) focusCellWithStop(cells[target]);
        else onNavigateBefore?.(currentCol === 0 ? columns - 1 : currentCol - 1, 1);
        break;
      }
      case 'ArrowDown': {
        if (currentRow < totalRows - 1) {
          const target = findFocusableInDirection(cells, currentIndex + columns, columns);
          if (target !== -1) focusCellWithStop(cells[target]);
          else onNavigateAfter?.(currentCol, columns);
        } else onNavigateAfter?.(currentCol, columns);
        break;
      }
      case 'ArrowUp': {
        if (currentRow > 0) {
          const target = findFocusableInDirection(cells, currentIndex - columns, -columns);
          if (target !== -1) focusCellWithStop(cells[target]);
          else onNavigateBefore?.(currentCol, columns);
        } else onNavigateBefore?.(currentCol, columns);
        break;
      }
      case 'Home':
        if (e.ctrlKey || e.metaKey) focusFirst();
        else {
          const rowStart = currentRow * columns;
          const rowEnd = Math.min(rowStart + columns - 1, cells.length - 1);
          const target = findFocusableInDirection(cells, rowStart, 1);
          if (target !== -1 && target <= rowEnd) focusCellWithStop(cells[target]);
        }
        break;
      case 'End':
        if (e.ctrlKey || e.metaKey) focusLast();
        else {
          const rowStart = currentRow * columns;
          const rowEnd = Math.min(rowStart + columns - 1, cells.length - 1);
          const target = findFocusableInDirection(cells, rowEnd, -1);
          if (target !== -1 && target >= rowStart) focusCellWithStop(cells[target]);
        }
        break;
      case 'PageUp':
        onPageUp?.(e);
        break;
      case 'PageDown':
        onPageDown?.(e);
        break;
      default:
        handled = false;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return {handleKeyDown, handleFocus: syncTabStops, syncTabStops, focusCell, focusFirst, focusLast};
}
