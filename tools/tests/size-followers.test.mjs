#!/usr/bin/env node
/**
 * Inherited size reaches content an owner renders in its own layer (lib/cascade followers;
 * Astryx `useSize(sizeProp)` handed to the listbox rows). Unit: `stamp()` runs a settled
 * element's appliers on its `data-ax-inherit-from` followers (inside layer roots too), with
 * `data-ax-inherit-map` and `data-ax-inherit-deep`; a null provider and `seal()` leave them be.
 * Built docs (server markup, no JS): a Selector and a MultiSelector in a small InputGroup render
 * sm option rows (MultiSelector's row checkboxes sm), the default demo stays md; in the browser
 * the rows keep their sizes and the Selector check marks keep theirs.
 *   node tools/tests/size-followers.test.mjs
 */
import {readFileSync} from 'node:fs';
import {parse} from 'node-html-parser';
import {lib} from './lib-loader.mjs';
import {setup} from './_harness.mjs';

const {page, check, open, done} = await setup();
const {stamp, seal} = await lib('cascade.ts');

console.log('stamp() followers');
const source = (marker = 'size') => `<div id="box" data-ax-inherit="${marker}" data-size="md"></div>`;
const layer = (rows) => `<div popover data-astryx-layer-root>${rows}</div>`;
const sizeTo = (size) => ({size: (a) => { a['data-size'] = size; }});
let out = parse(await stamp(source() + layer('<p id="row" data-size="md" data-ax-inherit-from="box"></p>'), sizeTo('sm')));
check('a follower inside a layer root takes the stamp', out.querySelector('#row').getAttribute('data-size') === 'sm' && out.querySelector('#box').getAttribute('data-size') === 'sm');
check('…and its follower attributes are dropped', !out.querySelector('#row').hasAttribute('data-ax-inherit-from'));
out = parse(await stamp(source() + layer('<p id="row" data-size="md" data-ax-inherit-from="box" data-ax-inherit-map="lg=md"></p>'), sizeTo('lg')));
check('data-ax-inherit-map rewrites the value it receives', out.querySelector('#row').getAttribute('data-size') === 'md' && out.querySelector('#box').getAttribute('data-size') === 'lg');
out = parse(await stamp(source() + layer('<div id="wrap" data-ax-inherit-from="box" data-ax-inherit-deep><i id="a" data-size="md"></i><b><i id="b" data-size="md"></i></b><i id="c"></i></div>'), sizeTo('sm')));
check('deep: descendants carrying the attribute take it, the follower and the rest stay bare',
  out.querySelector('#a').getAttribute('data-size') === 'sm' && out.querySelector('#b').getAttribute('data-size') === 'sm' &&
  !out.querySelector('#wrap').hasAttribute('data-size') && !out.querySelector('#c').hasAttribute('data-size'), out.toString());
out = parse(await stamp(source() + layer('<p id="row" data-size="md" data-ax-inherit-from="box"></p>'), {size: null}));
check('a null provider settles the source: the follower keeps its value and drops the link', out.querySelector('#row').getAttribute('data-size') === 'md' && !out.querySelector('#row').hasAttribute('data-ax-inherit-from'));
out = parse(await stamp(source('other') + layer('<p id="row" data-size="md" data-ax-inherit-from="box"></p>'), sizeTo('sm')));
check('a stamp of another key leaves the follower linked', out.querySelector('#row').getAttribute('data-size') === 'md' && out.querySelector('#row').getAttribute('data-ax-inherit-from') === 'box');
out = parse(await seal(source() + layer('<p id="row" data-size="md" data-ax-inherit-from="box"></p>')));
check('seal() ends the cascade for the source and its followers', !out.querySelector('#box').hasAttribute('data-ax-inherit') && !out.querySelector('#row').hasAttribute('data-ax-inherit-from') && out.querySelector('#row').getAttribute('data-size') === 'md');

