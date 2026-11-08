/**
 * The bottom-sheet stack: open order, recede depth, one scrim, the replace handoff, and the
 * focus helpers sheet hosts share. Port of @astryxdesign/core 0.7.9
 * BottomSheet/bottomSheetStack.ts (registry, views, detectReplace, reportBottomSheetMotion,
 * closeDialogKeepingFocus, focusSheetPanel, getBottomSheetBeneath, writeScrimOpacity).
 *
 * Each modal sheet keeps its own native `<dialog>`; the top layer already paints a later
 * `showModal()` above an earlier one and the later dialog blocks the earlier one. This
 * registry decides how far each covered sheet recedes, whose `::backdrop` is the one scrim,
 * and when a close + open is a replace. Order is open order (a reopen goes on top). Same-task
 * opens (several sheets open on load) follow document order, which is the order hosts connect
 * and present in, so no top-layer reconciliation is needed.
 *
 * Batches: a host reports every flip (open, close) as it happens; the batch seals in a
 * microtask (before anything paints). A replace is exactly one close and one open in a batch,
 * same modality, neither dialog containing the other, the closing sheet the top open sheet,
 * and the actor (the control last pressed in a sheet within 1s, else the element focused at
 * the first flip) inside the closing sheet (or nowhere). A switcher forces the pairing.
 * Everything else exits with its own motion. Several modal sheets closing in one batch
 * return focus once, to the bottom one's opener, after the last dialog has closed.
 *
 * One registry per realm under a versioned global symbol (two bundles share one stack).
 * SSR-safe: nothing touches the DOM on import.
 */
import {focusForLastInput} from '../runtime/modality';
import {isTransitionRunning, prefersReducedMotion, waitForTransition} from './motion';

export type SheetReplacedMotion = 'covered' | 'aligning' | 'fading';
export type SheetFocusReason = 'open' | 'reveal' | 'replace';

export interface SheetStackView {
  /** Another modal sheet is presented alongside this one. */
  readonly isStacked: boolean;
  /** The open sheet on top. */
  readonly isTop: boolean;
  /** Open with at least one open sheet above it. */
  readonly isCovered: boolean;
  /** Open sheets above (drives the recede). */
  readonly depth: number;
  /** This sheet's `::backdrop` is the stack's one visible scrim. */
  readonly ownsScrim: boolean;
  /** Covered and containing no presented sheet: inert and hidden from AT. */
  readonly isBlocked: boolean;
  /** Closing, and an open sheet above owns the scrim now: drop the backdrop at once. */
  readonly isScrimTakenOver: boolean;
  /** Closed and being replaced (retained, aligning, fading) instead of sliding out. */
  readonly replacedMotion: SheetReplacedMotion | null;
  readonly alignmentOffset: number;
  /** Open and replacing the sheet that closed with it. */
  readonly isReplacing: boolean;
}

export const DEFAULT_VIEW: SheetStackView = {
  isStacked: false,
  isTop: false,
  isCovered: false,
  depth: 0,
  ownsScrim: false,
  isBlocked: false,
  isScrimTakenOver: false,
  replacedMotion: null,
  alignmentOffset: 0,
  isReplacing: false,
};

/** What a sheet host (`<ax-bottom-sheet>`) gives the registry. */
export interface SheetStackHost {
  readonly dialog: HTMLDialogElement | null;
  readonly panel: HTMLElement | null;
  readonly isModal: boolean;
  /** Receive this host's view whenever it changes. */
  applyView(view: SheetStackView): void;
  /** The batch sealed and this close is an exit: run it (the host calls `sheetExited` after). */
  beginExit(): void;
  /** The replace is over: close the dialog keeping focus, end the close lifecycle. */
  finishReplaced(): void;
  /** Move focus into the sheet. */
  focusSheet(reason: SheetFocusReason): void;
  /** The element focus returns to when the sheet closes the flow. */
  getOpener(): HTMLElement | null;
  /** Adopt the replaced sheet's opener. */
  setOpener(opener: HTMLElement | null): void;
}

interface ReplaceState {
  replacer: Entry;
  motion: SheetReplacedMotion;
  alignmentOffset: number;
  alignDone: boolean;
  enterDone: boolean;
  cancel: Array<() => void>;
}

interface Entry {
  host: SheetStackHost;
  doc: Document;
  seq: number;
  isOpen: boolean;
  view: SheetStackView;
  replace: ReplaceState | null;
  replacing: Entry | null;
  /** Member of a group of sheets closing in one batch. */
  group: ClosingGroup | null;
}

