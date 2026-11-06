/**
 * ChatComposer + ChatComposerInput + ChatSendButton (components/chat): typing, Enter to send,
 * Shift+Enter line break, IME guard, the astryx-submit payload, send / stop states, history,
 * disabled state, click-to-focus and the keyboard-only focus ring, status announcements.
 */
import {setup} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('chat');

const EDITOR = '#chat-demo-input [data-ax-chat-editable]';
const SEND = '#chat-demo-composer [data-ax-chat-send]';
const state = () => page.evaluate(() => {
  const input = document.getElementById('chat-demo-input');
  const editor = input.querySelector('[data-ax-chat-editable]');
  const send = document.querySelector('#chat-demo-composer [data-ax-chat-send]');
  return {
    value: input.value,
    html: editor.innerHTML,
    placeholderHidden: input.querySelector('.ax-chat-input-placeholder').hidden,
    sendDisabled: send.disabled,
    sendVariant: send.getAttribute('data-variant'),
    sendLabel: send.getAttribute('aria-label'),
    stopIconHidden: send.querySelector('[data-ax-chat-icon="stop"]').hidden,
    composerValue: document.getElementById('chat-demo-composer').value,
  };
});

// Capture events.
await page.evaluate(() => {
  window.__events = [];
  const composer = document.getElementById('chat-demo-composer');
  for (const name of ['astryx-submit', 'astryx-change', 'astryx-stop']) {
    // Captured at the document and stopped there, so the demo's streamed reply stays out.
    document.addEventListener(name, (e) => {
      if (e.target !== composer && !composer.contains(e.target)) return;
      window.__events.push({name, detail: JSON.parse(JSON.stringify(e.detail ?? {}))});
      if (name !== 'astryx-change') e.stopPropagation();
    }, true);
  }
});

let s = await state();
check('editor is a combobox with triggers (aria-haspopup listbox, collapsed)', await page.$eval(EDITOR, (e) => e.getAttribute('role') === 'combobox' && e.getAttribute('aria-haspopup') === 'listbox' && e.getAttribute('aria-expanded') === 'false' && !e.hasAttribute('aria-multiline')));
check('plain input is a multiline textbox', await page.$eval('ax-chat-composer:not(#chat-demo-composer) [data-ax-chat-editable]', (e) => e.getAttribute('role') === 'textbox' && e.getAttribute('aria-multiline') === 'true'));
check('empty: placeholder shown, send disabled (primary, "Send")', !s.placeholderHidden && s.sendDisabled && s.sendVariant === 'primary' && s.sendLabel === 'Send', JSON.stringify(s));

// Typing.
await page.click(EDITOR);
await page.keyboard.type('Hello there');
s = await state();
check('typing updates value, hides placeholder, enables send', s.value === 'Hello there' && s.placeholderHidden && !s.sendDisabled && s.composerValue === 'Hello there', JSON.stringify(s));
const changes = await page.evaluate(() => window.__events.filter((e) => e.name === 'astryx-change').length);
check('astryx-change fired while typing', changes >= 11, String(changes));

// Shift+Enter: a line break, no submit.
await page.keyboard.press('Shift+Enter');
await page.keyboard.type('second line');
s = await state();
let submits = await page.evaluate(() => window.__events.filter((e) => e.name === 'astryx-submit').length);
check('Shift+Enter inserts a line break without sending', submits === 0 && /Hello there\n+second line/.test(s.value), JSON.stringify(s.value));

// IME composition: Enter that commits a candidate never sends.
await page.evaluate((sel) => {
  const editor = document.querySelector(sel);
  editor.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true, isComposing: true}));
  editor.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', keyCode: 229, bubbles: true, cancelable: true}));
}, EDITOR);
submits = await page.evaluate(() => window.__events.filter((e) => e.name === 'astryx-submit').length);
check('IME Enter (isComposing / keyCode 229) does not send', submits === 0);

// Enter sends the trimmed draft and clears.
await page.keyboard.press('Enter');
s = await state();
const submit = await page.evaluate(() => window.__events.filter((e) => e.name === 'astryx-submit').at(-1)?.detail);
check('Enter dispatches astryx-submit {value, tokens} from the composer', submit && /^Hello there\n+second line$/.test(submit.value) && Array.isArray(submit.tokens), JSON.stringify(submit));
check('the draft clears after sending; send disabled again', s.value === '' && !s.placeholderHidden && s.sendDisabled && s.composerValue === '', JSON.stringify(s));

// Whitespace never sends.
await page.keyboard.type('   ');
await page.keyboard.press('Enter');
submits = await page.evaluate(() => window.__events.filter((e) => e.name === 'astryx-submit').length);
check('a whitespace-only draft does not send', submits === 1);
await page.keyboard.press('Control+A');
await page.keyboard.press('Backspace');

// History: ArrowUp at the start recalls the last sent message (selected), ArrowDown restores the draft.
await page.keyboard.press('ArrowUp');
s = await state();
const selected = await page.evaluate(() => window.getSelection().toString());
check('ArrowUp recalls the previous message, fully selected', /^Hello there/.test(s.value) && selected.startsWith('Hello there'), JSON.stringify({v: s.value, selected}));
await page.keyboard.press('ArrowDown');
s = await state();
check('ArrowDown past the newest entry restores the (empty) draft', s.value === '', JSON.stringify(s.value));

