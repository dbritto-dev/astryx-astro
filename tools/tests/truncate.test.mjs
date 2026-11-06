#!/usr/bin/env node
/**
 * Text/Heading truncation tooltip (behaviors/truncateTooltip.ts): a tooltip with the full text
 * only while the element is actually truncated.
 *   node tools/tests/truncate.test.mjs
 */
import {setup, isOpen, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('text');

const single = '[data-truncate="single"][data-truncate-tooltip]';
const multi = '[data-truncate="multi"][data-truncate-tooltip]';

await sleep(100);
const s = await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  return {tip: el.getAttribute('data-ax-tooltip'), describedby: el.getAttribute('aria-describedby'), next: el.nextElementSibling?.tagName};
}, single);
check('truncated single-line text gets a tooltip sibling', !!s.tip && s.next === 'AX-TOOLTIP' && s.describedby === s.tip, JSON.stringify(s));
await page.locator(single).scrollIntoViewIfNeeded();
const box = await page.locator(single).boundingBox();
await page.mouse.move(box.x + 20, box.y + box.height / 2, {steps: 2});
await sleep(300);
check('hover shows it', await isOpen(page, `#${s.tip}`));
const content = await page.evaluate((id) => {
  const tip = document.getElementById(id);
  const text = tip.querySelector('.ax-truncate-tooltip-text');
  const cs = getComputedStyle(text);
  return {text: text.textContent, maxWidth: cs.maxWidth, wordBreak: cs.wordBreak, overflowWrap: cs.overflowWrap};
}, s.tip);
check('tooltip holds the full text', content.text.startsWith('Single-line truncation keeps a long sentence'), content.text);
check('content is capped at 300px with break-word', content.maxWidth === '300px' && (content.wordBreak === 'break-word' || content.overflowWrap === 'break-word'), JSON.stringify(content));
await page.mouse.move(1080, 880);
await sleep(200);

const m = await page.evaluate((sel) => document.querySelector(sel).getAttribute('data-ax-tooltip'), multi);
check('a clamped multi-line text gets one too', !!m);

// Widen the container until nothing is truncated: the tooltip goes away.
const removed = await page.evaluate(async (sel) => {
  const el = document.querySelector(sel);
  el.parentElement.style.maxWidth = 'none';
  el.style.width = '2000px';
  await new Promise((r) => setTimeout(r, 150));
  return {tip: el.getAttribute('data-ax-tooltip'), describedby: el.getAttribute('aria-describedby'), next: el.nextElementSibling?.tagName ?? null};
}, single);
check('no tooltip once the text fits', removed.tip === null && removed.describedby === null && removed.next !== 'AX-TOOLTIP', JSON.stringify(removed));

// A short text that never truncates never gets a tooltip.
const short = await page.evaluate(async () => {
  const el = document.createElement('span');
  el.className = 'astryx-text';
  el.dataset.truncate = 'single';
  el.dataset.display = 'block';
  el.setAttribute('data-truncate-tooltip', 'below');
  el.textContent = 'Short';
  el.style.width = '200px';
  document.querySelector('.demo').append(el);
  await new Promise((r) => setTimeout(r, 150));
  return {tip: el.getAttribute('data-ax-tooltip'), next: el.nextElementSibling?.tagName ?? null};
});
check('a short text gets no tooltip', short.tip === null && short.next !== 'AX-TOOLTIP', JSON.stringify(short));
const grown = await page.evaluate(async () => {
  const el = document.querySelector('.demo > span:last-child');
  el.textContent = 'This text grew long enough that the 200px box now truncates it with an ellipsis';
  await new Promise((r) => setTimeout(r, 150));
  const tip = document.getElementById(el.getAttribute('data-ax-tooltip') ?? '');
  return {tip: !!tip, placement: tip?.dataset.placement, text: tip?.textContent};
});
check('new text that truncates gains a tooltip (placement from the attribute)', grown.tip && grown.placement === 'below' && grown.text.startsWith('This text grew'), JSON.stringify(grown));

await done();
