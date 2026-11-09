import NumberInput from 'astryx-astro/components/NumberInput/NumberInput.astro';
import Demo from 'astryx-astro/components/NumberInput/NumberInput.demo.astro';
import demoSource from 'astryx-astro/components/NumberInput/NumberInput.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, overview, type Meta, type Story} from '../_lib/story';

const meta = {
  title: 'Form Controls/Number Input',
  component: NumberInput,
  ...astryx('NumberInput'),
  args: {label: 'Quantity', value: 2},
} satisfies Meta;
export default meta;

/** Every example from the docs page (NumberInput.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

type NumberHost = HTMLElement & {value: number | null};
const valueNow = (input: HTMLElement) => input.getAttribute('aria-valuenow');

/**
 * Keyboard stepping on the `step` grid, clamped to `min`/`max`: ArrowUp/ArrowDown by one step,
 * PageUp/PageDown by ten, Home/End to the bounds, the wheel over the focused field; the stepper
 * buttons step too and are `aria-disabled` at a bound. Every committed value reports `astryx-change`.
 */
export const Default: Story = {
  args: {min: 0, max: 10, hasNumberSteppers: true, htmlName: 'quantity'},
  play: async ({canvas, canvasElement, step}) => {
    const host = await upgraded<NumberHost>(canvasElement, 'ax-number-input');
    const changes = recordEvents<{value: number | null}>(canvasElement, 'astryx-change');
    const input = canvas.getByRole('spinbutton', {name: 'Quantity'});
    const increment = canvas.getByRole('button', {name: 'Increment Quantity'});
    const decrement = canvas.getByRole('button', {name: 'Decrement Quantity'});
    await expect(input).toHaveAttribute('aria-valuemin', '0');
    await expect(input).toHaveAttribute('aria-valuemax', '10');
    await expect(valueNow(input)).toBe('2');

    await step('ArrowUp and ArrowDown step by one', async () => {
      input.focus();
      await userEvent.keyboard('{ArrowUp}');
      await expect(valueNow(input)).toBe('3');
      await userEvent.keyboard('{ArrowDown}');
      await expect(valueNow(input)).toBe('2');
    });
    await step('PageUp steps by ten, clamped to max; the increment stepper is then aria-disabled', async () => {
      await userEvent.keyboard('{PageUp}');
      await expect(valueNow(input)).toBe('10');
      await userEvent.keyboard('{ArrowUp}');
      await expect(valueNow(input)).toBe('10');
      await expect(increment).toHaveAttribute('aria-disabled', 'true');
    });
    await step('Home and End jump to the bounds', async () => {
      await userEvent.keyboard('{Home}');
      await expect(valueNow(input)).toBe('0');
      await expect(decrement).toHaveAttribute('aria-disabled', 'true');
      await userEvent.keyboard('{End}');
      await expect(valueNow(input)).toBe('10');
    });
    await step('The wheel over the focused field steps', async () => {
      input.dispatchEvent(new WheelEvent('wheel', {deltaY: 100, bubbles: true, cancelable: true}));
      await waitFor(() => expect(valueNow(input)).toBe('9'));
    });
    await step('A stepper press steps and keeps focus in the field', async () => {
      await userEvent.click(decrement);
      await waitFor(() => expect(valueNow(input)).toBe('8'));
      await expect(input).toHaveFocus();
    });
    await expect(changes.map((e) => e.detail.value)).toEqual([3, 2, 10, 0, 10, 9, 8]);
    await expect(host.value).toBe(8);
  },
};

/**
 * Typing keeps a draft that commits on Enter or blur, clamped to the bounds. Text that does not
 * parse stays visible but `aria-invalid`, "Invalid number" is announced, and blur reverts it.
 */
export const TypedEntry: Story = {
  args: {value: 5, min: 0, max: 10},
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-number-input');
    const changes = recordEvents<{value: number | null}>(canvasElement, 'astryx-change');
    const input = canvas.getByRole('spinbutton', {name: 'Quantity'});
    await step('A draft does not commit while typing; Enter commits it clamped to max', async () => {
      await userEvent.click(input);
      await userEvent.keyboard('{Control>}a{/Control}25');
      await expect(input).toHaveValue('25');
      await expect(valueNow(input)).toBe('5');
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(valueNow(input)).toBe('10'));
      await expect(input).toHaveValue('10');
    });
    await step('Unparseable text is invalid and announced; blur reverts it', async () => {
      await userEvent.keyboard('{Control>}a{/Control}12abc');
      await waitFor(() => expect(input).toBeInvalid());
      await expect(canvas.getByRole('alert')).toHaveTextContent('Invalid number');
      await userEvent.tab();
      await waitFor(() => expect(input).toHaveValue('10'));
      await expect(input).not.toBeInvalid();
    });
    await expect(changes.map((e) => e.detail.value)).toEqual([10]);
  },
};

/** The stepper column (mouse and pen only, out of the tab order). */
export const WithSteppers: Story = {args: {hasNumberSteppers: true, min: 0, max: 10}};

/**
 * `units` text at the end describes the input; the steppers step by `step` (64).
 */
export const WithUnits: Story = {
  args: {label: 'Storage', value: 128, units: 'GB', step: 64, min: 64, max: 1024, hasNumberSteppers: true},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-number-input');
    const input = canvas.getByRole('spinbutton', {name: 'Storage'});
    await expect(input).toHaveAccessibleDescription('GB');
    await userEvent.click(canvas.getByRole('button', {name: 'Increment Storage'}));
    await waitFor(() => expect(valueNow(input)).toBe('192'));
  },
};

