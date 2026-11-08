// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Port of @astryxdesign/core 0.7.9 src/Chat/useSpeechRecognition.ts,
// useChatDictation.ts and ChatDictationButton.tsx (state + rendering).

/**
 * Voice input for the chat composer.
 *
 *   createSpeechRecognition(options) — useSpeechRecognition: a headless wrapper of the Web
 *     Speech API (feature-detected `SpeechRecognition` / `webkitSpeechRecognition`) with
 *     start / stop / abort / toggle, interim transcript and an optional microphone analyser.
 *   createChatDictation(options) — useChatDictation: adds the analyser (noise-floor
 *     calibration, volume, 5 voice bands), start / stop sounds (never on iOS), "CAPS LOCK"
 *     (a sustained average volume ≥ 0.15 over ≥ 10 frames uppercases the transcript) and the
 *     interim ghost text + final insertion into a ChatComposerInput.
 *   `<ax-chat-dictation-button>` — ChatDictationButton on a dictation it owns (see
 *     components/Chat/ChatDictationButton.astro for attributes and events).
 */
import {defineElement} from './runtime/layer';
import {globalSingleton} from './runtime/global';
import {isIOSDevice} from './runtime/platform';
import type {ChatComposerInputElement} from './chat-composer-input';

const Base: typeof HTMLElement = typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement;

type RecognitionResultList = {
  length: number;
  [index: number]: {isFinal: boolean; length: number; [index: number]: {transcript: string}};
};
interface RecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: {resultIndex: number; results: RecognitionResultList}) => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onerror: ((event: {error: string; message?: string}) => void) | null;
  onnomatch: (() => void) | null;
}
type RecognitionCtor = new () => RecognitionInstance;

function getSpeechRecognition(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor};
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ── Volume analyser (shared by both hooks in Astryx) ────────────────────────

interface VolumeAnalyser {
  getVolume(): number;
  getBands(count: number): number[];
  getRawBands(count: number): number[];
  cleanup(): void;
}

/** One AudioContext per page, shared by every copy of this module. */
const audio = globalSingleton('chat-dictation-audio', () => ({context: null as AudioContext | null}));
function defaultAudioContext(): AudioContext {
  if (!audio.context || audio.context.state === 'closed') audio.context = new AudioContext();
  if (audio.context.state === 'suspended') void audio.context.resume();
  return audio.context;
}

async function createVolumeAnalyser(getCtx: () => AudioContext): Promise<VolumeAnalyser | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({audio: true});
    const ctx = getCtx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.5;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const noiseFloor = new Float32Array(analyser.frequencyBinCount);
    let samples = 0;
    const CALIBRATION_FRAMES = 60;
    const calibrate = () => {
      analyser.getByteFrequencyData(data);
      samples++;
      for (let i = 0; i < data.length; i++) {
        const v = data[i] / 255;
        if (v > noiseFloor[i]) noiseFloor[i] = v;
      }
    };
    const clean = (i: number) => (samples < CALIBRATION_FRAMES ? 0 : Math.max(0, data[i] / 255 - noiseFloor[i] * 1.1));
    const bands = (count: number, value: (i: number) => number) => {
      const out: number[] = [];
      const voiceSplits = [3, 6, 11, 18, data.length];
      const splits = count <= voiceSplits.length ? voiceSplits.slice(0, count) : voiceSplits;
      let start = 1;
      for (const end of splits) {
        let sum = 0;
        for (let i = start; i < end; i++) sum += value(i);
        out.push(sum / (end - start));
        start = end;
      }
      return out;
    };
    return {
      getVolume() {
        analyser.getByteFrequencyData(data);
        if (samples < CALIBRATION_FRAMES) calibrate();
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += clean(i);
        return sum / data.length;
      },
      getBands(count) {
        analyser.getByteFrequencyData(data);
        if (samples < CALIBRATION_FRAMES) calibrate();
        return bands(count, clean);
      },
      getRawBands(count) {
        analyser.getByteFrequencyData(data);
        return bands(count, (i) => data[i] / 255);
      },
      cleanup() {
        source.disconnect();
        for (const track of stream.getTracks()) track.stop();
      },
    };
  } catch {
    return null;
  }
}

// ── Speech recognition ───────────────────────────────────────────────────────

export interface SpeechRecognitionState {
  isSupported: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  volume: number;
  bands: number[];
  rawBands: number[];
  interimTranscript: string;
}