// The send button submits the composer value.
await page.keyboard.type('Via the button');
await page.click(SEND);
const viaButton = await page.evaluate(() => window.__events.filter((e) => e.name === 'astryx-submit').at(-1)?.detail);
s = await state();
check('send button submits the draft and clears it', viaButton?.value === 'Via the button' && s.value === '', JSON.stringify({viaButton, s}));

// Stop state.
await page.evaluate(() => {
  const c = document.getElementById('chat-demo-composer');
  c.isStopShown = true;
  c.isDisabled = true;
});
s = await state();
check('stop state: secondary, "Stop", enabled even while disabled, stop icon', s.sendVariant === 'secondary' && s.sendLabel === 'Stop' && !s.sendDisabled && !s.stopIconHidden, JSON.stringify(s));
check('disabled: editor not editable, aria-disabled, still focusable', await page.$eval(EDITOR, (e) => e.getAttribute('contenteditable') === 'false' && e.getAttribute('aria-disabled') === 'true' && e.tabIndex === 0));
check('disabled composer keeps the stop button reachable (pointer-events)', await page.$eval(SEND, (b) => getComputedStyle(b.parentElement).pointerEvents === 'auto'));
await page.click(SEND);
const stops = await page.evaluate(() => window.__events.filter((e) => e.name === 'astryx-stop').length);
check('stop button dispatches astryx-stop', stops === 1);
await page.evaluate(() => {
  const c = document.getElementById('chat-demo-composer');
  c.isStopShown = false;
  c.isDisabled = false;
});
s = await state();
check('back to send state', s.sendVariant === 'primary' && s.sendLabel === 'Send' && s.sendDisabled && s.stopIconHidden, JSON.stringify(s));

// Click-to-focus on empty body space, caret after the draft.
await page.evaluate(() => { document.getElementById('chat-demo-input').value = 'abc'; document.activeElement?.blur(); });
const body = await page.$('#chat-demo-composer [data-ax-chat-body]');
const box = await body.boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height - 12);
const caret = await page.evaluate(() => {
  const sel = window.getSelection();
  const editor = document.activeElement;
  const after = document.createRange();
  after.setStart(sel.focusNode, sel.focusOffset);
  after.setEnd(editor, editor.childNodes.length);
  return {focused: editor?.matches('[data-ax-chat-editable]'), collapsed: sel.isCollapsed, rest: after.toString()};
});
check('a click on empty body space focuses the editor with the caret at the end', caret.focused && caret.collapsed && caret.rest === '', JSON.stringify(caret));
check('pointer focus does not draw the composer focus ring', await page.$eval('#chat-demo-composer [data-ax-chat-body]', (b) => !b.hasAttribute('data-ax-keyboard-focus')));
await page.keyboard.press('Shift+Tab');
await page.keyboard.press('Tab');
await page.waitForTimeout(50);
const ring = await page.$eval('#chat-demo-composer [data-ax-chat-body]', (b) => ({attr: b.hasAttribute('data-ax-keyboard-focus'), outline: getComputedStyle(b).outlineStyle}));
check('keyboard focus in the editor draws the focus ring', ring.attr && ring.outline !== 'none', JSON.stringify(ring));

// Status announcement (useAnnounceRenderedText): later status is announced, error assertively.
await page.evaluate(() => { document.getElementById('chat-demo-composer').status = {type: 'error', message: 'Could not reach the server'}; });
await page.waitForTimeout(120);
const announced = await page.evaluate(() => document.querySelector('[data-astryx-live-region="assertive"]')?.textContent ?? '');
const bar = await page.$eval('#chat-demo-composer > [data-ax-chat-status]', (el) => ({type: el.getAttribute('data-ax-type'), pos: el.getAttribute('data-ax-position'), text: el.textContent.trim(), last: el === el.parentElement.lastElementChild}));
check('status bar renders below the body with the message', bar.type === 'error' && bar.pos === 'bottom' && bar.last && bar.text.includes('Could not reach'), JSON.stringify(bar));
check('a status set later is announced assertively', announced.includes('Could not reach the server'), JSON.stringify(announced));
await page.evaluate(() => { document.getElementById('chat-demo-composer').status = null; });
check('clearing the status removes the bar', await page.$('#chat-demo-composer > [data-ax-chat-status]') === null);
const pageLoadStatus = await page.evaluate(() => document.querySelector('[data-astryx-live-region="assertive"]')?.textContent ?? '');
check('a status shown with the page is not announced', !pageLoadStatus.includes('Message failed to send'), pageLoadStatus);

// Standalone input submits itself.
await page.evaluate(() => {
  window.__standalone = null;
  document.getElementById('chat-demo-standalone').addEventListener('astryx-submit', (e) => { window.__standalone = e.detail; });
});
await page.click('#chat-demo-standalone [data-ax-chat-editable]');
await page.keyboard.type('standalone');
await page.keyboard.press('Enter');
const standalone = await page.evaluate(() => window.__standalone);
check('standalone input dispatches astryx-submit itself', standalone?.value === 'standalone', JSON.stringify(standalone));

await done();
