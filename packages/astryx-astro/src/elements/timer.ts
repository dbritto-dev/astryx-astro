/**
 * <ax-timer> — the ticking half of Timer (port of the effect in @astryxdesign/core
 * Timer/Timer.tsx). Light DOM: it is Timer's Text root and owns one <time> child, whose
 * text and `dateTime` it rewrites directly (no re-render per tick), only when they change.
 *
 * Attributes (rendered by Timer.astro):
 *   data-start-time  Unix ms the operation began; absent/invalid → the element's first connection
 *   data-format      'elapsed' | 'clock'
 *   data-locale      the server-resolved locale for the digits (Intl.NumberFormat)
 * The next tick is scheduled for the moment the text changes (every second; every minute
 * for `elapsed` past an hour; a future start waits until it begins). Ticking stops while
 * disconnected and restarts on reconnect or when an attribute changes.
 */
import {
  digitsFor,
  getElapsedMilliseconds,
  getMillisecondsUntilNextChange,
  getPresentation,
  resolveFormat,
} from '../components/Timer/timerFormat';

class AxTimer extends HTMLElement {
  static observedAttributes = ['data-start-time', 'data-format', 'data-locale'];

  #mountTime: number | null = null;
  #timeout: ReturnType<typeof setTimeout> | undefined;
  #text: string | undefined;
  #dateTime: string | undefined;

  connectedCallback() {
    this.#mountTime ??= Date.now();
    this.#start();
  }

  disconnectedCallback() {
    this.#stop();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.#start();
  }

  /** The Unix ms the timer counts from. */
  get startTime(): number {
    const raw = this.getAttribute('data-start-time');
    const parsed = raw == null || raw === '' ? NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : (this.#mountTime ?? Date.now());
  }

  #stop() {
    if (this.#timeout !== undefined) clearTimeout(this.#timeout);
    this.#timeout = undefined;
  }

  #start() {
    this.#stop();
    this.#text = undefined;
    this.#dateTime = undefined;
    const startTime = this.startTime;
    const format = resolveFormat(this.getAttribute('data-format'));
    const digits = digitsFor(this.getAttribute('data-locale'));
    const tick = () => {
      const now = Date.now();
      const elapsed = getElapsedMilliseconds(now, startTime);
      const {text, dateTime} = getPresentation(elapsed, format, digits);
      const node = this.querySelector('time');
      if (node) {
        if (text !== this.#text) { node.textContent = text; this.#text = text; }
        if (dateTime !== this.#dateTime) { node.dateTime = dateTime; this.#dateTime = dateTime; }
      }
      this.#timeout = setTimeout(tick, getMillisecondsUntilNextChange(now, startTime, elapsed, format));
    };
    tick();
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-timer')) customElements.define('ax-timer', AxTimer);

export {AxTimer};
