#!/usr/bin/env node
/**
 * Field / FieldLabel in a real browser (run `cd apps/docs && npx astro build` first):
 * label/description wiring around native controls, description click forwarding (focus a
 * text control, toggle a checkbox), group labels (span + id, no `for`), optional/required
 * indicators vs a FormLayout default, the label info-icon tooltip, status message ids,
 * horizontal-labels via FormLayout and via `formDirection` (theme hook data-layout).
 *   node tools/tests/field.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('field');

const wiring = await page.evaluate(() => {
  const input = document.getElementById('field-email');
  return {
    label: document.querySelector('label[for="field-email"]')?.textContent,
    desc: document.getElementById('field-email-help')?.textContent,
    status: document.getElementById('field-date-status')?.textContent,
    statusVariant: document.getElementById('field-date-status')?.dataset.variant,
    detached: document.getElementById('field-range-status')?.dataset.variant,
  };
});
check('label[for] + descriptionID + status messageID render as wired', wiring.label === 'Email address' && wiring.desc === 'We never share your email' && wiring.status === 'This date is in the past' && wiring.statusVariant === 'attached', JSON.stringify(wiring));
check('statusVariant detached + default messageID (`${inputID}-status`)', wiring.detached === 'detached', JSON.stringify(wiring));

await page.click('#field-email-help');
check('description click focuses the text control', await page.evaluate(() => document.activeElement?.id === 'field-email'));
await page.click('text=Clicking this description toggles the box');
check('description click activates a checkbox (like the label)', await page.evaluate(() => document.getElementById('subscribe-box').checked));

const group = await page.evaluate(() => {
  const el = document.getElementById('plan-label');
  return {tag: el?.tagName, hasFor: el?.hasAttribute('for'), name: el?.textContent, describedClickable: document.getElementById('plan-desc')?.hasAttribute('data-ax-field-description')};
});
check('group label: <span id> without for; group description is not click-forwarded', group.tag === 'SPAN' && !group.hasFor && group.name?.startsWith('Plan') && group.describedClickable === false, JSON.stringify(group));

const indicators = await page.evaluate(() => {
  const vis = (el) => !!el && getComputedStyle(el).display !== 'none';
  const project = document.querySelector('label[for="hl-project"] [data-ax-indicator="required"]');
  const owner = [...document.querySelectorAll('.astryx-field-label')].find((l) => l.textContent.startsWith('Owner'));
  return {project: vis(project), owner: vis(owner?.querySelector('[data-ax-indicator="optional"]')), ownerStamp: owner?.dataset.formOptionality};
});
check('defaultOptionality="optional": required shows, optional (the default) is hidden', indicators.project && !indicators.owner && indicators.ownerStamp === 'optional', JSON.stringify(indicators));

await page.hover('label:has-text("Country") .ax-field-label-tip');
await sleep(400);
check('label info icon shows its tooltip on hover', await page.evaluate(() => {
  const icon = document.querySelector('label[for="field-country"] .ax-field-label-tip');
  const tip = document.getElementById(icon.getAttribute('data-ax-tooltip'));
  return tip?.matches(':popover-open') && tip.textContent === 'Used for tax purposes' && !icon.closest('label').contains(tip);
}));

const layout = await page.evaluate(() => {
  const explicit = document.querySelector('[data-test="explicit-layout"]');
  const stamped = document.querySelector('label[for="hl-project"]').closest('.astryx-field');
  return {explicit: explicit.dataset.layout, explicitDisplay: getComputedStyle(explicit).display, stamped: stamped.dataset.formDirection, stampedDisplay: getComputedStyle(stamped).display};
});
check('horizontal labels: FormLayout stamp and explicit formDirection (data-layout hook)', layout.explicit === 'horizontal-labels' && layout.explicitDisplay === 'contents' && layout.stamped === 'horizontal-labels' && layout.stampedDisplay === 'contents', JSON.stringify(layout));

check('labelIcon renders a small icon before the text', await page.evaluate(() => {
  const icon = document.querySelector('label[for="field-icon"] .astryx-icon');
  return icon?.dataset.size === 'sm' && icon.nextSibling?.textContent === 'With icon';
}));

await done();