interface ClosingGroup {
  members: Set<Entry>;
  returnTarget: HTMLElement | null;
}

interface Batch {
  opened: Entry[];
  closed: Entry[];
  actor: Element | null;
  forceReplace: boolean;
  scheduled: boolean;
}

interface State {
  entries: Entry[];
  seq: number;
  batch: Batch;
  lastPress: WeakMap<Document, {target: Element; at: number}>;
  pendingGroupReturn: WeakMap<Document, ClosingGroup>;
}

const KEY = Symbol.for('astryx-astro/bottom-sheet-stack/v1');
const PRESS_ACTOR_WINDOW_MS = 1000;
const ALIGNMENT_THRESHOLD_PX = 1;

function state(): State {
  const holder = globalThis as typeof globalThis & {[KEY]?: State};
  if (!holder[KEY]) {
    Object.defineProperty(holder, KEY, {
      value: {
        entries: [],
        seq: 0,
        batch: {opened: [], closed: [], actor: null, forceReplace: false, scheduled: false},
        lastPress: new WeakMap(),
        pendingGroupReturn: new WeakMap(),
      } satisfies State,
    });
  }
  return holder[KEY]!;
}

const entryOf = (host: SheetStackHost) => state().entries.find((e) => e.host === host) ?? null;

function group(doc: Document, isModal: boolean): Entry[] {
  return state().entries.filter((e) => e.doc === doc && e.host.isModal === isModal).sort((a, b) => a.seq - b.seq);
}

function sameView(a: SheetStackView, b: SheetStackView): boolean {
  return (Object.keys(a) as Array<keyof SheetStackView>).every((k) => a[k] === b[k]);
}

function computeViews(doc: Document, isModal: boolean): void {
  const order = group(doc, isModal);
  const changed: Entry[] = [];
  const set = (entry: Entry, view: SheetStackView) => {
    if (!sameView(entry.view, view)) {
      entry.view = view;
      changed.push(entry);
    }
  };
  if (!isModal) {
    for (const entry of order) {
      set(entry, {...DEFAULT_VIEW, replacedMotion: entry.replace?.motion ?? null, alignmentOffset: entry.replace?.alignmentOffset ?? 0, isReplacing: entry.replacing != null});
    }
  } else {
    const open = order.filter((e) => e.isOpen);
    const top = open[open.length - 1] ?? null;
    const owner = order.find((e) => e.isOpen || e.replace != null) ?? null;
    order.forEach((entry, index) => {
      let depth = 0;
      for (let above = index + 1; above < order.length; above++) {
        if (order[above].isOpen && order[above] !== entry.replace?.replacer) depth++;
      }
      const isCovered = entry.isOpen && depth > 0;
      const dialog = entry.host.dialog;
      const containsPresented = dialog != null && order.some((o) => o !== entry && o.host.dialog != null && dialog.contains(o.host.dialog));
      set(entry, {
        isStacked: order.length > 1,
        isTop: entry === top,
        isCovered,
        depth,
        ownsScrim: entry === owner,
        isBlocked: isCovered && !containsPresented,
        isScrimTakenOver: !entry.isOpen && owner != null && owner !== entry,
        replacedMotion: entry.replace?.motion ?? null,
        alignmentOffset: entry.replace?.alignmentOffset ?? 0,
        isReplacing: entry.replacing != null,
      });
    });
  }
  for (const entry of changed) entry.host.applyView(entry.view);
}

function update(entry: Entry): void {
  computeViews(entry.doc, entry.host.isModal);
}

function actorFor(doc: Document): Element | null {
  const press = state().lastPress.get(doc);
  if (press && press.target.isConnected && Date.now() - press.at <= PRESS_ACTOR_WINDOW_MS) return press.target;
  return doc.activeElement;
}

function noteFlip(entry: Entry, flip: 'opened' | 'closed'): void {
  const {batch} = state();
  if (batch.opened.length === 0 && batch.closed.length === 0) batch.actor = actorFor(entry.doc);
  const list = flip === 'opened' ? batch.opened : batch.closed;
  if (!list.includes(entry)) list.push(entry);
  if (!batch.scheduled) {
    batch.scheduled = true;
    queueMicrotask(seal);
  }
}

/** A sheet records the presses that land in it (its own dialog listener, not the document's). */
export function noteSheetPress(dialog: HTMLDialogElement, target: EventTarget | null): void {
  if (target instanceof Element) state().lastPress.set(dialog.ownerDocument, {target, at: Date.now()});
}

