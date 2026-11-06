/**
 * ChatDictationButton (components/chat-dictation-button): feature detection (hidden, or visible
 * but disabled, without SpeechRecognition), and with a fake SpeechRecognition: toggle, the
 * start/stop names, equalizer bars, interim ghost text and final insertion into the composer
 * input, events.
 */
import {setup} from './_harness.mjs';

const {page, context, check, open, done} = await setup();

// ── Unsupported ──────────────────────────────────────────────────────────────
const noSpeech = await context.newPage();
await noSpeech.addInitScript(() => {
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
});
await open('chat-dictation-button');
const base = page.url();
await noSpeech.goto(base);
await noSpeech.waitForLoadState('load');
await noSpeech.waitForTimeout(100);
const unsupported = await noSpeech.evaluate(() => ({
  hidden: document.getElementById('dictation-demo-button').hidden,
  hiddenRendered: getComputedStyle(document.getElementById('dictation-demo-button')).display,
  visible: !document.getElementById('dictation-demo-md').hidden,
  disabled: document.querySelector('#dictation-demo-md button').disabled,
  label: document.querySelector('#dictation-demo-md button').getAttribute('aria-label'),
}));
check('unsupported: hidden by default (isHiddenWhenUnsupported)', unsupported.hidden && unsupported.hiddenRendered === 'none', JSON.stringify(unsupported));
check('unsupported with isHiddenWhenUnsupported={false}: visible but disabled', unsupported.visible && unsupported.disabled && unsupported.label === 'Start dictation', JSON.stringify(unsupported));
await noSpeech.close();

// ── Fake SpeechRecognition ───────────────────────────────────────────────────
await context.addInitScript(() => {
  class FakeRecognition {
    constructor() { window.__recognition = this; this.lang = ''; }
    start() { window.__started = (window.__started ?? 0) + 1; setTimeout(() => this.onstart?.(), 0); }
    stop() { setTimeout(() => this.onend?.(), 0); }
    abort() { setTimeout(() => this.onend?.(), 0); }
    emit(text, isFinal) {
      const result = Object.assign([{transcript: text}], {isFinal});
      this.onresult?.({resultIndex: 0, results: Object.assign([result], {length: 1})});
    }
  }
  window.SpeechRecognition = FakeRecognition;
  // No microphone in the test: the analyser fails quietly (Astryx returns null).
  if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error('no mic'));
});
await open('chat-dictation-button');
const button = '#dictation-demo-button button';
const st = () => page.evaluate(() => {
  const host = document.getElementById('dictation-demo-button');
  const btn = host.querySelector('button');
  const input = document.querySelector('#dictation-demo-composer ax-chat-composer-input');
  return {
    hidden: host.hidden,
    disabled: btn.disabled,
    label: btn.getAttribute('aria-label'),
    iconHidden: btn.querySelector('[data-ax-chat-icon="microphone"]').hidden,
    barsHidden: host.querySelector('.ax-chat-dictation-bars').hidden,
    value: input.value,
    interim: input.querySelector('[data-astryx-dictation-interim]')?.textContent ?? null,
    lang: window.__recognition?.lang,
    listening: host.dictation?.state.isListening,
    send: document.querySelector('#dictation-demo-composer [data-ax-chat-send]').disabled,
  };
});
await page.evaluate(() => {
  window.__events = [];
  for (const n of ['astryx-dictation-start', 'astryx-dictation-end', 'astryx-transcript', 'astryx-dictation-result']) document.addEventListener(n, (e) => window.__events.push([n, e.detail]));
});
let s = await st();
check('supported: shown and enabled, "Start dictation", microphone icon', !s.hidden && !s.disabled && s.label === 'Start dictation' && !s.iconHidden && s.barsHidden, JSON.stringify(s));

await page.click(button);
await page.waitForTimeout(50);
s = await st();
check('listening: "Stop dictation", bars replace the icon', s.listening && s.label === 'Stop dictation' && s.iconHidden && !s.barsHidden, JSON.stringify(s));
check('recognition language defaults to the request locale', s.lang === 'en', JSON.stringify(s.lang));
check('an empty interim span marks the input (ghost text container)', s.interim === '', JSON.stringify(s));

await page.evaluate(() => window.__recognition.emit('hello wor', false));
s = await st();
check('interim results show as ghost text, not in the value', s.interim === 'hello wor' && s.value === '', JSON.stringify(s));
await page.evaluate(() => window.__recognition.emit('hello world', true));
s = await st();
check('a final result is inserted at the caret through insertText', s.value === 'hello world ' && s.interim === '', JSON.stringify(s));
check('…and follows the change pipeline (send enabled)', s.send === false, JSON.stringify(s));

await page.click(button);
await page.waitForTimeout(50);
s = await st();
check('stopping: back to "Start dictation", no ghost span', !s.listening && s.label === 'Start dictation' && !s.iconHidden && s.barsHidden && s.interim === null, JSON.stringify(s));
const events = await page.evaluate(() => window.__events.map(([n, d]) => `${n}:${d?.transcript ?? ''}:${d?.isFinal ?? ''}`));
// useChatDictation with an input reports the result before the final transcript callback.
check('events: start, interim transcript, result, final transcript, end', JSON.stringify(events) === JSON.stringify(['astryx-dictation-start::', 'astryx-transcript:hello wor:false', 'astryx-dictation-result:hello world:', 'astryx-transcript:hello world:true', 'astryx-dictation-end::']), JSON.stringify(events));

// The labelled button dictates into the input its selector names, in its language.
await page.click('#dictation-demo-label button');
await page.waitForTimeout(50);
const labelled = await page.evaluate(() => ({lang: window.__recognition.lang, label: document.querySelector('#dictation-demo-label button').getAttribute('aria-label')}));
check('label override stays while listening; lang from dictation options', labelled.label === 'Voice note' && labelled.lang === 'es-CO', JSON.stringify(labelled));
await page.evaluate(() => window.__recognition.emit('hola', true));
check('dictation.input selector targets that input', await page.evaluate(() => document.getElementById('dictation-demo-target').value === 'hola '));

await done();
