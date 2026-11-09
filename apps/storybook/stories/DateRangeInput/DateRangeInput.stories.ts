import DateRangeInput from 'astryx-astro/components/DateRangeInput/DateRangeInput.astro';
import Demo from 'astryx-astro/components/DateRangeInput/DateRangeInput.demo.astro';
import demoSource from 'astryx-astro/components/DateRangeInput/DateRangeInput.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import DateRangeInputForm from './DateRangeInputForm.astro';
import formSource from './DateRangeInputForm.astro?raw';
import DateRangeInputMatrix from './DateRangeInputMatrix.astro';
import matrixSource from './DateRangeInputMatrix.astro?raw';
import DateRangeInputTemporal from './DateRangeInputTemporal.astro';
import temporalSource from './DateRangeInputTemporal.astro?raw';
import DateRangeInputWeekdays from './DateRangeInputWeekdays.astro';
import weekdaysSource from './DateRangeInputWeekdays.astro?raw';

const meta = {
  title: 'Form Controls/Date Range Input',
  component: DateRangeInput,
  ...astryx('DateRangeInput'),
  // Fixed dates only: a story is pre-rendered once, so "today" would be the build day.
  args: {label: 'Reporting period', value: {start: '2026-03-09', end: '2026-03-15'}},
} satisfies Meta;
export default meta;

/** Every example from the docs page (DateRangeInput.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

type Range = {start: string; end: string} | null;
type RangeHost = HTMLElement & {value: Range};

// The trigger drops the year for ranges in the current year ("Mar 9 – Mar 15"), so text
// assertions accept both forms and never depend on the day the story runs.
const rangeText = (start: string, end: string) => new RegExp(`^${start}(, 2026)? – ${end}(, 2026)?$`);
const parts = (canvasElement: HTMLElement) => {
  const host = canvasElement.querySelector<RangeHost>('ax-date-range-input')!;
  const trigger = host.querySelector<HTMLButtonElement>('[data-ax-range-trigger]')!;
  const layer = canvasElement.querySelector<HTMLElement>(`#${host.getAttribute('data-ax-popover')}`)!;
  const day = (iso: string) => layer.querySelector<HTMLButtonElement>(`button[data-date="${iso}"]:not([data-ax-outside])`)!;
  return {host, trigger, layer, day};
};

/**
 * The trigger opens the two-month calendar with focus inside. The first click starts a range,
 * Escape cancels the pick before closing, and the second click commits `{start, end}` (in
 * order) and closes. The clear button empties the range.
 */
export const Default: Story = {
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-date-range-input');
    const {host, trigger, layer, day} = parts(canvasElement);
    const changes = recordEvents<{value: Range}>(canvasElement, 'astryx-change');
    await expect(trigger).toHaveTextContent(rangeText('Mar 9', 'Mar 15'));
    await expect(trigger).toHaveAccessibleName(/^Reporting period: Mar 9/);
    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');

    await step('The trigger opens the calendar on the value’s month, focus inside', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await waitFor(() => expect(layer.contains(document.activeElement)).toBe(true));
      await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'));
      await waitFor(() => expect(trigger).toHaveAttribute('aria-controls', layer.id));
      await expect(day('2026-03-09').closest('[role="gridcell"]')).toHaveAttribute('aria-selected', 'true');
    });

    await step('Escape during a pick cancels the pick; a second Escape closes', async () => {
      await userEvent.click(day('2026-03-03'));
      await expect(isShowing(layer)).toBe(true);
      await userEvent.keyboard('{Escape}');
      await new Promise((resolve) => setTimeout(resolve, 300));
      await expect(isShowing(layer)).toBe(true);
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await expect(trigger).toHaveFocus();
      await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
      await expect(changes).toHaveLength(0);
    });

    await step('Two clicks (later day first) commit the range in order and close', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await userEvent.click(day('2026-03-20'));
      await expect(isShowing(layer)).toBe(true);
      await userEvent.click(day('2026-03-12'));
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await expect(changes.map((e) => e.detail.value)).toEqual([{start: '2026-03-12', end: '2026-03-20'}]);
      await expect(host.value).toEqual({start: '2026-03-12', end: '2026-03-20'});
      await expect(trigger).toHaveTextContent(rangeText('Mar 12', 'Mar 20'));
    });

    await step('Clear empties the range and shows the placeholder', async () => {
      await userEvent.click(canvas.getByRole('button', {name: 'Clear Reporting period'}));
      await expect(changes.at(-1)?.detail.value).toBeNull();
      await expect(host.value).toBeNull();
      await expect(trigger).toHaveTextContent('Select date range');
    });
  },
};

