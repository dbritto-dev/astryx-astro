import TimeInput from 'astryx-astro/components/TimeInput/TimeInput.astro';
import Demo from 'astryx-astro/components/TimeInput/TimeInput.demo.astro';
import demoSource from 'astryx-astro/components/TimeInput/TimeInput.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import TimeInputForm from './TimeInputForm.astro';
import formSource from './TimeInputForm.astro?raw';
import TimeInputMatrix from './TimeInputMatrix.astro';
import matrixSource from './TimeInputMatrix.astro?raw';
import TimeInputTemporal from './TimeInputTemporal.astro';
import temporalSource from './TimeInputTemporal.astro?raw';

const meta = {
  title: 'Form Controls/Time Input',
  component: TimeInput,
  ...astryx('TimeInput'),
  // Fixed values only: an empty field steps from "now", so interactive stories start with a time.
  args: {label: 'Start time', value: '14:30'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (TimeInput.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

type Host = HTMLElement & {value?: string};

const parts = (canvasElement: HTMLElement) => {
  const host = canvasElement.querySelector<Host>('ax-time-input')!;
  return {host, input: host.querySelector<HTMLInputElement>(':scope > input.ax-input-native')!};
};

const retype = async (input: HTMLInputElement, text: string) => {
  await userEvent.tripleClick(input);
  await userEvent.keyboard(`{Control>}a{/Control}${text}`);
};

const announced = (text: string) =>
  waitFor(() => expect([...document.querySelectorAll('[data-astryx-live-region]')].map((r) => r.textContent).join(' ')).toContain(text));

/**
 * Typing reports a time as soon as the text reads as one ("3:45 PM", "1430"); blur redraws it
 * in the locale format. Unreadable text is marked invalid and announced, and blur reverts it.
 * ArrowUp / ArrowDown step by a minute and announce the new time.
 */
export const Default: Story = {
  args: {description: 'Type a time; ↑/↓ change it by a minute'},
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-time-input');
    const {host, input} = parts(canvasElement);
    const changes = recordEvents<{value?: string}>(canvasElement, 'astryx-change');
    await expect(canvas.getByRole('textbox', {name: 'Start time'})).toBe(input);
    await expect(input).toHaveValue('2:30 PM');

    await step('Typed text reports as soon as it reads as a time; blur reformats it', async () => {
      await retype(input, '3:45 PM');
      await waitFor(() => expect(changes.at(-1)?.detail.value).toBe('15:45'));
      await userEvent.tab();
      await expect(input).toHaveValue('3:45 PM');
      await expect(host.value).toBe('15:45');
    });

    await step('Compact "1430" reads as 2:30 PM', async () => {
      await retype(input, '1430');
      await userEvent.tab();
      await waitFor(() => expect(host.value).toBe('14:30'));
      await expect(input).toHaveValue('2:30 PM');
    });

    await step('Unreadable text is invalid and announced; blur reverts it', async () => {
      const before = changes.length;
      await retype(input, 'xyz');
      await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'));
      await expect(host.querySelector('[data-ax-time-alert]')).toHaveTextContent('Invalid time');
      await userEvent.tab();
      await waitFor(() => expect(input).toHaveValue('2:30 PM'));
      await expect(input).not.toHaveAttribute('aria-invalid');
      await expect(changes).toHaveLength(before);
    });

    await step('ArrowUp / ArrowDown step by a minute and announce it', async () => {
      input.focus();
      await userEvent.keyboard('{ArrowUp}');
      await waitFor(() => expect(host.value).toBe('14:31'));
      await announced('2:31 PM');
      await userEvent.keyboard('{ArrowDown}{ArrowDown}');
      await waitFor(() => expect(host.value).toBe('14:29'));
    });
  },
};

/**
 * `increment={15}` with a clear button. Stepping wraps at midnight; a click on the clock icon
 * focuses the input; the clear button empties the value and keeps focus.
 */
export const QuarterHours: Story = {
  args: {label: 'Last call', value: '23:45', increment: 15, hasClear: true},
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-time-input');
    const {host, input} = parts(canvasElement);
    const changes = recordEvents<{value?: string}>(canvasElement, 'astryx-change');

    await step('A click on the clock icon focuses the input', async () => {
      await userEvent.click(host.querySelector('.ax-time-input-icon')!);
      await expect(input).toHaveFocus();
    });

    await step('ArrowUp wraps 11:45 PM → 12:00 AM; ArrowDown wraps back', async () => {
      await userEvent.keyboard('{ArrowUp}');
      await waitFor(() => expect(host.value).toBe('00:00'));
      await expect(input).toHaveValue('12:00 AM');
      await userEvent.keyboard('{ArrowDown}');
      await waitFor(() => expect(host.value).toBe('23:45'));
    });

    await step('Clear empties the value and keeps focus', async () => {
      await userEvent.click(canvas.getByRole('button', {name: 'Clear Last call'}));
      await expect(changes.at(-1)?.detail).toHaveProperty('value', undefined);
      await expect(host.value).toBeUndefined();
      await expect(input).toHaveValue('');
      await expect(input).toHaveFocus();
    });
  },
};

/** Empty: the placeholder becomes a format hint while focused. */
export const Empty: Story = {
  args: {label: 'Closes', value: null},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-time-input');
    const {input} = parts(canvasElement);
    await expect(input).toHaveAttribute('placeholder', 'Select a time');
    await userEvent.click(input);
    await waitFor(() => expect(input).toHaveAttribute('placeholder', 'e.g., 2:30 PM'));
    input.blur();
    await waitFor(() => expect(input).toHaveAttribute('placeholder', 'Select a time'));
  },
};

