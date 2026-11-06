#!/usr/bin/env node
/**
 * List + ListItem in a real browser (run `cd apps/docs && npx astro build` first): semantics
 * (ul/ol, role="list", header labelling, start), density padding, dividers, markers (dots,
 * circles, the shared number column, a custom marker, Markdown's square/letter/roman/task
 * markers), nested lists, the four edge treatments inside a Card (geometry against the heading
 * and the card's edges), and interactive rows (button, link, delegate, selected, disabled).
 *   node tools/tests/list.test.mjs
 */
import {setup} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('list');

const near = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;
const sel = (t) => `[data-test="${t}"]`;

// ── semantics ──
const semantics = await page.evaluate(() => {
  const q = (t) => document.querySelector(`[data-test="${t}"]`);
  const headed = q('header-prop');
  const label = document.getElementById(headed.getAttribute('aria-labelledby') ?? '');
  const slotted = q('header-slot');
  const slotLabel = document.getElementById(slotted.getAttribute('aria-labelledby') ?? '');
  const decimal = q('decimal-start');
  return {
    tag: headed.tagName, role: headed.getAttribute('role'), label: label?.textContent?.trim(), wrapper: headed.parentElement.className,
    slotLabel: slotLabel?.textContent?.trim(), styleTag: q('style-disc').tagName, olTag: decimal.tagName, start: decimal.getAttribute('start'),
    startVar: decimal.style.getPropertyValue('--_ax-list-start'), listStyle: decimal.dataset.listStyle, density: headed.dataset.density,
    itemClass: headed.querySelector('li').className, plainStart: q('style-decimal').hasAttribute('start'),
  };
});
check('<ul role="list"> labelled by its header prop', semantics.tag === 'UL' && semantics.role === 'list' && semantics.label === 'Team' && semantics.wrapper === 'ax-list-root', JSON.stringify(semantics));
check('header slot labels the list', semantics.slotLabel?.startsWith('Header slot'), JSON.stringify(semantics));
check('decimal renders <ol start>, counter starts at start - 1; disc stays <ul>', semantics.olTag === 'OL' && semantics.start === '8' && semantics.startVar.trim() === '7' && semantics.styleTag === 'UL' && !semantics.plainStart, JSON.stringify(semantics));
check('theme hooks: .astryx-list[data-density][data-list-style], rows .astryx-item.astryx-list-item', semantics.listStyle === 'decimal' && semantics.density === 'balanced' && /astryx-item/.test(semantics.itemClass) && /astryx-list-item/.test(semantics.itemClass), JSON.stringify(semantics));

// ── density + dividers ──
const density = await page.evaluate(() => ['compact', 'balanced', 'spacious'].map((d) => {
  const list = document.querySelector(`[data-test="density-${d}"]`);
  const rows = [...list.querySelectorAll(':scope > li')];
  const cs = (el) => getComputedStyle(el);
  return {
    d, pad: cs(rows[0]).paddingTop, inset: cs(rows[0]).paddingLeft, rowDensity: rows[0].dataset.density, gap: cs(list).rowGap,
    borders: rows.map((r) => cs(r).borderBottomWidth), radius: cs(rows[0]).borderTopLeftRadius,
  };
}));
const [compact, balanced, spacious] = density;
check('density sets row padding 4 / 8 / 12px and data-density on rows', compact.pad === '4px' && balanced.pad === '8px' && spacious.pad === '12px' && compact.rowDensity === 'compact' && spacious.rowDensity === 'spacious', JSON.stringify(density));
check('spacious widens the inline inset to 12px', spacious.inset === '12px' && compact.inset === '8px', JSON.stringify(density));
check('dividers: every row but the last, square corners, no list gap', compact.borders.join() === '1px,1px,0px' && compact.radius === '0px' && compact.gap === '0px', JSON.stringify(compact));
check('no dividers: 2px gap, rounded rows, no borders', balanced.borders.every((b) => b === '0px') && balanced.gap === '2px' && balanced.radius !== '0px', JSON.stringify(balanced));