export interface SpeechRecognitionOptions {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  audioContext?: AudioContext;
  /** Measure the microphone (volume, bands). @default true */
  hasVolume?: boolean;
  transformTranscript?: (text: string) => string;
  onTranscript?: (transcript: string, isFinal: boolean) => void;
  onResult?: (transcript: string) => void;
  onError?: (error: {error: string; message?: string}) => void;
  onStart?: () => void;
  onEnd?: () => void;
  /** Spoken message for `nomatch` (server-translated). */
  noSpeechMessage?: string;
  onChange?: (state: SpeechRecognitionState) => void;
}

export interface SpeechRecognitionController {
  readonly state: SpeechRecognitionState;
  start(): void;
  stop(): void;
  abort(): void;
  toggle(): void;
  destroy(): void;
}

const ZERO_BANDS = () => [0, 0, 0, 0, 0];

export function createSpeechRecognition(options: SpeechRecognitionOptions = {}): SpeechRecognitionController {
  const {continuous = true, interimResults = true, hasVolume = true} = options;
  const getCtx = () => options.audioContext ?? defaultAudioContext();
  const state: SpeechRecognitionState = {
    isSupported: getSpeechRecognition() != null,
    isListening: false,
    isSpeaking: false,
    volume: 0,
    bands: ZERO_BANDS(),
    rawBands: ZERO_BANDS(),
    interimTranscript: '',
  };
  let recognition: RecognitionInstance | null = null;
  let analyser: VolumeAnalyser | null = null;
  let raf = 0;
  const changed = () => options.onChange?.(state);

  const startPolling = () => {
    const poll = () => {
      if (analyser) {
        state.volume = analyser.getVolume();
        state.bands = analyser.getBands(5);
        state.rawBands = analyser.getRawBands(5);
        changed();
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
  };
  const stopPolling = () => {
    cancelAnimationFrame(raf);
    state.volume = 0;
    state.bands = ZERO_BANDS();
    state.rawBands = ZERO_BANDS();
    analyser?.cleanup();
    analyser = null;
  };

  const start = () => {
    const SR = getSpeechRecognition();
    if (!SR) return;
    recognition?.abort();
    const r = new SR();
    r.lang = options.lang ?? (typeof document !== 'undefined' ? document.documentElement.lang : '') ?? '';
    r.continuous = continuous;
    r.interimResults = interimResults;
    r.onstart = () => {
      state.isListening = true;
      changed();
      options.onStart?.();
      if (hasVolume) {
        void createVolumeAnalyser(getCtx).then((a) => {
          if (!a) return;
          analyser = a;
          startPolling();
        });
      }
    };
    r.onend = () => {
      state.isListening = false;
      state.isSpeaking = false;
      state.interimTranscript = '';
      stopPolling();
      changed();
      options.onEnd?.();
    };
    r.onspeechstart = () => { state.isSpeaking = true; changed(); };
    r.onspeechend = () => { state.isSpeaking = false; changed(); };
    r.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        let transcript = result[0].transcript;
        if (options.transformTranscript) transcript = options.transformTranscript(transcript);
        if (result.isFinal) {
          options.onResult?.(transcript);
          options.onTranscript?.(transcript, true);
          state.interimTranscript = '';
        } else {
          interim += transcript;
        }
      }
      if (interim) {
        state.interimTranscript = interim;
        options.onTranscript?.(interim, false);
      }
      changed();
    };
    r.onerror = (event) => options.onError?.({error: event.error, message: event.message});
    r.onnomatch = () => options.onError?.({error: 'no-speech', message: options.noSpeechMessage});
    recognition = r;
    r.start();
  };

  return {
    state,
    start,
    stop: () => recognition?.stop(),
    abort: () => {
      recognition?.abort();
      stopPolling();
      changed();
    },
    toggle: () => (state.isListening ? recognition?.stop() : start()),
    destroy: () => {
      recognition?.abort();
      recognition = null;
      stopPolling();
    },
  };
}

// ── Dictation ────────────────────────────────────────────────────────────────

function playPlop(freq: number, delay: number, getCtx: () => AudioContext, volume = 0.25) {
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;
    const dur = freq < 200 ? 0.18 : 0.06;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 1.3, now + delay);
    osc.frequency.exponentialRampToValueAtTime(freq, now + delay + 0.01);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.93, now + delay + dur);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.setValueAtTime(volume, now + delay);
    gain.gain.exponentialRampToValueAtTime(volume * 0.2, now + delay + dur * 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + delay);
    osc.stop(now + delay + dur);
  } catch {
    // Audio feedback is best-effort.
  }
}

