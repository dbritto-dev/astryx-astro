import DateTimeInput from 'astryx-astro/components/DateTimeInput/DateTimeInput.astro';
import Demo from 'astryx-astro/components/DateTimeInput/DateTimeInput.demo.astro';
import demoSource from 'astryx-astro/components/DateTimeInput/DateTimeInput.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import DateTimeInputForm from './DateTimeInputForm.astro';
import formSource from './DateTimeInputForm.astro?raw';
import DateTimeInputMatrix from './DateTimeInputMatrix.astro';
import matrixSource from './DateTimeInputMatrix.astro?raw';
import DateTimeInputTemporal from './DateTimeInputTemporal.astro';
import temporalSource from './DateTimeInputTemporal.astro?raw';

const meta = {
  title: 'Form Controls/Date Time Input',
  component: DateTimeInput,
  ...astryx('DateTimeInput'),
  // Fixed values only: a story is pre-rendered once, so "now" would be the build time. A date
  // picked without a time takes the current time, so every interactive story starts with both.
  args: {label: 'Meeting time', value: '2026-03-21T14:30'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (DateTimeInput.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

type Host = HTMLElement & {value?: string};

const parts = (canvasElement: HTMLElement) => {
  const host = canvasElement.querySelector<Host>('ax-date-time-input')!;
  const config = JSON.parse(host.getAttribute('data-ax-config')!) as {popover: string; listPopover?: string};
  const calendarLayer = canvasElement.querySelector<HTMLElement>(`#${config.popover}`)!;
  const listLayer = config.listPopover ? canvasElement.querySelector<HTMLElement>(`#${config.listPopover}`) : null;
  return {
    host,
    dateInput: host.querySelector<HTMLInputElement>('input[data-ax-date-input]')!,
    timeInput: host.querySelector<HTMLInputElement>('input[data-ax-time-input]')!,
    toggle: host.querySelector<HTMLButtonElement>('[data-ax-date-toggle]')!,
    calendarLayer,
    listLayer,
    day: (iso: string) => calendarLayer.querySelector<HTMLButtonElement>(`button[data-date="${iso}"]:not([data-ax-outside])`)!,
    option: (time: string) => listLayer!.querySelector<HTMLElement>(`[role="option"][data-time="${time}"]`)!,
    activeOption: () => document.getElementById(host.querySelector('input[data-ax-time-input]')!.getAttribute('aria-activedescendant') ?? '')?.textContent,
  };
};

const retype = async (input: HTMLInputElement, text: string) => {
  await userEvent.tripleClick(input);
  await userEvent.keyboard(`{Control>}a{/Control}${text}`);
};

/**
 * A typed or picked date keeps the time; a typed time combines with the date; ArrowUp and
 * ArrowDown step the time by `timeIncrement`. Events carry the local ISO datetime.
 */
export const Default: Story = {
  args: {description: 'Type or pick a date; type a time or use ↑/↓'},
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-date-time-input');
    const {host, dateInput, timeInput, toggle, calendarLayer, day} = parts(canvasElement);
    const changes = recordEvents<{value?: string}>(canvasElement, 'astryx-change');
    await expect(canvas.getByRole('combobox', {name: 'Meeting time'})).toBe(dateInput);
    await expect(canvas.getByRole('textbox', {name: 'Meeting time time'})).toBe(timeInput);
    await expect(dateInput).toHaveValue('March 21, 2026');
    await expect(timeInput).toHaveValue('2:30 PM');

    await step('A typed date keeps the time', async () => {
      await retype(dateInput, 'April 2, 2026');
      await waitFor(() => expect(changes.at(-1)?.detail.value).toBe('2026-04-02T14:30'));
      await userEvent.keyboard('{Escape}');
    });

    await step('The toggle opens the calendar on the date; a picked day keeps the time and closes', async () => {
      await userEvent.click(toggle);
      await waitFor(() => expect(isShowing(calendarLayer)).toBe(true));
      await waitFor(() => expect(calendarLayer.contains(document.activeElement)).toBe(true));
      await waitFor(() => expect(dateInput).toHaveAttribute('aria-expanded', 'true'));
      await userEvent.click(day('2026-04-09'));
      await waitFor(() => expect(isShowing(calendarLayer)).toBe(false));
      await expect(host.value).toBe('2026-04-09T14:30');
      await expect(dateInput).toHaveValue('April 9, 2026');
    });

    await step('A typed time combines with the date', async () => {
      await retype(timeInput, '4:05 PM');
      await userEvent.tab();
      await waitFor(() => expect(host.value).toBe('2026-04-09T16:05'));
      await expect(timeInput).toHaveValue('4:05 PM');
    });

    await step('ArrowUp steps the time by a minute', async () => {
      timeInput.focus();
      await userEvent.keyboard('{ArrowUp}');
      await waitFor(() => expect(host.value).toBe('2026-04-09T16:06'));
      await expect(changes.at(-1)?.detail.value).toBe('2026-04-09T16:06');
    });
  },
};

/**
 * `timeOptionInterval` turns the time into a combobox with a list of preset times: a click or
 * Alt+ArrowDown opens it, arrows / Home / End move the active option, Enter commits, Escape
 * closes. With the list closed, arrows step by `timeIncrement` (15 minutes here).
 */
export const WithTimeOptions: Story = {
  args: {label: 'Reminder', value: '2026-03-21T09:00', timeOptionInterval: 15, timeIncrement: 15, hasClear: true},
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-date-time-input');
    const {host, dateInput, timeInput, listLayer, option, activeOption} = parts(canvasElement);
    const changes = recordEvents<{value?: string}>(canvasElement, 'astryx-change');
    await expect(canvas.getByRole('combobox', {name: 'Reminder time'})).toBe(timeInput);

    await step('With the list closed, ArrowUp steps by 15 minutes', async () => {
      timeInput.focus();
      await userEvent.keyboard('{ArrowUp}');
      await waitFor(() => expect(host.value).toBe('2026-03-21T09:15'));
    });

    await step('A click opens the list on the selected time; focus stays in the input', async () => {
      await userEvent.click(timeInput);
      await waitFor(() => expect(isShowing(listLayer)).toBe(true));
      await waitFor(() => expect(timeInput).toHaveAttribute('aria-expanded', 'true'));
      await expect(activeOption()).toBe('9:15 AM');
      await expect(option('09:15')).toHaveAttribute('aria-selected', 'true');
      await expect(timeInput).toHaveFocus();
    });

    await step('Arrows, Home and End move the active option; Enter commits and closes', async () => {
      await userEvent.keyboard('{ArrowDown}{ArrowDown}');
      await expect(activeOption()).toBe('9:45 AM');
      await userEvent.keyboard('{Home}');
      await expect(activeOption()).toBe('12:00 AM');
      await userEvent.keyboard('{End}');
      await expect(activeOption()).toBe('11:45 PM');
      await userEvent.keyboard('{ArrowUp}{Enter}');
      await waitFor(() => expect(isShowing(listLayer)).toBe(false));
      await expect(host.value).toBe('2026-03-21T23:30');
      await waitFor(() => expect(timeInput).toHaveAttribute('aria-expanded', 'false'));
    });

    await step('Alt+ArrowDown opens; Escape closes', async () => {
      await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
      await waitFor(() => expect(isShowing(listLayer)).toBe(true));
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(listLayer)).toBe(false));
    });

    await step('A pointer pick commits and closes, focus in the input', async () => {
      await userEvent.click(timeInput);
      await waitFor(() => expect(isShowing(listLayer)).toBe(true));
      await userEvent.click(option('18:30'));
      await waitFor(() => expect(isShowing(listLayer)).toBe(false));
      await expect(host.value).toBe('2026-03-21T18:30');
      await expect(timeInput).toHaveFocus();
    });

    await step('Clear empties both segments', async () => {
      await userEvent.click(canvas.getByRole('button', {name: 'Clear Reminder'}));
      await expect(changes.at(-1)?.detail.value).toBeUndefined();
      await expect(host.value).toBeUndefined();
      await expect(dateInput).toHaveValue('');
      await expect(timeInput).toHaveValue('');
    });
  },
};

