import Timer from 'astryx-astro/components/Timer/Timer.astro';
import Demo from 'astryx-astro/components/Timer/Timer.demo.astro';
import demoSource from 'astryx-astro/components/Timer/Timer.demo.astro?raw';
import {expect, waitFor} from 'storybook/test';
import {upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import TimerInText from './TimerInText.astro';
import inTextSource from './TimerInText.astro?raw';
import TimerTemporal from './TimerTemporal.astro';
import temporalSource from './TimerTemporal.astro?raw';

const meta = {
  title: 'Content/Timer',
  component: Timer,
  ...astryx('Timer'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Timer.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

// 1 January 2026, 00:00 UTC, and 1 January 2100 (always in the future).
const START_2026 = 1767225600000;
const START_2100 = 4102444800000;

const time = (canvasElement: HTMLElement) => canvasElement.querySelector<HTMLTimeElement>('ax-timer time')!;
/** The seconds in an ISO 8601 duration `PT<n>S`. */
const seconds = (el: HTMLTimeElement) => Number(/^PT(\d+)S$/.exec(el.dateTime)?.[1] ?? NaN);

/**
 * Counts from the moment the element connects. Pre-rendered as "0s" (the server's first
 * paint); in the browser it ticks every second, writing the text and the `<time>`'s ISO
 * duration.
 */
export const Default: Story = {
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-timer');
    const el = time(canvasElement);
    await expect(el).toHaveTextContent(/^\d+s$/);
    await expect(el.dateTime).toMatch(/^PT\d+S$/);
    const first = seconds(el);
    await waitFor(() => expect(seconds(el)).toBeGreaterThan(first), {timeout: 3000});
    await expect(el).toHaveTextContent(`${seconds(el)}s`);
  },
};

/** `format="clock"`: a stopwatch reading (m:ss, then h:mm:ss). */
export const Clock: Story = {
  args: {format: 'clock'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-timer');
    const el = time(canvasElement);
    await expect(el).toHaveTextContent(/^\d+:\d{2}$/);
    const first = el.textContent;
    await waitFor(() => expect(el.textContent).not.toBe(first), {timeout: 3000});
  },
};

/**
 * A fixed `startTime` (Unix ms: midnight UTC, 1 January 2026). Pre-rendered as "0s"; in the
 * browser it shows the hours and minutes since then, updated every minute (past an hour,
 * `elapsed` drops the seconds), so the reading depends on the day you look at it.
 */
export const FixedStartTime: Story = {
  args: {startTime: START_2026},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-timer');
    const el = time(canvasElement);
    await waitFor(() => expect(el).toHaveTextContent(/^\d+h \d{2}m$/));
    await expect(seconds(el) % 60).toBe(0);
  },
};

/** A `startTime` in the future (1 January 2100): the timer holds at "0s" until it begins. */
export const FutureStartTime: Story = {
  args: {startTime: START_2100},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-timer');
    await expect(time(canvasElement)).toHaveTextContent('0s');
    await expect(time(canvasElement)).toHaveAttribute('datetime', 'PT0S');
  },
};

/** Body type, large, primary and semibold: a prominent reading. */
export const Prominent: Story = {args: {type: 'body', size: 'lg', color: 'primary', weight: 'semibold'}};

export const AccentClock: Story = {args: {color: 'accent', format: 'clock'}};

/** Arabic (Egypt): the digits are the locale's own ("٠s" before the first tick). */
export const ArabicDigits: Story = {
  args: {locale: 'ar-EG'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-timer');
    await expect(time(canvasElement)).toHaveTextContent(/^[٠-٩]+s$/);
  },
};

/** `type="inherit" color="inherit"` inside a line of Text (a story wrapper). */
export const InText = composed(TimerInText, {}, {controls: ['format'], source: inTextSource});

/**
 * A `Temporal.Instant` start time (a story wrapper builds it on the server), shown as a clock:
 * pre-rendered "0:00", then h:mm:ss since 1 January 2026 in the browser.
 */
export const TemporalStartTime = composed(TimerTemporal, {
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-timer');
    await waitFor(() => expect(time(canvasElement)).toHaveTextContent(/^\d+:\d{2}:\d{2}$/));
  },
}, {controls: ['format'], source: temporalSource});