// ── markers ──
const markers = await page.evaluate(() => {
  const q = (t) => document.querySelector(`[data-test="${t}"]`);
  const box = (el) => el.getBoundingClientRect();
  const dot = q('style-disc').querySelector('.ax-list-marker-dot');
  const circle = q('style-circle').querySelector('.ax-list-marker-circle');
  const label0 = box(q('style-disc').querySelector('.ax-item-label'));
  const dotBox = box(dot);
  const numbers = [...q('decimal-start').querySelectorAll(':scope > li > .ax-list-number')];
  const labels = [...q('decimal-start').querySelectorAll(':scope > li .ax-item-label')];
  const custom = q('custom-marker');
  const customLabels = [...custom.querySelectorAll(':scope > li .ax-item-label')].map((l) => box(l).left);
  return {
    dot: {w: dotBox.width, h: dotBox.height, bg: getComputedStyle(dot).backgroundColor, radius: getComputedStyle(dot).borderRadius},
    dotCenterInLine: dotBox.top + dotBox.height / 2 > label0.top && dotBox.top + dotBox.height / 2 < label0.bottom,
    circleBorder: getComputedStyle(circle).borderTopWidth, circleBg: getComputedStyle(circle).backgroundColor,
    numberRights: numbers.map((n) => box(n).right), labelLefts: labels.map((l) => box(l).left),
    numberContent: getComputedStyle(numbers[0], '::before').content, numberFont: getComputedStyle(numbers[0]).fontVariantNumeric,
    listDisplay: getComputedStyle(q('decimal-start')).display, rowDisplay: getComputedStyle(numbers[0].parentElement).display,
    counterIncrement: getComputedStyle(numbers[0].parentElement).counterIncrement,
    customLabels, customMarker: !!custom.querySelector('li:nth-child(2) > .ax-list-marker-custom .astryx-icon, li:nth-child(2) > .ax-list-marker-custom svg'),
    customNoNumber: !custom.querySelector('li:nth-child(2) > .ax-list-number'),
    noneMarker: !document.querySelector('[data-test="header-prop"] .ax-list-marker, [data-test="header-prop"] .ax-list-number'),
  };
});
check('disc: a 6px round dot centred on the first line', markers.dot.w === 6 && markers.dot.h === 6 && markers.dot.radius === '50%' && markers.dotCenterInLine, JSON.stringify(markers.dot));
check('circle: an outlined, transparent dot', markers.circleBorder === '1px' && markers.circleBg === 'rgba(0, 0, 0, 0)', JSON.stringify(markers));
check('numbers: CSS counter "n." with tabular figures', markers.numberContent.includes('counter(astryx-list)') && markers.numberFont.includes('tabular-nums') && markers.counterIncrement.startsWith('astryx-list'), JSON.stringify(markers));
check('numbered rows subgrid into one shared column (8–11: one text start, periods aligned)', markers.listDisplay === 'grid' && markers.rowDisplay === 'grid'
  && markers.labelLefts.every((l) => near(l, markers.labelLefts[0])) && markers.numberRights.every((r) => near(r, markers.numberRights[0])), JSON.stringify(markers));
check('custom marker slot takes the marker column; text still aligned', markers.customMarker && markers.customNoNumber && markers.customLabels.every((l) => near(l, markers.customLabels[0])), JSON.stringify(markers.customLabels));
check('listStyle="none" draws no marker', markers.noneMarker);

const scoped = await page.evaluate(() => {
  const lists = [...document.querySelectorAll('.demo .astryx-list')];
  const square = lists.find((l) => l.querySelector('.ax-list-marker-square'));
  const alpha = document.querySelector('.ax-list-number[data-marker="lower-alpha"]');
  const roman = document.querySelector('.ax-list-number[data-marker="lower-roman"]');
  const task = document.querySelector('[data-test="task"]');
  const boxes = [...task.querySelectorAll('.ax-list-task input[type="checkbox"]')];
  return {
    square: !!square, alpha: alpha ? getComputedStyle(alpha, '::before').content : null,
    roman: roman ? getComputedStyle(roman, '::before').content : null, gutter: roman?.hasAttribute('data-ax-gutter'),
    task: boxes.map((b) => ({checked: b.checked, readonly: b.getAttribute('aria-readonly'), name: b.labels?.[0]?.textContent?.trim()})),
  };
});
check('ListMarkerScope: square dots, letter and roman counters (gutter)', scoped.square && scoped.alpha?.includes('lower-alpha') && scoped.roman?.includes('lower-roman') && scoped.gutter, JSON.stringify(scoped));
check('task items draw a read-only checkbox named by the item text', scoped.task.length === 2 && scoped.task[0].checked && !scoped.task[1].checked && scoped.task.every((t) => t.readonly === 'true') && scoped.task[0].name === 'Write the spec', JSON.stringify(scoped.task));

