#!/usr/bin/env node
/**
 * Dialog: invoker trigger + API open, initial focus, Tab containment, Escape through the layer
 * stack (a popover inside closes first), backdrop press rules per purpose (start AND end on the
 * backdrop), focus return without scrolling, scroll lock on <html>, SSR isOpen, native closes
 * reconciled, announcements and toasts inside the open modal (above it, no focus steal).
 *   node tools/tests/dialog.test.mjs
 */
import {setup, sleep, activeId} from './_harness.mjs';

const {page, check, open, done} = await setup({height: 700});
await open('dialog');

const isModal = (id) => page.evaluate((i) => document.getElementById(i).matches(':modal'), id);
const htmlOverflow = () => page.evaluate(() => getComputedStyle(document.documentElement).overflow);
const host = (id) => `document.getElementById('${id}').parentElement`;
const insideDialog = (id) => page.evaluate((i) => document.getElementById(i).contains(document.activeElement), id);

console.log('Server wiring');
check('trigger is a show-modal invoker with aria-haspopup', await page.evaluate(() => {
  const b = document.getElementById('dlg-info-trigger');
  return b.getAttribute('commandfor') === 'dlg-info' && b.getAttribute('command') === 'show-modal' && b.getAttribute('aria-haspopup') === 'dialog';
}));
check('dialog: aria-modal, labelled by the DialogHeader title', await page.evaluate(() => {
  const d = document.getElementById('dlg-info');
  return d.getAttribute('aria-modal') === 'true' && document.getElementById(d.getAttribute('aria-labelledby'))?.textContent === 'Project archived';
}));
check('header close button points at the dialog (command=close)', await page.evaluate(() => {
  const b = document.querySelector('#dlg-info [data-ax-dialog-close]');
  return b?.getAttribute('commandfor') === 'dlg-info' && b?.getAttribute('command') === 'close' && b?.getAttribute('aria-label') === 'Close';
}));
check('runtime takes backdrop dismissal over (closedby any → closerequest)', (await page.getAttribute('#dlg-info', 'closedby')) === 'closerequest');
check('form/required keep their native closedby', (await page.getAttribute('#dlg-form', 'closedby')) === 'closerequest' && (await page.getAttribute('#dlg-required', 'closedby')) === 'none');
check('required dialog has role=alertdialog', (await page.getAttribute('#dlg-required', 'role')) === 'alertdialog');
check('inline preview is not a <dialog> and has no modal attributes', await page.evaluate(() => {
  const el = document.querySelector('[data-testid="dlg-inline"]');
  return el.tagName === 'DIV' && el.classList.contains('astryx-dialog') && !el.hasAttribute('aria-modal') && el.getAttribute('data-variant') === 'standard';
}));

console.log('Open via the trigger');
await page.evaluate(() => { window.__events = []; document.addEventListener('astryx-open-change', (e) => window.__events.push([e.target.querySelector('dialog')?.id, e.detail.isOpen, e.detail.reason])); });
await page.click('#dlg-info-trigger');
await sleep(80);
check('opens as a native modal', await isModal('dlg-info'));
check('host reports isOpen and reflects data-ax-open', await page.evaluate(`${host('dlg-info')}.isOpen && ${host('dlg-info')}.getAttribute('data-ax-open') === 'true'`));
check('astryx-open-change {isOpen: true}', (await page.evaluate(() => window.__events.at(-1)))?.[1] === true);
check('initial focus on the DialogHeader title', (await activeId(page)) === 'dlg-info-title');
check('page scroll locked on <html>', (await htmlOverflow()) === 'hidden');
check('entry origin set from the opener', await page.evaluate(() => document.getElementById('dlg-info').style.getPropertyValue('--dialog-dir-x') !== ''));

console.log('Tab containment');
const tabbed = [];
for (let i = 0; i < 8; i++) {
  await page.keyboard.press('Tab');
  tabbed.push(await insideDialog('dlg-info'));
}
check('Tab never leaves the modal (8 presses)', tabbed.every(Boolean), JSON.stringify(tabbed));
await page.focus('#dlg-info-first');
await page.keyboard.press('Shift+Tab');
await page.keyboard.press('Shift+Tab');
check('Shift+Tab wraps from the first control to the last', (await activeId(page)) === 'dlg-info-done');

