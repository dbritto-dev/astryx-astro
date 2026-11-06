#!/usr/bin/env node
/**
 * FileInput in a real browser (run `cd apps/docs && npx astro build` first): the hidden
 * trigger (name, keyboard opens the picker, surface click opens it), selection (names,
 * trigger name, clear button, astryx-change, polite announcement), validation (accept,
 * maxSize, maxFiles → one error status, aria-invalid, describedby), dropzone drag & drop,
 * clear (focus back to the trigger), disabled, FormLayout required, native form submit/reset.
 *   node tools/tests/file-input.test.mjs
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
// One persistent listener turns on file-chooser interception before any press (a listener
// added right before the press races the CDP call and can miss the chooser).
let chooser = null;
page.on('filechooser', (fc) => { chooser = fc; });
const nextChooser = async (ms = 1500) => {
  chooser = null;
  return async () => {
    for (let t = 0; t < ms && !chooser; t += 25) await sleep(25);
    return chooser;
  };
};
await open('file-input');
await sleep(200);

const root = (t) => `ax-file-input:has(input[data-test="${t}"])`;
const native = (t) => `input[data-test="${t}"]`;
const pdf = {name: 'resume.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test')};
const png = {name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('png')};
const big = {name: 'big.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(60 * 1024)};

await page.evaluate(() => {
  window.__changes = [];
  document.addEventListener('astryx-change', (e) => {
    const v = e.detail.value;
    window.__changes.push(v == null ? null : Array.isArray(v) ? v.map((f) => f.name) : v.name);
  });
});
const lastChange = () => page.evaluate(() => window.__changes.at(-1));
const info = (t) => page.evaluate((r) => {
  const el = document.querySelector(r);
  const trigger = el.querySelector('[data-ax-file-trigger]');
  const text = (ids) => (ids ?? '').split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)?.textContent.trim()).join(' | ');
  return {
    name: trigger.getAttribute('aria-label'), desc: text(trigger.getAttribute('aria-describedby')), invalid: trigger.getAttribute('aria-invalid'),
    status: el.dataset.status ?? null, clearHidden: el.querySelector('[data-ax-input-clear]')?.hidden,
    shown: (el.querySelector('[data-ax-file-text]') ?? el.querySelector('[data-ax-file-names]'))?.textContent,
    files: [...el.querySelector('input[type=file]').files].map((f) => f.name),
  };
}, root(t));

const initial = await info('compact');
check('trigger named by the label, described by the description; clear hidden', initial.name === 'Resume' && initial.desc === 'PDF only' && initial.clearHidden === true, JSON.stringify(initial));
check('native file input: aria-hidden, tabindex -1, accept, caller props', await page.evaluate((s) => {
  const el = document.querySelector(s);
  return el.getAttribute('aria-hidden') === 'true' && el.tabIndex === -1 && el.accept === '.pdf' && el.name === 'resume';
}, native('compact')));

// keyboard: Tab to the trigger, Enter opens the picker
await page.focus(`${root('compact')} [data-ax-file-trigger]`);
const chooser1 = await nextChooser();
await page.keyboard.press('Enter');
const fc = await chooser1();
check('Enter on the focused trigger opens the picker', fc != null);
if (fc) await fc.setFiles(pdf);
await sleep(60);
const picked = await info('compact');
check('selection shows the name, names the trigger, shows clear, keeps the file in the form input', picked.shown === 'resume.pdf' && picked.name === 'Resume, resume.pdf' && picked.clearHidden === false && picked.files.join() === 'resume.pdf', JSON.stringify(picked));
check('astryx-change carries the File', (await lastChange()) === 'resume.pdf');
const polite = await page.evaluate(() => [...document.querySelectorAll('[data-astryx-live-region="polite"]')].map((r) => r.textContent).join(' | '));
check('selection announced politely ("1 file selected: resume.pdf")', polite.includes('1 file selected: resume.pdf'), polite);

// surface click opens the picker
const chooser2 = await nextChooser();
await page.click(`${root('compact')} .astryx-file-input-icon`);
const fc2 = await chooser2();
check('a click on the surface opens the picker', fc2 != null);
if (fc2) await fc2.setFiles(pdf);
await sleep(60);

// clear
await page.click(`${root('compact')} [data-ax-input-clear]`);
await sleep(60);
const cleared = await info('compact');
check('clear removes the files, emits null, focus returns to the trigger', cleared.shown === 'Choose file' && cleared.files.length === 0 && (await lastChange()) === null &&
  await page.evaluate(() => document.activeElement?.hasAttribute('data-ax-file-trigger')), JSON.stringify(cleared));

// validation: accept
await page.setInputFiles(native('compact'), png);
await sleep(60);
const rejected = await info('compact');
check('accept: rejected file → error status describing the trigger, aria-invalid', rejected.status === 'error' && rejected.invalid === 'true' && rejected.desc.includes('"photo.png" is not an accepted file type'), JSON.stringify(rejected));
check('error box attached below the control + icon in the field', await page.evaluate((r) => {
  const el = document.querySelector(r);
  return el.nextElementSibling?.matches('.astryx-field-status[data-variant="attached"][data-type="error"]') && !!el.querySelector('.astryx-input-status-icon[data-status="error"]');
}, root('compact')));
await page.setInputFiles(native('compact'), pdf);
await sleep(60);
const fixed = await info('compact');
check('a valid pick removes the error status', fixed.status === null && fixed.invalid === null && !fixed.desc.includes('accepted'), JSON.stringify(fixed));

// validation: maxSize + maxFiles (multiple)
await page.setInputFiles(native('multiple'), [pdf, big, png, {...pdf, name: 'c.pdf'}]);
await sleep(60);
const multi = await info('multiple');
check('maxSize + maxFiles: one combined error, valid files kept (first 2)', multi.desc.includes('"big.bin" exceeds 50.0 KB limit') && multi.desc.includes('Maximum 2 files allowed') && multi.files.join() === 'resume.pdf,photo.png' && multi.shown === 'resume.pdf, photo.png', JSON.stringify(multi));
check('astryx-change carries File[] when isMultiple', JSON.stringify(await lastChange()) === '["resume.pdf","photo.png"]');

// tooltip placement: no box, status button described by the message
await page.setInputFiles(native('tooltip-variant'), pdf);
await sleep(60);
const tip = await page.evaluate((r) => {
  const el = document.querySelector(r);
  const button = el.querySelector('.ax-input-status-button');
  return {box: !!el.parentElement.querySelector('.astryx-field-status'), tip: button && document.getElementById(button.getAttribute('aria-describedby'))?.textContent};
}, root('tooltip-variant'));
check('tooltip placement: no message box, focusable status button with the message', !tip.box && tip.tip === '"resume.pdf" is not an accepted file type', JSON.stringify(tip));

// dropzone drag & drop
const dz = root('dropzone');
await page.evaluate((r) => {
  const el = document.querySelector(r);
  const dt = new DataTransfer();
  dt.items.add(new File(['a'], 'a.png', {type: 'image/png'}));
  dt.items.add(new File(['b'], 'b.png', {type: 'image/png'}));
  el.dispatchEvent(new DragEvent('dragenter', {dataTransfer: dt, bubbles: true, cancelable: true}));
  window.__dragOver = el.hasAttribute('data-ax-drag-over') && el.querySelector('[data-ax-file-placeholder]').textContent;
  el.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true}));
}, dz);
await sleep(60);
const dropped = await info('dropzone');
const dragState = await page.evaluate(() => window.__dragOver);
check('dragover highlights the zone with "Drop files here"', dragState === 'Drop files here', String(dragState));
check('drop selects the files (shown, in the form input, highlight cleared)', dropped.shown === 'a.png, b.png' && dropped.files.join() === 'a.png,b.png' && await page.evaluate((r) => !document.querySelector(r).hasAttribute('data-ax-drag-over'), dz), JSON.stringify(dropped));

// disabled
const dis = await page.evaluate((r) => {
  const el = document.querySelector(r);
  const t = el.querySelector('[data-ax-file-trigger]');
  return {aria: t.getAttribute('aria-disabled'), tab: t.tabIndex, form: el.querySelector('input[type=file]').getAttribute('form'), clear: !!el.querySelector('[data-ax-input-clear]')};
}, root('disabled'));
check('disabled: trigger aria-disabled but tabbable, input detached from its form, no clear', dis.aria === 'true' && dis.tab === 0 && dis.form === '' && !dis.clear, JSON.stringify(dis));
await page.focus(`${root('disabled')} [data-ax-file-trigger]`);
const chooser3 = await nextChooser(700);
await page.keyboard.press('Enter');
check('disabled: Enter does not open the picker', (await chooser3()) == null);

// FormLayout required + native form
const req = await info('form-file');
check('FormLayout default required → trigger described by "Required" (no aria-required on a button)', req.desc.includes('Required') && await page.evaluate((r) => !document.querySelector(r).querySelector('[data-ax-file-trigger]').hasAttribute('aria-required'), root('form-file')), JSON.stringify(req));
await page.setInputFiles(native('form-file'), pdf);
await page.click('form[data-test="form"] button[type="submit"]');
const submitted = await page.evaluate(() => JSON.parse(document.querySelector('form[data-test="form"] [data-test="form-output"]').textContent));
check('form submit carries the selected file', submitted.some(([k, v]) => k === 'document' && v === 'resume.pdf'), JSON.stringify(submitted));
await page.click('form[data-test="form"] button[type="reset"]');
await sleep(40);
const afterReset = await info('form-file');
check('form reset clears the files and the display', afterReset.files.length === 0 && afterReset.shown === 'Choose file' && afterReset.clearHidden === true, JSON.stringify(afterReset));

await done();