export interface ChatDictationOptions extends Omit<SpeechRecognitionOptions, 'hasVolume' | 'onChange'> {
  /** @default false */
  hasSounds?: boolean;
  /** The input that shows interim text and receives final results. */
  input?: () => ChatComposerInputElement | null;
  onChange?: (state: SpeechRecognitionState) => void;
}

export interface ChatDictationController extends SpeechRecognitionController {}

export function createChatDictation(options: ChatDictationOptions = {}): ChatDictationController {
  const getCtx = () => options.audioContext ?? defaultAudioContext();
  let volumeHistory: number[] = [];
  let analyser: VolumeAnalyser | null = null;
  let raf = 0;
  let interimSpan: HTMLSpanElement | null = null;
  let speech: SpeechRecognitionController;

  const changed = () => options.onChange?.(speech.state);
  const editableOf = () => options.input?.()?.editable ?? null;

  const startPolling = () => {
    const poll = () => {
      if (analyser) {
        const vol = analyser.getVolume();
        speech.state.volume = vol;
        volumeHistory.push(vol);
        if (volumeHistory.length > 30) volumeHistory.shift();
        speech.state.bands = analyser.getBands(5);
        speech.state.rawBands = analyser.getRawBands(5);
        changed();
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
  };
  const stopPolling = () => {
    cancelAnimationFrame(raf);
    speech.state.volume = 0;
    speech.state.bands = ZERO_BANDS();
    speech.state.rawBands = ZERO_BANDS();
    volumeHistory = [];
    analyser?.cleanup();
    analyser = null;
  };

  const insertInterim = () => {
    const editable = editableOf();
    if (!editable) return;
    const span = document.createElement('span');
    span.setAttribute('data-astryx-dictation-interim', '');
    span.className = 'ax-chat-dictation-interim';
    span.contentEditable = 'false';
    editable.appendChild(span);
    interimSpan = span;
    editable.dispatchEvent(new Event('input', {bubbles: true}));
  };
  const removeInterim = () => {
    if (interimSpan?.isConnected) interimSpan.remove();
    interimSpan = null;
  };

  const transform = (text: string) => {
    let t = options.transformTranscript ? options.transformTranscript(text) : text;
    const avg = volumeHistory.length > 0 ? volumeHistory.reduce((a, b) => a + b, 0) / volumeHistory.length : 0;
    if (avg >= 0.15 && volumeHistory.length >= 10) t = t.toUpperCase();
    return t;
  };

  const hasInput = () => options.input?.() != null;

  speech = createSpeechRecognition({
    ...options,
    hasVolume: false,
    transformTranscript: transform,
    onTranscript: (transcript, isFinal) => {
      const input = options.input?.() ?? null;
      if (input) {
        if (isFinal) {
          removeInterim();
          input.focus();
          input.insertText(`${transcript} `);
          options.onResult?.(transcript);
          insertInterim();
        } else if (interimSpan) {
          interimSpan.textContent = transcript;
        } else {
          insertInterim();
          if (interimSpan) (interimSpan as HTMLSpanElement).textContent = transcript;
        }
      }
      options.onTranscript?.(transcript, isFinal);
    },
    onResult: (transcript) => { if (!hasInput()) options.onResult?.(transcript); },
    onStart: () => {
      if (options.hasSounds && !isIOSDevice()) {
        playPlop(392, 0, getCtx);
        playPlop(523, 0.07, getCtx);
      }
      void createVolumeAnalyser(getCtx).then((a) => {
        if (!a) return;
        analyser = a;
        startPolling();
      });
      if (hasInput()) insertInterim();
      options.onStart?.();
    },
    onEnd: () => {
      stopPolling();
      if (options.hasSounds && !isIOSDevice()) {
        playPlop(523, 0, getCtx);
        playPlop(392, 0.07, getCtx);
      }
      if (hasInput()) {
        removeInterim();
        editableOf()?.dispatchEvent(new Event('input', {bubbles: true}));
      }
      options.onEnd?.();
    },
    onChange: () => changed(),
  });

  return {
    get state() { return speech.state; },
    start: () => speech.start(),
    stop: () => speech.stop(),
    abort: () => {
      speech.abort();
      stopPolling();
      changed();
    },
    toggle: () => speech.toggle(),
    destroy: () => {
      speech.destroy();
      stopPolling();
      removeInterim();
    },
  };
}

// ── <ax-chat-dictation-button> ───────────────────────────────────────────────

const BAR_MIN_SCALE = 0.08;

export class ChatDictationButtonElement extends Base {
  #dictation: ChatDictationController | null = null;
  #onClick = () => this.#dictation?.toggle();
  /** Applied to every transcript before CAPS LOCK (Astryx transformTranscript). */
  transformTranscript: ((text: string) => string) | null = null;

  connectedCallback(): void {
    const emit = (name: string, detail: unknown = {}) => this.dispatchEvent(new CustomEvent(name, {detail, bubbles: true, composed: true}));
    this.#dictation = createChatDictation({
      lang: this.getAttribute('data-ax-lang') || undefined,
      continuous: this.getAttribute('data-ax-continuous') !== 'false',
      interimResults: this.getAttribute('data-ax-interim') !== 'false',
      hasSounds: this.hasAttribute('data-ax-sounds'),
      noSpeechMessage: this.getAttribute('data-ax-no-speech') ?? undefined,
      input: () => this.#input(),
      transformTranscript: (text) => (this.transformTranscript ? this.transformTranscript(text) : text),
      onTranscript: (transcript, isFinal) => emit('astryx-transcript', {transcript, isFinal}),
      onResult: (transcript) => emit('astryx-dictation-result', {transcript}),
      onError: (error) => emit('astryx-dictation-error', error),
      onStart: () => emit('astryx-dictation-start'),
      onEnd: () => emit('astryx-dictation-end'),
      onChange: () => this.#render(),
    });
    const supported = this.#dictation.state.isSupported;
    const button = this.#button;
    if (supported) {
      this.hidden = false;
      if (button) {
        (button as HTMLButtonElement).disabled = false;
        button.removeAttribute('data-ax-disabled');
      }
    } else {
      // Unsupported: hidden (isHiddenWhenUnsupported) or a disabled button.
      this.hidden = this.hasAttribute('data-ax-hidden-when-unsupported');
    }
    button?.addEventListener('click', this.#onClick);
    this.#render();
  }

  disconnectedCallback(): void {
    this.#button?.removeEventListener('click', this.#onClick);
    this.#dictation?.destroy();
    this.#dictation = null;
  }

  /** The controller (useChatDictation's return). */
  get dictation(): ChatDictationController | null { return this.#dictation; }

  get #button(): HTMLElement | null {
    return this.querySelector<HTMLElement>('[data-ax-chat-dictation-toggle]');
  }

  #input(): ChatComposerInputElement | null {
    const selector = this.getAttribute('data-ax-input');
    let el: Element | null = null;
    if (selector) {
      try { el = this.ownerDocument.querySelector(selector); } catch { el = null; }
    } else {
      el = this.closest('ax-chat-composer')?.querySelector('ax-chat-composer-input') ?? null;
    }
    return el && typeof (el as ChatComposerInputElement).insertText === 'function' ? (el as ChatComposerInputElement) : null;
  }

  #render() {
    const state = this.#dictation?.state;
    const button = this.#button;
    if (!state || !button) return;
    const listening = state.isListening;
    const label = this.getAttribute('data-ax-label') ?? this.getAttribute(listening ? 'data-ax-stop-label' : 'data-ax-start-label') ?? '';
    button.setAttribute('aria-label', label);
    const icon = button.querySelector<HTMLElement>('[data-ax-chat-icon="microphone"]');
    if (icon) icon.hidden = listening;
    const bars = this.querySelector<HTMLElement>(':scope > .ax-chat-dictation-bars');
    if (!bars) return;
    bars.hidden = !listening;
    if (!listening) return;
    // Quiet speech (0–10%) maps to the full visual range; clipping blends toward error.
    const boosted = state.bands.map((b) => Math.min(Math.pow(b / 0.2, 0.5), 1));
    const isClipping = state.volume >= 0.2;
    const strength = Math.min((state.volume - 0.2) / 0.1, 1) * 100;
    const color = isClipping ? `color-mix(in srgb, var(--color-accent), var(--color-error) ${strength}%)` : 'var(--color-accent)';
    const els = bars.querySelectorAll<HTMLElement>('.ax-chat-dictation-bar');
    els.forEach((bar, i) => {
      const level = boosted[i] ?? 0;
      bar.style.backgroundColor = color;
      bar.style.transform = `scaleY(${BAR_MIN_SCALE + level * (1 - BAR_MIN_SCALE)})`;
    });
  }
}

defineElement('ax-chat-dictation-button', ChatDictationButtonElement);

declare global {
  interface HTMLElementTagNameMap {
    'ax-chat-dictation-button': ChatDictationButtonElement;
  }
}