const nested = await page.evaluate(() => {
  const outer = document.querySelector('[data-test="nested"]');
  const inner = document.querySelector('[data-test="nested-inner"]');
  return {
    outerRow: outer.querySelector(':scope > li').dataset.density, innerRow: inner.querySelector(':scope > li').dataset.density,
    innerMarker: !!inner.querySelector('.ax-list-marker-circle'), outerMarker: !!outer.querySelector(':scope > li > .ax-list-marker > .ax-list-marker-dot'),
    innerInDescription: !!inner.closest('.ax-item-description'),
    nestedOl: document.querySelectorAll('[data-test="nested-decimal"] ol').length,
  };
});
check('nested List keeps its own density and marker; the outer keeps its own', nested.outerRow === 'balanced' && nested.innerRow === 'compact' && nested.innerMarker && nested.outerMarker && nested.innerInDescription && nested.nestedOl === 1, JSON.stringify(nested));

// ── edge treatments in a Card ──
const edges = await page.evaluate(() => ['padded', 'flush', 'outset', 'bleed'].map((edge) => {
  const card = document.querySelector(`[data-test="edge-card-${edge}"]`);
  const heading = card.querySelector('h4');
  const list = card.querySelector('.astryx-list');
  const row = list.querySelector(':scope > li');
  const start = row.querySelector('.ax-item-start');
  const b = (el) => el.getBoundingClientRect();
  const cs = getComputedStyle(row);
  return {
    edge, cardLeft: b(card).left, cardRight: b(card).right, headingLeft: b(heading).left, listLeft: b(list).left, listRight: b(list).right,
    rowLeft: b(row).left, rowRight: b(row).right, startLeft: b(start).left, radius: cs.borderTopLeftRadius, padStart: cs.paddingLeft,
    marginStart: cs.marginLeft, listEdge: list.dataset.axEdge ?? null, rowEdge: row.dataset.axEdge ?? null,
  };
}));
const E = Object.fromEntries(edges.map((e) => [e.edge, e]));
check('padded: text 8px in from the heading; row at the content edge', near(E.padded.startLeft, E.padded.headingLeft + 8) && near(E.padded.rowLeft, E.padded.headingLeft) && E.padded.rowEdge === null, JSON.stringify(E.padded));
check('flush: no inset — text on the heading line, row stops at the content', near(E.flush.startLeft, E.flush.headingLeft) && near(E.flush.rowLeft, E.flush.headingLeft) && E.flush.padStart === '0px', JSON.stringify(E.flush));
check('outset: text on the heading line, background reaches 8px into the padding', near(E.outset.startLeft, E.outset.headingLeft) && near(E.outset.rowLeft, E.outset.headingLeft - 8) && E.outset.listEdge === 'outset', JSON.stringify(E.outset));
check('outset: the list reaches the container padding edge', E.outset.listLeft < E.outset.headingLeft - 8 && E.outset.listLeft <= E.outset.cardLeft + 1.5, JSON.stringify(E.outset));
check('bleed: text on the heading line, row reaches both card edges, square corners', near(E.bleed.startLeft, E.bleed.headingLeft) && E.bleed.rowLeft <= E.bleed.cardLeft + 1.5 && E.bleed.rowRight >= E.bleed.cardRight - 1.5 && E.bleed.radius === '0px' && E.bleed.listEdge === 'bleed', JSON.stringify(E.bleed));
const compensation = await page.evaluate(() => {
  const list = document.querySelector('[data-test="edge-compensation"]');
  return {list: list.dataset.axEdge, row: list.querySelector('li').dataset.axEdge};
});
check('deprecated edgeCompensation="inline" behaves as outset', compensation.list === 'outset' && compensation.row === 'outset', JSON.stringify(compensation));