/**
 * Whether a sheet that is about to open will own the stack's scrim (nothing modal is open or
 * retained in its document). Read before `showModal()` so its backdrop starts right.
 */
export function willOwnScrim(dialog: HTMLDialogElement): boolean {
  return !state().entries.some((e) => e.doc === dialog.ownerDocument && e.host.isModal && e.host.dialog !== dialog && (e.isOpen || e.replace != null));
}

/** The element focused when this batch's first flip arrived (read it before the first show). */
export function primeBatchActor(doc: Document): void {
  const {batch} = state();
  if (batch.opened.length === 0 && batch.closed.length === 0 && !batch.scheduled) batch.actor = actorFor(doc);
}

/** The next close + open of this task is a replace whatever the actor (a switcher step change). */
export function forceReplaceThisTask(): void {
  const {batch} = state();
  batch.forceReplace = true;
  if (!batch.scheduled) {
    batch.scheduled = true;
    queueMicrotask(seal);
  }
}

/** A sheet presented (after `showModal()` / `showPopover()`): it goes on top of its group. */
export function sheetOpened(host: SheetStackHost): void {
  const st = state();
  const dialog = host.dialog;
  if (!dialog) return;
  let entry = entryOf(host);
  if (entry) {
    // Reopened during its exit or while it was being replaced: a sheet again, on top.
    if (entry.replace) {
      for (const c of entry.replace.cancel.splice(0)) c();
      if (entry.replace.replacer.replacing === entry) entry.replace.replacer.replacing = null;
      entry.replace = null;
    }
    entry.group?.members.delete(entry);
    entry.group = null;
    entry.isOpen = true;
    entry.seq = ++st.seq;
  } else {
    entry = {host, doc: dialog.ownerDocument, seq: ++st.seq, isOpen: true, view: DEFAULT_VIEW, replace: null, replacing: null, group: null};
    st.entries.push(entry);
  }
  noteFlip(entry, 'opened');
  update(entry);
}

/** A sheet started to close. The batch decides whether it exits or is replaced. */
export function sheetClosing(host: SheetStackHost): void {
  const entry = entryOf(host);
  if (!entry || !entry.isOpen) return;
  entry.isOpen = false;
  // A replacing sheet that closes drops the sheet it was replacing (unless it comes back).
  noteFlip(entry, 'closed');
  update(entry);
}

/** The sheet's dialog left the top layer (exit over, replace over, or removed). */
export function sheetExited(host: SheetStackHost): void {
  const st = state();
  const entry = entryOf(host);
  if (!entry) return;
  st.entries.splice(st.entries.indexOf(entry), 1);
  if (entry.replace) {
    for (const c of entry.replace.cancel.splice(0)) c();
    if (entry.replace.replacer.replacing === entry) entry.replace.replacer.replacing = null;
    entry.replace = null;
  }
  if (entry.replacing) {
    entry.replacing.replace = null;
    entry.replacing = null;
  }
  const grp = entry.group;
  entry.group = null;
  if (grp) {
    grp.members.delete(entry);
    if (grp.members.size === 0) st.pendingGroupReturn.set(entry.doc, grp);
  }
  st.batch.opened = st.batch.opened.filter((e) => e !== entry);
  st.batch.closed = st.batch.closed.filter((e) => e !== entry);
  entry.view = DEFAULT_VIEW;
  host.applyView(DEFAULT_VIEW);
  computeViews(entry.doc, host.isModal);
}

/** Whether `host` closes as part of a group (several sheets in one batch). */
export function isClosingTogether(host: SheetStackHost): boolean {
  return entryOf(host)?.group != null;
}

/**
 * Called by a host once its dialog closed: the focus a closing group owes (bottom sheet's
 * opener), when this was its last member. Returns the target, or null.
 */
export function takeGroupReturnTarget(doc: Document): HTMLElement | null {
  const st = state();
  const grp = st.pendingGroupReturn.get(doc);
  st.pendingGroupReturn.delete(doc);
  return grp?.returnTarget ?? null;
}

/** The open sheet directly beneath `host` in its group, or null. */
export function sheetBeneath(host: SheetStackHost): SheetStackHost | null {
  const entry = entryOf(host);
  const doc = host.dialog?.ownerDocument;
  if (!doc) return null;
  const order = group(doc, host.isModal);
  const start = entry ? order.indexOf(entry) - 1 : order.length - 1;
  for (let i = start; i >= 0; i--) if (order[i].isOpen && order[i] !== entry) return order[i].host;
  return null;
}

