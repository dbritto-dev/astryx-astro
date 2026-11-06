/**
 * <ax-timestamp> — the client half of Timestamp (port of the clock store, the render's format
 * choice and the live-interval effect of @astryxdesign/core Timestamp/Timestamp.tsx, and the
 * row values of Timestamp/TimestampHoverCard.tsx). Light DOM: it is Timestamp's Text root and
 * owns one `<time>` child, plus the sibling hover card (`data-ax-card` = its id).
 *
 * On connect it reads the clock once (Astryx renders a clock-dependent format as UTC date_time
 * until then), picks the effective format (relative within `autoThreshold` for `auto`), and
 * writes the text in the viewer's zone with `data-locale` (+ `data-ax-calendar`). A relative
 * result gets the full absolute time (zone spelled out) as the `<time>`'s aria-label and a tab
 * stop, and attaches the hover card (`data-ax-hover-card` + `aria-haspopup` on the root, the
 * card enabled); otherwise those are removed again unless `tooltipEntries` keep the card.
 * The card's `<template>` is stamped into it once; its row values (and copy values / names)
 * are recomputed in the viewer's zone. With `data-ax-live` a relative phrase re-renders at
 * getLiveInterval() of its distance. Changing `data-value` / `data-ax-format` re-renders.
 */
import {
  DEFAULT_AUTO_THRESHOLD,
  effectiveTimestampFormat,
  formatInstant,
  formatRelativeTime,
  formatTooltipLines,
  getLiveInterval,
  isRelativeFormat,
  parseValue,
  type CalendarSystem,
  type TimestampFormat,
  type TimestampTooltipEntry,
  type TimestampTooltipLine,
} from '../lib/date';
import {fillMessage, resolveShownCalendar} from '../components/Calendar/calendarModel';

type AbsoluteFormat = Exclude<TimestampFormat, 'relative' | 'relative_short' | 'auto'>;

export class AxTimestamp extends HTMLElement {
  static observedAttributes = ['data-value', 'data-ax-format'];
  #timer: ReturnType<typeof setTimeout> | undefined;
  #connected = false;

  connectedCallback(): void {
    this.#connected = true;
    this.#stampCard();
    this.#tick();
  }

  disconnectedCallback(): void {
    this.#connected = false;
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  attributeChangedCallback(): void {
    if (this.#connected) this.#tick();
  }

  /** The hover card layer (`<ax-hover-card>`), if the Timestamp has one. */
  get card(): HTMLElement | null {
    const id = this.getAttribute('data-ax-card');
    return id ? this.ownerDocument.getElementById(id) : null;
  }

  #stampCard() {
    const template = this.card?.querySelector<HTMLTemplateElement>('template[data-ax-timestamp-card]');
    if (template) template.replaceWith(template.content.cloneNode(true));
  }

  #tick() {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
    const now = new Date();
    const date = parseValue(this.getAttribute('data-value') ?? '');
    if (Number.isNaN(date.getTime())) return;
    const locale = this.getAttribute('data-locale') ?? 'en';
    const calendar: CalendarSystem = resolveShownCalendar(this.getAttribute('data-ax-calendar') ?? 'gregory', 'Timestamp');
    const format = (this.getAttribute('data-ax-format') ?? 'auto') as TimestampFormat;
    const thresholdAttr = Number(this.getAttribute('data-ax-auto-threshold'));
    const autoThreshold = this.hasAttribute('data-ax-auto-threshold') && Number.isFinite(thresholdAttr) ? thresholdAttr : DEFAULT_AUTO_THRESHOLD;
    const effective = effectiveTimestampFormat(format, date, now, autoThreshold);
    const relative = isRelativeFormat(effective);
    const text = effective === 'relative'
      ? formatRelativeTime(date, now, locale, 'long')
      : effective === 'relative_short'
        ? formatRelativeTime(date, now, locale, 'narrow')
        : formatInstant(date, effective as AbsoluteFormat, locale, {isTimezoneShown: this.hasAttribute('data-ax-timezone-shown'), calendar});

    const time = this.querySelector('time');
    if (time) {
      if (time.textContent !== text) time.textContent = text;
      if (!this.hasAttribute('data-ax-own-label')) {
        if (relative) time.setAttribute('aria-label', formatInstant(date, 'full', locale, {timeZoneNameStyle: 'long', calendar}));
        else time.removeAttribute('aria-label');
      }
    }
    this.setAttribute('data-format', effective);

    // The hover card: attached for a relative result, or whenever tooltipEntries configure it.
    const card = this.card;
    if (card) {
      let entries: TimestampTooltipEntry[] | undefined;
      try {
        entries = this.hasAttribute('data-ax-entries') ? (JSON.parse(this.getAttribute('data-ax-entries')!) as TimestampTooltipEntry[]) : undefined;
      } catch {
        entries = undefined;
      }
      const attached = relative || entries !== undefined;
      if (attached) card.removeAttribute('data-ax-enabled');
      else card.setAttribute('data-ax-enabled', 'false');
      if (attached) {
        this.setAttribute('data-ax-hover-card', card.id);
        this.setAttribute('aria-haspopup', 'dialog');
      } else {
        this.removeAttribute('data-ax-hover-card');
        this.removeAttribute('aria-haspopup');
        if ((card as HTMLElement & {hide?: () => void}).hide && card.matches(':popover-open')) (card as HTMLElement & {hide: () => void}).hide();
      }
      if (time && !this.hasAttribute('data-ax-own-tabindex')) {
        if (attached) time.setAttribute('tabindex', '0');
        else time.removeAttribute('tabindex');
      }
      const lines: ReadonlyArray<TimestampTooltipLine> = entries
        ? formatTooltipLines(date, entries, locale, calendar)
        : [{value: formatInstant(date, 'full', locale, {calendar}), isCopyable: true}];
      this.#writeRows(card, lines);
    }

    if (this.hasAttribute('data-ax-live') && relative) {
      const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000);
      this.#timer = setTimeout(() => this.#tick(), getLiveInterval(diffSeconds));
    }
  }

  #writeRows(card: HTMLElement, lines: ReadonlyArray<TimestampTooltipLine>) {
    const template = this.getAttribute('data-ax-copy-template');
    card.querySelectorAll<HTMLElement>('.ax-timestamp-card-row').forEach((row, i) => {
      const line = lines[i];
      if (!line) return;
      const value = row.querySelector('.ax-timestamp-card-value');
      if (value && value.textContent !== line.value) value.textContent = line.value;
      const button = row.querySelector<HTMLElement>('[data-ax-copy]');
      if (!button) return;
      button.setAttribute('data-ax-copy-value', line.value);
      if (template) {
        const label = fillMessage(template, line.value);
        button.setAttribute('data-ax-copy-label', label);
        if (!button.hasAttribute('data-copied')) button.setAttribute('aria-label', label);
      }
    });
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ax-timestamp')) customElements.define('ax-timestamp', AxTimestamp);
