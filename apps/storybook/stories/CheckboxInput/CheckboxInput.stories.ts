import CheckboxInput from 'astryx-astro/components/CheckboxInput/CheckboxInput.astro';
import Demo from 'astryx-astro/components/CheckboxInput/CheckboxInput.demo.astro';
import demoSource from 'astryx-astro/components/CheckboxInput/CheckboxInput.demo.astro?raw';
import {expect, fn, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, overview, type Meta, type Story} from '../_lib/story';

const meta = {
  title: 'Form Controls/Checkbox Input',
  component: CheckboxInput,
  ...astryx('CheckboxInput'),
  args: {label: 'Accept terms', value: false},
} satisfies Meta;
export default meta;

/** Every example from the docs page (CheckboxInput.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

type CheckboxHost = HTMLElement & {checked: boolean; value: boolean | 'indeterminate'};
type Change = {isChecked: boolean; event: Event};

/** A click on the label checks it, Space unchecks it; each user toggle reports `astryx-change`. */
export const Default: Story = {
  args: {htmlName: 'terms'},
  play: async ({canvas, canvasElement, step}) => {
    const host = await upgraded<CheckboxHost>(canvasElement, 'ax-checkbox-input');
    const changes = recordEvents<Change>(canvasElement, 'astryx-change');
    const box = canvas.getByRole('checkbox', {name: 'Accept terms'});
    await expect(box).toHaveAttribute('name', 'terms');
    await step('A label click checks it', async () => {
      await userEvent.click(canvasElement.querySelector('label')!);
      await expect(box).toBeChecked();
      await expect(host.checked).toBe(true);
    });
    await step('Space on the focused checkbox unchecks it', async () => {
      box.focus();
      await userEvent.keyboard(' ');
      await expect(box).not.toBeChecked();
    });
    await expect(changes.map((e) => e.detail.isChecked)).toEqual([true, false]);
    await expect(changes[0].detail.event.type).toBe('change');
  },
};

export const Checked: Story = {args: {value: true}};

/** The mixed state lives on the native `indeterminate` property (no `aria-checked`); a click checks it. */
export const Indeterminate: Story = {
  args: {label: 'Select all regions', value: 'indeterminate'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-checkbox-input');
    const changes = recordEvents<Change>(canvasElement, 'astryx-change');
    const box = canvas.getByRole('checkbox', {name: 'Select all regions'}) as HTMLInputElement;
    await expect(box).toBePartiallyChecked();
    await expect(box).not.toHaveAttribute('aria-checked');
    await userEvent.click(box);
    await expect(box.indeterminate).toBe(false);
    await expect(box).toBeChecked();
    await expect(changes.map((e) => e.detail.isChecked)).toEqual([true]);
  },
};

export const Small: Story = {args: {size: 'sm', value: true}};

/** The description describes the checkbox, and clicking it toggles the box like the label. */
export const WithDescription: Story = {
  args: {label: 'Share usage data', description: 'Anonymous crash reports and feature usage', value: true},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-checkbox-input');
    const box = canvas.getByRole('checkbox', {name: 'Share usage data'});
    await expect(box).toHaveAccessibleDescription('Anonymous crash reports and feature usage');
    await userEvent.click(canvas.getByText('Anonymous crash reports and feature usage'));
    await expect(box).not.toBeChecked();
  },
};

export const WithLabelIcon: Story = {args: {label: 'Starred', labelIcon: 'success', value: true}};

/** The label stays in the markup for screen readers. */
export const LabelHidden: Story = {
  args: {label: 'Select row', isLabelHidden: true},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('checkbox', {name: 'Select row'})).toBeInTheDocument();
  },
};

/** Native `required` plus `aria-required`, and a "Required" indicator on the label. */
export const Required: Story = {
  args: {isRequired: true},
  play: async ({canvas}) => {
    const box = canvas.getByRole('checkbox', {name: /^Accept terms/});
    await expect(box).toBeRequired();
    await expect(box).toHaveAttribute('aria-required', 'true');
  },
};

