#!/usr/bin/env node
/**
 * Switch in a real browser (run `cd apps/docs && npx astro build` first): role="switch" on a
 * native checkbox, label / Space toggling with astryx-change {isChecked, event}, track + thumb
 * state and thumb travel (LTR + RTL), focus ring on the track only for keyboard focus, label
 * position order, disabled (aria-disabled, inert, no form value) + reason tooltip, loading,
 * status / required wiring, reduced motion, native form submit / reset.
 *   node tools/tests/switch.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('switch');

const root = (t) => `ax-switch[data-test="${t}"]`;
const inputOf = (t) => `${root(t)} input[role="switch"]`;
const stateOf = (t) => page.evaluate((sel) => {
  const r = document.querySelector(sel);
  const input = r.querySelector('input');
  const track = r.querySelector('.astryx-switch');
  const thumb = r.querySelector('.astryx-switch-thumb');
  const tr = track.getBoundingClientRect();
  const th = thumb.getBoundingClientRect();
  return {
    checked: input.checked, track: track.getAttribute('data-checked'), thumb: thumb.getAttribute('data-checked'),
    // thumb centre as a fraction of the track width (0 = left edge)
    pos: Math.round(((th.left + th.width / 2 - tr.left) / tr.width) * 100) / 100,
  };
}, root(t));

await page.evaluate(() => {
  window.__changes = [];
  document.addEventListener('astryx-change', (e) => window.__changes.push({tag: e.target.tagName, isChecked: e.detail.isChecked, type: e.detail.event?.type}));
});
const changes = () => page.evaluate(() => window.__changes.splice(0));
/** A real pointer click at an element's centre (the invisible input covers the track). */
const clickCenter = async (sel) => {
  await page.locator(sel).scrollIntoViewIfNeeded();
  const b = await page.locator(sel).boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
};

// ── semantics ──
const sem = await page.evaluate((sel) => {
  const input = document.querySelector(sel);
  const label = document.querySelector(`label[for="${input.id}"]`);
  const desc = document.getElementById(input.getAttribute('aria-describedby'));
  return {type: input.type, role: input.getAttribute('role'), label: label?.textContent, labelClass: label?.className, desc: desc?.textContent, trackHidden: input.nextElementSibling?.getAttribute('aria-hidden')};
}, inputOf('described'));
check('native checkbox with role="switch", labelled by its FieldLabel', sem.type === 'checkbox' && sem.role === 'switch' && sem.label === 'Dark mode' && /astryx-switch-label/.test(sem.labelClass), JSON.stringify(sem));
check('described by its description; decorative track is aria-hidden', sem.desc === 'Use a darker color scheme' && sem.trackHidden === 'true', JSON.stringify(sem));
check('theme hooks: track [data-size][data-checked], thumb [data-size][data-checked]', await page.evaluate((sel) => {
  const r = document.querySelector(sel);
  const t = r.querySelector('.astryx-switch');
  const th = r.querySelector('.astryx-switch-thumb');
  return t.dataset.size === 'md' && t.dataset.checked === 'checked' && th.dataset.size === 'md' && th.dataset.checked === 'checked';
}, root('on-md')));
check('field root: [data-label-position] / [data-label-spacing] only when not default', await page.evaluate((sel) => {
  const start = document.querySelector('ax-switch[data-test="label-start"]');
  const spread = document.querySelector('ax-switch[data-test="spread"]');
  const plain = document.querySelector(sel);
  return start.dataset.labelPosition === 'start' && spread.dataset.labelSpacing === 'spread' && !plain.hasAttribute('data-label-position') && !plain.hasAttribute('data-label-spacing');
}, root('on-md')));
check('labelPosition="start": the label precedes the switch in the DOM', await page.evaluate(() => {
  const row = document.querySelector('ax-switch[data-test="label-start"] .ax-switch-row');
  return row.firstElementChild.classList.contains('ax-switch-label-wrap');
}));