console.log('Server markup (built docs, no JS)');
const html = parse(readFileSync(new URL('../../apps/docs/dist/components/selector/index.html', import.meta.url), 'utf8'));
const rowsOf = (boxSelector) => {
  const box = html.querySelector(boxSelector);
  const listbox = html.getElementById(box.getAttribute('data-ax-listbox'));
  return {box: box.getAttribute('data-size'), rows: listbox.querySelectorAll('[role="option"]')};
};
const sel = rowsOf('ax-selector:has(#selector-in-sm-group), ax-selector#selector-in-sm-group') ;
check('Selector in an sm InputGroup: the box and every option row server-render sm',
  sel.box === 'sm' && sel.rows.length === 4 && sel.rows.every((r) => r.getAttribute('data-size') === 'sm' && !r.hasAttribute('data-ax-inherit-from')),
  JSON.stringify({box: sel.box, rows: sel.rows.map((r) => r.getAttribute('data-size'))}));
// The check Indicator renders a mark only for the selected row (a theme may draw the others).
const serverMarks = sel.rows.map((r) => r.querySelector('.astryx-selector-check')?.getAttribute('data-size')).filter(Boolean);
check('…and the check mark keeps its own size (sm Indicator)', serverMarks.length > 0 && serverMarks.every((v) => v === 'sm'), JSON.stringify(serverMarks));
const ms = rowsOf('ax-multi-selector:has(#multi-selector-in-sm-group), ax-multi-selector#multi-selector-in-sm-group');
const msSizes = ms.rows.filter((r) => !r.hasAttribute('data-ax-create-row')).map((r) => ({row: r.getAttribute('data-size'), box: r.querySelectorAll('[data-ax-mark-slot] [data-size]').map((el) => el.getAttribute('data-size'))}));
check('MultiSelector in an sm InputGroup: rows sm, their CheckboxInput parts sm',
  ms.box === 'sm' && msSizes.length === 4 && msSizes.every((r) => r.row === 'sm' && r.box.length > 0 && r.box.every((v) => v === 'sm')), JSON.stringify({box: ms.box, msSizes}));
const plainSel = html.querySelectorAll('ax-selector').find((b) => b.getAttribute('data-size') === 'md' && b.hasAttribute('data-ax-inherit'));
const plainRows = plainSel && html.getElementById(plainSel.getAttribute('data-ax-listbox')).querySelectorAll('[role="option"]');
check('a Selector outside any provider keeps md rows', plainRows?.length > 0 && plainRows.every((r) => r.getAttribute('data-size') === 'md'));

console.log('In the browser');
await open('selector');
const live = await page.evaluate(() => {
  const read = (id) => {
    const box = document.getElementById(id).closest('[data-ax-listbox]');
    const rows = [...document.getElementById(box.getAttribute('data-ax-listbox')).querySelectorAll('[role="option"]')];
    return {box: box.dataset.size, rows: rows.map((r) => r.dataset.size), marks: rows.map((r) => r.querySelector('[data-ax-mark-slot] [data-size]')?.dataset.size)};
  };
  const large = [...document.querySelectorAll('ax-selector[data-size="lg"]')][0];
  const largeRows = large ? [...document.getElementById(large.getAttribute('data-ax-listbox')).querySelectorAll('[role="option"]')] : [];
  return {sel: read('selector-in-sm-group'), ms: read('multi-selector-in-sm-group'), largeMarks: largeRows.map((r) => r.querySelector('.astryx-selector-check')?.dataset.size)};
});
check('after connect the sm rows stay sm', live.sel.rows.every((s) => s === 'sm') && live.ms.rows.every((s) => s === 'sm'), JSON.stringify(live));
const shown = (list) => list.filter(Boolean);
check('the elements restamp only option rows: check marks (sm, also in an lg Selector) and checkboxes keep their sizes',
  shown(live.sel.marks).length > 0 && shown(live.sel.marks).every((s) => s === 'sm') && live.ms.marks.every((s) => s === 'sm') &&
  shown(live.largeMarks).length > 0 && shown(live.largeMarks).every((s) => s === 'sm'), JSON.stringify(live));

await done();