/**
 * Preset ranges beside the calendar. The applied preset is `aria-current`; one past
 * min/max or the span limit is `aria-disabled`. Picking a preset commits and closes.
 */
export const WithPresets: Story = {
  args: {
    presets: [
      {label: 'Last 7 days', range: {start: '2026-03-09', end: '2026-03-15'}},
      {label: 'Last 14 days', range: {start: '2026-03-02', end: '2026-03-15'}},
      {label: 'This month', range: {start: '2026-03-01', end: '2026-03-31'}},
      {label: 'Last year', range: {start: '2025-01-01', end: '2025-12-31'}},
    ],
    min: '2025-06-01',
    max: '2026-03-31',
    maxRangeSpan: 31,
    description: 'Presets longer than 31 days are unavailable',
  },
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-date-range-input');
    const {host, trigger, layer} = parts(canvasElement);
    const changes = recordEvents<{value: Range}>(canvasElement, 'astryx-change');
    const preset = (name: string) => canvas.getByRole('button', {name, hidden: true});

    await step('Opening focuses the first preset; the applied one is current', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await waitFor(() => expect(preset('Last 7 days')).toHaveFocus());
      await expect(canvas.getByRole('group', {name: 'Preset date ranges'})).toBeInTheDocument();
      await expect(preset('Last 7 days')).toHaveAttribute('aria-current', 'true');
      await expect(preset('Last year')).toHaveAttribute('aria-disabled', 'true');
      await expect(preset('This month')).not.toHaveAttribute('aria-disabled');
    });

    await step('Tab reaches the next preset; Enter commits it and closes', async () => {
      await userEvent.tab();
      await expect(preset('Last 14 days')).toHaveFocus();
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await expect(changes.map((e) => e.detail.value)).toEqual([{start: '2026-03-02', end: '2026-03-15'}]);
      await expect(host.value).toEqual({start: '2026-03-02', end: '2026-03-15'});
      await expect(preset('Last 14 days')).toHaveAttribute('aria-current', 'true');
      await expect(preset('Last 7 days')).not.toHaveAttribute('aria-current');
    });

    await step('A disabled preset does nothing', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await userEvent.click(preset('Last year'));
      await new Promise((resolve) => setTimeout(resolve, 300));
      await expect(isShowing(layer)).toBe(true);
      await expect(changes).toHaveLength(1);
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(layer)).toBe(false));
    });
  },
};

/** No range yet: the trigger shows (and is named with) the placeholder; no clear button. */
export const Empty: Story = {
  args: {label: 'Stay', value: null},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-date-range-input');
    const {trigger} = parts(canvasElement);
    await expect(trigger).toHaveTextContent('Select date range');
    await expect(trigger).toHaveAccessibleName('Stay: Select date range');
    await expect(canvas.queryByRole('button', {name: 'Clear Stay'})).toBeNull();
  },
};

export const WithoutClear: Story = {args: {hasClear: false}};

/** One month, weeks starting on Monday. */
export const OneMonth: Story = {
  args: {numberOfMonths: 1, weekStartsOn: 'mon'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-date-range-input');
    const {trigger, layer} = parts(canvasElement);
    await userEvent.click(trigger);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await expect(layer.querySelectorAll('[role="grid"]')).toHaveLength(1);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
  },
};

