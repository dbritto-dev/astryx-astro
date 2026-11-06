#!/usr/bin/env node
/**
 * ClickableCard (components/ClickableCard, behaviors/clickable.ts) against the built docs.
 * Covers: surface activation (one click on the hidden control), nested button and link keep
 * their own activation, Ctrl/Cmd / target=_blank / middle click open a new tab, disabled cards
 * keep their tab stop and stay inert, the card paints the focus ring, blocked destinations.
 */
import {setup} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('clickable-card');
const sel = (t) => `[data-test="${t}"]`;
await page.evaluate(() => {
  window.__clicks = [];
  window.__opened = [];
  window.open = (...args) => { window.__opened.push(args); return null; };
  document.querySelector('[data-test="interactive"]').addEventListener('click', (e) => {
    const t = e.target;
    window.__clicks.push({action: t.classList?.contains('ax-clickable-card-action') ?? false, test: t.closest('[data-test]')?.dataset.test});
  });
});
const clicks = () => page.evaluate(() => window.__clicks.splice(0));
const opened = () => page.evaluate(() => window.__opened.splice(0));
const hash = () => page.evaluate(() => location.hash);
const resetHash = () => page.evaluate(() => history.replaceState(null, '', location.pathname));
const cardTitle = (t) => `${sel(t)} p >> nth=0`;

// Button card.
await page.click(cardTitle('button-card'));
let c = await clicks();
check('button card: surface click → one click on the hidden button', c.length === 1 && c[0].action, JSON.stringify(c));
await page.click(sel('nested-button'));
c = await clicks();
check('button card: nested button keeps its own click', c.length === 1 && !c[0].action && c[0].test === 'nested-button', JSON.stringify(c));
await resetHash();
await page.click(sel('nested-link'));
c = await clicks();
check('button card: nested link navigates, card not activated', c.length === 1 && !c[0].action && (await hash()) === '#cc-target', JSON.stringify(c));

// Link card.
await resetHash();
await page.click(cardTitle('link-card'));
c = await clicks();
check('link card: surface click goes through the link', c.length === 1 && c[0].action && (await hash()) === '#cc-target', JSON.stringify(c));
await resetHash();
await page.click(sel('nested'));
check('link card: nested button does not navigate', (await hash()) === '');
await page.click(cardTitle('link-card'), {modifiers: ['Control']});
let o = await opened();
check('link card: Ctrl-click opens a new tab (noopener)', o.length === 1 && o[0][0].endsWith('#cc-target') && o[0][1] === '_blank' && o[0][2] === 'noopener', JSON.stringify(o));
check('link card: Ctrl-click does not navigate this page', (await hash()) === '');
await page.click(cardTitle('link-card'), {button: 'middle'});
o = await opened();
check('link card: middle click opens a new tab', o.length === 1 && o[0][1] === '_blank', JSON.stringify(o));
await page.click(cardTitle('blank-card'));
o = await opened();
check('target=_blank card: plain click opens a new tab', o.length === 1 && o[0][1] === '_blank', JSON.stringify(o));
check('target=_blank link carries noopener noreferrer', await page.$eval(`${sel('blank-card')} a`, (a) => a.rel.includes('noopener') && a.rel.includes('noreferrer')));

// Disabled + blocked.
await clicks();
await resetHash();
await page.click(cardTitle('disabled-card'));
check('disabled link card: no navigation', (await hash()) === '' && (await opened()).length === 0);
check('disabled link card: focusable aria-disabled link, no href', await page.$eval(`${sel('disabled-card')} a`, (a) => a.tabIndex === 0 && a.getAttribute('aria-disabled') === 'true' && !a.hasAttribute('href') && a.getAttribute('role') === 'link'));
await page.focus(`${sel('disabled-button-card')} button`);
await clicks();
await page.keyboard.press('Enter');
c = await clicks();
check('disabled button card: Enter does not activate', c.every((x) => !x.action), JSON.stringify(c));
check('disabled card: dimmed, no overlay', await page.$eval(sel('disabled-card'), (el) => getComputedStyle(el).opacity === '0.5' && getComputedStyle(el, '::after').content === 'none'));
check('blocked destination renders no href', await page.$eval(`${sel('blocked-card')} a`, (a) => !a.hasAttribute('href')));

// Accessible name and focus ring.
check('hidden control carries the label as its name', await page.$eval(`${sel('link-card')} a.ax-clickable-card-action`, (a) => a.getAttribute('aria-label') === 'Settings'));
check('card surface has no role / tabindex', await page.$eval(sel('link-card'), (el) => !el.hasAttribute('role') && !el.hasAttribute('tabindex')));
await page.focus('body');
await page.keyboard.press('Tab');
const ring = await page.evaluate(() => {
  const card = document.activeElement?.closest('.astryx-clickable-card');
  return card ? {test: card.getAttribute('data-test'), style: getComputedStyle(card).outlineStyle} : null;
});
check('keyboard focus rings the card', ring != null && ring.style !== 'none', JSON.stringify(ring));
check('theme hooks: card + clickable-card with data-variant', await page.$eval(sel('link-card'), (el) => el.classList.contains('astryx-card') && el.classList.contains('astryx-clickable-card') && el.dataset.variant === 'default'));

await done();
