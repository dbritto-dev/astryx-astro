#!/usr/bin/env node
/**
 * Markup inserted after its elements are defined (innerHTML, a client router, Storybook
 * switching stories) upgrades in tree order, so a host connects before the parts that follow
 * it. On page load the parts' elements are defined first, which hides the difference. Each
 * docs page's demo sections are replaced with the server markup through innerHTML, then the
 * hosts that reach for another element while connecting must still work: the combobox family
 * (its listbox layer is a later sibling, runtime/combobox `comboboxLayer`), PowerSearch (its
 * field Tokenizer is a descendant and gets properties), the chat input's trigger menu,
 * Pagination's page-size Selector, and a DateInput's calendar.
 *   node tools/tests/late-insert.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup({height: 1000});

/** Replace every demo section with its server markup; returns how many were replaced. */
const reinsert = () => page.evaluate(async () => {
  const fresh = new DOMParser().parseFromString(await (await fetch(location.href)).text(), 'text/html');
  const server = [...fresh.querySelectorAll('section')];
  let count = 0;
  [...document.querySelectorAll('section')].forEach((section, i) => {
    if (!server[i] || !section.querySelector('[class*="astryx-"]')) return;
    section.innerHTML = server[i].innerHTML;
    count++;
  });
  return count;
});

/** The first enabled, visible host of `tag` (or `sel`), marked `data-late` for later queries. */
const pick = (sel) => page.evaluate((s) => {
  const host = [...document.querySelectorAll(s)].find((el) =>
    !el.matches('[data-ax-disabled], [data-ax-read-only], [aria-disabled="true"]') && el.checkVisibility());
  document.querySelectorAll('[data-late]').forEach((el) => el.removeAttribute('data-late'));
  host?.setAttribute('data-late', '');
  return host != null;
}, sel);

/** State of the marked host's combobox: expanded, its layer open, visible options. */
const state = () => page.evaluate(() => {
  const host = document.querySelector('[data-late]');
  const field = host.querySelector('[role="combobox"]') ?? document.getElementById(host.getAttribute('data-ax-wrapper') ?? '')?.querySelector('[role="combobox"]');
  const layerId = host.getAttribute('data-ax-layer');
  const layer = layerId ? document.getElementById(layerId) : host.querySelector('ax-combobox-layer');
  const options = layer ? [...layer.querySelectorAll('[role="option"]:not([data-ax-empty])')].filter((o) => !o.hidden && !o.closest('[hidden]')) : [];
  return {
    defined: layer?.matches(':defined') ?? null,
    expanded: field?.getAttribute('aria-expanded') ?? null,
    open: layer?.matches(':popover-open') ?? false,
    options: options.length,
  };
});

/** Open a docs page and record which elements report `astryx-change`. */
const go = async (slug) => {
  await open(slug);
  await page.evaluate(() => {
    window.__changes = [];
    document.addEventListener('astryx-change', (e) => window.__changes.push(e.target.localName));
  });
};
const changed = (tag) => page.evaluate((t) => window.__changes.includes(t), tag);
const clearChanges = () => page.evaluate(() => { window.__changes.length = 0; });

for (const [slug, tag] of [['selector', 'ax-selector'], ['multi-selector', 'ax-multi-selector']]) {
  console.log(`${tag} (listbox layer after the host)`);
  await go(slug);
  check(`${slug}: demo sections re-inserted`, (await reinsert()) > 0);
  await sleep(50);
  check('an enabled host to test', await pick(tag));
  await clearChanges();
  await page.click('[data-late] [role="combobox"]');
  await sleep(120);
  let s = await state();
  check('a click opens the listbox (aria-expanded, layer open, options)', s.defined && s.expanded === 'true' && s.open && s.options > 0, JSON.stringify(s));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await sleep(80);
  check('ArrowDown + Enter picks an option (astryx-change)', await changed(tag));
  await page.keyboard.press('Escape');
  await sleep(80);
  s = await state();
  check('Escape closes it', s.expanded === 'false' && !s.open, JSON.stringify(s));
}