console.log('Escape + focus return without scrolling');
await page.evaluate(() => window.scrollTo(0, 0));
const offscreen = await page.evaluate(() => document.getElementById('dlg-info-trigger').getBoundingClientRect().top > innerHeight);
await page.keyboard.press('Escape');
await sleep(80);
check('Escape closes', !(await page.evaluate(() => document.getElementById('dlg-info').open)));
check('focus returned to the trigger', (await activeId(page)) === 'dlg-info-trigger');
check('the page did not scroll to it', !offscreen || (await page.evaluate(() => scrollY)) === 0, `offscreen=${offscreen}`);
check('scroll lock released', (await htmlOverflow()) !== 'hidden');
check('astryx-open-change {isOpen: false, reason: escape}', JSON.stringify((await page.evaluate(() => window.__events.at(-1)))?.slice(1)) === '[false,"escape"]');

console.log('Backdrop press rules (purpose info)');
const backdropPoint = {x: 30, y: 30};
const pressFrom = async (from, to) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y);
  await page.mouse.up();
  await sleep(60);
};
await page.click('#dlg-info-trigger');
await sleep(60);
const box = await page.locator('#dlg-info').boundingBox();
const inside = {x: box.x + 40, y: box.y + box.height - 20};
await pressFrom(backdropPoint, inside);
check('press starting on the backdrop, ending inside: stays open', await isModal('dlg-info'));
await pressFrom(inside, backdropPoint);
check('press starting inside, ending on the backdrop: stays open', await isModal('dlg-info'));
await pressFrom(backdropPoint, {x: 40, y: 40});
check('press starting and ending on the backdrop: closes', !(await page.evaluate(() => document.getElementById('dlg-info').open)));
check('reason "outside"', (await page.evaluate(() => window.__events.at(-1)))?.[2] === 'outside');

