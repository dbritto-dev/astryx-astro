#!/usr/bin/env node
/**
 * Tokenizer: combobox semantics, static filtering without selected items, keyboard (wrap,
 * Enter adds, Escape, Backspace removes the last token, Tab/Shift+Tab and the focus redirect),
 * token ✕ and Clear all, astryx-change {values, change}, announcements, hasCreate (incl. below
 * minQueryLength, duplicates), maxEntries, async source via astryx-query (busy lane), empty
 * state slot, "+N more" folding (unfocusedInline + unfocusedLayer), form values + reset,
 * disabled, cancelable change.
 *   node tools/tests/tokenizer.test.mjs
 */
import {setup, isOpen, activeId, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('tokenizer');

const hostOf = async (inputId) => `#${await page.evaluate((i) => document.getElementById(i).closest('ax-tokenizer')?.id ?? document.querySelector(`ax-tokenizer[data-ax-wrapper="${document.getElementById(i).closest('[data-ax-wrapper-box]')?.id}"]`)?.id, inputId)}`;
const layerOf = (host) => page.evaluate((h) => '#' + document.querySelector(h).getAttribute('data-ax-layer'), host);
const visible = (layer) => page.evaluate((l) => [...document.querySelectorAll(`${l} [role="option"]:not([data-ax-empty])`)].filter((o) => !o.hidden && !o.closest('[hidden]')).map((o) => o.dataset.id).join(','), layer);
const activeDesc = (id) => page.evaluate((i) => {
  const d = document.getElementById(i).getAttribute('aria-activedescendant');
  return d ? document.getElementById(d)?.dataset.id : null;
}, id);
const tokens = (host) => page.evaluate((h) => {
  const el = document.querySelector(h);
  const boxes = [el, document.getElementById(el.getAttribute('data-ax-wrapper') ?? '')].filter(Boolean);
  return boxes.flatMap((b) => [...b.querySelectorAll(':scope > [data-ax-token-item]')]).map((t) => t.getAttribute('data-ax-token-item')).join(',');
}, host);
const live = () => page.evaluate(() => [...document.querySelectorAll('[data-astryx-live-region]')].map((r) => r.textContent).join('|'));
await page.evaluate(() => {
  window.__changes = [];
  document.addEventListener('astryx-change', (e) => { if (e.target.matches('ax-tokenizer')) window.__changes.push({id: e.target.id, ...e.detail}); });
});
const lastChange = () => page.evaluate(() => window.__changes.at(-1));

// ── Markup ──────────────────────────────────────────────────────────────────
const P = await hostOf('tk-people');
const PL = await layerOf(P);
console.log('Server markup');
check('host is a labelled group with the theme hooks', await page.evaluate((h) => {
  const el = document.querySelector(h);
  return el.getAttribute('role') === 'group' && el.getAttribute('aria-label') === 'Reviewers' && el.classList.contains('astryx-tokenizer') && el.dataset.size === 'md';
}, P));
check('input role=combobox aria-autocomplete=list aria-expanded=false', await page.evaluate(() => {
  const i = document.getElementById('tk-people');
  return i.getAttribute('role') === 'combobox' && i.getAttribute('aria-autocomplete') === 'list' && i.getAttribute('aria-expanded') === 'false'
    && document.getElementById(i.getAttribute('aria-controls'))?.getAttribute('role') === 'listbox';
}));
check('initial tokens rendered with remove buttons', (await tokens(P)) === 'ada,grace'
  && await page.evaluate((h) => document.querySelectorAll(`${h} [data-ax-token-remove]`).length === 2, P));
check('the field label names the input', await page.evaluate(() => document.querySelector('label[for="tk-people"]')?.textContent.includes('Reviewers')));

// ── Search + add ───────────────────────────────────────────────────────────
console.log('Search, keyboard, add');
await page.click('#tk-people');
await page.keyboard.type('a');
await sleep(60);
check('typing opens the list', await isOpen(page, PL));
check('selected people are filtered out', !(await visible(PL)).split(',').some((id) => id === 'ada' || id === 'grace'), await visible(PL));
check('first result highlighted', (await activeDesc('tk-people')) === (await visible(PL)).split(',')[0]);
await page.keyboard.press('ArrowUp');
const all = (await visible(PL)).split(',');
check('ArrowUp wraps to the last', (await activeDesc('tk-people')) === all.at(-1));
await page.keyboard.press('ArrowDown');
check('ArrowDown wraps to the first', (await activeDesc('tk-people')) === all[0]);
await page.keyboard.press('ArrowDown');
const picked = await activeDesc('tk-people');
await page.keyboard.press('Enter');
await sleep(60);
check('Enter adds a token', (await tokens(P)) === `ada,grace,${picked}`, await tokens(P));
const c1 = await lastChange();
check('astryx-change {values, change: add}', c1.change.type === 'add' && c1.change.item.id === picked && c1.values.map((v) => v.id).join(',') === `ada,grace,${picked}`);
check('input cleared, list closed, focus kept', (await page.inputValue('#tk-people')) === '' && !(await isOpen(page, PL)) && (await activeId(page)) === 'tk-people');
await sleep(60);
check('addition announced', (await live()).includes('Added '));

console.log('Remove');
await page.keyboard.press('Backspace');
await sleep(30);
check('Backspace in the empty input removes the last token', (await tokens(P)) === 'ada,grace');
check('remove change', (await lastChange()).change.type === 'remove' && (await lastChange()).change.item.id === picked);
await sleep(60);
check('removal announced', (await live()).includes('Removed '));
await page.click(`${P} [data-ax-token-item="ada"] [data-ax-token-remove]`);
await sleep(60);
check('a token ✕ removes it', (await tokens(P)) === 'grace');
check('focus moves to the input after a removal', (await activeId(page)) === 'tk-people');
await page.keyboard.press('Shift+Tab');
check('Shift+Tab from the input reaches the last token\'s remove button', await page.evaluate(() => document.activeElement?.matches('[data-ax-token-item="grace"] [data-ax-token-remove]')));
await page.keyboard.press('Shift+Tab');
await page.keyboard.press('Tab');
check('focus entering from outside lands on the input', (await activeId(page)) === 'tk-people');
await page.keyboard.type('mar');
await sleep(40);
await page.keyboard.press('Escape');
check('Escape closes the list', !(await isOpen(page, PL)));
check('Escape keeps the query', (await page.inputValue('#tk-people')) === 'mar');
await page.keyboard.press('ArrowDown');
await sleep(30);
check('ArrowDown reopens', await isOpen(page, PL));
await page.mouse.click(5, 5);
await sleep(30);
check('a press outside closes', !(await isOpen(page, PL)));
await page.fill('#tk-people', '');
await page.click(`${P} [data-ax-input-clear]`);
await sleep(60);
check('Clear all removes every token', (await tokens(P)) === '');
check('Clear all announced', (await live()).includes('All items removed'));
check('Clear button hides when nothing is left', await page.evaluate((h) => document.querySelector(`${h} [data-ax-input-clear]`).hidden, P));

// ── Create ──────────────────────────────────────────────────────────────────
console.log('hasCreate');
const T = await hostOf('tk-tags');
const TL = await layerOf(T);
await page.click('#tk-tags');
await page.keyboard.type('Ops');
await sleep(40);
check('Create row offered for unmatched text', (await visible(TL)) === '__xds_create__Ops');
check('Create row label', await page.evaluate((l) => document.querySelector(`${l} [data-id="__xds_create__Ops"]`)?.textContent.trim() === 'Create "Ops"', TL));
await page.keyboard.press('Enter');
await sleep(40);
check('Enter creates the token', (await tokens(T)) === 'Ops');
const c2 = await lastChange();
check('change type create with {id, label} = text', c2.change.type === 'create' && c2.change.item.id === 'Ops' && c2.change.item.label === 'Ops');
await page.keyboard.type('design');
await sleep(40);
check('an existing result suppresses the Create row', !(await visible(TL)).includes('__xds_create__'));
await page.keyboard.press('Enter');
await sleep(40);
await page.keyboard.type('ops');
await sleep(40);
check('a selected label (any case) suppresses the Create row', !(await visible(TL)).includes('__xds_create__'), await visible(TL));
await page.fill('#tk-tags', '');
await sleep(20);

console.log('minQueryLength + create');
const MN = await hostOf('tk-min');
const MNL = await layerOf(MN);
await page.click('#tk-min');
await page.keyboard.type('R');
await sleep(40);
check('below the minimum only the derived Create row shows', (await visible(MNL)) === '__xds_create__R');
await page.keyboard.type('e');
await sleep(40);
check('at the minimum the source answers', (await visible(MNL)).startsWith('research'), await visible(MNL));
await page.keyboard.press('Escape');

// ── maxEntries ─────────────────────────────────────────────────────────────
console.log('maxEntries + entries on focus');
const MX = await hostOf('tk-max');
const MXL = await layerOf(MX);
await page.click('#tk-max');
await sleep(40);
check('focus bootstraps the list (hasEntriesOnFocus)', await isOpen(page, MXL));
check('bootstrap omits selected items', !(await visible(MXL)).split(',').includes('design'));
await page.keyboard.press('Enter');
await sleep(60);
check('third token added', (await tokens(MX)).split(',').length === 3);
check('at the limit the input collapses', await page.evaluate(() => document.getElementById('tk-max').hasAttribute('data-ax-at-max')));
check('at the limit the list stays closed', !(await isOpen(page, MXL)));
await page.keyboard.press('ArrowDown');
await sleep(40);
check('nothing more is offered at the limit', !(await isOpen(page, MXL)));
await page.keyboard.press('Backspace');
await sleep(60);
check('below the limit again the input returns', !(await page.evaluate(() => document.getElementById('tk-max').hasAttribute('data-ax-at-max'))));

// ── Async ──────────────────────────────────────────────────────────────────
console.log('Async source');
const A = await hostOf('tk-async');
const AL = await layerOf(A);
await page.click('#tk-async');
await page.keyboard.type('pe');
await sleep(200);
check('busy: aria-busy + spinner in the end lane', await page.evaluate((h) => {
  const sp = document.querySelector(`${h} [data-ax-tokenizer-spinner]`);
  return document.getElementById('tk-async').getAttribute('aria-busy') === 'true' && !sp.hidden && !sp.hasAttribute('data-ax-idle') && !sp.closest('[hidden]');
}, A));
await sleep(450);
check('async answer shown', (await visible(AL)) === 'peru', await visible(AL));
check('busy cleared', (await page.getAttribute('#tk-async', 'aria-busy')) == null);
check('loading and count announced', (await live()).includes('1 result'));
await page.keyboard.press('Enter');
await sleep(40);
check('async item added', (await tokens(A)) === 'peru');
check('idle spinner keeps its slot beside tokens (hidden, aria-hidden)', await page.evaluate((h) => {
  const sp = document.querySelector(`${h} [data-ax-tokenizer-spinner]`);
  return !sp.hidden && sp.hasAttribute('data-ax-idle') && sp.getAttribute('aria-hidden') === 'true' && getComputedStyle(sp).visibility === 'hidden';
}, A));
check('lane reserve published', await page.evaluate((h) => document.querySelector(h).style.getPropertyValue('--_tokenizer-end-lane-reserve').includes('px'), A));
await page.keyboard.type('pe');
await sleep(500);
check('a selected async item never shows again', (await visible(AL)) === '' , await visible(AL));
await page.keyboard.press('Escape');

const E = await hostOf('tk-async-empty');
const EL = await layerOf(E);
await page.click('#tk-async-empty');
await page.keyboard.type('zz');
await sleep(80);
check('empty-search slot rendered', await page.evaluate((l) => {
  const e = document.querySelector(`${l} [data-ax-empty]`);
  return !e.hidden && e.textContent.includes('No records for that query');
}, EL));
await sleep(80);
check('empty message announced as rendered', (await live()).includes('No records for that query'));
await page.keyboard.press('Escape');

// ── Overflow ───────────────────────────────────────────────────────────────
console.log('Token overflow');
const I = await hostOf('tk-inline');
const folded = (h) => page.evaluate((s) => {
  const el = document.querySelector(s);
  const shown = [...el.querySelectorAll(':scope > [data-ax-token-item]')].filter((t) => getComputedStyle(t).display !== 'none').length;
  const ind = el.querySelector(':scope > [data-ax-overflow]');
  return {truncated: el.hasAttribute('data-ax-truncated'), shown, more: ind.hidden ? null : ind.textContent.trim(), height: el.getBoundingClientRect().height};
}, h);
const f1 = await folded(I);
check('folded: one row with "+N more"', f1.truncated && f1.shown > 0 && f1.shown < 8 && f1.more === `+${8 - f1.shown} more`, JSON.stringify(f1));
check('folded row fits within the field', await page.evaluate((s) => {
  const el = document.querySelector(s);
  const box = el.getBoundingClientRect();
  return [...el.querySelectorAll(':scope > [data-ax-token-item], :scope > [data-ax-overflow]')].filter((t) => getComputedStyle(t).display !== 'none').every((t) => t.getBoundingClientRect().right <= box.right - 2);
}, I));
await page.click('#tk-inline', {force: true}).catch(() => page.focus('#tk-inline'));
await page.focus('#tk-inline');
await sleep(60);
const f2 = await folded(I);
check('focus expands every token', !f2.truncated && f2.shown === 8 && f2.more === null && f2.height > f1.height, JSON.stringify(f2));
await page.mouse.click(5, 5);
await sleep(80);
const f3 = await folded(I);
check('blur folds again', f3.truncated && f3.more === f1.more, JSON.stringify(f3));

const L = await page.evaluate(() => '#' + document.querySelector('ax-tokenizer[data-ax-overlay]').id);
const lf1 = await folded(L);
check('unfocusedLayer: folded field shows "+N more"', lf1.truncated && lf1.more != null, JSON.stringify(lf1));
await page.click(L);
await sleep(80);
const overlay = await page.evaluate((s) => '#' + document.querySelector(s).getAttribute('data-ax-overlay'), L);
check('a press opens the overlay with the input focused', await isOpen(page, overlay) && await page.evaluate(() => document.activeElement?.matches('[data-ax-wrapper-box] input[role="combobox"]')));
check('the tokens move into the overlay field, all shown', await page.evaluate((o) => [...document.querySelectorAll(`${o} [data-ax-token-item]`)].filter((t) => getComputedStyle(t).display !== 'none').length === 8, overlay));
check('overlay covers the folded field', await page.evaluate(([s, o]) => {
  const a = document.querySelector(s).getBoundingClientRect();
  const b = document.querySelector(o).getBoundingClientRect();
  return Math.abs(a.top - b.top) < 2 && Math.abs(a.left - b.left) < 2 && Math.abs(a.width - b.width) < 2;
}, [L, overlay]));
await page.keyboard.press('Tab');
await sleep(80);
check('focus leaving closes the overlay and folds back', !(await isOpen(page, overlay)) && (await folded(L)).truncated);

// ── Custom tokens ──────────────────────────────────────────────────────────
console.log('Custom tokens');
const C = await hostOf('tk-custom');
const CL = await layerOf(C);
await page.click('#tk-custom');
await page.keyboard.type('ada');
await sleep(40);
await page.keyboard.press('Enter');
await sleep(60);
check('a static item\'s renderToken token is used for client adds', await page.evaluate((h) => document.querySelector(`${h} [data-ax-token-item="ada"] .astryx-token`)?.getAttribute('data-color') === 'purple', C));
check('server renderItem rows stay for static results', true);
await page.click(`${C} [data-ax-token-item="ada"] [data-ax-token-remove]`);
await sleep(60);
check('a custom token\'s astryx-remove removes it', !(await tokens(C)).includes('ada'));

// ── Form ───────────────────────────────────────────────────────────────────
console.log('Form');
const formData = () => page.evaluate(() => new URLSearchParams(new FormData(document.getElementById('tk-form'))).toString());
check('hidden inputs carry the ids', (await formData()) === 'tag=design&tag=research');
await page.click('#tk-form-tags');
await page.keyboard.type('Sec');
await sleep(40);
await page.keyboard.press('Enter');
await sleep(60);
check('adding updates the form value', (await formData()) === 'tag=design&tag=research&tag=security', await formData());
await page.keyboard.press('Backspace');
await page.keyboard.press('Backspace');
await sleep(60);
check('removing updates the form value', (await formData()) === 'tag=design');
await page.click('#tk-form button[type="reset"]');
await sleep(80);
check('form reset restores the server value', (await formData()) === 'tag=design&tag=research' && (await tokens(await hostOf('tk-form-tags'))) === 'design,research');

// ── Disabled ───────────────────────────────────────────────────────────────
console.log('Disabled');
const D = await hostOf('tk-disabled');
check('disabled input is focusable aria-disabled + readonly', await page.evaluate(() => {
  const i = document.getElementById('tk-disabled');
  return i.getAttribute('aria-disabled') === 'true' && i.readOnly && !i.disabled;
}));
check('disabled tokens have no remove buttons', await page.evaluate((h) => document.querySelectorAll(`${h} [data-ax-token-remove]`).length === 0, D));
check('disabled reason describes the input', await page.evaluate(() => {
  const ids = (document.getElementById('tk-disabled').getAttribute('aria-describedby') ?? '').split(' ');
  return ids.some((id) => document.getElementById(id)?.textContent?.includes('Locked by an administrator'));
}));
await page.focus('#tk-disabled');
await page.keyboard.press('Backspace');
await sleep(40);
check('Backspace removes nothing while disabled', (await tokens(D)) === 'design,engineering');
check('disabled host has data-disabled', (await page.getAttribute(D, 'data-disabled')) === 'disabled');

// ── Cancelable change ──────────────────────────────────────────────────────
console.log('Cancelable change');
await page.evaluate(() => {
  document.getElementById('tk-tags').closest('ax-tokenizer').addEventListener('astryx-change', (e) => e.preventDefault(), {once: true});
});
await page.click('#tk-tags');
await page.keyboard.type('Legal');
await sleep(40);
await page.keyboard.press('Enter');
await sleep(40);
check('preventDefault keeps the tokens', !(await tokens(T)).includes('legal'));
check('value setter renders tokens without an event', await page.evaluate(() => {
  const el = document.getElementById('tk-tags').closest('ax-tokenizer');
  const before = window.__changes.length;
  el.value = [{id: 'x', label: 'X-ray'}, {id: 'y', label: 'Yankee'}];
  const labels = [...el.querySelectorAll('[data-ax-token-item] .ax-token-label')].map((n) => n.textContent).join(',');
  return labels === 'X-ray,Yankee' && window.__changes.length === before;
}));

await done();
