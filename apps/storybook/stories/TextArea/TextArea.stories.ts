import TextArea from 'astryx-astro/components/TextArea/TextArea.astro';
import Demo from 'astryx-astro/components/TextArea/TextArea.demo.astro';
import demoSource from 'astryx-astro/components/TextArea/TextArea.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, overview, type Meta, type Story} from '../_lib/story';

const meta = {
  title: 'Form Controls/Text Area',
  component: TextArea,
  ...astryx('TextArea'),
  args: {label: 'Bio'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (TextArea.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

type TextAreaHost = HTMLElement & {value: string};

/** Every edit reports `astryx-change`; Enter adds a line instead of submitting. */
export const Default: Story = {
  args: {placeholder: 'A few words about you', htmlName: 'bio'},
  play: async ({canvas, canvasElement}) => {
    const host = await upgraded<TextAreaHost>(canvasElement, 'ax-text-area');
    const changes = recordEvents<{value: string}>(canvasElement, 'astryx-change');
    const textarea = canvas.getByRole('textbox', {name: 'Bio'});
    await expect(textarea).toHaveAttribute('name', 'bio');
    await userEvent.click(canvasElement.querySelector('label')!);
    await expect(textarea).toHaveFocus();
    await userEvent.keyboard('Hi{Enter}there');
    await expect(textarea).toHaveValue('Hi\nthere');
    await expect(host.value).toBe('Hi\nthere');
    await expect(changes.at(-1)?.detail.value).toBe('Hi\nthere');
  },
};

export const WithValue: Story = {args: {value: 'Mathematician and writer, known for her notes on the Analytical Engine.'}};

/** The description describes the textarea; clicking it focuses the textarea. */
export const WithDescription: Story = {
  args: {description: 'Shown on your public profile'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-text-area');
    const textarea = canvas.getByRole('textbox', {name: 'Bio'});
    await expect(textarea).toHaveAccessibleDescription('Shown on your public profile');
    await userEvent.click(canvas.getByText('Shown on your public profile'));
    await expect(textarea).toHaveFocus();
  },
};

/**
 * `maxLength` shows a grapheme-aware `count/limit` counter that describes the textarea. It does
 * not enforce the limit: past it the counter turns to an error and the textarea is `aria-invalid`.
 */
export const WithCounter: Story = {
  args: {label: 'Status', value: 'Out of office until Monday', maxLength: 30},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-text-area');
    const textarea = canvas.getByRole('textbox', {name: 'Status'});
    await expect(textarea).toHaveAccessibleDescription('26/30');
    await expect(textarea).not.toBeInvalid();
    await userEvent.click(textarea);
    await userEvent.keyboard('{End}, back on 12th');
    await waitFor(() => expect(textarea).toHaveAccessibleDescription('40/30'));
    await expect(textarea).toBeInvalid();
    await expect(textarea).toHaveValue('Out of office until Monday, back on 12th');
  },
};

/** A value already over the limit renders the error counter and `aria-invalid`. */
export const OverLimit: Story = {
  args: {label: 'Status', value: 'Travelling to the conference this week', maxLength: 20},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('textbox', {name: 'Status'})).toBeInvalid();
  },
};

/** Height comes from `rows`. */
export const SixRows: Story = {args: {rows: 6}};

export const WithStartIcon: Story = {args: {label: 'Message', startIcon: 'info', placeholder: 'Write a message'}};

export const Small: Story = {args: {size: 'sm', value: 'Small padding'}};

/** Large adds block padding; the height still comes from `rows`. */
export const Large: Story = {args: {size: 'lg', value: 'Large padding'}};

export const Required: Story = {
  args: {isRequired: true},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('textbox', {name: /^Bio/})).toHaveAttribute('aria-required', 'true');
  },
};

export const Optional: Story = {args: {isOptional: true}};

/** Error status: the attached message box describes the textarea, which is `aria-invalid`. */
export const ErrorStatus: Story = {
  args: {value: 'TBD', status: {type: 'error', message: 'Write at least 20 characters'}},
  play: async ({canvas}) => {
    const textarea = canvas.getByRole('textbox', {name: 'Bio'});
    await expect(textarea).toBeInvalid();
    await expect(textarea).toHaveAccessibleDescription('Write at least 20 characters');
  },
};

export const WarningStatus: Story = {args: {value: 'Call me at 555-0100', status: {type: 'warning', message: 'Your bio is public: avoid phone numbers'}}};

/** Success status shown through the status icon's tooltip (`statusVariant="tooltip"`). */
export const SuccessTooltip: Story = {args: {value: 'Mathematician and writer.', status: {type: 'success', message: 'Saved'}, statusVariant: 'tooltip'}};

/** Keeps its tab stop: `aria-disabled` + `readonly`, no `name`, typing changes nothing. */
export const Disabled: Story = {
  args: {value: 'Mathematician and writer.', htmlName: 'bio', isDisabled: true},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-text-area');
    const textarea = canvas.getByRole('textbox', {name: 'Bio'});
    await expect(textarea).toHaveAttribute('aria-disabled', 'true');
    await expect(textarea).not.toHaveAttribute('name');
    await userEvent.tab();
    await expect(textarea).toHaveFocus();
    await userEvent.keyboard('x');
    await expect(textarea).toHaveValue('Mathematician and writer.');
  },
};

/** The reason shows as a tooltip on keyboard focus and describes the textarea. */
export const DisabledWithMessage: Story = {
  args: {value: 'Mathematician and writer.', isDisabled: true, disabledMessage: 'Bios are locked during review'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-text-area');
    const textarea = canvas.getByRole('textbox', {name: 'Bio'});
    await expect(textarea).toHaveAccessibleDescription('Bios are locked during review');
    await userEvent.tab();
    await waitFor(() => expect(isShowing(canvasElement.querySelector('[role="tooltip"]'))).toBe(true));
  },
};

export const ReadOnly: Story = {
  args: {value: 'Mathematician and writer.', isReadOnly: true},
  play: async ({canvas}) => {
    const textarea = canvas.getByRole('textbox', {name: 'Bio'});
    await userEvent.type(textarea, 'x');
    await expect(textarea).toHaveValue('Mathematician and writer.');
  },
};

export const Loading: Story = {
  args: {value: 'Mathematician and writer.', isLoading: true},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('textbox', {name: 'Bio'})).toHaveAttribute('aria-busy', 'true');
  },
};