// ── toggling + thumb travel ──
let s = await stateOf('off-md');
check('off: thumb at the inline start', !s.checked && s.track === null && s.pos < 0.5, JSON.stringify(s));
await page.click('label:has-text("Off (md)")');
s = await stateOf('off-md');
check('label click turns it on: track + thumb checked, thumb at the inline end', s.checked && s.track === 'checked' && s.thumb === 'checked' && s.pos > 0.5, JSON.stringify(s));
let c = await changes();
check('astryx-change {isChecked: true, event: change} from <ax-switch>', c.length === 1 && c[0].isChecked === true && c[0].type === 'change' && c[0].tag === 'AX-SWITCH', JSON.stringify(c));
await page.focus(inputOf('off-md'));
await page.keyboard.press('Space');
s = await stateOf('off-md');
check('Space toggles it back off', !s.checked && s.track === null && s.pos < 0.5, JSON.stringify(s));
c = await changes();
check('… with isChecked: false', c.length === 1 && c[0].isChecked === false, JSON.stringify(c));
await clickCenter(`${root('off-sm')} .astryx-switch`);
s = await stateOf('off-sm');
check('clicking the track toggles (the input covers it)', s.checked && s.track === 'checked', JSON.stringify(s));
await changes();

s = await stateOf('rtl-on');
check('RTL: an on switch has its thumb at the inline end (left)', s.checked && s.pos < 0.5, JSON.stringify(s));
await clickCenter(`${root('rtl-on')} .astryx-switch`);
s = await stateOf('rtl-on');
check('RTL: off moves the thumb to the inline start (right)', !s.checked && s.pos > 0.5, JSON.stringify(s));
await changes();

// ── focus ring on the track ──
const ring = (t) => page.evaluate((sel) => {
  const cs = getComputedStyle(document.querySelector(sel).querySelector('.astryx-switch'));
  return cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px';
}, root(t));
await page.click('label:has-text("On (sm)")');
check('mouse focus: no ring on the track', !(await ring('on-sm')));
await page.keyboard.press('Shift+Tab');
await page.keyboard.press('Tab');
check('keyboard focus: ring on the track', await ring('on-sm'));
await changes();

// ── disabled / loading ──
const dis = await page.evaluate((sel) => {
  const input = document.querySelector(sel);
  return {aria: input.getAttribute('aria-disabled'), native: input.disabled, form: input.getAttribute('form'), name: input.name, track: input.nextElementSibling.dataset.disabled};
}, inputOf('disabled'));
check('disabled: aria-disabled, focusable, form="" and no name, track [data-disabled]', dis.aria === 'true' && !dis.native && dis.form === '' && dis.name === '' && dis.track === 'disabled', JSON.stringify(dis));
await page.click(inputOf('disabled'), {force: true});
await page.focus(inputOf('disabled'));
await page.keyboard.press('Space');
s = await stateOf('disabled');
check('disabled: click and Space do not toggle', !s.checked && s.track === null, JSON.stringify(s));
await page.keyboard.press('Shift+Tab');
await page.keyboard.press('Tab');
check('disabled: keyboard focus still shows the ring', await ring('disabled'));
const tip = await page.evaluate((sel) => {
  const r = document.querySelector(sel);
  const id = r.querySelector('.ax-switch-row').getAttribute('data-ax-tooltip');
  const input = r.querySelector('input');
  return {id, described: (input.getAttribute('aria-describedby') ?? '').split(' ').includes(id), text: document.getElementById(id)?.textContent};
}, root('disabled-message'));
check('disabledMessage: the reason describes the switch', tip.described && tip.text === 'Turned off org-wide', JSON.stringify(tip));
await page.focus(inputOf('disabled'));
await page.keyboard.press('Tab');
await page.keyboard.press('Tab');
await sleep(150);
check('disabledMessage: keyboard focus shows the reason tooltip', await page.evaluate((id) => document.getElementById(id)?.matches(':popover-open'), tip.id));
await page.click(inputOf('loading'), {force: true});
s = await stateOf('loading');
check('loading: aria-busy, spinner in the thumb, toggling blocked', !s.checked && await page.evaluate((sel) => {
  const r = document.querySelector(sel);
  return r.querySelector('input').getAttribute('aria-busy') === 'true' && !!r.querySelector('.astryx-switch-thumb .astryx-spinner');
}, root('loading')), JSON.stringify(s));
check('disabled / loading: no astryx-change', (await changes()).length === 0);
const polite = await page.evaluate(() => [...document.querySelectorAll('[data-astryx-live-region="polite"]')].map((n) => n.textContent).join('|'));
check('loading: "Loading" announced politely', polite.includes('Loading'), polite);

