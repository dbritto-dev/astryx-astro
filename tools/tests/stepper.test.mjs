#!/usr/bin/env node
/**
 * Stepper / Step (behaviors/stepper.ts) against the built docs.
 * Covers: <ol> + aria-label, exactly one aria-current="step", progress / indicator / status
 * text / clickable names per step, astryx-step-click (cancelable) and the default move,
 * disabled steps keep focus and stay inert, `activeStep` setter re-deriving every step,
 * single-advance fill timing, on-track caps, compact horizontal layout with summary controls
 * skipping disabled steps, vertical layout.
 */
import {setup} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('stepper');
await page.evaluate(() => {
  window.__events = [];
  document.addEventListener('astryx-step-click', (e) => window.__events.push({index: e.detail.index, list: e.target.getAttribute('data-test')}));
});
const events = () => page.evaluate(() => window.__events.splice(0));
const W = '#stepper-wizard';
const snapshot = (sel) => page.$eval(sel, (ol) => [...ol.children].map((li) => {
  const ind = li.querySelector('.astryx-step-indicator');
  return {
    current: li.getAttribute('aria-current'),
    progress: li.dataset.progress,
    kind: ind?.dataset.axKind ?? null,
    tone: ind?.dataset.axTone ?? null,
    text: ind?.textContent?.trim() ?? null,
    hasSvg: !!ind?.querySelector('svg'),
    status: li.querySelector('[data-ax-step-status]')?.textContent ?? '',
    name: li.querySelector('[data-ax-step-button]')?.getAttribute('aria-label') ?? null,
    label: li.querySelector('.astryx-step-label')?.dataset.progress,
  };
}));

check('an <ol> named "Progress" by default', await page.$eval(W, (ol) => ol.tagName === 'OL' && ol.getAttribute('aria-label') === 'Progress'));
let s = await snapshot(W);
check('exactly one aria-current="step", on activeStep', s.filter((x) => x.current === 'step').length === 1 && s[1].current === 'step', JSON.stringify(s.map((x) => x.current)));
check('progress: completed / in-progress / not-started', s.map((x) => x.progress).join() === 'completed,in-progress,not-started,not-started,not-started');
check('auto indicator: check, ring, error glyph, numbers', s[0].hasSvg && s[0].kind === 'icon' && s[1].hasSvg && s[2].tone === 'error' && s[3].kind === 'number' && s[3].text === '4');
check('status text for AT: completed / error', s[0].status === 'completed' && s[2].status === 'error' && s[1].status === '');
check('clickable names', s[0].name === 'Go to step 1: Account, completed' && s[1].name === 'Go to step 2: Profile' && s[2].name === 'Go to step 3: Billing, error', JSON.stringify(s.map((x) => x.name)));
check('description describes the clickable step', await page.$eval(`${W} > li:first-child [data-ax-step-button]`, (b) => document.getElementById(b.getAttribute('aria-describedby'))?.textContent?.includes('Email')));
check('optional affordance', await page.$eval(`${W} > li:nth-child(4)`, (li) => li.textContent.includes('Optional')));

// Click a step: event + default move.
await page.click(`${W} > li:first-child [data-ax-step-button]`);
let e = await events();
check('astryx-step-click {index: 0}', e.length === 1 && e[0].index === 0, JSON.stringify(e));
s = await snapshot(W);
check('aria-current moves to the clicked step', s[0].current === 'step' && s[1].current === null);
check('steps re-derive: ring on step 1, number on step 2', s[0].kind === 'icon' && s[1].kind === 'number' && s[1].text === '2' && s[0].status === '' && s[0].name === 'Go to step 1: Account');
check('labels re-derive', s[0].label === 'in-progress' && s[1].label === 'not-started');

// Cancelled click keeps the step.
await page.evaluate(() => document.addEventListener('astryx-step-click', (ev) => ev.preventDefault(), {once: true}));
await page.click(`${W} > li:nth-child(3) [data-ax-step-button]`);
s = await snapshot(W);
check('a cancelled astryx-step-click keeps the current step', s[0].current === 'step');
await events();

// Disabled step: focusable, inert.
const disabled = `${W} > li:nth-child(5) [data-ax-step-button]`;
check('disabled step keeps its button with aria-disabled', await page.$eval(disabled, (b) => b.getAttribute('aria-disabled') === 'true' && b.tabIndex === 0));
await page.click(disabled, {force: true});
check('disabled step: no event, no move', (await events()).length === 0 && (await snapshot(W))[0].current === 'step');