/** Empty, with placeholders. A time typed with no date reports nothing and reverts on blur. */
export const Empty: Story = {
  args: {label: 'Departure', value: null, timeOptionInterval: 30, hasClear: true},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-date-time-input');
    const {dateInput, timeInput, listLayer} = parts(canvasElement);
    const changes = recordEvents(canvasElement, 'astryx-change');
    await expect(dateInput).toHaveAttribute('placeholder', 'Select a date');
    await expect(timeInput).toHaveAttribute('placeholder', 'Select a time');
    await retype(timeInput, '10:00 AM');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(listLayer)).toBe(false));
    timeInput.blur();
    await waitFor(() => expect(timeInput).toHaveValue(''));
    await expect(changes).toHaveLength(0);
  },
};

/** Seconds in the time, and a two-month calendar. */
export const WithSeconds: Story = {
  args: {label: 'Precise', value: '2026-03-21T14:30:15', hasSeconds: true, numberOfMonths: 2},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-date-time-input');
    await expect(parts(canvasElement).timeInput).toHaveValue('2:30:15 PM');
  },
};

/**
 * `min` / `max` datetimes: their dates bound the calendar and typed dates, their times bound
 * the time on the boundary days. A date past `max` shows the detached error status.
 */
export const MinMax: Story = {
  args: {
    label: 'Booking window',
    value: '2026-03-10T09:00',
    min: '2026-03-10T09:00',
    max: '2026-03-20T17:30',
    timeOptionInterval: 60,
    description: 'Mar 10, 9 AM – Mar 20, 5:30 PM',
  },
  play: async ({canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-date-time-input');
    const {host, dateInput, timeInput, listLayer} = parts(canvasElement);
    const visible = () => [...listLayer!.querySelectorAll<HTMLElement>('[role="option"]')].filter((o) => !o.hidden).map((o) => o.textContent);

    await step('On the min day the list starts at the min time', async () => {
      await userEvent.click(timeInput);
      await waitFor(() => expect(isShowing(listLayer)).toBe(true));
      await expect(visible().at(0)).toBe('9:00 AM');
      await expect(visible().at(-1)).toBe('11:00 PM');
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(listLayer)).toBe(false));
    });

    await step('A step below the min time is refused', async () => {
      await userEvent.keyboard('{ArrowDown}');
      await new Promise((resolve) => setTimeout(resolve, 300));
      await expect(host.value).toBe('2026-03-10T09:00');
    });

    await step('A date past max is rejected with the detached error status', async () => {
      await retype(dateInput, 'March 25, 2026');
      await waitFor(() => expect(host).toHaveAttribute('data-status', 'error'));
      await expect(dateInput).toHaveAccessibleDescription(/Enter a date from March 10, 2026 to March 20, 2026/);
      await expect(timeInput).toHaveAccessibleDescription(/Enter a date from March 10, 2026 to March 20, 2026/);
      await expect(host.value).toBe('2026-03-10T09:00');
      await userEvent.keyboard('{Escape}');
    });
  },
};