/** `minRangeSpan` 4 and `maxRangeSpan` 14: once a start is picked, days too near or too far are disabled. */
export const SpanBounds: Story = {
  args: {label: 'At least 3 nights', value: {start: '2026-03-02', end: '2026-03-06'}, minRangeSpan: 4, maxRangeSpan: 14},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-date-range-input');
    const {trigger, layer, day} = parts(canvasElement);
    await userEvent.click(trigger);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await userEvent.click(day('2026-03-10'));
    await waitFor(() => expect(day('2026-03-12')).toHaveAttribute('aria-disabled', 'true'));
    await expect(day('2026-03-13')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(day('2026-03-23')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(day('2026-03-24')).toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{Escape}{Escape}');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
  },
};

export const Small: Story = {args: {size: 'sm'}};

export const Large: Story = {args: {size: 'lg'}};

export const ErrorStatus: Story = {
  args: {status: {type: 'error', message: 'Range is too long'}},
  play: async ({canvasElement}) => {
    await expect(parts(canvasElement).trigger).toHaveAttribute('aria-invalid', 'true');
    await expect(parts(canvasElement).trigger).toHaveAccessibleDescription(/Range is too long/);
  },
};

/** Every status × size, and the tooltip and detached status variants. */
export const Matrix = composed(DateRangeInputMatrix, {}, {source: matrixSource});

/** Disabled with a reason: the trigger keeps its tab stop (`aria-disabled`) but opens nothing. */
export const Disabled: Story = {
  args: {isDisabled: true, disabledMessage: 'Locked while the report runs'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-date-range-input');
    const {trigger, layer} = parts(canvasElement);
    await expect(trigger).toHaveAttribute('aria-disabled', 'true');
    await expect(trigger).toHaveAccessibleDescription(/Locked while the report runs/);
    await userEvent.click(trigger);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(isShowing(layer)).toBe(false);
  },
};

export const Loading: Story = {
  args: {isLoading: true},
  play: async ({canvasElement}) => {
    await expect(parts(canvasElement).trigger).toHaveAttribute('aria-busy', 'true');
  },
};

/** Required: the trigger is described by a visually hidden "Required". */
export const Required: Story = {
  args: {isRequired: true},
  play: async ({canvasElement}) => {
    await expect(parts(canvasElement).trigger).toHaveAccessibleDescription(/Required/);
  },
};

/** German, across a year end: both ends show their year. */
export const German: Story = {
  args: {label: 'Zeitraum', locale: 'de-DE', value: {start: '2025-12-28', end: '2026-01-03'}, weekStartsOn: 'mon'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-date-range-input');
    await expect(parts(canvasElement).trigger).toHaveTextContent('28. Dez. 2025 – 3. Jan. 2026');
  },
};

/** The Persian (Solar Hijri) calendar in Farsi; values stay Gregorian ISO. */
export const PersianCalendar: Story = {args: {label: 'بازه', locale: 'fa-IR', calendar: 'persian'}};

/** `Temporal.PlainDate` value, min and max, and presets computed with `getRange()` (a story wrapper builds them on the server). */
export const TemporalValues = composed(DateRangeInputTemporal, {
  args: {label: 'Sprint'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-date-range-input');
    const {host, trigger, layer} = parts(canvasElement);
    await expect(host.value).toEqual({start: '2026-03-02', end: '2026-03-13'});
    await userEvent.click(trigger);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await userEvent.click(canvas.getByRole('button', {name: 'Next sprint', hidden: true}));
    await waitFor(() => expect(isShowing(layer)).toBe(false));
    await expect(host.value).toEqual({start: '2026-03-16', end: '2026-03-29'});
  },
}, {controls: ['label', 'size', 'numberOfMonths'], source: temporalSource});

/** `dateConstraints` (weekdays only, a story wrapper): weekend days are disabled in the calendar. */
export const WeekdaysOnly = composed(DateRangeInputWeekdays, {
  args: {label: 'Weekdays only'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-date-range-input');
    const {trigger, layer, day} = parts(canvasElement);
    await userEvent.click(trigger);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await expect(day('2026-03-07')).toHaveAttribute('aria-disabled', 'true');
    await expect(day('2026-03-09')).not.toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
  },
}, {controls: ['label'], source: weekdaysSource});

/** In a form: `htmlName` submits `booking-start` / `booking-end`; Reset restores the server value. */
export const InForm = composed(DateRangeInputForm, {
  args: {label: 'Booking'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-date-range-input');
    const {host, trigger, layer, day} = parts(canvasElement);
    const form = canvasElement.querySelector('form')!;
    await userEvent.click(trigger);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await userEvent.click(day('2026-03-16'));
    await userEvent.click(day('2026-03-18'));
    await waitFor(() => expect(isShowing(layer)).toBe(false));
    await expect(Object.fromEntries(new FormData(form))).toEqual({'booking-start': '2026-03-16', 'booking-end': '2026-03-18'});
    await userEvent.click(canvas.getByRole('button', {name: 'Reset'}));
    await waitFor(() => expect(host.value).toEqual({start: '2026-03-09', end: '2026-03-15'}));
    await expect(Object.fromEntries(new FormData(form))).toEqual({'booking-start': '2026-03-09', 'booking-end': '2026-03-15'});
  },
}, {controls: ['label'], source: formSource});