/**
 * `formatValue` as Intl.NumberFormat options: currency text at rest (also the `aria-valuetext`),
 * the raw number while focused; a hidden input carries the raw value for the form.
 */
export const Currency: Story = {
  args: {label: 'Price', value: 1234.5, step: 0.01, min: 0, formatValue: {style: 'currency', currency: 'USD'}, htmlName: 'price'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-number-input');
    const input = canvas.getByRole('spinbutton', {name: 'Price'});
    await expect(input).toHaveValue('$1,234.50');
    await expect(input).toHaveAttribute('aria-valuetext', '$1,234.50');
    await userEvent.click(input);
    await waitFor(() => expect(input).toHaveValue('1234.5'));
    await userEvent.keyboard('{ArrowUp}');
    await userEvent.tab();
    await waitFor(() => expect(input).toHaveValue('$1,234.51'));
    await expect(canvasElement.querySelector('input[type="hidden"][name="price"]')).toHaveValue('1234.51');
  },
};

/** German number format: the focused text uses a decimal comma and `1.234.567,25` parses. */
export const German: Story = {
  args: {label: 'Betrag', locale: 'de-DE', value: 1234.5, step: 0.5},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-number-input');
    const input = canvas.getByRole('spinbutton', {name: 'Betrag'});
    await userEvent.click(input);
    await waitFor(() => expect(input).toHaveValue('1234,5'));
    await userEvent.keyboard('{Control>}a{/Control}1.234.567,25{Enter}');
    await waitFor(() => expect(valueNow(input)).toBe('1234567.25'));
  },
};

/** `inputmode="numeric"`; a fraction is rejected and reverts on blur. */
export const IntegerOnly: Story = {
  args: {label: 'Guests', value: 3, isIntegerOnly: true},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-number-input');
    const input = canvas.getByRole('spinbutton', {name: 'Guests'});
    await expect(input).toHaveAttribute('inputmode', 'numeric');
    await userEvent.click(input);
    await userEvent.keyboard('{Control>}a{/Control}2.5');
    await userEvent.tab();
    await waitFor(() => expect(valueNow(input)).toBe('3'));
  },
};

/** The clear button empties the field and commits `null`; focus stays in the field. */
export const WithClear: Story = {
  args: {label: 'Tip amount', value: 42, hasClear: true, placeholder: 'None'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-number-input');
    const changes = recordEvents<{value: number | null}>(canvasElement, 'astryx-change');
    const input = canvas.getByRole('spinbutton', {name: 'Tip amount'});
    await userEvent.click(canvas.getByRole('button', {name: /^Clear/}));
    await expect(input).toHaveValue('');
    await expect(input).not.toHaveAttribute('aria-valuenow');
    await expect(input).toHaveFocus();
    await expect(changes.map((e) => e.detail.value)).toEqual([null]);
  },
};

export const WithStartIcon: Story = {args: {label: 'Rating', value: 4, startIcon: 'success'}};

export const Small: Story = {args: {size: 'sm', hasNumberSteppers: true}};

export const Large: Story = {args: {size: 'lg', hasNumberSteppers: true}};

export const Required: Story = {
  args: {isRequired: true},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('spinbutton', {name: /^Quantity/})).toHaveAttribute('aria-required', 'true');
  },
};

/** Error status: the attached message box describes the input, which is `aria-invalid`. */
export const ErrorStatus: Story = {
  args: {value: 0, status: {type: 'error', message: 'Order at least one item'}},
  play: async ({canvas}) => {
    const input = canvas.getByRole('spinbutton', {name: 'Quantity'});
    await expect(input).toBeInvalid();
    await expect(input).toHaveAccessibleDescription('Order at least one item');
  },
};

export const WarningDetached: Story = {args: {value: 40, status: {type: 'warning', message: 'Large orders ship separately'}, statusVariant: 'detached'}};

export const SuccessStatus: Story = {args: {value: 3, status: {type: 'success', message: 'In stock'}}};

/** Keeps its tab stop; keys and steppers change nothing; no `name`. */
export const Disabled: Story = {
  args: {value: 8, htmlName: 'quantity', hasNumberSteppers: true, isDisabled: true},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-number-input');
    const input = canvas.getByRole('spinbutton', {name: 'Quantity'});
    await expect(input).toHaveAttribute('aria-disabled', 'true');
    await expect(input).not.toHaveAttribute('name');
    await userEvent.tab();
    await expect(input).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    await expect(valueNow(input)).toBe('8');
  },
};

/** The reason shows as a tooltip on keyboard focus and describes the input. */
export const DisabledWithMessage: Story = {
  args: {value: 8, isDisabled: true, disabledMessage: 'Locked while the order ships'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-number-input');
    await expect(canvas.getByRole('spinbutton', {name: 'Quantity'})).toHaveAccessibleDescription('Locked while the order ships');
    await userEvent.tab();
    await waitFor(() => expect(isShowing(canvasElement.querySelector('[role="tooltip"]'))).toBe(true));
  },
};

/** Still submitted, but no stepping by any route. */
export const ReadOnly: Story = {
  args: {value: 8, isReadOnly: true, hasNumberSteppers: true},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-number-input');
    const input = canvas.getByRole('spinbutton', {name: 'Quantity'});
    input.focus();
    await userEvent.keyboard('{ArrowUp}');
    await expect(valueNow(input)).toBe('8');
  },
};
