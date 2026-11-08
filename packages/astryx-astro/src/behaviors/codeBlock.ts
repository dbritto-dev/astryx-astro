/**
 * data-ax-code-block — CodeBlock's client parts (port of @astryxdesign/core
 * CodeBlock/CodeBlock.tsx: the collapse toggle and RangeCodeContent's highlight effect).
 *
 * - Collapse: the title row `[data-ax-codeblock-toggle]` (role=button) toggles on click and
 *   Enter/Space; it flips `aria-expanded`, the region's `inert` and `data-collapsed` on both
 *   (CSS animates the 1fr → 0fr grid row and turns the chevron). Dispatches
 *   `astryx-collapse-change` (bubbles) `{isCollapsed}` from the `<pre>`.
 * - Ranges (`highlightMode="ranges"`): the tokens rendered as JSON
 *   (`script[data-ax-code-tokens]`) are registered with the CSS Custom Highlight API
 *   (lib/codeblock applyHighlightRangesChunked) over the bare line text; in WebKit (whose
 *   ::highlight() painting in code blocks is unreliable, `isWebKitRenderer()` in
 *   elements/runtime/platform.ts) the lines are rebuilt as `.astryx-token-*` spans instead,
 *   as Astryx falls back.
 */
import {defineBehavior} from '../elements/behavior';
import {isWebKitRenderer} from '../elements/runtime/platform';
import {applyHighlightRangesChunked} from '../lib/codeblock/highlightRanges';
import type {TokenLine} from '../lib/codeblock/tokenizer';

function paintSpans(code: HTMLElement, tokenLines: TokenLine[]) {
  const doc = code.ownerDocument;
  code.querySelectorAll<HTMLElement>('[data-line]').forEach((line, i) => {
    const tokens = tokenLines[i] ?? [];
    const text = line.textContent ?? '';
    if (tokens.length === 0) return;
    const content = doc.createElement('span');
    content.className = 'ax-codeblock-line-content';
    let cursor = 0;
    for (const token of tokens) {
      if (token.start > cursor) content.append(text.slice(cursor, token.start));
      const end = Math.min(token.end, text.length);
      const span = doc.createElement('span');
      span.className = `astryx-token-${token.type} xds-token-${token.type}`;
      span.textContent = text.slice(token.start, end);
      content.append(span);
      cursor = end;
    }
    if (cursor < text.length) content.append(text.slice(cursor));
    line.replaceChildren(content);
  });
}

defineBehavior('code-block', (pre) => {
  const cleanups: Array<() => void> = [];

  const toggle = pre.querySelector<HTMLElement>('[data-ax-codeblock-toggle]');
  const regionId = toggle?.getAttribute('aria-controls');
  const region = regionId ? pre.ownerDocument.getElementById(regionId) : null;
  if (toggle && region) {
    const flip = () => {
      const isCollapsed = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!isCollapsed));
      toggle.toggleAttribute('data-collapsed', isCollapsed);
      region.toggleAttribute('data-collapsed', isCollapsed);
      // Hidden only visually by the 0fr row: inert takes it out of the tab order and the tree.
      region.inert = isCollapsed;
      pre.dispatchEvent(new CustomEvent('astryx-collapse-change', {detail: {isCollapsed}, bubbles: true, composed: true}));
    };
    const onClick = () => flip();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        flip();
      }
    };
    toggle.addEventListener('click', onClick);
    toggle.addEventListener('keydown', onKeyDown);
    cleanups.push(() => {
      toggle.removeEventListener('click', onClick);
      toggle.removeEventListener('keydown', onKeyDown);
    });
  }

  const data = pre.querySelector<HTMLScriptElement>(':scope > script[data-ax-code-tokens]');
  const code = pre.querySelector<HTMLElement>('code');
  if (data && code && !code.hasAttribute('data-ax-painted')) {
    let tokenLines: TokenLine[] = [];
    try {
      tokenLines = JSON.parse(data.textContent ?? '[]') as TokenLine[];
    } catch {
      tokenLines = [];
    }
    if (tokenLines.length > 0) {
      if (!isWebKitRenderer()) {
        code.setAttribute('data-ax-painted', 'ranges');
        const cleanup = applyHighlightRangesChunked(code, tokenLines);
        cleanups.push(() => {
          cleanup();
          code.removeAttribute('data-ax-painted');
        });
      } else {
        code.setAttribute('data-ax-painted', 'spans');
        paintSpans(code, tokenLines);
      }
    }
  }
  return () => {
    for (const fn of cleanups.splice(0)) fn();
  };
});
