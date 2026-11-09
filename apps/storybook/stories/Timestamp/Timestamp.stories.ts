import Timestamp from 'astryx-astro/components/Timestamp/Timestamp.astro';
import Demo from 'astryx-astro/components/Timestamp/Timestamp.demo.astro';
import demoSource from 'astryx-astro/components/Timestamp/Timestamp.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import TimestampMatrix from './TimestampMatrix.astro';
import matrixSource from './TimestampMatrix.astro?raw';
import TimestampTemporal from './TimestampTemporal.astro';
import temporalSource from './TimestampTemporal.astro?raw';

const meta = {
  title: 'Content/Timestamp',
  component: Timestamp,
  ...astryx('Timestamp'),
  // A fixed instant: 12:00 UTC on 19 February 2026 (the same calendar day from UTC−11 to UTC+11).
  args: {value: '2026-02-19T12:00:00Z'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Timestamp.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const parts = (canvasElement: HTMLElement) => {
  const root = canvasElement.querySelector<HTMLElement>('ax-timestamp')!;
  const time = root.querySelector<HTMLTimeElement>('time')!;
  const card = canvasElement.querySelector<HTMLElement>(`#${root.getAttribute('data-ax-card')}`);
  return {root, time, card};
};

/**
 * `auto` (the default): within 7 days a relative phrase, past that the date and time. The
 * pre-render shows the full date and time in UTC (the server never reads the clock); this
 * value is older than 7 days, so the browser shows the date and time in the viewer's zone,
 * with no hover card and no tab stop.
 */
export const Default: Story = {
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-timestamp');
    const {root, time} = parts(canvasElement);
    await waitFor(() => expect(root).toHaveAttribute('data-format', 'date_time'));
    await expect(time).toHaveAttribute('datetime', '2026-02-19T12:00:00.000Z');
    await expect(time).not.toHaveAttribute('tabindex');
    await expect(root).not.toHaveAttribute('aria-haspopup');
  },
};

/**
 * `relative`: the distance from the viewer's clock ("9 months ago"). There is no reference-time
 * prop, so the pre-render is the full date and time in UTC and the phrase is computed on load;
 * the full absolute time is its accessible name, it takes a tab stop and focus opens a hover
 * card with a copy button.
 */
export const Relative: Story = {
  args: {format: 'relative'},
  play: async ({canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-timestamp');
    const {root, time, card} = parts(canvasElement);
    await step('The relative phrase, named by the full date and time', async () => {
      await waitFor(() => expect(time).toHaveTextContent(/ ago$/));
      await expect(root).toHaveAttribute('data-format', 'relative');
      await expect(time).toHaveAccessibleName(/^\w+ \d+, 2026 at /);
      await expect(time).toHaveAttribute('tabindex', '0');
      await expect(root).toHaveAttribute('aria-haspopup', 'dialog');
    });
    await step('Focus opens the details card; Escape closes it', async () => {
      time.focus();
      await waitFor(() => expect(isShowing(card)).toBe(true));
      await expect(card).toHaveAccessibleName('Timestamp details');
      const rows = [...card!.querySelectorAll('.ax-timestamp-card-value')].map((r) => r.textContent);
      await expect(rows).toHaveLength(1);
      await expect(card!.querySelector('.astryx-timestamp-copy-button')).toHaveAccessibleName(`Copy ${rows[0]}`);
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(card)).toBe(false));
    });
  },
};

/** `relative_short`: the compact phrase ("9mo ago"); pre-rendered in UTC, as `relative`. */
export const RelativeShort: Story = {
  args: {format: 'relative_short'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-timestamp');
    await waitFor(() => expect(parts(canvasElement).time).toHaveTextContent(/ ago$/));
  },
};

/** `hasTooltip={false}`: a relative timestamp without the card or the tab stop. */
export const WithoutTooltip: Story = {
  args: {format: 'relative', hasTooltip: false},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-timestamp');
    const {root, time} = parts(canvasElement);
    await waitFor(() => expect(time).toHaveTextContent(/ ago$/));
    await expect(time).not.toHaveAttribute('tabindex');
    await expect(root).not.toHaveAttribute('aria-haspopup');
  },
};

