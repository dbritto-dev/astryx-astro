import InputGroup from 'astryx-astro/components/InputGroup/InputGroup.astro';
import Demo from 'astryx-astro/components/InputGroup/InputGroup.demo.astro';
import demoSource from 'astryx-astro/components/InputGroup/InputGroup.demo.astro?raw';
import {expect, fn, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta} from '../_lib/story';
import InputGroupStory from './InputGroupStory.astro';
import storySource from './InputGroupStory.astro?raw';

const meta = {
  title: 'Form Controls/Input Group',
  component: InputGroup,
  ...astryx('InputGroup'),
  args: {label: 'Website'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (InputGroup.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {
  controls: ['label', 'description', 'size', 'status', 'isLabelHidden', 'isDisabled', 'isRequired', 'isOptional', 'labelTooltip', 'addons'],
  source: storySource,
};

/**
 * A text prefix and a TextInput in one bordered row. The row is a `role="group"` named by the
 * group label; the input is named "<group label> <own label>" and described by the group's
 * description, and keeps its own behaviour (typing, the clear button).
 */
export const Default = composed(InputGroupStory, {
  args: {description: 'Your public homepage'},
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-text-input');
    const changes = recordEvents<{value: string}>(canvasElement, 'astryx-change');
    const group = canvas.getByRole('group', {name: 'Website'});
    await expect(group).toHaveAccessibleDescription('Your public homepage');
    const input = canvas.getByRole('textbox', {name: 'Website Domain'});
    await expect(input).toHaveAccessibleDescription('Your public homepage');
    await step('The member input edits and clears as on its own', async () => {
      await userEvent.click(canvas.getByRole('button', {name: /^Clear/}));
      await expect(input).toHaveValue('');
      await expect(input).toHaveFocus();
      await userEvent.keyboard('ada.dev');
      await expect(changes.at(-1)?.detail.value).toBe('ada.dev');
    });
  },
}, options);

/** Text addons on both sides of a NumberInput, which keeps its keyboard stepping. */
export const NumberAddons = composed(InputGroupStory, {
  args: {addons: 'number', label: 'Price'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-number-input');
    const input = canvas.getByRole('spinbutton', {name: 'Price Amount in USD'});
    input.focus();
    await userEvent.keyboard('{ArrowUp}');
    await expect(input).toHaveAttribute('aria-valuenow', '13');
  },
}, options);

/** A Button addon joins the row and stays a normal button. */
export const ButtonAddon = composed(InputGroupStory, {
  args: {addons: 'buttons', label: 'Search orders'},
  play: async ({canvas}) => {
    const onClick = fn();
    const button = canvas.getByRole('button', {name: 'Search'});
    button.addEventListener('click', onClick);
    await expect(canvas.getByRole('textbox', {name: 'Search orders Query'})).toBeInTheDocument();
    await userEvent.click(button);
    await expect(onClick).toHaveBeenCalledOnce();
  },
}, options);

/** `size` is stamped on every member (input and Button). */
export const Small = composed(InputGroupStory, {args: {addons: 'buttons', label: 'Search orders', size: 'sm'}}, options);

export const Large = composed(InputGroupStory, {args: {addons: 'buttons', label: 'Search orders', size: 'lg'}}, options);

/** The group label is visually hidden and still names the group and the input. */
export const LabelHidden = composed(InputGroupStory, {
  args: {isLabelHidden: true},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('textbox', {name: 'Website Domain'})).toBeInTheDocument();
  },
}, options);

/** An info icon at the end of the group label; hovering it shows the help text. */
export const WithLabelTooltip = composed(InputGroupStory, {
  args: {labelTooltip: 'Without the trailing slash'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-text-input');
    const icon = canvasElement.querySelector('[data-ax-label-tip]')!;
    const tip = document.getElementById(icon.getAttribute('data-ax-tooltip')!);
    await userEvent.hover(icon);
    await waitFor(() => expect(isShowing(tip)).toBe(true));
    await expect(tip).toHaveTextContent('Without the trailing slash');
    await userEvent.unhover(icon);
    await waitFor(() => expect(isShowing(tip)).toBe(false));
  },
}, options);

export const Required = composed(InputGroupStory, {args: {addons: 'number', label: 'Price', isRequired: true}}, options);

export const Optional = composed(InputGroupStory, {args: {addons: 'number', label: 'Price', isOptional: true}}, options);

/**
 * An error status: the group carries the status, the detached message describes the member
 * input, which is `aria-invalid`; the member draws no status icon of its own.
 */
export const ErrorStatus = composed(InputGroupStory, {
  args: {status: {type: 'error', message: 'This domain is already taken'}},
  play: async ({canvas}) => {
    const input = canvas.getByRole('textbox', {name: 'Website Domain'});
    await expect(input).toBeInvalid();
    await expect(input).toHaveAccessibleDescription('This domain is already taken');
  },
}, options);

export const WarningStatus = composed(InputGroupStory, {args: {addons: 'number', label: 'Price', status: {type: 'warning', message: 'Above your usual order value'}}}, options);

export const SuccessStatus = composed(InputGroupStory, {args: {status: {type: 'success', message: 'Domain verified'}}}, options);

/**
 * The row is `aria-disabled`; the member input is `aria-disabled` and read-only (still
 * focusable), loses its name and clear button, and Button addons are disabled.
 */
export const Disabled = composed(InputGroupStory, {
  args: {addons: 'buttons', label: 'Search orders', isDisabled: true, description: 'Search is paused during maintenance'},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('group', {name: 'Search orders'})).toHaveAttribute('aria-disabled', 'true');
    const input = canvas.getByRole('textbox', {name: 'Search orders Query'});
    await expect(input).toHaveAttribute('aria-disabled', 'true');
    await userEvent.type(input, 'x');
    await expect(input).toHaveValue('');
    await expect(canvas.getByRole('button', {name: 'Search'})).toBeDisabled();
  },
}, options);