// activeStep setter (demo Next button) and single-advance fill timing.
await page.click('[data-test="next"]');
s = await snapshot(W);
check('activeStep setter: Next moves aria-current to step 2', s[1].current === 'step' && s[0].progress === 'completed' && s[0].status === 'completed');
const timing = await page.$eval(W, (ol) => [...ol.querySelectorAll('.astryx-step-bar')].map((b) => b.style.getPropertyValue('--_ax-fill-duration')));
check('single advance: only the crossed bar gets a fill duration', timing[1] === 'var(--duration-medium)' && timing.filter((t) => t !== '0s').length === 1, JSON.stringify(timing));
check('bars filled up to the active step', await page.$eval(W, (ol) => [...ol.querySelectorAll('.astryx-step-bar')].map((b) => b.dataset.axFill).join() === 'filled,filled,empty,empty,empty'));
await page.$eval(W, (ol) => { ol.activeStep = 3; });
const jump = await page.$eval(W, (ol) => [...ol.querySelectorAll('.astryx-step-bar')].map((b) => b.style.getPropertyValue('--_ax-fill-duration')));
check('a jump lands at once (all 0s)', jump.every((t) => t === '0s'), JSON.stringify(jump));

// On-track caps.
const OT = '[data-test="on-track"]';
check('on-track: first lead and last rail segments hidden', await page.$eval(OT, (ol) => {
  const vis = (el) => getComputedStyle(el).visibility;
  return vis(ol.firstElementChild.querySelector('[data-ax-seg="lead"]')) === 'hidden' && vis(ol.lastElementChild.querySelector('[data-ax-seg="rail"]')) === 'hidden' && vis(ol.children[1].querySelector('[data-ax-seg="lead"]')) === 'visible';
}));
check('on-track status glyphs on non-current steps', await page.$eval(OT, (ol) => ol.children[0].querySelector('.astryx-step-indicator').dataset.axTone === 'success' && ol.children[1].querySelector('.astryx-step-indicator').dataset.axTone === 'warning'));

// Compact horizontal.
const C = '[data-test="compact"]';
check('narrow horizontal stepper is compact', await page.$eval(C, (ol) => ol.hasAttribute('data-ax-compact')));
check('compact: step buttons leave the layout, names stay for AT', await page.$eval(C, (ol) => [...ol.querySelectorAll('[data-ax-step-button]')].every((b) => b.getClientRects().length === 0) && ol.querySelectorAll('.ax-step-compact-name').length === 4));
const summary = await page.$eval(C, (ol) => {
  const sum = ol.parentElement.querySelector('[data-ax-stepper-summary]');
  return {hidden: sum.hidden, text: sum.querySelector('[data-ax-stepper-summary-body]').textContent, ariaHidden: sum.querySelector('[data-ax-stepper-summary-body]').getAttribute('aria-hidden'),
    controls: [...sum.querySelectorAll('[data-ax-stepper-control]')].map((b) => `${b.getAttribute('aria-label')}:${b.getAttribute('aria-disabled') ?? ''}`)};
});
check('summary row names the current step (aria-hidden)', !summary.hidden && summary.text.includes('Two') && summary.ariaHidden === 'true', JSON.stringify(summary));
check('summary controls named Previous / Next step', summary.controls.join() === 'Previous step:,Next step:', JSON.stringify(summary.controls));
await page.click(`[data-test="compact-host"] [data-ax-stepper-control="1"]`);
e = await events();
check('Next control skips the disabled step', e.length === 1 && e[0].index === 3 && await page.$eval(C, (ol) => ol.children[3].getAttribute('aria-current') === 'step'), JSON.stringify(e));
check('Next control disabled at the end', await page.$eval(`[data-test="compact-host"] [data-ax-stepper-control="1"]`, (b) => b.getAttribute('aria-disabled') === 'true'));
await page.setViewportSize({width: 1400, height: 900});
await page.$eval('[data-test="compact-host"]', (el) => { el.style.maxWidth = '900px'; });
await page.waitForTimeout(150);
check('widening leaves the compact layout', await page.$eval(C, (ol) => !ol.hasAttribute('data-ax-compact') && ol.parentElement.querySelector('[data-ax-stepper-summary]').hidden));

// Vertical.
check('vertical: list of steps with aria-current', await page.$eval('[data-test="vertical"]', (ol) => ol.dataset.orientation === 'vertical' && ol.children[1].getAttribute('aria-current') === 'step' && !ol.parentElement.classList.contains('astryx-stepper-frame')));

await done();