/**
 * `tooltipEntries` attach the card to an absolute format: rows per zone and format, with labels
 * and one copyable row.
 */
export const WithTooltipEntries: Story = {
  args: {
    format: 'date',
    tooltipEntries: [
      {label: 'Local'},
      {timezoneID: 'UTC', label: 'UTC'},
      {timezoneID: 'America/Bogota', label: 'Bogotá', format: 'date_time'},
      {timezoneID: 'UTC', format: 'system_date_time', label: 'ISO', isCopyable: true},
    ],
  },
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-timestamp');
    const {time, card} = parts(canvasElement);
    await expect(time).toHaveTextContent('Feb 19, 2026');
    await expect(time).toHaveAttribute('tabindex', '0');
    time.focus();
    await waitFor(() => expect(isShowing(card)).toBe(true));
    await expect([...card!.querySelectorAll('.ax-timestamp-card-label')].map((l) => l.textContent)).toEqual(['Local', 'UTC', 'Bogotá', 'ISO']);
    const values = [...card!.querySelectorAll('.ax-timestamp-card-value')].map((v) => v.textContent);
    await expect(values[2]).toBe('Feb 19, 2026, 7:00 AM GMT-5');
    await expect(values[3]).toBe('2026-02-19 12:00:00');
    await expect(card!.querySelectorAll('.astryx-timestamp-copy-button')).toHaveLength(1);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(card)).toBe(false));
  },
};

/** Every format, text type and color, and a Timestamp inheriting its surrounding Text. */
export const Matrix = composed(TimestampMatrix, {
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-timestamp');
    const text = (format: string) => canvasElement.querySelector(`[data-format-cell="${format}"] time`)?.textContent;
    await waitFor(() => expect(text('relative')).toMatch(/ ago$/));
    await expect(text('date')).toBe('Feb 19, 2026');
    await expect(text('date_long')).toBe('February 19, 2026');
    await expect(text('system_date')).toBe('2026-02-19');
    await expect(text('unix_seconds')).toBe('1771502400');
  },
}, {source: matrixSource});

/** `date_time` with `isTimezoneShown`: the viewer's zone abbreviation follows the time. */
export const TimezoneShown: Story = {args: {format: 'date_time', isTimezoneShown: true}};

/** Spanish: the long date in `es-ES`. */
export const Spanish: Story = {
  args: {format: 'date_long', locale: 'es-ES'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-timestamp');
    await expect(parts(canvasElement).time).toHaveTextContent('19 de febrero de 2026');
  },
};

/** A Unix timestamp in seconds as the value. */
export const UnixSecondsValue: Story = {
  args: {value: 1771502400, format: 'system_date'},
  play: async ({canvasElement}) => {
    const {time} = parts(canvasElement);
    await expect(time).toHaveAttribute('datetime', '2026-02-19T12:00:00.000Z');
    await expect(time).toHaveTextContent('2026-02-19');
  },
};

/** An unparseable value renders nothing. */
export const InvalidValue: Story = {
  args: {value: 'not a date'},
  play: async ({canvasElement}) => {
    await expect(canvasElement.querySelector('ax-timestamp')).toBeNull();
  },
};

/** `Temporal.Instant` and `Temporal.ZonedDateTime` values (a story wrapper builds them on the server). */
export const TemporalValues = composed(TimestampTemporal, {
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-timestamp');
    const times = [...canvasElement.querySelectorAll('ax-timestamp time')];
    await expect(times.map((t) => t.getAttribute('datetime'))).toEqual(['2026-02-19T12:00:00.000Z', '2026-02-19T12:00:00.000Z']);
    await expect(times[0]).toHaveTextContent('February 19, 2026');
  },
}, {controls: ['format'], source: temporalSource});
