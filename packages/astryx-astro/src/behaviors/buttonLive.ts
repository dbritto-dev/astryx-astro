/**
 * data-ax-button-live — Button's loading announcement (@astryxdesign/core Button.tsx,
 * isLiveRegionReady; spec:AST-086 FR3). Many screen readers skip a live region that
 * appears already holding its text, so a Button rendered loading ships its polite region
 * empty, with the translated text in this attribute, and the text is written on the frame
 * after the region exists — which is when it is announced.
 */
import {defineBehavior} from '../elements/behavior';

defineBehavior('button-live', (region) => {
  const frame = requestAnimationFrame(() => {
    const text = region.getAttribute('data-ax-button-live');
    if (text != null && region.textContent !== text) region.textContent = text;
  });
  return () => cancelAnimationFrame(frame);
});