for (const [slug, tag] of [['typeahead', 'ax-typeahead'], ['tokenizer', 'ax-tokenizer']]) {
  console.log(`${tag} (listbox layer after the host)`);
  await go(slug);
  check(`${slug}: demo sections re-inserted`, (await reinsert()) > 0);
  await sleep(50);
  check('an enabled host to test', await pick(`${tag}:not([data-ax-power-search-field])`));
  await page.focus('[data-late] [role="combobox"]').catch(() => page.evaluate(() => {
    const host = document.querySelector('[data-late]');
    document.getElementById(host.getAttribute('data-ax-wrapper'))?.querySelector('[role="combobox"]')?.focus();
  }));
  await page.keyboard.type('a');
  await sleep(250);
  const s = await state();
  check('typing filters into an open listbox (aria-expanded, layer open, options)', s.defined && s.expanded === 'true' && s.open && s.options > 0, JSON.stringify(s));
  await page.keyboard.press('Escape');
}

console.log('ax-power-search (field Tokenizer inside, properties set while connecting)');
await go('power-search');
check('power-search: demo sections re-inserted', (await reinsert()) > 0);
await sleep(50);
check('the main demo to test', await pick('#ps-main ax-tokenizer[data-ax-power-search-field]'));
await page.focus('#ps-main input[role="combobox"]');
await page.keyboard.press('ArrowDown');
await sleep(250);
let ps = await state();
check('the field Tokenizer lists the fields (searchSource reached the upgraded Tokenizer)', ps.defined && ps.open && ps.options > 0, JSON.stringify(ps));
await page.keyboard.press('Escape');

console.log('ax-chat-composer-input (trigger menu layer)');
await go('chat');
check('chat: demo sections re-inserted', (await reinsert()) > 0);
await sleep(50);
check('the chat demo input to test', await pick('#chat-demo-input'));
await page.click('#chat-demo-input [data-ax-chat-editable]');
await page.keyboard.type('Ask @');
await sleep(150);
const chat = await state();
check('typing @ opens the trigger menu', chat.defined && chat.open && chat.options > 0, JSON.stringify(chat));
await page.keyboard.press('Escape');

console.log('Pagination page-size Selector');
await go('pagination');
check('pagination: demo sections re-inserted', (await reinsert()) > 0);
await sleep(50);
check('the page-size Selector to test', await pick('#pg-count ax-selector'));
await page.click('[data-late] [role="combobox"]');
await sleep(120);
const pg = await state();
check('a click opens the page sizes', pg.defined && pg.expanded === 'true' && pg.open && pg.options > 0, JSON.stringify(pg));
await page.keyboard.press('Escape');

console.log('ax-date-input (calendar in its popover)');
await go('date-input');
check('date-input: demo sections re-inserted', (await reinsert()) > 0);
await sleep(50);
check('an enabled DateInput to test', await pick('ax-date-input:has(> [data-ax-date-toggle])'));
await clearChanges();
await page.click('[data-late] > [data-ax-date-toggle]');
await sleep(150);
const date = await page.evaluate(() => {
  const popover = document.querySelector('[data-late] > ax-picker-popover');
  const day = popover?.querySelector('ax-calendar [role="gridcell"] button:not([aria-disabled="true"]):not([disabled]), ax-calendar button[data-day]:not([aria-disabled="true"])');
  return {open: popover?.matches(':popover-open') ?? false, calendar: popover?.querySelector('ax-calendar')?.matches(':defined') ?? false, day: day != null};
});
check('the toggle opens the calendar, upgraded', date.open && date.calendar && date.day, JSON.stringify(date));
await page.evaluate(() => {
  const days = [...document.querySelectorAll('[data-late] > ax-picker-popover ax-calendar [role="gridcell"] button, [data-late] > ax-picker-popover ax-calendar button[data-day]')]
    .filter((b) => !b.disabled && b.getAttribute('aria-disabled') !== 'true' && b.getAttribute('aria-selected') !== 'true');
  days[2]?.click();
});
await sleep(120);
check('picking a day changes the value (astryx-change)', await changed('ax-date-input'));

await done();
