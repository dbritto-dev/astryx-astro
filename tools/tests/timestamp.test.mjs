#!/usr/bin/env node
/**
 * Timestamp (<ax-timestamp>): server UTC placeholder for clock formats, client switch to the
 * relative phrase in the viewer's zone, accessible name + tab stop + hover card attachment,
 * auto past the threshold (no card), live ticking, the hover card (opens on hover and focus,
 * <dl> rows, multi-zone entries, labelled dialog) and its copy buttons (clipboard, label and
 * tooltip flips, announcement, reset), the card's list kept out of a paragraph, invalid value.
 *   node tools/tests/timestamp.test.mjs
 */
import {readFileSync} from 'node:fs';
import {setup, sleep} from './_harness.mjs';

const {page, context, check, open, done, port} = await setup();
await context.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: `http://localhost:${port}`});

console.log('Server HTML');
const html = readFileSync(new URL('../../apps/docs/dist/components/timestamp/index.html', import.meta.url), 'utf8');
const ssr = html.slice(html.indexOf('id="ts-relative"'), html.indexOf('id="ts-relative"') + 200);
check('clock formats render the full date and time in UTC on the server', ssr.includes('>Feb 19, 2026, 5:00 PM UTC</time>'), ssr);
check('no hover-card trigger in the server HTML for a clock format', !html.slice(html.lastIndexOf('<ax-timestamp', html.indexOf('id="ts-relative"')), html.indexOf('id="ts-relative"')).includes('data-ax-hover-card='));
check('invalid value renders nothing', !html.includes('not a date') || !html.includes('id="ts-invalid"'));

await open('timestamp');
await page.waitForFunction(() => customElements.get('ax-timestamp'));
await sleep(100);
// The viewer-zone checks below assume the machine zone America/Bogota (UTC−5, no DST).
const inBogota = (await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)) === 'America/Bogota';
if (!inBogota) console.log('  (viewer zone is not America/Bogota: zone-specific text checks relaxed)');

const info = (id) => page.evaluate((id) => {
  const time = document.getElementById(id);
  const root = time.closest('ax-timestamp');
  const card = document.getElementById(root.getAttribute('data-ax-card') ?? '');
  return {
    text: time.textContent,
    label: time.getAttribute('aria-label'),
    tabindex: time.getAttribute('tabindex'),
    format: root.getAttribute('data-format'),
    trigger: root.getAttribute('data-ax-hover-card'),
    haspopup: root.getAttribute('aria-haspopup'),
    cardEnabled: card ? card.getAttribute('data-ax-enabled') !== 'false' : null,
    classes: root.className,
  };
}, id);

console.log('Relative');
const rel = await info('ts-relative');
check('relative phrase in the browser', rel.text === '5 minutes ago', rel.text);
check('data-format reflects the effective format', rel.format === 'relative' && rel.classes.includes('astryx-timestamp') && rel.classes.includes('astryx-text'));
check('full absolute time (zone spelled out) is the accessible name', /^[A-Z][a-z]+ \d+, \d{4} at .+ (Standard|Daylight) Time$|^[A-Z][a-z]+ \d+, \d{4} at .+ GMT[+-]\d/.test(rel.label ?? '') || /Time$/.test(rel.label ?? ''), rel.label);
check('tab stop + hover card attached', rel.tabindex === '0' && !!rel.trigger && rel.haspopup === 'dialog' && rel.cardEnabled === true, JSON.stringify(rel));
check('relative_short', (await info('ts-short')).text === '2h ago');
const autoRecent = await info('ts-auto-recent');
check('auto within the threshold → relative', autoRecent.text === '3 days ago' && autoRecent.format === 'relative');
const autoOld = await info('ts-auto-old');
check('auto past the threshold → date_time, no card, no tab stop, no name', autoOld.format === 'date_time' && autoOld.trigger === null && autoOld.cardEnabled === false && autoOld.tabindex === null && autoOld.label === null, JSON.stringify(autoOld));
check('future phrase', (await info('ts-future')).text === 'in 2 days');
check('locale es-ES', (await info('ts-es')).text === 'hace 1 hora', (await info('ts-es')).text);
const abs = await info('ts-date');
check('absolute format: no card, no tab stop', abs.text === 'Feb 19, 2026' && abs.trigger === null && abs.tabindex === null && abs.format === 'date');
check('absolute formats in the viewer zone (Bogotá, UTC−5)', !inBogota || (await info('ts-date_time')).text === 'Feb 19, 2026, 12:00 PM' && (await info('ts-system_date_time')).text === '2026-02-19 12:00:00' && (await info('ts-unix_seconds')).text === '1771520400');
check('isTimezoneShown', !inBogota || (await info('ts-zone')).text === 'Feb 19, 2026, 12:00 PM GMT-5', (await info('ts-zone')).text);
check('hasTooltip={false}: no card', (await info('ts-unix')).trigger === null && (await info('ts-unix')).tabindex === null);

console.log('Live');
const live1 = (await info('ts-live')).text;
await sleep(3500);
const live2 = (await info('ts-live')).text;
check('isLive ticks (every second under a minute)', live1 !== live2 && /seconds? ago/.test(live2), `${live1} → ${live2}`);
const still = (await info('ts-relative')).text;
check('not live: unchanged', still === '5 minutes ago');

