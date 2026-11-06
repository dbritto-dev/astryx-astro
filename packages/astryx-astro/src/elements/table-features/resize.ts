/**
 * Table column-resize behaviour — the client half of @astryxdesign/core
 * Table/plugins/columnResize/useTableColumnResize.tsx: pointer drag on a handle (window
 * listeners, RTL-aware delta), keyboard per the WAI-ARIA window splitter (ArrowLeft/Right
 * ±10px, Shift ±50px, Home → the column's minimum, End → the maximum when bounded), the
 * shared width computation (`computeColumnWidths`: the dragged column — or, for a
 * proportional column, it and its next neighbour inversely — clamped to the floors, the last
 * column taking the remainder), the table-height measurement that lets every handle's
 * indicator reach the last row (`--table-resize-height`, `--table-resize-offset`) and the
 * scroll gate that holds the hover reveal while the region scrolls (`--resize-hint-gate`).
 *
 * Commit: `astryx-column-resize` {updates} — every snapshot column but the last, in px.
 * API: `table.columnWidths` (get/set).
 */
import {registerTableBehavior, type AxTable} from '../table';

const KEYBOARD_STEP = 10;
const KEYBOARD_LARGE_STEP = 50;
const SCROLL_SETTLE_MS = 120;

interface Snapshot {
  key: string;
  th: HTMLTableCellElement;
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
}
interface Drag {
  startX: number;
  resizeIndex: number;
  neighborIndex: number | null;
  snapshots: Snapshot[];
  tableWidth: number;
}

/** Pixel widths of every snapshot column for a drag delta (Astryx computeColumnWidths). */
export function computeColumnWidths(drag: Drag, delta: number): number[] {
  const {snapshots, resizeIndex, neighborIndex, tableWidth} = drag;
  const widths = snapshots.map((s) => s.initialWidth);
  const lastIndex = snapshots.length - 1;
  if (resizeIndex < 0) return widths;
  if (neighborIndex != null) {
    const neighbor = snapshots[neighborIndex];
    const self = snapshots[resizeIndex];
    const maxDelta = neighbor.initialWidth - neighbor.minWidth;
    const minDelta = self.minWidth - self.initialWidth;
    const clamped = Math.max(minDelta, Math.min(delta, maxDelta));
    widths[neighborIndex] = neighbor.initialWidth - clamped;
    widths[resizeIndex] = self.initialWidth + clamped;
  } else {
    const self = snapshots[resizeIndex];
    widths[resizeIndex] = Math.min(self.maxWidth, Math.max(self.minWidth, self.initialWidth + delta));
  }
  if (lastIndex >= 0 && tableWidth > 0) {
    const sumOthers = widths.reduce((sum, w, i) => (i === lastIndex ? sum : sum + w), 0);
    widths[lastIndex] = Math.max(snapshots[lastIndex].minWidth, tableWidth - sumOthers);
  }
  return widths;
}

