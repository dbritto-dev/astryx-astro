/**
 * `data-truncate-tooltip="<placement>"` — the full-text tooltip of a truncated Text/Heading
 * (`maxLines > 0`, `hasTruncateTooltip`).
 *
 * Port of @astryxdesign/core Text/useTruncation.ts (single line: scrollWidth > offsetWidth;
 * multi-line: the content Range's height > offsetHeight, since -webkit-line-clamp reports a
 * clamped scrollHeight; one shared ResizeObserver plus one document MutationObserver for
 * content changes) and the sibling-mode Tooltip Text.tsx renders while truncated
 * (Text/text.stylex.ts truncationTooltipStyles: max-width 300px, word-break break-word).
 *
 * While an element is truncated it gets an `<ax-tooltip>` sibling holding its full text and
 * `aria-describedby` + `data-ax-tooltip` pointing at it; when it stops being truncated both go.
 * Hover shows it (the text is not focusable, so focus does not, as in Astryx).
 */
import '../components/Layer/Layer.css';
import '../components/Tooltip/Tooltip.css';
import '../elements/runtime/tooltip';

const ATTR = 'data-truncate-tooltip';
const PLACEMENTS = new Set(['above', 'below', 'start', 'end']);
const tips = new WeakMap<HTMLElement, HTMLElement>();
let counter = 0;
let resizeObserver: ResizeObserver | null = null;
const observed = new WeakSet<HTMLElement>();

/** Whether the element's text overflows its clamp. */
export function isTruncated(el: HTMLElement): boolean {
  // Text/Heading render data-truncate="single" for maxLines 1 and "multi" above.
  if (el.getAttribute('data-truncate') !== 'multi') return el.scrollWidth > el.offsetWidth;
  let contentHeight = el.scrollHeight;
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    contentHeight = range.getBoundingClientRect().height;
    range.detach();
  } catch {
    // scrollHeight fallback
  }
  return contentHeight > el.offsetHeight + 0.5;
}

function textOf(el: HTMLElement): string {
  return el.textContent ?? '';
}

function createTip(el: HTMLElement): HTMLElement {
  const tip = document.createElement('ax-tooltip');
  const placement = el.getAttribute(ATTR) ?? 'above';
  tip.id = `ax-truncate-tip-${(++counter).toString(36)}`;
  tip.setAttribute('popover', 'hint');
  tip.setAttribute('role', 'tooltip');
  tip.className = 'astryx-tooltip ax-layer ax-layer-motion';
  tip.setAttribute('data-astryx-layer-root', '');
  tip.setAttribute('data-placement', PLACEMENTS.has(placement) ? placement : 'above');
  tip.setAttribute('data-align', 'center');
  tip.setAttribute('data-astryx-keep-clear', '');
  tip.style.setProperty('--_astryx-layer-clearance', 'var(--spacing-1)');
  const content = document.createElement('span');
  content.className = 'ax-tooltip-content';
  const text = document.createElement('span');
  text.className = 'ax-truncate-tooltip-text';
  content.append(text);
  tip.append(content);
  return tip;
}

function describe(el: HTMLElement, id: string, on: boolean) {
  const ids = new Set((el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
  if (on) ids.add(id);
  else ids.delete(id);
  if (ids.size) el.setAttribute('aria-describedby', [...ids].join(' '));
  else el.removeAttribute('aria-describedby');
  if (on) el.setAttribute('data-ax-tooltip', id);
  else if (el.getAttribute('data-ax-tooltip') === id) el.removeAttribute('data-ax-tooltip');
}

function check(el: HTMLElement) {
  let tip = tips.get(el);
  if (!el.isConnected || !el.hasAttribute(ATTR)) {
    if (tip) { tip.remove(); describe(el, tip.id, false); tips.delete(el); }
    return;
  }
  if (isTruncated(el)) {
    if (!tip) {
      tip = createTip(el);
      tips.set(el, tip);
      el.after(tip);
      describe(el, tip.id, true);
    }
    const holder = tip.querySelector('.ax-truncate-tooltip-text');
    const text = textOf(el);
    if (holder && holder.textContent !== text) holder.textContent = text;
  } else if (tip) {
    (tip as HTMLElement & {hideNow?: () => void}).hideNow?.();
    tip.remove();
    describe(el, tip.id, false);
    tips.delete(el);
  }
}

function watch(el: HTMLElement) {
  if (observed.has(el)) return;
  observed.add(el);
  resizeObserver ??= new ResizeObserver((entries) => {
    for (const entry of entries) check(entry.target as HTMLElement);
  });
  // The first observation reports at once, which runs the first measurement.
  resizeObserver.observe(el);
}

function scan(root: ParentNode) {
  if (root instanceof HTMLElement && root.hasAttribute(ATTR)) watch(root);
  root.querySelectorAll<HTMLElement>(`[${ATTR}]`).forEach(watch);
}

function start() {
  scan(document);
  new MutationObserver((records) => {
    const recheck = new Set<HTMLElement>();
    for (const r of records) {
      if (r.type === 'attributes') {
        const el = r.target as HTMLElement;
        if (el.hasAttribute(ATTR)) watch(el);
        recheck.add(el);
        continue;
      }
      r.addedNodes.forEach((n) => { if (n instanceof HTMLElement && n.tagName !== 'AX-TOOLTIP') scan(n); });
      // New text in a box that keeps its size fires no resize.
      const host = (r.target instanceof Element ? r.target : r.target.parentElement)?.closest<HTMLElement>(`[${ATTR}]`);
      if (host) recheck.add(host);
    }
    for (const el of recheck) check(el);
  }).observe(document.documentElement, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [ATTR]});
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
}
