import TextInput from 'astryx-astro/components/TextInput/TextInput.astro';
import Demo from 'astryx-astro/components/TextInput/TextInput.demo.astro';
import demoSource from 'astryx-astro/components/TextInput/TextInput.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, overview, type Meta, type Story} from '../_lib/story';

const meta = {
  title: 'Form Controls/Text Input',
  component: TextInput,
  ...astryx('TextInput'),
  args: {label: 'Display name'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (TextInput.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

type TextHost = HTMLElement & {value: string};

/** Typing reports every edit in `astryx-change`; Enter reports `astryx-enter`. */
export const Default: Story = {
  args: {placeholder: 'Ada Lovelace', htmlName: 'displayName'},
  play: async ({canvas, canvasElement, step}) => {
    const host = await upgraded<TextHost>(canvasElement, 'ax-text-input');
    const changes = recordEvents<{value: string}>(canvasElement, 'astryx-change');
    const enters = recordEvents(canvasElement, 'astryx-enter');
    const input = canvas.getByRole('textbox', {name: 'Display name'});
    await expect(input).toHaveAttribute('name', 'displayName');
    await step('A label click focuses the input', async () => {
      await userEvent.click(canvasElement.querySelector('label')!);
      await expect(input).toHaveFocus();
    });
    await step('Typing reports each edit', async () => {
      await userEvent.keyboard('Ada');
      await expect(changes.map((e) => e.detail.value)).toEqual(['A', 'Ad', 'Ada']);
      await expect(host.value).toBe('Ada');
    });
    await step('Enter reports astryx-enter', async () => {
      await userEvent.keyboard('{Enter}');
      await expect(enters).toHaveLength(1);
    });
  },
};

export const WithValue: Story = {args: {value: 'Ada Lovelace'}};

/** The description describes the input, and clicking it focuses the input like the label. */
export const WithDescription: Story = {
  args: {description: 'Shown on your public profile'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-text-input');
    const input = canvas.getByRole('textbox', {name: 'Display name'});
    await expect(input).toHaveAccessibleDescription('Shown on your public profile');
    await userEvent.click(canvas.getByText('Shown on your public profile'));
    await expect(input).toHaveFocus();
  },
};

/** The clear button ("Clear Display name") shows while there is a value; it empties the input and keeps focus. */
export const WithClear: Story = {
  args: {value: 'Ada Lovelace', hasClear: true},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-text-input');
    const changes = recordEvents<{value: string}>(canvasElement, 'astryx-change');
    const input = canvas.getByRole('textbox', {name: 'Display name'});
    const clear = canvas.getByRole('button', {name: 'Clear Display name'});
    await userEvent.click(clear);
    await expect(input).toHaveValue('');
    await expect(input).toHaveFocus();
    await expect(changes.map((e) => e.detail.value)).toEqual(['']);
    await waitFor(() => expect(clear).not.toBeVisible());
    await userEvent.keyboard('A');
    await waitFor(() => expect(clear).toBeVisible());
  },
};

/** A search box: `type="search"`, a start icon, a hidden label and a clear button. */
export const Search: Story = {
  args: {label: 'Search orders', type: 'search', isLabelHidden: true, startIcon: 'search', placeholder: 'Search orders', hasClear: true, enterKeyHint: 'search', hasAutoCorrect: false},
  play: async ({canvas}) => {
    const input = canvas.getByRole('searchbox', {name: 'Search orders'});
    await expect(input).toHaveAttribute('enterkeyhint', 'search');
    await expect(input).toHaveAttribute('autocorrect', 'off');
  },
};

export const Password: Story = {args: {label: 'Password', type: 'password', value: 'correct horse', autoComplete: 'current-password'}};

export const Small: Story = {args: {size: 'sm', value: 'Ada Lovelace'}};

export const Large: Story = {args: {size: 'lg', value: 'Ada Lovelace'}};

/** `aria-required` (never native `required`) and a "Required" indicator on the label. */
export const Required: Story = {
  args: {isRequired: true},
  play: async ({canvas}) => {
    const input = canvas.getByRole('textbox', {name: /^Display name/});
    await expect(input).toHaveAttribute('aria-required', 'true');
    await expect(input).not.toHaveAttribute('required');
  },
};

export const Optional: Story = {args: {label: 'Middle name', isOptional: true}};

/** An info icon at the end of the label; hovering it shows the help text. */
export const WithLabelTooltip: Story = {
  args: {label: 'Username', labelTooltip: 'Letters, numbers and underscores only'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-text-input');
    const icon = canvasElement.querySelector('[data-ax-label-tip]')!;
    const tip = document.getElementById(icon.getAttribute('data-ax-tooltip')!);
    await userEvent.hover(icon);
    await waitFor(() => expect(isShowing(tip)).toBe(true));
    await expect(tip).toHaveTextContent('Letters, numbers and underscores only');
  },
};

/** Error status, attached: a message box under the control that describes the input, and `aria-invalid`. */
export const ErrorStatus: Story = {
  args: {label: 'Email', type: 'email', value: 'ada@', status: {type: 'error', message: 'Enter a valid email address'}},
  play: async ({canvas}) => {
    const input = canvas.getByRole('textbox', {name: 'Email'});
    await expect(input).toBeInvalid();
    await expect(input).toHaveAccessibleDescription('Enter a valid email address');
  },
};

/** Warning status with `statusVariant="detached"`: the message floats below the control. */
export const WarningDetached: Story = {
  args: {label: 'Email', type: 'email', value: 'ada@example', status: {type: 'warning', message: 'Check the domain'}, statusVariant: 'detached'},
  play: async ({canvas}) => {
    const input = canvas.getByRole('textbox', {name: 'Email'});
    await expect(input).not.toBeInvalid();
    await expect(input).toHaveAccessibleDescription('Check the domain');
  },
};

/** Success status with `statusVariant="tooltip"`: no box; a focusable status icon shows the message. */
export const SuccessTooltip: Story = {
  args: {label: 'Email', type: 'email', value: 'ada@example.com', status: {type: 'success', message: 'Verified'}, statusVariant: 'tooltip'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-text-input');
    const input = canvas.getByRole('textbox', {name: 'Email'});
    const button = canvasElement.querySelector<HTMLElement>('.ax-input-status-button')!;
    const tip = document.getElementById(button.getAttribute('aria-describedby')!);
    await expect(input).toHaveAccessibleDescription('Verified');
    input.focus();
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await waitFor(() => expect(isShowing(tip)).toBe(true));
  },
};

/** Keeps its tab stop: `aria-disabled` + `readonly`, no `name`, typing changes nothing. */
export const Disabled: Story = {
  args: {value: 'Ada Lovelace', htmlName: 'displayName', isDisabled: true},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-text-input');
    const changes = recordEvents(canvasElement, 'astryx-change');
    const input = canvas.getByRole('textbox', {name: 'Display name'});
    await expect(input).toHaveAttribute('aria-disabled', 'true');
    await expect(input).not.toHaveAttribute('name');
    await userEvent.tab();
    await expect(input).toHaveFocus();
    await userEvent.keyboard('x');
    await expect(input).toHaveValue('Ada Lovelace');
    await expect(changes).toHaveLength(0);
  },
};

/** The reason shows as a tooltip on keyboard focus and describes the input. */
export const DisabledWithMessage: Story = {
  args: {value: 'Ada Lovelace', isDisabled: true, disabledMessage: 'You need the Editor role to change this'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-text-input');
    const input = canvas.getByRole('textbox', {name: 'Display name'});
    const tip = canvasElement.querySelector('[role="tooltip"]');
    await expect(input).toHaveAccessibleDescription('You need the Editor role to change this');
    await userEvent.tab();
    await waitFor(() => expect(isShowing(tip)).toBe(true));
  },
};

/** Full opacity, still submitted, not editable. */
export const ReadOnly: Story = {
  args: {value: 'ada.lovelace', label: 'Username', htmlName: 'username', isReadOnly: true},
  play: async ({canvas}) => {
    const input = canvas.getByRole('textbox', {name: 'Username'});
    await expect(input).toHaveAttribute('readonly');
    await expect(input).toHaveAttribute('name', 'username');
    await userEvent.type(input, 'x');
    await expect(input).toHaveValue('ada.lovelace');
  },
};

/** Busy: `aria-busy` and a spinner inside the control. */
export const Loading: Story = {
  args: {value: 'Ada Lovelace', isLoading: true},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('textbox', {name: 'Display name'})).toHaveAttribute('aria-busy', 'true');
  },
};