/** The open modal sheet on top of `doc`'s stack, or null. */
export function topSheet(doc: Document): SheetStackHost | null {
  const open = group(doc, true).filter((e) => e.isOpen);
  return open[open.length - 1]?.host ?? null;
}

/** Whether another sheet of `host`'s group is presented (open, exiting or retained). */
export function hasOtherPresented(host: SheetStackHost): boolean {
  const doc = host.dialog?.ownerDocument;
  if (!doc) return false;
  return group(doc, host.isModal).some((e) => e.host !== host);
}

export function viewOf(host: SheetStackHost): SheetStackView {
  return entryOf(host)?.view ?? DEFAULT_VIEW;
}

// ── Seal ─────────────────────────────────────────────────────────────────────

function seal(): void {
  const st = state();
  const batch = st.batch;
  st.batch = {opened: [], closed: [], actor: null, forceReplace: false, scheduled: false};
  const pair = detectReplace(batch);
  const exits = batch.closed.filter((e) => e !== pair?.replaced && st.entries.includes(e) && !e.isOpen);
  // Several modal sheets of one document closing together: one focus return, bottom's opener.
  const modalExits = exits.filter((e) => e.host.isModal);
  if (modalExits.length > 1) {
    const ordered = [...modalExits].sort((a, b) => a.seq - b.seq);
    const grp: ClosingGroup = {members: new Set(ordered), returnTarget: ordered[0].host.getOpener()};
    for (const e of ordered) e.group = grp;
  }
  for (const e of exits) {
    // A replacing sheet that closes drops the sheet it was replacing, as a switcher drops a
    // retained step when the flow is left.
    if (e.replacing && e.replacing.replace?.replacer === e) finishReplace(e.replacing);
    e.host.beginExit();
  }
  if (pair) startReplace(pair.replaced, pair.replacer);
  for (const e of [...batch.opened, ...batch.closed]) if (st.entries.includes(e)) update(e);
}

function detectReplace(batch: Batch): {replaced: Entry; replacer: Entry} | null {
  if (batch.opened.length !== 1 || batch.closed.length !== 1) return null;
  const [replacer] = batch.opened;
  const [replaced] = batch.closed;
  if (replacer === replaced || replaced.doc !== replacer.doc || replaced.host.isModal !== replacer.host.isModal) return null;
  if (!replacer.isOpen || replaced.isOpen) return null;
  const a = replaced.host.dialog;
  const b = replacer.host.dialog;
  if (!a || !b || a.contains(b) || b.contains(a)) return null;
  const wasTop = !group(replaced.doc, replaced.host.isModal).some((o) => o !== replacer && o !== replaced && o.isOpen && o.seq > replaced.seq);
  if (!wasTop) return null;
  if (!batch.forceReplace) {
    const actor = batch.actor;
    const fromReplaced = actor == null || actor === replaced.doc.body || a.contains(actor);
    if (!fromReplaced) return null;
  }
  // A third sheet the closing sheet was itself replacing is dropped at once.
  if (replaced.replacing && replaced.replacing !== replacer) finishReplace(replaced.replacing);
  return {replaced, replacer};
}

function restingTopOf(panel: HTMLElement): number {
  const top = panel.getBoundingClientRect().top;
  const {transform} = getComputedStyle(panel);
  if (!transform || transform === 'none' || typeof DOMMatrixReadOnly !== 'function') return top;
  return top - new DOMMatrixReadOnly(transform).m42;
}

function startReplace(replaced: Entry, replacer: Entry): void {
  replacer.host.setOpener(replaced.host.getOpener());
  const replace: ReplaceState = {replacer, motion: 'covered', alignmentOffset: 0, alignDone: false, enterDone: false, cancel: []};
  replaced.replace = replace;
  replacer.replacing = replaced;
  update(replaced);
  replacer.host.focusSheet('replace');
  // The entering sheet starts to rise: a taller retained sheet moves down to its top edge.
  const enteringPanel = replacer.host.panel;
  const retainedPanel = replaced.host.panel;
  const reduced = prefersReducedMotion(retainedPanel);
  const offset = enteringPanel && retainedPanel && !reduced ? Math.max(0, restingTopOf(enteringPanel) - retainedPanel.getBoundingClientRect().top) : 0;
  const advance = () => {
    if (replaced.replace !== replace) return;
    if (replace.enterDone && (replace.motion !== 'aligning' || replace.alignDone)) {
      replace.motion = 'fading';
      update(replaced);
      replace.cancel.push(waitForTransition(retainedPanel, 'opacity', () => {
        if (replaced.replace === replace) finishReplace(replaced);
      }));
    }
  };
  if (offset > ALIGNMENT_THRESHOLD_PX) {
    replace.motion = 'aligning';
    replace.alignmentOffset = offset;
    update(replaced);
    replace.cancel.push(waitForTransition(retainedPanel, 'transform', () => {
      replace.alignDone = true;
      advance();
    }));
  }
  const markEntered = () => {
    replace.enterDone = true;
    advance();
  };
  // A sheet that came back while it was fading is already in place: its entrance is over.
  if (enteringPanel && isTransitionRunning(enteringPanel, 'transform')) replace.cancel.push(waitForTransition(enteringPanel, 'transform', markEntered));
  else markEntered();
}