// ── interactive rows ──
const log = () => page.textContent(sel('log'));
await page.click(`${sel('button-row')} .ax-item-start`);
check('button row: a surface click (start icon) is retargeted to the invisible button', (await log()) === 'button in button-row', await log());
const buttonRow = await page.evaluate(() => {
  const row = document.querySelector('[data-test="button-row"]');
  const action = row.querySelector('button.ax-item-action');
  return {action: !!action, type: action?.type, hit: row.classList.contains('ax-hit-area'), inList: row.hasAttribute('data-ax-in-list'), tag: row.tagName};
});
check('button row renders <li> with an invisible <button type="button">, hit-area enrolled', buttonRow.action && buttonRow.type === 'button' && buttonRow.hit && buttonRow.inList && buttonRow.tag === 'LI', JSON.stringify(buttonRow));
await page.evaluate(() => { document.querySelector('[data-test="log"]').textContent = 'none'; });
await page.focus(`${sel('button-row')} button.ax-item-action`);
await page.keyboard.press('Enter');
check('Enter on the focused row button activates it', (await log()) === 'button in button-row', await log());
const ring = await page.evaluate(() => getComputedStyle(document.querySelector('[data-test="button-row"]')).outlineStyle);
check('keyboard focus rings the row (focus within)', ring === 'solid', ring);

await page.click(`${sel('link-row')} .ax-item-description`);
await page.waitForTimeout(50);
check('link row: a surface click follows the invisible link', page.url().endsWith('#list-target'), page.url());
const external = await page.evaluate(() => {
  const a = document.querySelector('[data-test="external-row"] a.ax-item-action');
  return {target: a?.getAttribute('target'), rel: a?.getAttribute('rel')};
});
check('target="_blank" merges noopener noreferrer into rel', external.target === '_blank' && /noopener/.test(external.rel) && /noreferrer/.test(external.rel) && /external/.test(external.rel), JSON.stringify(external));

const delegateBefore = await page.$eval(sel('delegate-input'), (i) => i.checked);
await page.click(`${sel('delegate-row')} .ax-item-label`);
const delegate = await page.evaluate(() => {
  const input = document.querySelector('[data-test="delegate-input"]');
  const desc = document.getElementById(input.getAttribute('aria-describedby') ?? '');
  const row = document.querySelector('[data-test="delegate-row"]');
  return {checked: input.checked, desc: desc?.textContent, extraStops: row.querySelectorAll('button, a').length};
});
check('delegate row: a surface click toggles its checkbox, no extra tab stop', !delegateBefore && delegate.checked && delegate.extraStops === 0, JSON.stringify(delegate));
check('delegate control is described by the row description (item-description)', delegate.desc?.includes('interactiveRef'), JSON.stringify(delegate));

const states = await page.evaluate(() => {
  const selected = document.querySelector('[data-test="selected-row"]');
  const disabled = document.querySelector('[data-test="disabled-row"]');
  return {
    current: selected.getAttribute('aria-current'), ariaSelected: selected.getAttribute('aria-selected'), selectedState: selected.dataset.selected,
    selectedBg: getComputedStyle(selected).backgroundColor,
    disabled: disabled.getAttribute('aria-disabled'), disabledButton: disabled.querySelector('button')?.disabled, disabledHit: disabled.classList.contains('ax-hit-area'),
  };
});
check('isSelected → aria-current="true" (never aria-selected on a list item) + selected fill', states.current === 'true' && states.ariaSelected === null && states.selectedState === 'selected' && states.selectedBg !== 'rgba(0, 0, 0, 0)', JSON.stringify(states));
check('isDisabled → aria-disabled row, natively disabled action, no hit area', states.disabled === 'true' && states.disabledButton === true && !states.disabledHit, JSON.stringify(states));
await page.evaluate(() => { document.querySelector('[data-test="log"]').textContent = 'none'; });
await page.click(`${sel('disabled-row')} .ax-item-label`, {force: true});
check('a disabled row does not activate (no pointer events, disabled action)', !(await log()).includes('disabled-row'), await log());

await done();
