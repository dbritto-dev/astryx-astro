// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Ports @astryxdesign/core 0.7.9 src/Markdown/plugins/HeadingLinksRenderer.tsx
// (handleClick, isUnmodifiedPrimaryActivation, COPY_FEEDBACK_MS) with hooks/useClipboard.ts.

/**
 * data-ax-markdown-heading-link="<permalink>" — the `#` copy button createMarkdownHeadingLinks()
 * adds to Markdown headings. An honest copy button, not an anchor: an unmodified primary click
 * (or Enter / Space, which click a button) copies the canonical absolute URL
 * (`new URL(permalink, location.href)`) without navigating, scrolling or touching the hash.
 * Success: `data-copied` (CSS swaps `#` for the check), the button's name becomes the copied
 * label (`data-ax-copied-label`) for 1.5s, and the label is announced politely. A rejected
 * clipboard write changes nothing. Dispatches `astryx-copy` {text} (bubbles).
 */
import {defineBehavior} from '../elements/behavior';
import {announce} from '../elements/runtime/announce';

const COPY_FEEDBACK_MS = 1500;

defineBehavior('markdown-heading-link', (button) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const setCopied = (copied: boolean) => {
    button.toggleAttribute('data-copied', copied);
    const label = button.getAttribute(copied ? 'data-ax-copied-label' : 'data-ax-copy-label');
    if (label) button.setAttribute('aria-label', label);
  };
  const onClick = async (event: MouseEvent) => {
    if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const permalink = button.getAttribute('data-ax-markdown-heading-link');
    if (!permalink) return;
    const text = new URL(permalink, window.location.href).href;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(true);
    const message = button.getAttribute('data-ax-copied-label');
    if (message) announce(message, {from: button});
    if (timer != null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      setCopied(false);
    }, COPY_FEEDBACK_MS);
    button.dispatchEvent(new CustomEvent('astryx-copy', {detail: {text}, bubbles: true, composed: true}));
  };
  button.addEventListener('click', onClick);
  return () => {
    button.removeEventListener('click', onClick);
    if (timer != null) clearTimeout(timer);
  };
});