function finishReplace(replaced: Entry): void {
  const replace = replaced.replace;
  if (!replace) return;
  for (const c of replace.cancel.splice(0)) c();
  replaced.replace = null;
  if (replace.replacer.replacing === replaced) replace.replacer.replacing = null;
  // The replacer takes the scrim over in this same task; the replaced dialog leaves.
  update(replace.replacer);
  replaced.host.finishReplaced();
}

// ── Shared host helpers ──────────────────────────────────────────────────────

/** Whether a sheet's dialog is presented (modal `open`, or a manual popover). */
export function isPresented(dialog: HTMLDialogElement | null): boolean {
  if (!dialog) return false;
  return dialog.open || dialog.matches(':popover-open');
}

/** Leave the native host, whichever one presents the sheet. */
export function hideSheetHost(dialog: HTMLDialogElement): void {
  // Hiding a popover that is not showing is a no-op.
  if (dialog.hasAttribute('popover')) dialog.hidePopover();
  if (dialog.open) dialog.close();
}

/**
 * Close a dialog without letting the browser move focus: a modal `close()` focuses the
 * element focused at `showModal()` time even when focus is in another dialog by then.
 */
export function closeDialogKeepingFocus(dialog: HTMLDialogElement | null): void {
  if (!dialog || !isPresented(dialog)) return;
  const doc = dialog.ownerDocument;
  const active = doc.activeElement;
  hideSheetHost(dialog);
  if (doc.activeElement !== active && active instanceof HTMLElement && active.isConnected && !dialog.contains(active)) {
    active.focus({preventScroll: true});
  }
}

/**
 * Move focus into a sheet panel (focusSheetPanel). Focus already inside stays put; on
 * `reveal` the panel takes focus (ring only after keyboard input); otherwise a
 * `[data-autofocus]` descendant, else the panel (modal sheets, or a replace).
 */
export function focusSheetPanel(panel: HTMLElement | null, reason: SheetFocusReason, isModal: boolean): void {
  if (!panel) return;
  const host = panel.closest('dialog');
  if (host && (host.hasAttribute('inert') || host.getAttribute('aria-hidden') === 'true')) return;
  const active = panel.ownerDocument.activeElement;
  const inside = active != null && panel.contains(active) && active.closest('dialog') === host;
  if (inside && (reason !== 'replace' || active !== panel)) return;
  if (reason === 'reveal') {
    focusForLastInput(panel);
    return;
  }
  const auto = [...panel.querySelectorAll<HTMLElement>('[data-autofocus]')].find((el) => el.closest('dialog') === host);
  if (auto) auto.focus({preventScroll: true});
  else if (!inside && (isModal || reason === 'replace')) panel.focus({preventScroll: true});
}

/** The pending restore of a dialog's scrim transition pin. */
export interface ScrimWrite {
  frame: number;
}

/**
 * Write a dialog's scrim opacity. A change while the dialog is up is a change of owner and
 * lands with no transition (pinned to 0s for two frames), so the dim never dips or doubles.
 */
export function writeScrimOpacity(dialog: HTMLDialogElement | null, opacity: string, pending: ScrimWrite, instant = true): void {
  if (!dialog) return;
  if (!instant || !isPresented(dialog) || dialog.style.getPropertyValue('--_sheet-scrim-opacity') === opacity) {
    dialog.style.setProperty('--_sheet-scrim-opacity', opacity);
    return;
  }
  dialog.style.setProperty('--_sheet-scrim-duration', '0s');
  dialog.style.setProperty('--_sheet-scrim-opacity', opacity);
  cancelAnimationFrame(pending.frame);
  pending.frame = requestAnimationFrame(() => {
    pending.frame = requestAnimationFrame(() => {
      pending.frame = 0;
      dialog.style.removeProperty('--_sheet-scrim-duration');
    });
  });
}
