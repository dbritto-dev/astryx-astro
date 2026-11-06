#!/usr/bin/env node
/**
 * Toast + ToastViewport + toast(): the viewport region, announcements (polite / assertive),
 * no focus steal, maxVisible queue (older toasts surface as newer ones leave), uniqueID
 * overwrite in place / ignore, dismiss button + onHide, auto-hide timers that pause on hover,
 * focus, a blurred window and a hidden page, F6 and the focus hand-off, MediaTheme side,
 * static toasts, the fallback viewport.
 *   node tools/tests/toast.test.mjs
 */
import {setup, sleep, activeId} from './_harness.mjs';

const {page, context, check, open, done} = await setup({height: 700});
await open('toast');

const rows = () => page.evaluate(() => [...document.querySelectorAll('#toast-viewport .ax-toast-row')].map((r) => ({
  id: r.getAttribute('data-toast-id'),
  text: r.querySelector('.ax-toast-content')?.textContent,
  exiting: r.hasAttribute('data-ax-exiting'),
})));
const live = (p) => page.evaluate((x) => document.querySelector(`body > [data-astryx-live-region="${x}"]`)?.textContent ?? '', p);
// The demo's toasts are raised through buttons; tests that need options call the same module
// through a viewport instance (`toast()` on the element is the same queue path).
const show = (options) => page.evaluate((o) => {
  const vp = document.getElementById('toast-viewport');
  window.__hidden = window.__hidden ?? [];
  const id = vp.toasts.length;
  window.__dismiss = vp.toast({...o, onHide: (reason) => window.__hidden.push([o.body, reason])});
  return id;
}, options);
const clear = async () => {
  await page.evaluate(() => { for (const t of [...document.getElementById('toast-viewport').toasts]) document.getElementById('toast-viewport').context.removeToast(t.id, 'manual'); });
  await sleep(120);
};

console.log('Static toasts');
const statics = await page.evaluate(() => {
  const info = document.getElementById('toast-static-info');
  const err = document.getElementById('toast-static-error');
  return {
    info: [info.getAttribute('role'), info.getAttribute('aria-live'), info.getAttribute('data-type')],
    err: [err.getAttribute('role'), err.getAttribute('aria-live'), err.getAttribute('data-ax-auto-hide')],
    media: info.querySelector('.ax-toast-media').getAttribute('data-astryx-media'),
    dismiss: info.querySelector('[data-ax-toast-dismiss]').getAttribute('aria-label'),
  };
});
check('info toast is its own polite status region', JSON.stringify(statics.info) === '["status","polite","info"]');
check('error toast is an assertive alert that persists', JSON.stringify(statics.err) === '["alert","assertive","false"]');
check('MediaTheme measured: dark text side on the light-mode inverted surface', statics.media === 'dark');
check('dismiss button label translated', statics.dismiss === 'Dismiss notification');
await page.evaluate(() => {
  window.__staticDismiss = null;
  document.getElementById('toast-static-info').addEventListener('astryx-dismiss', (e) => { window.__staticDismiss = e.detail.reason; });
});
await page.click('#toast-static-info [data-ax-toast-dismiss]');
check('static dismiss reports astryx-dismiss {reason: manual}', (await page.evaluate(() => window.__staticDismiss)) === 'manual');

