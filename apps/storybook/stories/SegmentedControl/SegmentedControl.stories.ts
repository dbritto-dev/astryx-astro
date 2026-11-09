import SegmentedControl from 'astryx-astro/components/SegmentedControl/SegmentedControl.astro';
import Demo from 'astryx-astro/components/SegmentedControl/SegmentedControl.demo.astro';
import demoSource from 'astryx-astro/components/SegmentedControl/SegmentedControl.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, frame, overview, type Meta} from '../_lib/story';
import SegmentedControlStory from './SegmentedControlStory.astro';
import storySource from './SegmentedControlStory.astro?raw';

const meta = {
  title: 'Action/Segmented Control',
  component: SegmentedControl,
  ...astryx('SegmentedControl'),
  // Every story renders SegmentedControlStory; each segment set picks its own label and value.
  args: {label: 'Period'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (SegmentedControl.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {controls: ['value', 'size', 'layout', 'isDisabled', 'disabledMessage', 'items', 'dir'], source: storySource};

type Control = HTMLElement & {value: string};
const checked = (root: Element) => [...root.querySelectorAll('[role="radio"][aria-checked="true"]')].map((s) => s.getAttribute('data-value'));
const stops = (root: Element) => [...root.querySelectorAll('[role="radio"][tabindex="0"]')].map((s) => s.getAttribute('data-value'));

/**
 * One Tab stop on the selected segment; arrows (wrapping), Home and End move and select
 * (selection follows focus); a click selects; each user selection dispatches `astryx-change`
 * `{value}`, which `preventDefault()` vetoes; setting `el.value` selects without an event.
 */
export const Default = composed(SegmentedControlStory, {
  play: async ({canvas, canvasElement, step}) => {
    const control = await upgraded<Control>(canvasElement, 'ax-segmented-control');
    const changes = recordEvents<{value: string}>(canvasElement, 'astryx-change');
    const radio = (name: string) => canvas.getByRole('radio', {name});

    await step('The value is checked and holds the only tab stop', async () => {
      await expect(canvas.getByRole('radiogroup', {name: 'Period'})).toBe(control);
      await expect(radio('Week')).toHaveAttribute('aria-checked', 'true');
      await expect(stops(control)).toEqual(['week']);
    });

    await step('Tab enters on the selected segment and shows the keyboard hint', async () => {
      await userEvent.tab();
      await expect(radio('Week')).toHaveFocus();
      const hint = control.querySelector('[data-ax-keyboard-hint]');
      await waitFor(() => expect(isShowing(hint)).toBe(true));
      await userEvent.keyboard('{ArrowRight}');
      await waitFor(() => expect(isShowing(hint)).toBe(false));
    });

    await step('Arrows, Home and End select as focus moves', async () => {
      await expect(radio('Month')).toHaveFocus();
      await expect(checked(control)).toEqual(['month']);
      await expect(stops(control)).toEqual(['month']);
      await userEvent.keyboard('{End}');
      await expect(checked(control)).toEqual(['year']);
      await userEvent.keyboard('{ArrowRight}');
      await expect(radio('Day')).toHaveFocus();
      await expect(checked(control)).toEqual(['day']);
      await userEvent.keyboard('{ArrowLeft}');
      await expect(checked(control)).toEqual(['year']);
      await userEvent.keyboard('{Home}');
      await expect(checked(control)).toEqual(['day']);
      await expect(changes.map((e) => e.detail.value)).toEqual(['month', 'year', 'day', 'year', 'day']);
    });

    await step('A click selects', async () => {
      await userEvent.click(radio('Month'));
      await expect(checked(control)).toEqual(['month']);
      await expect(changes.at(-1)?.detail.value).toBe('month');
    });

    await step('preventDefault() on astryx-change keeps the current value', async () => {
      control.addEventListener('astryx-change', (event) => event.preventDefault(), {once: true});
      await userEvent.click(radio('Year'));
      await expect(checked(control)).toEqual(['month']);
      await expect(control.value).toBe('month');
    });

    await step('Setting el.value selects without an event', async () => {
      const before = changes.length;
      control.value = 'day';
      await expect(checked(control)).toEqual(['day']);
      await expect(changes.length).toBe(before);
    });
  },
}, options);

export const Small = composed(SegmentedControlStory, {args: {size: 'sm'}}, options);

export const Large = composed(SegmentedControlStory, {args: {size: 'lg'}}, options);

/** `layout="fill"` stretches the segments equally across the container. */
export const Fill = composed(SegmentedControlStory, {args: {layout: 'fill', items: 'plans'}, decorators: [frame({width: 420})]}, options);

/** Icons before the labels, with a disabled segment: arrows skip it and a click on it selects nothing. */
export const WithIcons = composed(SegmentedControlStory, {
  args: {items: 'icons'},
  play: async ({canvas, canvasElement}) => {
    const control = await upgraded(canvasElement, 'ax-segmented-control');
    const calendar = canvas.getByRole('radio', {name: 'Calendar'});
    await expect(calendar).toHaveAttribute('aria-disabled', 'true');
    canvas.getByRole('radio', {name: 'Grid'}).focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(canvas.getByRole('radio', {name: 'List'})).toHaveFocus();
    await expect(checked(control)).toEqual(['list']);
    calendar.click();
    await expect(checked(control)).toEqual(['list']);
  },
}, options);

/** Icon-only segments: `label` is each segment's name, shown as a tooltip on hover. */
export const IconOnly = composed(SegmentedControlStory, {
  args: {items: 'iconOnly'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-segmented-control');
    const filter = canvas.getByRole('radio', {name: 'Filter'});
    await userEvent.hover(filter);
    await waitFor(() => expect(isShowing(canvasElement.querySelector(`#${filter.dataset.axTooltip}`))).toBe(true));
    await userEvent.click(filter);
    await expect(filter).toHaveAttribute('aria-checked', 'true');
  },
}, options);

/** A disabled control: segments are aria-disabled, the selected one keeps the Tab stop, nothing selects. */
export const Disabled = composed(SegmentedControlStory, {
  args: {isDisabled: true},
  play: async ({canvas, canvasElement}) => {
    const control = await upgraded(canvasElement, 'ax-segmented-control');
    await expect(control).toHaveAttribute('aria-disabled', 'true');
    for (const segment of canvas.getAllByRole('radio')) await expect(segment).toHaveAttribute('aria-disabled', 'true');
    canvas.getByRole('radio', {name: 'Day'}).click();
    await expect(checked(control)).toEqual(['week']);
    await userEvent.tab();
    await expect(canvas.getByRole('radio', {name: 'Week'})).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(checked(control)).toEqual(['week']);
  },
}, options);

/** `disabledMessage`: the reason is a tooltip on the group and describes every segment. */
export const DisabledWithReason = composed(SegmentedControlStory, {
  args: {isDisabled: true, disabledMessage: 'Only owners can change the billing period', items: 'plans'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-segmented-control');
    const monthly = canvas.getByRole('radio', {name: 'Monthly'});
    await expect(monthly).toHaveAccessibleDescription('Only owners can change the billing period');
    await userEvent.tab();
    await expect(monthly).toHaveFocus();
    await waitFor(() => expect(isShowing(canvasElement.querySelector('[role="tooltip"]'))).toBe(true));
  },
}, options);

/** In a narrow container the control caps at its width and labels truncate. */
export const Narrow = composed(SegmentedControlStory, {args: {items: 'sections'}, decorators: [frame({width: 280})]}, options);

/** Right-to-left: ArrowLeft moves forward, ArrowRight back. */
export const RightToLeft = composed(SegmentedControlStory, {
  args: {dir: 'rtl', value: 'day'},
  play: async ({canvas, canvasElement}) => {
    const control = await upgraded(canvasElement, 'ax-segmented-control');
    canvas.getByRole('radio', {name: 'Day'}).focus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(checked(control)).toEqual(['week']);
    await userEvent.keyboard('{ArrowRight}');
    await expect(checked(control)).toEqual(['day']);
  },
}, options);