export const Small: Story = {args: {size: 'sm'}};

export const Large: Story = {args: {size: 'lg'}};

export const ErrorStatus: Story = {
  args: {status: {type: 'error', message: 'The room is booked then'}},
  play: async ({canvasElement}) => {
    const {dateInput, timeInput} = parts(canvasElement);
    await expect(dateInput).toHaveAttribute('aria-invalid', 'true');
    await expect(timeInput).toHaveAttribute('aria-invalid', 'true');
    await expect(timeInput).toHaveAccessibleDescription(/The room is booked then/);
  },
};

/** Every status × size. */
export const Matrix = composed(DateTimeInputMatrix, {}, {source: matrixSource});

/** Disabled with a reason: both inputs keep their tab stop but take no input and open nothing. */
export const Disabled: Story = {
  args: {isDisabled: true, disabledMessage: 'The event has started'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-date-time-input');
    const {host, dateInput, timeInput, calendarLayer} = parts(canvasElement);
    await expect(dateInput).toHaveAttribute('aria-disabled', 'true');
    await expect(dateInput).toHaveAccessibleDescription(/The event has started/);
    dateInput.focus();
    await userEvent.keyboard('{ArrowDown}');
    timeInput.focus();
    await userEvent.keyboard('{ArrowUp}');
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(isShowing(calendarLayer)).toBe(false);
    await expect(host.value).toBe('2026-03-21T14:30');
  },
};

export const Loading: Story = {
  args: {isLoading: true},
  play: async ({canvasElement}) => {
    await expect(parts(canvasElement).dateInput).toHaveAttribute('aria-busy', 'true');
  },
};

export const Required: Story = {args: {isRequired: true}};

/** German: "21. März 2026" and a 24-hour time from the locale's hour cycle. */
export const German: Story = {
  args: {label: 'Termin', locale: 'de-DE', timeOptionInterval: 30},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-date-time-input');
    const {dateInput, timeInput} = parts(canvasElement);
    await expect(dateInput).toHaveValue('21. März 2026');
    await expect(timeInput).toHaveValue('14:30');
  },
};

/** `hourFormat="12h"` overrides en-GB's 24-hour clock. */
export const TwelveHourFormat: Story = {args: {label: 'Start', locale: 'en-GB', hourFormat: '12h'}};

/** The Hebrew calendar in Hebrew; values stay Gregorian ISO. */
export const HebrewCalendar: Story = {args: {label: 'מועד', locale: 'he-IL', calendar: 'hebrew'}};

/**
 * A `Temporal.PlainDateTime` value and `Temporal.ZonedDateTime` bounds (a story wrapper builds
 * them on the server); events still carry ISO strings.
 */
export const TemporalValues = composed(DateTimeInputTemporal, {
  args: {label: 'Kickoff'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-date-time-input');
    const {host, timeInput, listLayer} = parts(canvasElement);
    await expect(host.value).toBe('2026-03-23T10:00');
    await userEvent.click(timeInput);
    await waitFor(() => expect(isShowing(listLayer)).toBe(true));
    const first = [...listLayer!.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => !o.hidden);
    await expect(first).toHaveTextContent('9:00 AM');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(listLayer)).toBe(false));
  },
}, {controls: ['label', 'size'], source: temporalSource});

/** In a form: `htmlName` submits the ISO datetime; Reset restores the server value. */
export const InForm = composed(DateTimeInputForm, {
  args: {label: 'Starts'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-date-time-input');
    const {host, dateInput} = parts(canvasElement);
    const form = canvasElement.querySelector('form')!;
    await retype(dateInput, 'March 22, 2026');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(Object.fromEntries(new FormData(form))).toEqual({starts: '2026-03-22T09:00'}));
    await userEvent.click(canvas.getByRole('button', {name: 'Reset'}));
    await waitFor(() => expect(host.value).toBe('2026-03-21T09:00'));
    await expect(Object.fromEntries(new FormData(form))).toEqual({starts: '2026-03-21T09:00'});
  },
}, {controls: ['label'], source: formSource});