export const WithSeconds: Story = {
  args: {label: 'Lap time', value: '14:30:15', hasSeconds: true},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-time-input');
    await expect(parts(canvasElement).input).toHaveValue('2:30:15 PM');
  },
};

/** `min` / `max` with a 30-minute increment: steps and typed times outside are refused. */
export const MinMax: Story = {
  args: {label: 'Business hours', value: '09:00', min: '09:00', max: '17:00', increment: 30, description: '9 AM – 5 PM'},
  play: async ({canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-time-input');
    const {host, input} = parts(canvasElement);
    await step('A step below min is refused; a step inside applies', async () => {
      input.focus();
      await userEvent.keyboard('{ArrowDown}');
      await new Promise((resolve) => setTimeout(resolve, 300));
      await expect(host.value).toBe('09:00');
      await userEvent.keyboard('{ArrowUp}');
      await waitFor(() => expect(host.value).toBe('09:30'));
    });
    await step('A typed time after max is invalid and not reported; blur reverts', async () => {
      await retype(input, '6:00 PM');
      await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'));
      await expect(host.value).toBe('09:30');
      await userEvent.tab();
      await waitFor(() => expect(input).toHaveValue('9:30 AM'));
    });
  },
};

export const Small: Story = {args: {size: 'sm'}};

export const Large: Story = {args: {size: 'lg'}};

export const ErrorStatus: Story = {
  args: {value: '18:00', status: {type: 'error', message: 'Outside business hours'}},
  play: async ({canvasElement}) => {
    const {input} = parts(canvasElement);
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveAccessibleDescription(/Outside business hours/);
  },
};

/** Every status × size, and the tooltip and detached status variants. */
export const Matrix = composed(TimeInputMatrix, {}, {source: matrixSource});

/** Disabled with a reason: still focusable, but arrows and typing change nothing. */
export const Disabled: Story = {
  args: {value: '08:15', isDisabled: true, disabledMessage: 'Set by your administrator'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-time-input');
    const {host, input} = parts(canvasElement);
    const changes = recordEvents(canvasElement, 'astryx-change');
    await expect(input).toHaveAttribute('aria-disabled', 'true');
    await expect(input).toHaveAccessibleDescription(/Set by your administrator/);
    input.focus();
    await expect(input).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}1');
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(host.value).toBe('08:15');
    await expect(input).toHaveValue('8:15 AM');
    await expect(changes).toHaveLength(0);
  },
};

export const Loading: Story = {
  args: {isLoading: true},
  play: async ({canvasElement}) => {
    await expect(parts(canvasElement).input).toHaveAttribute('aria-busy', 'true');
  },
};

export const Required: Story = {args: {isRequired: true}};

/** German: the locale's 24-hour cycle, for display and typing. */
export const German: Story = {
  args: {label: 'Uhrzeit', locale: 'de-DE'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-time-input');
    const {host, input} = parts(canvasElement);
    await expect(input).toHaveValue('14:30');
    await retype(input, '9:05');
    await userEvent.tab();
    await waitFor(() => expect(host.value).toBe('09:05'));
    await expect(input).toHaveValue('09:05');
  },
};

/** `hourFormat="12h"` in Japanese: the locale's own day period ("午後"), typed and shown. */
export const JapaneseTwelveHour: Story = {
  args: {label: '時刻', locale: 'ja-JP', hourFormat: '12h'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-time-input');
    const {host, input} = parts(canvasElement);
    await expect(input).toHaveValue('午後2:30');
    await retype(input, '午前9:15');
    await userEvent.tab();
    await waitFor(() => expect(host.value).toBe('09:15'));
  },
};

/** `Temporal.PlainTime` value, min and max (a story wrapper builds them on the server); events carry ISO strings. */
export const TemporalValues = composed(TimeInputTemporal, {
  args: {label: 'Morning slot'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-time-input');
    const {host, input} = parts(canvasElement);
    const changes = recordEvents<{value?: string}>(canvasElement, 'astryx-change');
    await expect(host.value).toBe('08:45');
    input.focus();
    await userEvent.keyboard('{ArrowUp}');
    await waitFor(() => expect(changes.at(-1)?.detail.value).toBe('09:00'));
  },
}, {controls: ['label', 'size', 'increment'], source: temporalSource});

/** In a form and an InputGroup: `htmlName` submits ISO times; Reset restores the server values. */
export const InForm = composed(TimeInputForm, {
  args: {label: 'Opens'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-time-input');
    const form = canvasElement.querySelector('form')!;
    const opens = canvas.getByRole('textbox', {name: /^Opens/}) as HTMLInputElement;
    await retype(opens, '10:30 AM');
    await userEvent.tab();
    await waitFor(() => expect(Object.fromEntries(new FormData(form))).toEqual({opens: '10:30', from: '10:00'}));
    await userEvent.click(canvas.getByRole('button', {name: 'Reset'}));
    await waitFor(() => expect(Object.fromEntries(new FormData(form))).toEqual({opens: '09:00', from: '10:00'}));
    await expect(opens).toHaveValue('9:00 AM');
  },
}, {controls: ['label'], source: formSource});
