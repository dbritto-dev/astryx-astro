/**
 * data-ax-image-fallback — image load-error fallback chains for server-rendered media
 * (Avatar: src → fallbackSrc → initials / person icon; Thumbnail: image → placeholder).
 * Replaces the React `onError → setErroredSrc` state of Avatar.tsx and Thumbnail.tsx.
 *
 * Markup protocol, inside the element carrying `data-ax-image-fallback`:
 *  - the live step: elements with `data-ax-fallback-step="0"` (an <img>, plus anything that
 *    goes with it, e.g. Thumbnail's inset border);
 *  - later steps: `<template data-ax-fallback-step="N">` holding that step's elements, so a
 *    fallback image is not requested and a fallback plate is not in the DOM until needed.
 * When an <img> of the live step fails, that step's elements are removed and the next
 * template is swapped in; an <img> in it continues the chain. An image that already
 * failed before this script ran (`complete` with no natural size) counts as failed.
 */
import {defineBehavior} from '../elements/behavior';

const STEP = 'data-ax-fallback-step';

function stepOf(el: Element): number {
  return Number(el.getAttribute(STEP) ?? 0);
}

function isBroken(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth === 0 && (img.currentSrc || img.src) !== '';
}

defineBehavior('image-fallback', (root) => {
  const advance = (failed: HTMLImageElement) => {
    if (!root.contains(failed) || failed.closest('template')) return;
    const step = stepOf(failed);
    root.querySelectorAll(`[${STEP}="${step}"]:not(template)`).forEach((el) => el.remove());
    const next = Array.from(root.querySelectorAll<HTMLTemplateElement>(`template[${STEP}]`))
      .filter((t) => stepOf(t) > step)
      .sort((a, b) => stepOf(a) - stepOf(b))[0];
    if (!next) return;
    const content = next.content.cloneNode(true) as DocumentFragment;
    const imgs = Array.from(content.querySelectorAll('img'));
    next.replaceWith(content);
    imgs.forEach(check);
  };
  const check = (img: HTMLImageElement) => { if (isBroken(img)) advance(img); };
  const onError = (event: Event) => {
    if (event.target instanceof HTMLImageElement) advance(event.target);
  };
  // `error` does not bubble; capture it on the container.
  root.addEventListener('error', onError, true);
  root.querySelectorAll('img').forEach((img) => { if (!img.closest('template')) check(img); });
  return () => root.removeEventListener('error', onError, true);
});