export const Optional: Story = {args: {label: 'Email me product news', isOptional: true, value: true}};

/** An error status: a detached message below the box that describes it, and `aria-invalid`. */
export const ErrorStatus: Story = {
  args: {status: {type: 'error', message: 'You must accept the terms to continue'}},
  play: async ({canvas}) => {
    const box = canvas.getByRole('checkbox', {name: 'Accept terms'});
    await expect(box).toBeInvalid();
    await expect(box).toHaveAccessibleDescription('You must accept the terms to continue');
  },
};

/** A warning describes the box but does not make it invalid. */
export const WarningStatus: Story = {
  args: {label: 'Send marketing email', value: true, status: {type: 'warning', message: 'Marketing email may land in your spam folder'}},
  play: async ({canvas}) => {
    const box = canvas.getByRole('checkbox', {name: 'Send marketing email'});
    await expect(box).not.toBeInvalid();
    await expect(box).toHaveAccessibleDescription('Marketing email may land in your spam folder');
  },
};

export const SuccessStatus: Story = {args: {label: 'Save preferences', value: true, status: {type: 'success', message: 'Preferences saved'}}};

/** Keeps its tab stop (`aria-disabled`), leaves the form, and ignores clicks, label clicks and Space. */
export const Disabled: Story = {
  args: {htmlName: 'terms', isDisabled: true},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-checkbox-input');
    const changes = recordEvents(canvasElement, 'astryx-change');
    const box = canvas.getByRole('checkbox', {name: 'Accept terms'});
    await expect(box).toHaveAttribute('aria-disabled', 'true');
    await expect(box).not.toHaveAttribute('name');
    await expect(box).toHaveAttribute('form', '');
    await userEvent.tab();
    await expect(box).toHaveFocus();
    await userEvent.keyboard(' ');
    await userEvent.click(box);
    await userEvent.click(canvasElement.querySelector('label')!);
    await expect(box).not.toBeChecked();
    await expect(changes).toHaveLength(0);
  },
};

/** The reason shows as a tooltip when the row is hovered or the box takes keyboard focus, and describes the box. */
export const DisabledWithMessage: Story = {
  args: {label: 'Share usage data', value: true, isDisabled: true, disabledMessage: 'Managed by your administrator'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-checkbox-input');
    const box = canvas.getByRole('checkbox', {name: 'Share usage data'});
    const tip = canvasElement.querySelector('[role="tooltip"]');
    await expect(box).toHaveAccessibleDescription('Managed by your administrator');
    await userEvent.tab();
    await expect(box).toHaveFocus();
    await waitFor(() => expect(isShowing(tip)).toBe(true));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(tip)).toBe(false));
  },
};

/** Full opacity and `aria-readonly`; clicks and Space leave it as it is. */
export const ReadOnly: Story = {
  args: {value: true, isReadOnly: true},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-checkbox-input');
    const changes = recordEvents(canvasElement, 'astryx-change');
    const box = canvas.getByRole('checkbox', {name: 'Accept terms'});
    await expect(box).toHaveAttribute('aria-readonly', 'true');
    await userEvent.click(box);
    box.focus();
    await userEvent.keyboard(' ');
    await expect(box).toBeChecked();
    await expect(changes).toHaveLength(0);
  },
};

/** Busy: a spinner in the box and `aria-busy`; toggling is blocked. */
export const Loading: Story = {
  args: {isLoading: true},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-checkbox-input');
    const box = canvas.getByRole('checkbox', {name: 'Accept terms'});
    const onChange = fn();
    canvasElement.addEventListener('astryx-change', onChange);
    await expect(box).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(box);
    await expect(box).not.toBeChecked();
    await expect(onChange).not.toHaveBeenCalled();
  },
};

export const FixedWidth: Story = {args: {label: 'Remember this device for 30 days', width: 180}};