console.log('Hover card');
const cardId = (await info('ts-relative')).trigger;
const rootSel = `ax-timestamp[data-ax-card="${cardId}"]`;
const box = await page.locator(rootSel).boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {steps: 2});
await sleep(450);
const card = await page.evaluate((id) => {
  const c = document.getElementById(id);
  return {
    open: c.matches(':popover-open'),
    role: c.getAttribute('role'),
    label: c.getAttribute('aria-label'),
    dl: !!c.querySelector('dl.ax-timestamp-card'),
    template: !!c.querySelector('template'),
    rows: [...c.querySelectorAll('.ax-timestamp-card-value')].map((d) => d.textContent),
    buttons: [...c.querySelectorAll('.astryx-timestamp-copy-button')].map((b) => b.getAttribute('aria-label')),
    controls: document.querySelector(`[data-ax-card="${id}"]`).getAttribute('aria-controls'),
  };
}, cardId);
check('hover opens the labelled dialog card', card.open && card.role === 'dialog' && card.label === 'Timestamp details' && card.controls === cardId, JSON.stringify(card));
check('card content stamped from its template: one copyable <dl> row (viewer zone)', card.dl && !card.template && card.rows.length === 1 && (!inBogota || card.rows[0].endsWith('GMT-5')) && card.buttons[0] === `Copy ${card.rows[0]}`, JSON.stringify(card));
const placed = await page.evaluate(([id, sel]) => document.getElementById(id).getBoundingClientRect().bottom <= document.querySelector(sel).getBoundingClientRect().top + 1, [cardId, rootSel]);
check('card placed above the timestamp', placed);

console.log('Copy');
const copyBtn = `#${cardId} .astryx-timestamp-copy-button`;
const tipText = () => page.evaluate((sel) => document.getElementById(document.querySelector(sel).getAttribute('data-ax-copy-tooltip')).textContent, copyBtn);
check('copy tooltip reads "Copy" and describes the button', (await tipText()) === 'Copy' && (await page.getAttribute(copyBtn, 'aria-describedby')) === (await page.getAttribute(copyBtn, 'data-ax-copy-tooltip')));
await page.hover(copyBtn);
await page.click(copyBtn);
await sleep(80);
const clip = await page.evaluate(() => navigator.clipboard.readText());
check('clipboard holds the row value', clip === card.rows[0], clip);
const after = await page.evaluate((sel) => {
  const b = document.querySelector(sel);
  return {label: b.getAttribute('aria-label'), copied: b.hasAttribute('data-copied'), describedBy: b.getAttribute('aria-describedby'), check: getComputedStyle(b.querySelector('[data-state="copied"]')).display !== 'none'};
}, copyBtn);
check('copied: name "Copied", tooltip "Copied" (now the name: not a description), check icon', after.label === 'Copied' && after.copied && after.check && after.describedBy === null && (await tipText()) === 'Copied', JSON.stringify(after));
check('"Copied" announced', (await page.evaluate(() => [...document.querySelectorAll('[data-astryx-live-region]')].map((r) => r.textContent).join('|'))).includes('Copied'));
check('card stays open while copying', await page.evaluate((id) => document.getElementById(id).matches(':popover-open'), cardId));
await sleep(1600);
check('resets after 1.5s', (await page.getAttribute(copyBtn, 'aria-label')) === `Copy ${card.rows[0]}` && (await tipText()) === 'Copy');
await page.mouse.move(5, 5);
await sleep(600);
check('leaving closes the card', !(await page.evaluate((id) => document.getElementById(id).matches(':popover-open'), cardId)));

console.log('Keyboard + entries');
const entriesRoot = await page.evaluate(() => document.getElementById('ts-entries').closest('ax-timestamp').getAttribute('data-ax-card'));
check('tooltipEntries attach a card to an absolute format (tab stop)', (await info('ts-entries')).tabindex === '0' && (await info('ts-entries')).trigger === entriesRoot);
await page.focus('#ts-entries');
await sleep(150);
const entriesCard = await page.evaluate((id) => {
  const c = document.getElementById(id);
  return {
    open: c.matches(':popover-open'),
    labels: [...c.querySelectorAll('dt')].map((d) => d.textContent),
    values: [...c.querySelectorAll('dd')].map((d) => d.textContent),
    buttons: c.querySelectorAll('.astryx-timestamp-copy-button').length,
    columns: c.querySelector('dl').dataset.columns,
    actionCells: c.querySelectorAll('.ax-timestamp-card-action').length,
  };
}, entriesRoot);
check('focus opens the card', entriesCard.open);
check('multi-zone rows with labels, one copy column', entriesCard.labels.join() === 'Local,UTC,Bogotá,ISO' && entriesCard.buttons === 1 && entriesCard.actionCells === 4 && entriesCard.columns === 'label-value-action', JSON.stringify(entriesCard));
check('zones: UTC marked, named zone marked, ISO machine-readable', entriesCard.values[1].endsWith('UTC') && entriesCard.values[2] === 'Feb 19, 2026, 12:00 PM GMT-5' && entriesCard.values[3] === '2026-02-19 17:00:00', JSON.stringify(entriesCard.values));
await page.keyboard.press('Escape');
await sleep(100);
check('Escape closes it', !(await page.evaluate((id) => document.getElementById(id).matches(':popover-open'), entriesRoot)));

console.log('Paragraph');
const para = await page.evaluate(() => {
  const p = document.getElementById('ts-paragraph');
  return {contains: p.contains(document.getElementById('ts-inline')), text: p.textContent.includes('by Ada'), dlInP: !!p.querySelector('dl')};
});
check('a Timestamp inside <p> keeps the paragraph whole', para.contains && para.text, JSON.stringify(para));

await done();
