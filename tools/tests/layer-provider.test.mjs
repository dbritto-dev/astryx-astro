#!/usr/bin/env node
/**
 * LayerProvider renders the toast viewport from its `toast` config (Astryx LayerProvider →
 * ToastHostOutlet): one viewport for the root provider, after its content, with the config's
 * position / maxVisible and the provider's inset; a nested provider renders none (its toast
 * config is ignored) and only narrows the inset; `toast()` finds that viewport (no fallback).
 *   node tools/tests/layer-provider.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('layer');

const vp = await page.evaluate(() => {
  const all = [...document.querySelectorAll('ax-toast-viewport')];
  const v = all[0];
  const root = document.getElementById('layer-provider-root');
  const nested = document.getElementById('layer-provider-nested');
  return {
    count: all.length,
    inRoot: !!v && root.contains(v) && !nested.contains(v),
    afterContent: !!v && [...root.querySelectorAll(':scope > :not(script):not(.ax-toast-home)')].every((el) => el.compareDocumentPosition(v) & Node.DOCUMENT_POSITION_FOLLOWING),
    position: v?.getAttribute('data-position'),
    max: v?.getAttribute('data-max-visible'),
    inset: v?.style.getPropertyValue('--astryx-layer-inset-block-start').trim(),
    rootInset: root.style.getPropertyValue('--astryx-layer-inset-block-start').trim(),
    nestedInset: nested.style.getPropertyValue('--astryx-layer-inset-block-start').trim(),
    nestedDisplay: getComputedStyle(nested).display,
    legacyAttrs: root.hasAttribute('data-astryx-toast-position') || root.hasAttribute('data-astryx-toast-max-visible'),
  };
});
check('the root provider renders one toast viewport, after its content', vp.count === 1 && vp.inRoot && vp.afterContent, JSON.stringify(vp));
check('…from its toast config (bottomEnd, 3 visible) and the provider inset (64px)', vp.position === 'bottomEnd' && vp.max === '3' && vp.inset === '64px', JSON.stringify(vp));
check('a nested provider renders no viewport and ignores its toast config; it narrows the inset (96px)', vp.count === 1 && vp.nestedInset === '96px' && vp.rootInset === '64px' && vp.nestedDisplay === 'contents', JSON.stringify(vp));
check('no data-astryx-toast-* stand-in attributes remain', !vp.legacyAttrs);

await page.click('#layer-provider-toast');
await sleep(250);
const shown = await page.evaluate(() => {
  const v = document.querySelector('ax-toast-viewport');
  let open = false;
  try { open = v.matches(':popover-open'); } catch {}
  return {
    open,
    text: v.querySelector('.ax-toast-content')?.textContent?.trim(),
    fallback: document.querySelector('[data-astryx-toast-fallback]') != null,
    region: v.getAttribute('role'),
  };
});
check('toast() goes to the provider\'s viewport (no fallback viewport), which shows it', shown.open && shown.text === 'Saved to the provider’s viewport' && !shown.fallback, JSON.stringify(shown));

await done();