console.log('Viewport + toast()');
check('viewport is a shown manual popover without a region while empty', await page.evaluate(() => {
  const vp = document.getElementById('toast-viewport');
  return vp.matches(':popover-open') && !vp.hasAttribute('role');
}));
await page.focus('#toast-info');
await page.keyboard.press('Enter');
await sleep(120);
let list = await rows();
check('a toast appears', list.length === 1 && list[0].text === 'Changes saved (1)', JSON.stringify(list));
check('focus stays on the button that raised it', (await activeId(page)) === 'toast-info');
check('viewport becomes a named region', await page.evaluate(() => {
  const vp = document.getElementById('toast-viewport');
  return vp.getAttribute('role') === 'region' && vp.getAttribute('aria-label') === 'Notifications';
}));
check('rows carry no live region (the viewport announces)', await page.evaluate(() => !document.querySelector('#toast-viewport ax-toast').hasAttribute('role')));
check('announced politely', (await live('polite')).includes('Changes saved (1)'));
const geo = await page.evaluate(() => {
  const r = document.querySelector('#toast-viewport ax-toast').getBoundingClientRect();
  return {right: innerWidth - r.right, bottom: innerHeight - r.bottom, width: r.width};
});
check('bottomEnd inside the 16px gutters, 400px wide', Math.round(geo.right) === 16 && Math.round(geo.bottom) === 16 && geo.width === 400, JSON.stringify(geo));
await page.click('#toast-error');
await sleep(120);
check('error toasts are announced assertively', (await live('assertive')).includes('Could not reach the server'));
await page.evaluate(() => document.getElementById('toast-viewport').style.setProperty('--astryx-layer-inset-block-end', '56px'));
const lifted = await page.evaluate(() => {
  const cards = document.querySelectorAll('#toast-viewport ax-toast');
  return Math.round(innerHeight - cards[cards.length - 1].getBoundingClientRect().bottom);
});
check('--astryx-layer-inset-block-end lifts the stack above a bottom bar', lifted === 56 + 16, String(lifted));
await page.evaluate(() => document.getElementById('toast-viewport').style.removeProperty('--astryx-layer-inset-block-end'));

console.log('Dismiss + onHide');
await clear();
await show({body: 'Dismiss me', isAutoHide: false});
await sleep(80);
await page.click('#toast-viewport [data-ax-toast-dismiss]');
await sleep(150);
check('dismiss button removes the toast', (await rows()).length === 0);
check('onHide("manual") fired once', JSON.stringify(await page.evaluate(() => window.__hidden)) === '[["Dismiss me","manual"]]');
await show({body: 'API dismiss', isAutoHide: false});
await sleep(60);
await page.evaluate(() => { window.__dismiss(); window.__dismiss(); });
await sleep(150);
check('the returned dismiss function removes it (and is idempotent)', (await rows()).length === 0 && (await page.evaluate(() => window.__hidden.filter((h) => h[0] === 'API dismiss').length)) === 1);

console.log('maxVisible queue');
await page.click('#toast-burst');
await sleep(150);
list = await rows();
check('5 toasts, 3 visible (maxVisible=3), newest kept', list.length === 3 && list.at(-1).text === 'Notification 5 of 5', JSON.stringify(list.map((r) => r.text)));
await page.locator('#toast-viewport .ax-toast-row').last().locator('[data-ax-toast-dismiss]').click();
await sleep(200);
list = await rows();
check('dismissing one surfaces the next older toast', list.length === 3 && list[0].text === 'Notification 2 of 5', JSON.stringify(list.map((r) => r.text)));
await clear();

console.log('uniqueID');
await show({body: 'Saved at 1', uniqueID: 'save', isAutoHide: false});
await sleep(60);
await page.evaluate(() => { document.querySelector('#toast-viewport .ax-toast-row').__marker = true; });
await show({body: 'Saved at 2', uniqueID: 'save', isAutoHide: false});
await sleep(60);
list = await rows();
check('overwrite updates the toast in place (one row, new text)', list.length === 1 && list[0].text === 'Saved at 2', JSON.stringify(list));
check('…keeping the same row element', await page.evaluate(() => document.querySelector('#toast-viewport .ax-toast-row').__marker === true));
await show({body: 'Saved at 3', uniqueID: 'save', collisionBehavior: 'ignore', isAutoHide: false});
await sleep(60);
check('collisionBehavior "ignore" drops the new one', (await rows())[0].text === 'Saved at 2');
await clear();

