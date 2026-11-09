import DateInput from 'astryx-astro/components/DateInput/DateInput.astro';
import Demo from 'astryx-astro/components/DateInput/DateInput.demo.astro';
import demoSource from 'astryx-astro/components/DateInput/DateInput.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import DateInputTemporal from './DateInputTemporal.astro';
import temporalSource from './DateInputTemporal.astro?raw';

const meta = {
  title: 'Form Controls/Date Input',
  component: DateInput,
  ...astryx('DateInput'),
  // Fixed dates only: a story is pre-rendered once, so "today" would be the build day.
  args: {label: 'Event date', value: '2026-03-21'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (DateInput.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/** An ISO string value, drawn in the `date_long` format; typing a complete date reports it at once. */
export const Default: Story = {
  play: async ({canvas, canvasElement}) => {
    const host = await upgraded<HTMLElement & {value?: string}>(canvasElement, 'ax-date-input');
    const input = canvas.getByRole('combobox', {name: 'Event date'});
    const changes = recordEvents<{value?: string}>(canvasElement, 'astryx-change');
    await expect(input).toHaveValue('March 21, 2026');
    await userEvent.tripleClick(input);
    await userEvent.keyboard('{Control>}a{/Control}April 2, 2026');
    await waitFor(() => expect(changes.map((e) => e.detail.value)).toEqual(['2026-04-02']));
    await expect(host.value).toBe('2026-04-02');
  },
};

/**
 * `Temporal.PlainDate` value, min and max (a story wrapper builds them on the server). Numeric
 * text commits on Enter; a date past `max` stays with an error status.
 */
export const TemporalValue = composed(DateInputTemporal, {
  args: {label: 'Start date'},
  play: async ({canvas, canvasElement, step}) => {
    const host = await upgraded<HTMLElement & {value?: string}>(canvasElement, 'ax-date-input');
    const input = canvas.getByRole('combobox', {name: 'Start date'});
    const changes = recordEvents<{value?: string}>(canvasElement, 'astryx-change');
    await expect(input).toHaveValue('November 8, 2026');
    await expect(host.value).toBe('2026-11-08');

    await step('Numeric text commits on Enter (events carry ISO strings)', async () => {
      await userEvent.tripleClick(input);
      await userEvent.keyboard('{Control>}a{/Control}12/25/2026{Enter}');
      await waitFor(() => expect(changes.at(-1)?.detail.value).toBe('2026-12-25'));
      await expect(input).toHaveValue('December 25, 2026');
    });

    await step('A date after max is rejected with an error status', async () => {
      await userEvent.tripleClick(input);
      await userEvent.keyboard('{Control>}a{/Control}4/1/2027{Enter}');
      await waitFor(() => expect(host).toHaveAttribute('data-status', 'error'));
      await expect(host.value).toBe('2026-12-25');
    });
  },
}, {controls: ['label', 'size', 'hasClear'], source: temporalSource});

/** The toggle opens the calendar with focus inside; Escape closes it and returns focus. */
export const CalendarPopover: Story = {
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-date-input');
    const toggle = canvasElement.querySelector<HTMLElement>('[data-ax-date-toggle]')!;
    const layer = canvasElement.querySelector('ax-picker-popover');
    await userEvent.click(toggle);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await waitFor(() => expect(layer!.contains(document.activeElement)).toBe(true));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
    await expect(toggle).toHaveFocus();
    await expect(canvas.getByRole('combobox', {name: 'Event date'})).toHaveValue('March 21, 2026');
  },
};

export const Empty: Story = {args: {value: null}};

export const WithClear: Story = {args: {hasClear: true}};

export const Small: Story = {args: {size: 'sm'}};

export const Large: Story = {args: {size: 'lg'}};

export const Disabled: Story = {args: {isDisabled: true, disabledMessage: 'Dates are locked after approval'}};

export const Loading: Story = {args: {isLoading: true}};

export const Required: Story = {args: {isRequired: true}};

export const ErrorStatus: Story = {args: {status: {type: 'error', message: 'Pick a date in the future'}}};

export const TwoMonths: Story = {args: {numberOfMonths: 2}};

/** German order and month names: the field reads and writes `5.4.2026`. */
export const German: Story = {args: {label: 'Datum', locale: 'de-DE'}};

/** A non-Gregorian calendar: the Buddhist era in Thai; values stay Gregorian ISO. */
export const BuddhistCalendar: Story = {
  args: {label: 'วันที่', calendar: 'buddhist', locale: 'th-TH'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-date-input');
    await expect(canvasElement.querySelector('input')!.value).toContain('2569');
  },
};
