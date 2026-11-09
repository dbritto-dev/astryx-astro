import Calendar from 'astryx-astro/components/Calendar/Calendar.astro';
import Demo from 'astryx-astro/components/Calendar/Calendar.demo.astro';
import demoSource from 'astryx-astro/components/Calendar/Calendar.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import CalendarTemporalRange from './CalendarTemporalRange.astro';
import rangeSource from './CalendarTemporalRange.astro?raw';

const meta = {
  title: 'Form Controls/Calendar',
  component: Calendar,
  ...astryx('Calendar'),
  // Fixed dates only: a story is pre-rendered once, so "today" would be the build day.
  args: {value: '2026-11-08'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Calendar.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const day = (root: Element, iso: string) => root.querySelector<HTMLElement>(`[data-date="${iso}"]`)!;

/** Click picks a day; arrow keys move the roving focus and Enter picks. Events carry ISO strings. */
export const Single: Story = {
  play: async ({canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-calendar');
    const changes = recordEvents<{value: string}>(canvasElement, 'astryx-change');
    await step('Click', async () => {
      await userEvent.click(day(canvasElement, '2026-11-12'));
      await expect(changes.at(-1)?.detail.value).toBe('2026-11-12');
      await expect(day(canvasElement, '2026-11-12').closest('[role="gridcell"]')).toHaveAttribute('aria-selected', 'true');
    });
    await step('Keyboard', async () => {
      await userEvent.keyboard('{ArrowRight}{ArrowDown}');
      await waitFor(() => expect(document.activeElement?.closest('[data-date]')?.getAttribute('data-date') ?? document.activeElement?.getAttribute('data-date')).toBe('2026-11-20'));
      await userEvent.keyboard('{Enter}');
      await expect(changes.at(-1)?.detail.value).toBe('2026-11-20');
    });
  },
};

export const Range: Story = {args: {mode: 'range', value: {start: '2026-11-03', end: '2026-11-10'}}};

export const TwoMonths: Story = {args: {numberOfMonths: 2}};

/** ISO week numbers, weeks starting on Monday. */
export const WeekNumbers: Story = {args: {hasWeekNumbers: true, weekStartsOn: 1}};

export const VariableRowCount: Story = {args: {hasVariableRowCount: true, hasOutsideDays: false}};

/** Days outside min/max are disabled. */
export const MinMax: Story = {
  args: {min: '2026-11-05', max: '2026-11-20'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-calendar');
    await expect(day(canvasElement, '2026-11-04').closest('[data-disabled]')).not.toBeNull();
    await expect(day(canvasElement, '2026-11-05').closest('[data-disabled]')).toBeNull();
  },
};

/** Persian (Solar Hijri) in Farsi: the grid shows Farvardin 1405; values stay Gregorian ISO. */
export const Persian: Story = {
  args: {calendar: 'persian', locale: 'fa-IR', value: '2026-03-21'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-calendar');
    await expect(canvas.getByRole('grid')).toHaveAccessibleName(/فروردین/);
    await expect(day(canvasElement, '2026-03-21').closest('[role="gridcell"]')).toHaveAttribute('aria-selected', 'true');
  },
};

/** Hebrew in a right-to-left page. */
export const Hebrew: Story = {args: {calendar: 'hebrew', locale: 'he-IL', value: '2026-09-12', dir: 'rtl'}};

export const IslamicUmmAlQura: Story = {args: {calendar: 'islamic-umalqura', locale: 'ar-SA', value: '2026-02-18', dir: 'rtl'}};

/** Japanese imperial eras: 1 May 2019 is Reiwa 1. */
export const Japanese: Story = {args: {calendar: 'japanese', locale: 'ja-JP', value: '2019-05-01'}};

/** Temporal.PlainDate range, min and max (a story wrapper builds them on the server). */
export const TemporalRange = composed(CalendarTemporalRange, {
  play: async ({canvasElement}) => {
    const calendar = await upgraded<HTMLElement & {value: unknown}>(canvasElement, 'ax-calendar');
    await expect(calendar.value).toEqual({start: '2026-11-09', end: '2026-11-15'});
  },
}, {controls: ['numberOfMonths'], source: rangeSource});
