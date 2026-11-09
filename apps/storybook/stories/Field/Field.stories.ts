import Field from 'astryx-astro/components/Field/Field.astro';
import Demo from 'astryx-astro/components/Field/Field.demo.astro';
import demoSource from 'astryx-astro/components/Field/Field.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import FieldHorizontalLabels from './FieldHorizontalLabels.astro';
import horizontalSource from './FieldHorizontalLabels.astro?raw';

// Field wraps a control it does not render: each story passes a native input in the default
// slot (raw HTML) and wires `id` / `aria-describedby` itself, as a custom control would. Every
// story has its own ids, so the docs page (all stories on one page) keeps them unique.
const native = 'box-sizing:border-box;width:100%;height:var(--size-element-md);padding:0 var(--spacing-2);border:var(--border-width) solid var(--color-border-emphasized);border-radius:var(--radius-element);background:var(--color-background-surface);color:var(--color-text-primary);font:inherit;font-size:var(--text-body-size);position:relative;z-index:1';
const email = (id: string, attrs = '') => `<input id="${id}" type="email" placeholder="you@example.com" style="${native}"${attrs ? ` ${attrs}` : ''}>`;
/** Args for a Field around an email input with id `id`; `attrs` are extra input attributes. */
const field = (id: string, args: Record<string, unknown> = {}, attrs = '') => ({inputID: id, slots: {default: email(id, attrs)}, ...args});

const meta = {
  title: 'Form Controls/Field',
  component: Field,
  ...astryx('Field'),
  args: {label: 'Email address', width: 320, ...field('story-field-email')},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Field.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/** The label names the control (`for`); the description describes it and a click on it focuses the control. */
export const Default: Story = {
  args: field('story-field-default', {description: 'We never share your email'}, 'aria-describedby="story-field-default-desc"'),
  play: async ({canvas}) => {
    const input = canvas.getByRole('textbox', {name: 'Email address'});
    await expect(input).toHaveAccessibleDescription('We never share your email');
    await userEvent.click(canvas.getByText('We never share your email'));
    await expect(input).toHaveFocus();
  },
};

export const Required: Story = {args: field('story-field-required', {isRequired: true}, 'aria-required="true"')};

export const Optional: Story = {args: field('story-field-optional', {isOptional: true})};

/** Label and description are visually hidden and still name and describe the control. */
export const LabelHidden: Story = {
  args: field('story-field-hidden', {isLabelHidden: true, description: 'Work address preferred'}, 'aria-describedby="story-field-hidden-desc"'),
  play: async ({canvas}) => {
    await expect(canvas.getByRole('textbox', {name: 'Email address'})).toHaveAccessibleDescription('Work address preferred');
  },
};

export const WithLabelIcon: Story = {args: field('story-field-icon', {label: 'Due date', labelIcon: 'calendar'})};

/** An info icon at the end of the label; hovering it shows the help text, which stays out of the control's name. */
export const WithLabelTooltip: Story = {
  args: field('story-field-tip', {labelTooltip: 'Used for receipts only'}),
  play: async ({canvas, canvasElement}) => {
    await expect(canvas.getByRole('textbox', {name: 'Email address'})).toBeInTheDocument();
    const icon = canvasElement.querySelector('[data-ax-label-tip]')!;
    const tip = document.getElementById(icon.getAttribute('data-ax-tooltip')!);
    await userEvent.hover(icon);
    await waitFor(() => expect(isShowing(tip)).toBe(true));
    await expect(tip).toHaveTextContent('Used for receipts only');
  },
};

/** `statusVariant="attached"` (default): the message box sits under the control, id `${inputID}-status`. */
export const AttachedStatus: Story = {
  args: field('story-field-error', {status: {type: 'error', message: 'Enter a valid email address'}}, 'value="ada@" aria-invalid="true" aria-describedby="story-field-error-status"'),
  play: async ({canvas}) => {
    const input = canvas.getByRole('textbox', {name: 'Email address'});
    await expect(input).toHaveAccessibleDescription('Enter a valid email address');
  },
};

/** `statusVariant="detached"`: the message floats below the control with its icon. */
export const DetachedStatus: Story = {
  args: field('story-field-warning', {status: {type: 'warning', message: 'Check the domain'}, statusVariant: 'detached'}, 'value="ada@example" aria-describedby="story-field-warning-status"'),
};

/**
 * `statusVariant="tooltip"`: no message box (the control shows the status). Field still speaks
 * the message through the page's polite live region, and again when it changes.
 */
export const TooltipStatus: Story = {
  args: field('story-field-success', {status: {type: 'success', message: 'Verified'}, statusVariant: 'tooltip'}, 'value="ada@example.com"'),
  play: async ({canvasElement}) => {
    await expect(canvasElement.querySelector('.astryx-field-status')).toBeNull();
    const announcer = canvasElement.querySelector<HTMLElement>('[data-ax-field-status][hidden]')!;
    announcer.textContent = 'Verified just now';
    await waitFor(() => expect(document.querySelector('[data-astryx-live-region="polite"]')).toHaveTextContent('Verified just now'));
  },
};

export const Disabled: Story = {args: field('story-field-disabled', {isDisabled: true}, 'value="ada@example.com" disabled')};

/**
 * `isGroupLabel`: the label is a `<span id>` (no `for`) that names a group of controls through
 * `aria-labelledby`.
 */
export const GroupLabel: Story = {
  args: {
    label: 'Plan',
    inputID: 'story-field-plan',
    labelID: 'story-field-plan-label',
    isGroupLabel: true,
    isRequired: true,
    description: 'Billed monthly',
    descriptionID: 'story-field-plan-desc',
    slots: {
      default: '<div role="radiogroup" aria-labelledby="story-field-plan-label" aria-describedby="story-field-plan-desc" style="display:flex;gap:var(--spacing-3)">'
        + '<label><input type="radio" name="story-field-plan" value="starter" checked> Starter</label>'
        + '<label><input type="radio" name="story-field-plan" value="team"> Team</label></div>',
    },
  },
  play: async ({canvas, canvasElement}) => {
    const group = canvas.getByRole('radiogroup', {name: /^Plan/});
    await expect(group).toHaveAccessibleDescription('Billed monthly');
    const label = canvasElement.querySelector('#story-field-plan-label')!;
    await expect(label.tagName).toBe('SPAN');
    await expect(label).not.toHaveAttribute('for');
  },
};

/** In a FormLayout with horizontal labels: the label sits beside the control (`data-layout` theme hook). */
export const HorizontalLabels = composed(FieldHorizontalLabels, {
  play: async ({canvas, canvasElement}) => {
    const input = canvas.getByRole('textbox', {name: /^Project/});
    await expect(input).toHaveAccessibleDescription('Shown in the sidebar');
    const field = input.closest('.astryx-field')!;
    await expect(field).toHaveAttribute('data-layout', 'horizontal-labels');
    const label = canvasElement.querySelector('label[for="story-hl-project"]')!.getBoundingClientRect();
    await expect(label.right).toBeLessThanOrEqual(input.getBoundingClientRect().left);
  },
}, {source: horizontalSource});
