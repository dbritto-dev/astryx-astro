/**
 * data-ax-copy — a copy-to-clipboard button: port of @astryxdesign/core hooks/useClipboard.ts
 * (the clipboard write, the transient copied flag with its restarting reset timer, the polite
 * announcement) plus the label/tooltip flips CodeBlock and Timestamp give their copy
 * IconButton. The button stays a native `<button>` (an IconButton), so this is a behaviour.
 *
 * Attributes (server-rendered, already translated):
 *   data-ax-copy                 marker
 *   data-ax-copy-value="…"       the text to copy, or
 *   data-ax-copy-from="<id>"     an element whose text is copied (a <template>'s content)
 *   data-ax-copy-label / data-ax-copied-label        aria-label idle / while copied
 *   data-ax-copy-announce        spoken on success (a swapped aria-label alone is not reliably announced)
 *   data-ax-copy-reset="2000"    ms the copied state lasts (useClipboard resetAfterMs)
 *   data-ax-copy-tooltip="<id>"  the sibling <ax-tooltip> of the button (wired here: Button
 *                                does not take a caller `data-ax-tooltip` yet)
 *   data-ax-copy-tip / data-ax-copied-tip            tooltip text idle / while copied
 * While copied the button carries `data-copied` (CSS swaps the two icon states). The tooltip
 * describes the button only while its text differs from the button's name (Button's
 * `isTooltipName` rule). A click is stopped at the button (CodeBlock: never toggles the
 * collapsible header). Success dispatches `astryx-copy` (bubbles) `{text}` — Astryx `onCopy`.
 * A clipboard rejection changes nothing.
 */
import {defineBehavior} from '../elements/behavior';
import {announce} from '../elements/runtime/announce';

const DEFAULT_RESET_AFTER_MS = 2000;

function copyText(button: HTMLElement): string | null {
  const value = button.getAttribute('data-ax-copy-value');
  if (value != null) return value;
  const id = button.getAttribute('data-ax-copy-from');
  const source = id ? button.ownerDocument.getElementById(id) : null;
  if (!source) return null;
  return source instanceof HTMLTemplateElement ? source.content.textContent : source.textContent;
}

function sync(button: HTMLElement, copied: boolean) {
  button.toggleAttribute('data-copied', copied);
  const label = button.getAttribute(copied ? 'data-ax-copied-label' : 'data-ax-copy-label');
  if (label) button.setAttribute('aria-label', label);
  const tipId = button.getAttribute('data-ax-copy-tooltip');
  if (!tipId) return;
  const tip = button.getAttribute(copied ? 'data-ax-copied-tip' : 'data-ax-copy-tip');
  const content = button.ownerDocument.getElementById(tipId)?.querySelector('.ax-tooltip-content');
  if (content && tip != null && content.textContent !== tip) content.textContent = tip;
  const ids = new Set((button.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
  const name = button.getAttribute('aria-label') ?? '';
  if (tip != null && tip.trim() !== name.trim()) ids.add(tipId);
  else ids.delete(tipId);
  if (ids.size) button.setAttribute('aria-describedby', [...ids].join(' '));
  else button.removeAttribute('aria-describedby');
}

defineBehavior('copy', (button) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const tipId = button.getAttribute('data-ax-copy-tooltip');
  if (tipId && !button.hasAttribute('data-ax-tooltip')) button.setAttribute('data-ax-tooltip', tipId);
  sync(button, false);

  const onClick = async (event: MouseEvent) => {
    event.stopPropagation();
    const text = copyText(button);
    if (text == null) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return; // Clipboard failures leave the copied state unchanged.
    }
    sync(button, true);
    const message = button.getAttribute('data-ax-copy-announce');
    if (message) announce(message, {from: button});
    // Restart on every copy, or a rapid re-copy is reverted early by the previous timer.
    if (timer != null) clearTimeout(timer);
    const reset = Number(button.getAttribute('data-ax-copy-reset') ?? DEFAULT_RESET_AFTER_MS);
    timer = setTimeout(() => {
      timer = null;
      sync(button, false);
    }, Number.isFinite(reset) ? reset : DEFAULT_RESET_AFTER_MS);
    button.dispatchEvent(new CustomEvent('astryx-copy', {detail: {text}, bubbles: true, composed: true}));
  };
  button.addEventListener('click', onClick);
  return () => {
    button.removeEventListener('click', onClick);
    if (timer != null) clearTimeout(timer);
  };
});