console.log('IME guard');
await page.click('#dlg-info-trigger');
await sleep(60);
await page.evaluate(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', isComposing: true, bubbles: true, cancelable: true})));
await sleep(60);
check('an Escape that ends an IME composition dismisses nothing', await isModal('dlg-info'));
await page.keyboard.press('Escape');
await sleep(60);

console.log('Container padding + sizing');
const pad = await page.evaluate(() => {
  const read = (id) => {
    const inner = document.querySelector(`#${id} > .ax-dialog-inner`);
    const cs = getComputedStyle(inner);
    return [cs.getPropertyValue('--container-padding-inline-start').trim(), cs.paddingInlineStart, cs.paddingBlockStart];
  };
  const before = read('dlg-info');
  document.documentElement.style.setProperty('--astryx-dialog-padding', '40px');
  const themed = read('dlg-info');
  const explicit = read('dlg-form');
  document.documentElement.style.removeProperty('--astryx-dialog-padding');
  return {before, themed, explicit};
});
check('default inset --spacing-4 (16px), published as --container-padding-*', JSON.stringify(pad.before) === '["1rem","16px","16px"]', JSON.stringify(pad.before));
check('a theme\'s --astryx-dialog-padding reaches theme-default dialogs', pad.themed[1] === '40px' && pad.themed[0] === '40px', JSON.stringify(pad.themed));
check('an explicit padding prop (6 → 24px) wins over the theme', JSON.stringify(pad.explicit) === '["1.5rem","24px","24px"]', JSON.stringify(pad.explicit));
check('the inner publishes the max height for Layout (--container-max-height)', (await page.evaluate(() => getComputedStyle(document.querySelector('#dlg-info > .ax-dialog-inner')).getPropertyValue('--container-max-height').trim())) === '75dvh');
check('root resets inherited container padding (layer boundary)', (await page.evaluate(() => getComputedStyle(document.getElementById('dlg-info')).getPropertyValue('--container-padding-inline-start').trim())) === '0px');

console.log('purpose="form" and "required"');
await page.click('#dlg-form-trigger');
await sleep(60);
check('form: data-autofocus control takes focus', (await activeId(page)) === 'dlg-form-input');
check('width={560}', Math.round((await page.locator('#dlg-form').boundingBox()).width) === 560);
check('radius from --_dialog-radius (--radius-container)', (await page.evaluate(() => getComputedStyle(document.getElementById('dlg-form')).borderTopLeftRadius)) === '12px');
await pressFrom(backdropPoint, {x: 40, y: 40});
check('form: a backdrop press does not dismiss', await isModal('dlg-form'));
await page.keyboard.press('Escape');
await sleep(60);
check('form: Escape dismisses', !(await page.evaluate(() => document.getElementById('dlg-form').open)));
await page.click('#dlg-required-trigger');
await sleep(60);
await page.keyboard.press('Escape');
await sleep(60);
check('required: Escape is consumed and does not dismiss', await isModal('dlg-required'));
await pressFrom(backdropPoint, {x: 40, y: 40});
check('required: a backdrop press does not dismiss', await isModal('dlg-required'));
await page.evaluate(() => document.getElementById('dlg-required').requestClose?.());
await sleep(60);
check('required: a native close request (cancel) is refused', await isModal('dlg-required'));
await page.click('#dlg-required-accept');
await sleep(60);
check('required: its own close control closes it', !(await page.evaluate(() => document.getElementById('dlg-required').open)));
check('focus back on the required trigger', (await activeId(page)) === 'dlg-required-trigger');

console.log('Nested layer: a popover inside the dialog');
await page.click('#dlg-nested-trigger');
await sleep(60);
await page.click('#dlg-pop-trigger');
await sleep(80);
const popOpen = () => page.evaluate(() => document.getElementById('dlg-pop').matches(':popover-open'));
check('popover opens inside the modal', await popOpen());
await page.keyboard.press('Escape');
await sleep(60);
check('first Escape closes only the popover', !(await popOpen()) && (await isModal('dlg-nested')));
check('focus back on the popover trigger, inside the dialog', (await activeId(page)) === 'dlg-pop-trigger');
await page.keyboard.press('Escape');
await sleep(60);
check('second Escape closes the dialog', !(await page.evaluate(() => document.getElementById('dlg-nested').open)));
await page.click('#dlg-nested-trigger');
await sleep(60);
await page.click('#dlg-pop-trigger');
await sleep(60);
await pressFrom(backdropPoint, {x: 40, y: 40});
check('a backdrop press that light-dismissed the popover leaves the dialog open', !(await popOpen()) && (await isModal('dlg-nested')));
await pressFrom(backdropPoint, {x: 40, y: 40});
check('the next backdrop press dismisses the dialog', !(await page.evaluate(() => document.getElementById('dlg-nested').open)));

console.log('API and native closes');
await page.click('#dlg-api-trigger');
await sleep(60);
check('host.show() opens', await isModal('dlg-api'));
check('API open focuses the title', (await activeId(page)) === 'dlg-api-title');
await page.evaluate(() => document.getElementById('dlg-api').close());
await sleep(60);
check('a native dialog.close() is reconciled (host closed, event fired)', await page.evaluate(() => {
  const h = document.getElementById('dlg-api').parentElement;
  return !h.isOpen && h.getAttribute('data-ax-open') === 'false' && window.__events.at(-1)[1] === false;
}));
check('focus returned to the API opener', (await activeId(page)) === 'dlg-api-trigger');
await page.evaluate(() => document.getElementById('dlg-api').parentElement.setAttribute('data-ax-open', 'true'));
await sleep(60);
check('data-ax-open="true" opens', await isModal('dlg-api'));
await page.evaluate(() => document.getElementById('dlg-api').parentElement.toggle(false));
await sleep(60);
check('toggle(false) closes', !(await page.evaluate(() => document.getElementById('dlg-api').open)));

console.log('Fullscreen + positioned (and RTL)');
await page.click('#dlg-full-trigger');
await sleep(60);
const full = await page.locator('#dlg-full').boundingBox();
const vp = page.viewportSize();
check('fullscreen covers the viewport (minus a held scrollbar gutter)', full.x === 0 && full.y === 0 && full.height === vp.height && full.width >= vp.width - 20, JSON.stringify(full));
await page.keyboard.press('Escape');
await sleep(60);
await page.click('#dlg-pos-trigger');
await sleep(60);
let pos = await page.locator('#dlg-pos').boundingBox();
check('position {top: 24, start: 24} in LTR', Math.round(pos.x) === 24 && Math.round(pos.y) === 24, JSON.stringify(pos));
await page.keyboard.press('Escape');
await sleep(60);
await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
await page.evaluate(() => document.getElementById('dlg-pos').parentElement.show());
await sleep(60);
// The held scrollbar gutter narrows the containing block, so compare the resolved offsets.
const rtlOffsets = await page.evaluate(() => {
  const cs = getComputedStyle(document.getElementById('dlg-pos'));
  return {right: cs.right, top: cs.top};
});
check('logical start mirrors under RTL (right: 24px)', rtlOffsets.right === '24px' && rtlOffsets.top === '24px', JSON.stringify(rtlOffsets));
await page.keyboard.press('Escape');
await sleep(60);
await page.evaluate(() => document.documentElement.removeAttribute('dir'));

console.log('Announcements and toasts while the modal is open');
await page.click('#dlg-info-trigger');
await sleep(60);
await page.focus('#dlg-info-toast');
await page.keyboard.press('Enter');
await sleep(250);
const toastState = await page.evaluate(() => {
  const dialog = document.getElementById('dlg-info');
  const vpEl = document.querySelector('ax-toast-viewport');
  const card = vpEl?.querySelector('ax-toast');
  const r = card?.getBoundingClientRect();
  const hit = r ? document.elementFromPoint(r.left + 12, r.top + r.height / 2) : null;
  return {
    hosted: vpEl?.parentElement === dialog,
    shown: vpEl?.matches(':popover-open'),
    above: card ? card.contains(hit) : false,
    region: dialog.querySelector(':scope > [data-astryx-modal-live-region="polite"]')?.textContent,
    active: document.activeElement?.id,
  };
});
check('the toast viewport moved into the open modal', toastState.hosted);
check('…and re-entered the top layer above it', toastState.shown && toastState.above);
check('the toast is announced in the dialog\'s own live region', toastState.region === 'Members notified', toastState.region);
check('the toast did not take focus', toastState.active === 'dlg-info-toast', toastState.active);
await page.keyboard.press('Escape');
await sleep(60);
check('closing the modal sends the viewport home, still shown', await page.evaluate(() => {
  const vpEl = document.querySelector('ax-toast-viewport');
  return vpEl.parentElement.classList.contains('ax-toast-home') && vpEl.matches(':popover-open') && vpEl.querySelectorAll('ax-toast').length === 1;
}));

console.log('Motion (no reduced motion)');
await page.emulateMedia({reducedMotion: 'no-preference'});
await page.click('#dlg-info-trigger');
const entry = await page.evaluate(() => document.getElementById('dlg-info').getAnimations().map((a) => a.transitionProperty));
check('entry: @starting-style transition on opacity and transform', entry.includes('opacity') && entry.includes('transform'), JSON.stringify(entry));
await sleep(700);
await page.keyboard.press('Escape');
const exit = await page.evaluate(() => {
  const d = document.getElementById('dlg-info');
  return {open: d.open, display: getComputedStyle(d).display, anims: d.getAnimations().map((a) => a.transitionProperty)};
});
check('exit: closed at once, still painted while it fades (allow-discrete)', !exit.open && exit.display !== 'none' && exit.anims.includes('opacity'), JSON.stringify(exit));
check('focus returned as it closed', (await activeId(page)) === 'dlg-info-trigger');
await sleep(400);
check('exit ends hidden', (await page.evaluate(() => getComputedStyle(document.getElementById('dlg-info')).display)) === 'none');
await page.emulateMedia({reducedMotion: 'reduce'});
await page.click('#dlg-info-trigger');
check('reduced motion: no transition (appears at once under a fine pointer)', (await page.evaluate(() => document.getElementById('dlg-info').getAnimations().length)) === 0);
await page.keyboard.press('Escape');
await sleep(60);

console.log('SSR isOpen: opens on connect, settled');
await page.evaluate(() => {
  const tpl = document.createElement('template');
  tpl.innerHTML = '<ax-dialog class="ax-overlay-host" data-ax-open="true"><dialog id="dlg-ssr" class="astryx-dialog" aria-label="SSR" data-ax-scroll-lock=""><div class="ax-dialog-inner"><button id="dlg-ssr-btn">OK</button></div></dialog></ax-dialog>';
  document.body.append(tpl.content);
});
await sleep(60);
check('opened on connect', await isModal('dlg-ssr'));
check('opened settled (no entry motion)', (await page.getAttribute('#dlg-ssr', 'data-ax-settled')) != null);
await page.keyboard.press('Escape');
await sleep(60);
check('…and closes like any other', !(await page.evaluate(() => document.getElementById('dlg-ssr').open)) && (await page.getAttribute('#dlg-ssr', 'data-ax-settled')) == null);

console.log('A modal removed while open (holding the toast viewport)');
await page.click('#dlg-info-trigger');
await sleep(60);
await page.click('#dlg-info-toast');
await sleep(150);
await page.evaluate(() => document.getElementById('dlg-info').parentElement.remove());
await sleep(80);
const after = await page.evaluate(() => {
  const vpEl = document.querySelector('ax-toast-viewport');
  return {home: vpEl?.parentElement?.classList.contains('ax-toast-home'), shown: vpEl?.matches(':popover-open'), toasts: vpEl?.querySelectorAll('ax-toast').length, lock: getComputedStyle(document.documentElement).overflow, active: document.activeElement?.id};
});
check('the viewport goes home with its toasts, still shown', after.home && after.shown && after.toasts >= 1, JSON.stringify(after));
check('scroll lock released and focus back on the opener', after.lock !== 'hidden' && after.active === 'dlg-info-trigger', JSON.stringify(after));

await done();