console.log('Auto-hide timers');
// Keep the pointer off the stack: a toast that appears under a resting pointer is held.
await page.mouse.move(10, 10);
await show({body: 'Quick', autoHideDuration: 400});
await sleep(700);
check('auto-hides after its duration', (await rows()).length === 0);
check('onHide("auto")', (await page.evaluate(() => window.__hidden.at(-1)))?.[1] === 'auto');
await show({body: 'Hover holds me', autoHideDuration: 400});
await sleep(60);
await page.hover('#toast-viewport ax-toast .ax-toast-content');
await sleep(700);
check('pointer over the toast pauses the timer', (await rows()).length === 1);
await page.mouse.move(10, 10);
await sleep(600);
check('leaving resumes with at least 1s left (not yet gone)', (await rows()).length === 1);
await sleep(700);
check('…then it hides', (await rows()).length === 0);
await show({body: 'Focus holds me', autoHideDuration: 400});
await sleep(60);
await page.focus('#toast-viewport [data-ax-toast-dismiss]');
await sleep(700);
check('focus inside pauses the timer', (await rows()).length === 1);
await page.focus('#toast-info');
await sleep(1300);
check('focus leaving resumes it', (await rows()).length === 0);
await show({body: 'Blur holds me', autoHideDuration: 400});
await sleep(40);
await page.evaluate(() => window.dispatchEvent(new Event('blur')));
await sleep(700);
check('a blurred window pauses the timer', (await rows()).length === 1);
await page.evaluate(() => window.dispatchEvent(new Event('focus')));
await sleep(1300);
check('window focus resumes it', (await rows()).length === 0);
await show({body: 'Hidden page holds me', autoHideDuration: 400});
await sleep(40);
await page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'hidden'});
  document.dispatchEvent(new Event('visibilitychange'));
});
await sleep(700);
check('a hidden page pauses the timer', (await rows()).length === 1);
await page.evaluate(() => {
  delete document.visibilityState;
  document.dispatchEvent(new Event('visibilitychange'));
});
await sleep(1300);
check('visible again resumes it', (await rows()).length === 0);

console.log('F6 and the focus hand-off');
await show({body: 'Older', isAutoHide: false});
await page.click('#toast-undo');
await sleep(100);
await page.focus('#toast-info');
await page.keyboard.press('F6');
check('F6 moves focus to the newest toast\'s first control (Undo)', await page.evaluate(() => document.activeElement?.hasAttribute('data-toast-undo')));
await page.keyboard.press('Tab');
check('Tab reaches its dismiss button', await page.evaluate(() => document.activeElement?.hasAttribute('data-ax-toast-dismiss')));
await page.keyboard.press('Enter');
await sleep(200);
check('dismissing the focused toast hands focus to the other toast', await page.evaluate(() => {
  const row = document.activeElement?.closest('.ax-toast-row');
  return row?.querySelector('.ax-toast-content')?.textContent === 'Older';
}));
await page.keyboard.press('Enter');
await sleep(200);
check('dismissing the last one returns focus where it came from', (await activeId(page)) === 'toast-info');
check('viewport drops its region when empty', !(await page.evaluate(() => document.getElementById('toast-viewport').hasAttribute('role'))));

console.log('Undo action from a server-rendered template');
await page.click('#toast-undo');
await sleep(100);
await page.click('#toast-viewport [data-toast-undo]');
await sleep(200);
list = await rows();
check('the Undo button runs its handler and the replacement toast shows', list.length === 1 && list[0].text === 'Message restored', JSON.stringify(list));
await clear();

console.log('Fallback viewport');
await page.evaluate(() => document.getElementById('toast-viewport').closest('.ax-toast-home').remove());
await sleep(60);
await page.click('#toast-info');
await sleep(150);
const fb = await page.evaluate(() => {
  const vp = document.querySelector('[data-astryx-toast-fallback] ax-toast-viewport');
  return vp ? {shown: vp.matches(':popover-open'), rows: vp.querySelectorAll('.ax-toast-row').length, label: vp.querySelector('[data-ax-toast-dismiss]')?.getAttribute('aria-label')} : null;
});
check('toast() without a viewport creates a fallback in <body>', fb?.shown && fb.rows === 1 && fb.label === 'Dismiss notification', JSON.stringify(fb));

console.log('Dark mode: MediaTheme picks the light side on a light inverted surface');
const dark = await context.newPage();
await dark.emulateMedia({colorScheme: 'dark'});
await dark.goto(page.url());
await sleep(200);
check('static info toast in dark mode → data-astryx-media="light"', (await dark.evaluate(() => document.querySelector('#toast-static-info .ax-toast-media').getAttribute('data-astryx-media'))) === 'light');
const errSide = await dark.evaluate(() => document.querySelector('#toast-static-error .ax-toast-media').getAttribute('data-astryx-media'));
check('error toast side is measured too (a side or "off")', errSide === 'dark' || errSide === 'light' || errSide === null, String(errSide));
await dark.close();

await done();
