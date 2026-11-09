import Switch from 'astryx-astro/components/Switch/Switch.astro';
import Demo from 'astryx-astro/components/Switch/Switch.demo.astro';
import demoSource from 'astryx-astro/components/Switch/Switch.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, overview, type Meta, type Story} from '../_lib/story';

const meta = {
  title: 'Form Controls/Switch',
  component: Switch,
  ...astryx('Switch'),
  args: {label: 'Enable notifications', value: false},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Switch.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

type SwitchHost = HTMLElement & {checked: boolean};
type Change = {isChecked: boolean; event: Event};

/** A click on the label turns it on, Space turns it off; each user toggle reports `astryx-change`. */
export const Default: Story = {
  args: {htmlName: 'notify'},
  play: async ({canvas, canvasElement, step}) => {
    const host = await upgraded<SwitchHost>(canvasElement, 'ax-switch');
    const changes = recordEvents<Change>(canvasElement, 'astryx-change');
    const control = canvas.getByRole('switch', {name: 'Enable notifications'});
    await expect(control).toHaveAttribute('name', 'notify');
    await step('A label click turns it on', async () => {
      await userEvent.click(canvasElement.querySelector('label')!);
      await expect(control).toBeChecked();
      await expect(host.checked).toBe(true);
    });
    await step('Space on the focused switch turns it off', async () => {
      control.focus();
      await userEvent.keyboard(' ');
      await expect(control).not.toBeChecked();
    });
    await expect(changes.map((e) => e.detail.isChecked)).toEqual([true, false]);
  },
};

export const On: Story = {args: {value: true}};

export const Small: Story = {args: {size: 'sm', value: true}};

/** The description describes the switch. */
export const WithDescription: Story = {
  args: {label: 'Dark mode', description: 'Use a darker color scheme'},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('switch', {name: 'Dark mode'})).toHaveAccessibleDescription('Use a darker color scheme');
  },
};

/** `labelPosition="start"`: the label precedes the switch. */
export const LabelStart: Story = {args: {labelPosition: 'start', value: true}};

/** `labelSpacing="spread"`: label and switch at opposite ends of a fixed-width row. */
export const LabelSpread: Story = {args: {labelSpacing: 'spread', width: 320}};

export const LabelStartSpread: Story = {args: {labelPosition: 'start', labelSpacing: 'spread', width: 320, value: true}};

/** The label stays in the markup for screen readers. */
export const LabelHidden: Story = {
  args: {isLabelHidden: true},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('switch', {name: 'Enable notifications'})).toBeInTheDocument();
  },
};

export const WithLabelIcon: Story = {args: {label: 'Backups', labelIcon: 'success', value: true}};

/** An info icon at the end of the label; hovering it shows the help text. */
export const WithLabelTooltip: Story = {
  args: {label: 'Auto-save', labelTooltip: 'Saves a draft every 30 seconds', value: true},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-switch');
    const icon = canvasElement.querySelector('[data-ax-label-tip]')!;
    const tip = canvasElement.querySelector('[role="tooltip"]');
    await userEvent.hover(icon);
    await waitFor(() => expect(isShowing(tip)).toBe(true));
    await expect(tip).toHaveTextContent('Saves a draft every 30 seconds');
    await userEvent.unhover(icon);
    await waitFor(() => expect(isShowing(tip)).toBe(false));
  },
};

/** Native `required` plus `aria-required`; `aria-invalid` stays false without an error. */
export const Required: Story = {
  args: {label: 'Two-factor authentication', isRequired: true},
  play: async ({canvas}) => {
    const control = canvas.getByRole('switch', {name: /^Two-factor authentication/});
    await expect(control).toBeRequired();
    await expect(control).toHaveAttribute('aria-required', 'true');
    await expect(control).toHaveAttribute('aria-invalid', 'false');
  },
};

export const Optional: Story = {args: {label: 'Weekly digest', isOptional: true}};

/** An error status: a detached message below the switch that describes it, and `aria-invalid`. */
export const ErrorStatus: Story = {
  args: {label: 'Two-factor authentication', status: {type: 'error', message: 'Two-factor authentication is required for admins'}},
  play: async ({canvas}) => {
    const control = canvas.getByRole('switch', {name: 'Two-factor authentication'});
    await expect(control).toBeInvalid();
    await expect(control).toHaveAccessibleDescription('Two-factor authentication is required for admins');
  },
};

export const WarningStatus: Story = {args: {label: 'Public links', value: true, status: {type: 'warning', message: 'Public links can be shared outside your team'}}};

export const SuccessStatus: Story = {args: {label: 'Backups', value: true, status: {type: 'success', message: 'Backups are on'}}};

/** Keeps its tab stop (`aria-disabled`), leaves the form, and ignores clicks and Space. */
export const Disabled: Story = {
  args: {htmlName: 'notify', isDisabled: true},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-switch');
    const changes = recordEvents(canvasElement, 'astryx-change');
    const control = canvas.getByRole('switch', {name: 'Enable notifications'});
    await expect(control).toHaveAttribute('aria-disabled', 'true');
    await expect(control).not.toHaveAttribute('name');
    await expect(control).toHaveAttribute('form', '');
    await userEvent.tab();
    await expect(control).toHaveFocus();
    await userEvent.keyboard(' ');
    await userEvent.click(control);
    await expect(control).not.toBeChecked();
    await expect(changes).toHaveLength(0);
  },
};

/** The reason shows as a tooltip on keyboard focus (and row hover) and describes the switch. */
export const DisabledWithMessage: Story = {
  args: {label: 'Screen sharing', value: true, isDisabled: true, disabledMessage: 'Turned off org-wide'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-switch');
    const control = canvas.getByRole('switch', {name: 'Screen sharing'});
    const tip = canvasElement.querySelector('[role="tooltip"]');
    await expect(control).toHaveAccessibleDescription('Turned off org-wide');
    await userEvent.tab();
    await expect(control).toHaveFocus();
    await waitFor(() => expect(isShowing(tip)).toBe(true));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(tip)).toBe(false));
  },
};

/** Busy: a spinner in the thumb and `aria-busy`; the pointer passes through and Space is blocked. */
export const Loading: Story = {
  args: {isLoading: true},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-switch');
    const changes = recordEvents(canvasElement, 'astryx-change');
    const control = canvas.getByRole('switch', {name: 'Enable notifications'});
    await expect(control).toHaveAttribute('aria-busy', 'true');
    await userEvent.tab();
    await expect(control).toHaveFocus();
    await userEvent.keyboard(' ');
    await expect(control).not.toBeChecked();
    await expect(changes).toHaveLength(0);
  },
};
