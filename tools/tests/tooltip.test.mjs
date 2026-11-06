#!/usr/bin/env node
/**
 * Tooltip / HoverCard / InfoTip: hover intent with delays, the hover bridge, keyboard
 * focus-visible shows, pointer focus does not, press hides, Escape, group handoff,
 * controlled state, never focusable, SSR aria-describedby, HoverCard interactivity and exit
 * grace, InfoTip pinning.
 *   node tools/tests/tooltip.test.mjs
 */
import {setup, isOpen, activeId, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('tooltip');

const tipOf = (sel) => page.getAttribute(sel, 'data-ax-tooltip');
const center = async (sel) => {
  const b = await page.locator(sel).boundingBox();
  return [b.x + b.width / 2, b.y + b.height / 2];
};
const hover = async (sel) => { const [x, y] = await center(sel); await page.mouse.move(x, y, {steps: 2}); };
const away = () => page.mouse.move(1080, 880, {steps: 2});

console.log('SSR wiring');
const aboveTip = await tipOf('#tip-above-trigger');
check('trigger has aria-describedby = layer id in server HTML', (await page.getAttribute('#tip-above-trigger', 'aria-describedby')) === aboveTip);
check('layer is role=tooltip popover=hint', (await page.getAttribute(`#${aboveTip}`, 'role')) === 'tooltip' && (await page.getAttribute(`#${aboveTip}`, 'popover')) === 'hint');
check('tooltip content has no focusable element', await page.evaluate((id) => document.getElementById(id).querySelectorAll('a,button,input,[tabindex]').length === 0 && !document.getElementById(id).hasAttribute('tabindex'), aboveTip));

console.log('Hover with delay');
// The isDefaultOpen tooltip is open on load: Escape dismisses it (top-most), then let the
// 300ms handoff window pass so the next hover waits for its delay.
const defaultTip = await tipOf('button:has-text("isDefaultOpen")');
check('isDefaultOpen is shown on load', await isOpen(page, `#${defaultTip}`));
await page.keyboard.press('Escape');
await sleep(400);
check('Escape dismisses the default-open tooltip', !(await isOpen(page, `#${defaultTip}`)));
await hover('#tip-above-trigger');
await sleep(80);
check('not shown before the 200ms delay', !(await isOpen(page, `#${aboveTip}`)));
await sleep(220);
check('shown after the delay', await isOpen(page, `#${aboveTip}`));
const t = await page.locator('#tip-above-trigger').boundingBox();
const l = await page.locator(`#${aboveTip}`).boundingBox();
check('placed above its trigger, centered, with clearance', l.y + l.height <= t.y && t.y - (l.y + l.height) < 10 && Math.abs((l.x + l.width / 2) - (t.x + t.width / 2)) < 2, JSON.stringify({t, l}));
// Move onto the surface through the gap: the bridge keeps it open.
await page.mouse.move(l.x + l.width / 2, l.y + l.height / 2, {steps: 3});
await sleep(200);
check('hovering the surface keeps it open (hover bridge)', await isOpen(page, `#${aboveTip}`));
await away();
await sleep(180);
check('leaving hides it', !(await isOpen(page, `#${aboveTip}`)));

console.log('Group handoff');
await sleep(400); // let the skip window expire
await hover('#tip-above-trigger');
await sleep(260);
check('first tooltip open', await isOpen(page, `#${aboveTip}`));
const belowTip = await tipOf('#tip-below-trigger');
await hover('#tip-below-trigger');
await sleep(40);
check('moving to a neighbour shows its tooltip without the delay', await isOpen(page, `#${belowTip}`));
check('and replaces the previous one', !(await isOpen(page, `#${aboveTip}`)));
await away();
await sleep(500);

console.log('Press hides; pointer focus does not show');
await hover('#tip-nodelay-trigger');
await sleep(60);
const noDelayTip = await tipOf('#tip-nodelay-trigger');
check('delay=0 shows at once', await isOpen(page, `#${noDelayTip}`));
await page.mouse.down();
await page.mouse.up();
await sleep(60);
check('pressing the trigger hides its tooltip', !(await isOpen(page, `#${noDelayTip}`)));
check('the trigger is focused by the click', (await activeId(page)) === 'tip-nodelay-trigger');
check('mouse focus does not reopen it', !(await isOpen(page, `#${noDelayTip}`)));
await away();
await page.evaluate(() => document.activeElement.blur());
await sleep(400);

console.log('Keyboard focus-visible');
// Focus the tab stop just before the trigger, then Tab onto it (keyboard → :focus-visible).
await page.evaluate(() => {
  const all = [...document.querySelectorAll('button, a[href], [tabindex="0"], select, input')];
  const i = all.indexOf(document.getElementById('tip-above-trigger'));
  (all[i - 1] ?? document.body).focus();
});
await page.keyboard.press('Tab');
check('Tab lands on the trigger', (await activeId(page)) === 'tip-above-trigger', String(await activeId(page)));
await sleep(30);
check('keyboard focus shows the tooltip immediately', await isOpen(page, `#${aboveTip}`));
await page.keyboard.press('Escape');
await sleep(50);
check('Escape hides it', !(await isOpen(page, `#${aboveTip}`)));
check('focus stays on the trigger', (await activeId(page)) === 'tip-above-trigger');
await page.keyboard.press('Tab');
await sleep(30);
check('blur hides / next trigger shows', !(await isOpen(page, `#${aboveTip}`)) && (await isOpen(page, `#${belowTip}`)));
await page.keyboard.press('Escape');

console.log('Text trigger');
const textTrigger = page.locator('.ax-tooltip-trigger').first();
check('text trigger is a focusable span with hover indication', (await textTrigger.getAttribute('tabindex')) === '0' && (await textTrigger.getAttribute('data-hover-indication')) === '');
check('text trigger with hasHoverIndication=false has none', (await page.locator('.ax-tooltip-trigger').nth(1).getAttribute('data-hover-indication')) === null);

console.log('focusTrigger never / isEnabled false / controlled');
const neverTip = await tipOf('button:has-text("focusTrigger never")');
await page.focus('button:has-text("focusTrigger never")');
await page.keyboard.press('Shift+Tab');
await page.keyboard.press('Tab');
await sleep(40);
check('focusTrigger=never ignores keyboard focus', !(await isOpen(page, `#${neverTip}`)));
const disabledTip = await tipOf('button:has-text("isEnabled false")');
await hover('button:has-text("isEnabled false")');
await sleep(300);
check('isEnabled=false never shows', !(await isOpen(page, `#${disabledTip}`)));
await away();
const controlledTip = await tipOf('#tip-controlled-trigger');
check('isOpen=true is shown on load', await isOpen(page, `#${controlledTip}`));
await hover('#tip-controlled-trigger');
await away();
await sleep(200);
check('controlled tooltip ignores hover leave', await isOpen(page, `#${controlledTip}`));
const request = await page.evaluate(async (id) => {
  const el = document.getElementById(id);
  let detail = null;
  // Blur whatever keyboard focus left open (focusTrigger="always" above), so only it remains.
  document.activeElement?.blur();
  await new Promise((r) => setTimeout(r, 150));
  el.addEventListener('astryx-open-change', (e) => { detail = e.detail; }, {once: true});
  document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
  await new Promise((r) => setTimeout(r, 30));
  return {detail, open: el.matches(':popover-open')};
}, controlledTip);
check('Escape on a controlled tooltip reports a request and keeps it open', request.open && request.detail?.isRequest === true && request.detail?.isOpen === false, JSON.stringify(request));
const neverShown = await tipOf('button:has-text("isOpen false")');
await hover('button:has-text("isOpen false")');
await sleep(300);
check('isOpen=false never shows', !(await isOpen(page, `#${neverShown}`)));
await away();

console.log('Sibling mode');
await hover('button:has-text("Owned trigger")');
await sleep(260);
check('attachTooltip trigger shows its sibling layer', await isOpen(page, '#tip-owned'));
await away();
await sleep(400);
await hover('#tip-for-target');
await sleep(260);
const forId = await page.getAttribute('#tip-for-target', 'data-ax-tooltip');
check('`for` wires an existing trigger at runtime', !!forId && (await isOpen(page, `#${forId}`)) && (await page.getAttribute('#tip-for-target', 'aria-describedby'))?.includes(forId));
await away();
await sleep(400);

console.log('RTL');
const rtlStart = await tipOf('#tip-rtl-start');
await hover('#tip-rtl-start');
await sleep(260);
const rs = await page.locator('#tip-rtl-start').boundingBox();
const rl = await page.locator(`#${rtlStart}`).boundingBox();
check('placement start is on the right in RTL', rl.x >= rs.x + rs.width - 1, JSON.stringify({rs, rl}));
await away();
await sleep(400);

console.log('Touch: tap opens on a non-action trigger, never on an action trigger in auto');
{
  const touch = await page.context().browser().newContext({hasTouch: true, viewport: {width: 1100, height: 900}, reducedMotion: 'reduce'});
  const tp = await touch.newPage();
  await tp.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await tp.goto(page.url());
  await tp.waitForLoadState('load');
  const textTip = await tp.locator('.ax-tooltip-trigger').first().getAttribute('data-ax-tooltip');
  await tp.locator('.ax-tooltip-trigger').first().tap();
  await sleep(80);
  check('tap on a text trigger opens its tooltip', await isOpen(tp, `#${textTip}`));
  await tp.tap('h1');
  await sleep(80);
  check('a tap elsewhere closes it', !(await isOpen(tp, `#${textTip}`)));
  const btnTip = await tp.getAttribute('#tip-below-trigger', 'data-ax-tooltip');
  await tp.tap('#tip-below-trigger');
  await sleep(300);
  check('tap on a button (an action) does not open it (auto)', !(await isOpen(tp, `#${btnTip}`)));
  const tapTip = await tp.getAttribute('button:has-text("touchTrigger tap")', 'data-ax-tooltip');
  await tp.tap('button:has-text("touchTrigger tap")');
  await sleep(80);
  check('touchTrigger="tap" opens on an action trigger', await isOpen(tp, `#${tapTip}`));
  await touch.close();
}

console.log('HoverCard');
await open('hover-card');
const card = '#hc-profile';
await hover('#hc-profile-trigger');
await sleep(150);
check('hover card waits its 300ms delay', !(await isOpen(page, card)));
await sleep(250);
check('hover card shows after the delay', await isOpen(page, card));
check('named card: role=dialog + aria-label', (await page.getAttribute(card, 'role')) === 'dialog' && (await page.getAttribute(card, 'aria-label')) === 'Ada Lovelace');
check('trigger advertises the dialog while open', (await page.getAttribute('#hc-profile-trigger', 'aria-haspopup')) === 'dialog' && (await page.getAttribute('#hc-profile-trigger', 'aria-controls')) === 'hc-profile' && (await page.getAttribute('#hc-profile-trigger', 'aria-expanded')) === 'true');
const link = await page.locator('#hc-profile-link').boundingBox();
await page.mouse.move(link.x + 5, link.y + 5, {steps: 4});
await sleep(400);
check('moving into the card keeps it open (interactive)', await isOpen(page, card));
await away();
await sleep(100);
check('exit grace: still open 100ms after leaving', await isOpen(page, card));
await sleep(250);
check('closed after the 200ms grace', !(await isOpen(page, card)));
check('aria-controls removed when closed', (await page.getAttribute('#hc-profile-trigger', 'aria-controls')) === null && (await page.getAttribute('#hc-profile-trigger', 'aria-expanded')) === 'false');
// Keyboard: focus opens, Tab into the card keeps it, Escape returns focus to the trigger.
await page.evaluate(() => document.getElementById('hc-profile-trigger').focus());
await sleep(40);
check('focus on the trigger opens the card', await isOpen(page, card));
await page.keyboard.press('Tab');
await sleep(250);
check('Tab into the card keeps it open', (await activeId(page)) === 'hc-profile-link' && (await isOpen(page, card)));
await page.keyboard.press('Escape');
await sleep(60);
check('Escape closes the card and returns focus without reopening', !(await isOpen(page, card)) && (await activeId(page)) === 'hc-profile-trigger');
await page.evaluate(() => document.activeElement.blur());
const textCard = '#hc-text';
check('unnamed card describes its text trigger (role=group)', (await page.getAttribute(textCard, 'role')) === 'group' && (await page.locator('[data-ax-hover-card="hc-text"]').getAttribute('aria-describedby')) === 'hc-text');

console.log('InfoTip');
await open('info-tip');
const info = '#infotip-metric';
const infoTip = await page.getAttribute(info, 'data-ax-tooltip');
check('InfoTip is a named button with aria-expanded=false', (await page.getAttribute(info, 'aria-label')) === 'About this metric' && (await page.getAttribute(info, 'aria-expanded')) === 'false');
check('default label is translated "More information"', (await page.getAttribute('#infotip-sm', 'aria-label')) === 'More information');
await hover(info);
await sleep(260);
check('hover previews the help', await isOpen(page, `#${infoTip}`));
check('preview is not pinned', (await page.getAttribute(info, 'aria-expanded')) === 'false');
await page.mouse.down();
await page.mouse.up();
await sleep(60);
check('a click pins it (stays open, aria-expanded=true)', (await isOpen(page, `#${infoTip}`)) && (await page.getAttribute(info, 'aria-expanded')) === 'true');
await away();
await sleep(300);
check('pinned help survives the pointer leaving', await isOpen(page, `#${infoTip}`));
const live = await page.evaluate(() => [...document.querySelectorAll('[data-astryx-live-region="polite"]')].map((r) => r.textContent).join('|'));
check('pinning announces the help once', live.includes('30-day rolling average'), live);
await page.mouse.click(1080, 880);
await sleep(60);
check('a press outside ends the pin', !(await isOpen(page, `#${infoTip}`)) && (await page.getAttribute(info, 'aria-expanded')) === 'false');
await page.focus(info);
await page.keyboard.press('Enter');
await sleep(60);
check('Enter pins it', (await isOpen(page, `#${infoTip}`)) && (await page.getAttribute(info, 'aria-expanded')) === 'true');
await page.keyboard.press('Enter');
await sleep(60);
check('a second Enter closes it', !(await isOpen(page, `#${infoTip}`)));
await page.keyboard.press('Enter');
await sleep(40);
await page.keyboard.press('Escape');
await sleep(40);
check('Escape closes a pinned help', !(await isOpen(page, `#${infoTip}`)));

await done();