const num = (raw: string | null | undefined, fallback: number) => {
  const n = raw == null || raw === '' ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

registerTableBehavior('resize', (table: AxTable) => {
  let widths: Record<string, number> = {};
  try {
    widths = JSON.parse(table.getAttribute('data-ax-column-widths') ?? '{}') ?? {};
  } catch {
    widths = {};
  }
  let drag: Drag | null = null;
  const rtl = (el: Element) => (getComputedStyle(el).direction === 'rtl' ? -1 : 1);
  const handleOf = (node: EventTarget | null) => {
    const el = (node as Element | null)?.closest?.<HTMLElement>('[data-resize-handle]');
    return el && table.owns(el) ? el : null;
  };

  const snapshot = (handle: HTMLElement, startX: number): Drag | null => {
    const th = handle.closest('th');
    const row = th?.parentElement;
    const tableEl = table.table;
    if (!th || !row || !tableEl) return null;
    const columnKey = handle.dataset.columnKey ?? '';
    const handleMin = num(handle.getAttribute('aria-valuemin'), 50);
    const maxWidth = num(handle.dataset.axMax, Infinity);
    const snapshots: Snapshot[] = [];
    for (const cell of row.querySelectorAll<HTMLTableCellElement>(':scope > th')) {
      const key = cell.getAttribute('data-column-key');
      if (!key || cell.getAttribute('data-ax-resizable') === 'false') continue;
      const rendered = cell.getBoundingClientRect().width;
      snapshots.push({
        key,
        th: cell,
        initialWidth: widths[key] ?? (rendered > 0 ? rendered : 0),
        minWidth: num(cell.getAttribute('data-ax-resize-min'), handleMin),
        maxWidth,
      });
    }
    const resizeIndex = snapshots.findIndex((s) => s.key === columnKey);
    const neighborKey = handle.dataset.axNeighbor;
    const ni = neighborKey ? snapshots.findIndex((s) => s.key === neighborKey) : -1;
    return {startX, resizeIndex, neighborIndex: ni >= 0 ? ni : null, snapshots, tableWidth: tableEl.getBoundingClientRect().width};
  };

  const applyWidths = (d: Drag, values: number[]) => {
    d.snapshots.forEach((s, i) => {
      const px = `${values[i]}px`;
      s.th.style.width = px;
      s.th.style.minWidth = px;
      s.th.style.maxWidth = px;
    });
  };

  const commit = (d: Drag, values: number[]) => {
    const updates: Record<string, number> = {};
    const last = d.snapshots.length - 1;
    d.snapshots.forEach((s, i) => {
      if (i !== last) updates[s.key] = values[i];
    });
    if (Object.keys(updates).length === 0) return;
    widths = {...widths, ...updates};
    for (const handle of table.querySelectorAll<HTMLElement>('thead [data-resize-handle]')) {
      const key = handle.dataset.columnKey ?? '';
      if (table.owns(handle) && key in updates) handle.setAttribute('aria-valuenow', String(updates[key]));
    }
    table.emit('astryx-column-resize', {updates});
  };

  const endDrag = (handle: HTMLElement) => {
    handle.removeAttribute('data-resizing');
    handle.style.removeProperty('--indicator-color');
    handle.style.removeProperty('--indicator-width');
    const tableEl = table.table;
    if (tableEl) tableEl.style.userSelect = '';
  };

  const onPointerDown = (event: PointerEvent) => {
    const handle = handleOf(event.target);
    if (!handle || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const d = snapshot(handle, event.clientX);
    if (!d || d.resizeIndex < 0) return;
    drag = d;
    handle.setAttribute('data-resizing', 'true');
    handle.style.setProperty('--indicator-color', 'var(--color-accent)');
    handle.style.setProperty('--indicator-width', '2px');
    applyWidths(d, computeColumnWidths(d, 0));
    const tableEl = table.table;
    if (tableEl) tableEl.style.userSelect = 'none';
    const sign = rtl(d.snapshots[d.resizeIndex].th);
    const onMove = (ev: PointerEvent) => {
      if (drag !== d) return;
      applyWidths(d, computeColumnWidths(d, (ev.clientX - d.startX) * sign));
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
    const onUp = (ev: PointerEvent) => {
      cleanup();
      if (drag !== d) return;
      drag = null;
      endDrag(handle);
      const values = computeColumnWidths(d, (ev.clientX - d.startX) * sign);
      applyWidths(d, values);
      commit(d, values);
    };
    const onCancel = () => {
      cleanup();
      if (drag !== d) return;
      drag = null;
      endDrag(handle);
      for (const s of d.snapshots) {
        s.th.style.width = '';
        s.th.style.minWidth = '';
        s.th.style.maxWidth = '';
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };

  const resizeBy = (handle: HTMLElement, delta: number) => {
    const d = snapshot(handle, 0);
    if (!d || d.resizeIndex < 0) return;
    const values = computeColumnWidths(d, delta);
    applyWidths(d, values);
    commit(d, values);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const handle = handleOf(event.target);
    if (!handle || event.target !== handle) return;
    const th = handle.closest('th');
    if (!th) return;
    const key = handle.dataset.columnKey ?? '';
    const step = event.shiftKey ? KEYBOARD_LARGE_STEP : KEYBOARD_STEP;
    const minWidth = num(handle.getAttribute('aria-valuemin'), 50);
    const maxWidth = num(handle.dataset.axMax, Infinity);
    const current = () => widths[key] ?? th.getBoundingClientRect().width;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowLeft':
        event.preventDefault();
        resizeBy(handle, step * (event.key === 'ArrowRight' ? 1 : -1) * rtl(th));
        break;
      case 'Home':
        event.preventDefault();
        resizeBy(handle, minWidth - current());
        break;
      case 'End':
        event.preventDefault();
        if (maxWidth !== Infinity) resizeBy(handle, maxWidth - current());
        break;
    }
  };

  // The handles reach from the header to the last row.
  const tableEl = table.table;
  let ro: ResizeObserver | null = null;
  if (tableEl && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => {
      const rect = tableEl.getBoundingClientRect();
      tableEl.style.setProperty('--table-resize-height', `${rect.height}px`);
      let offset = 0;
      for (const handle of tableEl.querySelectorAll<HTMLElement>('[data-resize-handle]')) {
        if (table.owns(handle)) offset = Math.max(offset, handle.getBoundingClientRect().top - rect.top);
      }
      tableEl.style.setProperty('--table-resize-offset', `${offset}px`);
    });
    ro.observe(tableEl);
  }

  // Scroll gate (FR10): columns moving under a still pointer are not a hover.
  let settle: ReturnType<typeof setTimeout> | null = null;
  const supportsScrollEnd = 'onscrollend' in table;
  const clearGate = () => table.style.removeProperty('--resize-hint-gate');
  const onScroll = () => {
    table.style.setProperty('--resize-hint-gate', 'transparent');
    if (supportsScrollEnd) return;
    if (settle != null) clearTimeout(settle);
    settle = setTimeout(clearGate, SCROLL_SETTLE_MS);
  };
  table.addEventListener('scroll', onScroll, {passive: true});
  if (supportsScrollEnd) table.addEventListener('scrollend', clearGate, {passive: true});

  table.addEventListener('pointerdown', onPointerDown);
  table.addEventListener('keydown', onKeyDown);
  table.api.set('resize', {
    get: () => ({...widths}),
    set: (value) => {
      widths = {...(value as Record<string, number>)};
      for (const th of table.headerCells()) {
        const key = th.getAttribute('data-column-key') ?? '';
        if (!(key in widths)) continue;
        const px = `${widths[key]}px`;
        th.style.width = px;
        th.style.minWidth = px;
        th.style.maxWidth = px;
        th.querySelector<HTMLElement>(':scope > [data-resize-handle], :scope > * > [data-resize-handle]')?.setAttribute('aria-valuenow', String(widths[key]));
      }
    },
  });
  return () => {
    ro?.disconnect();
    table.removeEventListener('scroll', onScroll);
    table.removeEventListener('scrollend', clearGate);
    if (settle != null) clearTimeout(settle);
    clearGate();
    table.removeEventListener('pointerdown', onPointerDown);
    table.removeEventListener('keydown', onKeyDown);
    table.api.delete('resize');
  };
});