// ── status / required ──
const st = await page.evaluate(() => {
  const input = (t) => document.querySelector(`ax-switch[data-test="${t}"] input`);
  const e = input('status-error-md');
  const box = (e.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)).find((n) => n?.classList.contains('astryx-field-status'));
  const req = input('required');
  return {invalid: e.getAttribute('aria-invalid'), text: box?.textContent, variant: box?.dataset.variant, reqNative: req.required, reqAria: req.getAttribute('aria-required'), reqInvalid: req.getAttribute('aria-invalid')};
});
check('error status: aria-invalid + described by the detached message', st.invalid === 'true' && st.text === 'Two-factor authentication is required for admins' && st.variant === 'detached', JSON.stringify(st));
check('isRequired: native required + aria-required, aria-invalid="false" without an error', st.reqNative && st.reqAria === 'true' && st.reqInvalid === 'false', JSON.stringify(st));

// ── reduced motion ──
check('reduced motion: no thumb transition (media query)', await page.evaluate((sel) => getComputedStyle(document.querySelector(sel).querySelector('.astryx-switch-thumb')).transitionDuration === '0s', root('on-md')));
await page.emulateMedia({reducedMotion: 'no-preference'});
const motion = await page.evaluate((sel) => {
  const thumb = document.querySelector(sel).querySelector('.astryx-switch-thumb');
  const before = getComputedStyle(thumb).transitionDuration;
  document.documentElement.setAttribute('data-astryx-reduced-motion', '');
  const after = getComputedStyle(thumb).transitionDuration;
  document.documentElement.removeAttribute('data-astryx-reduced-motion');
  return {before, after};
}, root('on-md'));
check('motion: thumb slides by default; [data-astryx-reduced-motion] stops it', motion.before !== '0s' && motion.after === '0s', JSON.stringify(motion));
await page.emulateMedia({reducedMotion: 'reduce'});

// ── FormLayout + form submit / reset ──
const opt = await page.evaluate(() => {
  const input = document.querySelector('ax-switch[data-test="form-policy"] input');
  const label = document.querySelector(`label[for="${input.id}"]`);
  return {stamp: label.getAttribute('data-form-optionality'), shown: getComputedStyle(label.querySelector('.ax-field-indicator')).display !== 'none', aria: input.getAttribute('aria-required')};
});
check('FormLayout optionality reaches the switch label (the exception still shows)', opt.stamp === 'optional' && opt.shown && opt.aria === 'true', JSON.stringify(opt));
await clickCenter(`${root('form-sms')} .astryx-switch`);
await page.click('form[data-test="form"] button[type="submit"]');
const out = JSON.parse(await page.textContent('[data-test="form-output"]'));
check('form submit: on switches submit "on"', out.alerts === 'on' && out.sms === 'on' && !('policy' in out), JSON.stringify(out));
await page.click('form[data-test="form"] button[type="reset"]');
await sleep(50);
s = await stateOf('form-sms');
check('form reset: initial state and track restored', !s.checked && s.track === null, JSON.stringify(s));

await done();
