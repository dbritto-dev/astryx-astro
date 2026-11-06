#!/usr/bin/env node
/**
 * Popover: click open/close, Escape, outside press (start AND end outside), focus return,
 * aria-expanded sync, initial focus, Tab containment, the Escape stack with nested layers,
 * explicit-dismiss popovers, non-native triggers, sibling mode.
 *   node tools/tests/popover.test.mjs
 */
import {setup, isOpen, activeId, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('popover');

const expanded = (sel) => page.getAttribute(sel, 'aria-expanded');
const basic = '#pop-basic';
const trigger = '#pop-basic-trigger';

console.log('Zero-JS wiring (server HTML)');
check('trigger is a native invoker', (await page.getAttribute(trigger, 'popovertarget')) === 'pop-basic');
check('trigger has aria-haspopup=dialog + aria-controls', (await page.getAttribute(trigger, 'aria-haspopup')) === 'dialog' && (await page.getAttribute(trigger, 'aria-controls')) === 'pop-basic');
check('layer is popover=auto with a layer root', (await page.getAttribute(basic, 'popover')) === 'auto' && (await page.getAttribute(basic, 'data-astryx-layer-root')) != null);

console.log('Click open / click close');
await page.click(trigger);
await sleep(80);
check('click opens', await isOpen(page, basic));
check('aria-expanded true while open', (await expanded(trigger)) === 'true');
check('initial focus on first content control', (await activeId(page)) === 'pop-basic-first');
check('trigger carries an anchor-name while open', (await page.evaluate(() => document.querySelector('#pop-basic-anchor').style.getPropertyValue('anchor-name'))).includes('--astryx-layer-'));
await page.click(trigger);
await sleep(80);
check('second click closes', !(await isOpen(page, basic)));
check('aria-expanded false after close', (await expanded(trigger)) === 'false');

console.log('Escape + focus return');
await page.click(trigger);
await sleep(80);
await page.keyboard.press('Escape');
await sleep(80);
check('Escape closes', !(await isOpen(page, basic)));
check('focus returns to the trigger', (await activeId(page)) === 'pop-basic-trigger');
check('anchor-name removed after close', (await page.evaluate(() => document.querySelector('#pop-basic-anchor').style.getPropertyValue('anchor-name'))) === '');

console.log('Outside press');
await page.click(trigger);
await sleep(80);
const tr = await page.locator(trigger).boundingBox();
const pr = await page.locator(basic).boundingBox();
// Start inside the layer, end outside: must stay open.
await page.mouse.move(pr.x + 10, pr.y + 10);
await page.mouse.down();
await page.mouse.move(900, 860);
await page.mouse.up();
await sleep(80);
check('press starting inside and ending outside keeps it open', await isOpen(page, basic));
// Start and end outside: closes.
await page.mouse.move(900, 860);
await page.mouse.down();
await page.mouse.up();
await sleep(80);
check('press starting and ending outside closes it', !(await isOpen(page, basic)));
check('aria-expanded synced after light dismiss', (await expanded(trigger)) === 'false');
void tr;

console.log('Tab containment (aria-modal)');
await page.focus(trigger);
await page.keyboard.press('Enter');
await sleep(80);
check('keyboard Enter opens', await isOpen(page, basic));
check('focus moved inside', (await activeId(page)) === 'pop-basic-first');
await page.keyboard.press('Tab'); // Invite
await page.keyboard.press('Tab'); // fallback close (revealed)
const onClose = await page.evaluate(() => document.activeElement?.closest('[data-astryx-popover-fallback-close]') != null);
check('Tab reaches the hidden fallback close', onClose);
const revealed = await page.evaluate(() => getComputedStyle(document.activeElement.parentElement).clipPath);
check('fallback close is revealed when focused', revealed === 'none', revealed);
await page.keyboard.press('Tab');
check('Tab wraps to the first control', (await activeId(page)) === 'pop-basic-first');
await page.keyboard.press('Shift+Tab');
const backOnClose = await page.evaluate(() => document.activeElement?.closest('[data-astryx-popover-fallback-close]') != null);
check('Shift+Tab wraps to the last control', backOnClose);
await page.keyboard.press('Enter'); // activates the fallback close
await sleep(80);
check('fallback close closes', !(await isOpen(page, basic)));
check('focus back on trigger after fallback close', (await activeId(page)) === 'pop-basic-trigger');

console.log('Escape stack: nested popover + tooltip inside a popover');
await page.click('#pop-outer-trigger');
await sleep(80);
await page.click('#pop-inner-trigger');
await sleep(80);
check('outer and inner both open', (await isOpen(page, '#pop-outer')) && (await isOpen(page, '#pop-inner')));
await page.keyboard.press('Escape');
await sleep(80);
check('first Escape closes only the inner popover', !(await isOpen(page, '#pop-inner')) && (await isOpen(page, '#pop-outer')));
check('focus returned to the inner trigger', (await activeId(page)) === 'pop-inner-trigger');
// A tooltip inside the outer popover opens on keyboard focus.
await page.keyboard.press('Shift+Tab');
await sleep(50);
const tipId = await page.getAttribute('#pop-inner-tip-trigger', 'data-ax-tooltip');
check('tooltip in popover opened by keyboard focus', await isOpen(page, `#${tipId}`));
await page.keyboard.press('Escape');
await sleep(80);
check('Escape closes the tooltip first, popover stays', !(await isOpen(page, `#${tipId}`)) && (await isOpen(page, '#pop-outer')));
await page.keyboard.press('Escape');
await sleep(80);
check('next Escape closes the outer popover', !(await isOpen(page, '#pop-outer')));
check('focus returned to the outer trigger', (await activeId(page)) === 'pop-outer-trigger');

console.log('Explicit dismissal only (coachmark)');
await page.click('#pop-coach-trigger');
await sleep(80);
check('coachmark is popover=manual', (await page.getAttribute('#pop-coach', 'popover')) === 'manual');
await page.keyboard.press('Escape');
await sleep(50);
check('Escape does not close it', await isOpen(page, '#pop-coach'));
await page.mouse.click(900, 860);
await sleep(50);
check('outside press does not close it', await isOpen(page, '#pop-coach'));
await page.click('#pop-coach button:has-text("Got it")');
await sleep(80);
check('its own close button closes it', !(await isOpen(page, '#pop-coach')));

console.log('role="button" trigger (JS path) and sibling mode');
await page.click('#pop-role-trigger');
await sleep(80);
check('role=button trigger opens', await isOpen(page, '#pop-role'));
check('role=button aria-expanded true', (await expanded('#pop-role-trigger')) === 'true');
await page.click('#pop-role-trigger');
await sleep(80);
check('pressing the trigger again closes it (no reopen by the same press)', !(await isOpen(page, '#pop-role')));
await page.focus('#pop-role-trigger');
await page.keyboard.press(' ');
await sleep(80);
check('Space opens a role=button trigger', await isOpen(page, '#pop-role'));
await page.keyboard.press('Escape');
await sleep(50);
await page.click('#pop-sibling-trigger');
await sleep(80);
check('sibling-mode popover opens from its external trigger', await isOpen(page, '#pop-sibling'));
const sb = await page.locator('#pop-sibling-trigger').boundingBox();
const sl = await page.locator('#pop-sibling').boundingBox();
check('sibling popover is anchored below its trigger', Math.abs(sl.y - (sb.y + sb.height)) < 12 && Math.abs(sl.x - sb.x) < 2, JSON.stringify({sb, sl}));
await page.keyboard.press('Escape');

console.log('Disabled');
await page.click('button:has-text("isEnabled false")');
await sleep(50);
check('isEnabled=false opens nothing', await page.evaluate(() => [...document.querySelectorAll('ax-popover')].every((p) => !p.matches(':popover-open'))));

console.log('Event');
const events = await page.evaluate(async () => {
  const log = [];
  const el = document.querySelector('#pop-basic');
  el.addEventListener('astryx-open-change', (e) => log.push(e.detail.isOpen));
  el.show();
  await new Promise((r) => setTimeout(r, 50));
  el.hide();
  await new Promise((r) => setTimeout(r, 50));
  return log;
});
check('astryx-open-change fires for open and close', JSON.stringify(events) === '[true,false]', JSON.stringify(events));

console.log('Zero JS: open, Escape and light dismiss with scripts disabled');
const noJs = await page.context().browser().newContext({javaScriptEnabled: false, viewport: {width: 1100, height: 900}});
const np = await noJs.newPage();
await np.route('https://fonts.googleapis.com/**', (r) => r.abort());
await np.goto(page.url());
await np.click('#pop-basic-trigger');
check('no-JS: the trigger opens the popover', await np.evaluate(() => document.querySelector('#pop-basic').matches(':popover-open')));
await np.keyboard.press('Escape');
check('no-JS: Escape closes it', !(await np.evaluate(() => document.querySelector('#pop-basic').matches(':popover-open'))));
await np.click('#pop-basic-trigger');
await np.mouse.click(1000, 880);
check('no-JS: a press outside closes it', !(await np.evaluate(() => document.querySelector('#pop-basic').matches(':popover-open'))));
await noJs.close();

await done();
