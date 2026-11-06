// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Ports the `onLinkClick` handler of @astryxdesign/core 0.7.9
// src/Markdown/Markdown.tsx (renderInline, case 'link').

/**
 * data-ax-link-click on a Markdown root — Astryx `onLinkClick(href, event)` as a DOM event: a
 * click on a link the document rendered dispatches `astryx-link-click` {href, event} from the
 * link (bubbles, composed, cancelable). `preventDefault()` on it stops the navigation (Astryx's
 * `return false`). Only rendered links take part: a blocked destination is a `<span>` and never
 * reaches the event. One delegated listener per root, so streamed links need no wiring.
 */
import {defineBehavior} from '../elements/behavior';

defineBehavior('link-click', (root) => {
  const onClick = (event: MouseEvent) => {
    const link = (event.target as Element | null)?.closest?.('a[href]');
    if (!link || !root.contains(link) || link.closest('[data-ax-link-click]') !== root) return;
    const href = link.getAttribute('href') ?? '';
    const custom = new CustomEvent('astryx-link-click', {detail: {href, event}, bubbles: true, composed: true, cancelable: true});
    if (!link.dispatchEvent(custom)) event.preventDefault();
  };
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
});
