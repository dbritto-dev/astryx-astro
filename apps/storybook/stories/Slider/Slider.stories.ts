import Slider from 'astryx-astro/components/Slider/Slider.astro';
import Demo from 'astryx-astro/components/Slider/Slider.demo.astro';
import demoSource from 'astryx-astro/components/Slider/Slider.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, frame, overview, type Meta, type Story} from '../_lib/story';
import SliderFormatted from './SliderFormatted.astro';
import formattedSource from './SliderFormatted.astro?raw';

// Known issue (component): inside a FormLayout with defaultOptionality="required" (the Overview
// demo), the cascade stamps `aria-required` onto the Slider's visually hidden "Required"
// element, a critical axe `aria-allowed-attr` violation. Reported, not fixed here.

const meta = {
  title: 'Form Controls/Slider',
  component: Slider,
  ...astryx('Slider'),
  args: {label: 'Volume', value: 40},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Slider.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/** Horizontal sliders fill their container: give them a realistic width. */
const sized = {decorators: [frame({width: 360})]};

type SliderHost = HTMLElement & {value: number | [number, number]};
type Value = {value: number | [number, number]};
const now = (thumb: HTMLElement) => Number(thumb.getAttribute('aria-valuenow'));
/** The pointer position at `fraction` of the travel (inset by half a thumb at each end). */
const along = (control: Element, fraction: number) => {
  const rect = control.getBoundingClientRect();
  return {clientX: rect.left + 10 + fraction * (rect.width - 20), clientY: rect.top + rect.height / 2};
};

/**
 * Keyboard (APG): ←/→ and ↑/↓ by `step`, PageUp/PageDown by ten steps, Home/End to the bounds.
 * Each handled key reports `astryx-change` then `astryx-change-end`; keyboard focus shows the
 * value tooltip, which follows the value.
 */
export const Default: Story = {
  ...sized,
  play: async ({canvas, canvasElement, step}) => {
    const host = await upgraded<SliderHost>(canvasElement, 'ax-slider');
    const changes = recordEvents<Value>(canvasElement, 'astryx-change');
    const ends = recordEvents<Value>(canvasElement, 'astryx-change-end');
    const thumb = canvas.getByRole('slider', {name: 'Volume'});
    await expect(thumb).toHaveAttribute('aria-valuemin', '0');
    await expect(thumb).toHaveAttribute('aria-valuemax', '100');
    await expect(now(thumb)).toBe(40);

    await step('Keyboard focus shows the value tooltip', async () => {
      await userEvent.tab();
      await expect(thumb).toHaveFocus();
      const tip = document.getElementById(thumb.getAttribute('data-ax-tooltip')!);
      await waitFor(() => expect(isShowing(tip)).toBe(true));
      await expect(tip).toHaveTextContent('40');
    });
    await step('Arrows step by one, PageUp/PageDown by ten, Home/End go to the bounds', async () => {
      const seen: number[] = [];
      for (const key of ['{ArrowRight}', '{ArrowUp}', '{ArrowLeft}', '{ArrowDown}', '{PageUp}', '{PageDown}', '{End}', '{Home}']) {
        await userEvent.keyboard(key);
        seen.push(now(thumb));
      }
      await expect(seen).toEqual([41, 42, 41, 40, 50, 40, 100, 0]);
    });
    await expect(changes.map((e) => e.detail.value)).toEqual([41, 42, 41, 40, 50, 40, 100, 0]);
    await expect(ends.map((e) => e.detail.value)).toEqual([41, 42, 41, 40, 50, 40, 100, 0]);
    await expect(host.value).toBe(0);
  },
};

/**
 * Pointer: a press on the track moves the thumb there and focuses it; dragging follows the
 * pointer; the release reports one `astryx-change-end`.
 */
export const PointerDrag: Story = {
  ...sized,
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-slider');
    const ends = recordEvents<Value>(canvasElement, 'astryx-change-end');
    const thumb = canvas.getByRole('slider', {name: 'Volume'});
    const control = canvasElement.querySelector('.astryx-slider-control')!;
    // One user-event session, so the pressed button carries over between the calls.
    const user = userEvent.setup();
    await user.pointer({keys: '[MouseLeft>]', target: control, coords: along(control, 0.75)});
    await expect(now(thumb)).toBe(75);
    await expect(thumb).toHaveFocus();
    await user.pointer({target: control, coords: along(control, 0.3)});
    await expect(now(thumb)).toBe(30);
    await user.pointer({keys: '[/MouseLeft]', target: control, coords: along(control, 0.3)});
    await expect(ends.map((e) => e.detail.value)).toEqual([30]);
  },
};

/**
 * Range (`value={[start, end]}`): thumbs "Minimum value" and "Maximum value" in a group named by
 * the label. They never cross: `minStepsBetweenThumbs` keeps a gap, and each thumb's bounds
 * follow the other thumb.
 */
export const Range: Story = {
  ...sized,
  args: {label: 'Budget', value: [20, 60], minStepsBetweenThumbs: 10, valueDisplay: 'text'},
  play: async ({canvas, canvasElement}) => {
    const host = await upgraded<SliderHost>(canvasElement, 'ax-slider');
    await expect(canvas.getByRole('group', {name: 'Budget'})).toBeInTheDocument();
    const lower = canvas.getByRole('slider', {name: 'Minimum value'});
    const upper = canvas.getByRole('slider', {name: 'Maximum value'});
    await expect(lower).toHaveAttribute('aria-valuemax', '50');
    await expect(upper).toHaveAttribute('aria-valuemin', '30');
    lower.focus();
    await userEvent.keyboard('{End}');
    await expect(now(lower)).toBe(50);
    upper.focus();
    await userEvent.keyboard('{Home}');
    await expect(now(upper)).toBe(60);
    await expect(host.value).toEqual([50, 60]);
    await expect(host).toHaveTextContent('50 – 60');
  },
};

/** `valueDisplay="text"`: the value beside the control, kept current. */
export const ValueText: Story = {
  ...sized,
  args: {label: 'Brightness', value: 70, valueDisplay: 'text', description: 'Applies to every display'},
  play: async ({canvas, canvasElement}) => {
    const host = await upgraded(canvasElement, 'ax-slider');
    const thumb = canvas.getByRole('slider', {name: 'Brightness'});
    await expect(thumb).toHaveAccessibleDescription(expect.stringContaining('Applies to every display'));
    thumb.focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(host).toHaveTextContent('71');
  },
};

/** `valueDisplay="none"` with a visually hidden label. */
export const NoValueDisplay: Story = {...sized, args: {label: 'Balance', value: 50, valueDisplay: 'none', isLabelHidden: true}};

/** Port extension `formatOptions` (Intl.NumberFormat): percent text and `aria-valuetext`, fractional steps without float error. */
export const Percent: Story = {
  ...sized,
  args: {label: 'Opacity', value: 0.35, min: 0, max: 1, step: 0.05, formatOptions: {style: 'percent'}, valueDisplay: 'text'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-slider');
    const thumb = canvas.getByRole('slider', {name: 'Opacity'});
    await expect(thumb).toHaveAttribute('aria-valuetext', '35%');
    thumb.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
    await expect(thumb).toHaveAttribute('aria-valuenow', '0.55');
    await expect(thumb).toHaveAttribute('aria-valuetext', '55%');
  },
};

/** Labelled marks; a press on a mark label snaps the thumb to its value. */
export const WithMarks: Story = {
  ...sized,
  args: {
    label: 'Temperature',
    value: 50,
    step: 25,
    marks: [{value: 0, label: '0°'}, {value: 25, label: '25°'}, {value: 50, label: '50°'}, {value: 75, label: '75°'}, {value: 100, label: '100°'}],
  },
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-slider');
    const thumb = canvas.getByRole('slider', {name: 'Temperature'});
    await userEvent.click(canvas.getByText('75°'));
    await expect(now(thumb)).toBe(75);
  },
};

/** A server-side `formatValue` function (a story wrapper) for a range with unlabelled marks. */
export const FormattedRange = composed(SliderFormatted, {
  args: {label: 'Price range'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-slider');
    const lower = canvas.getByRole('slider', {name: 'Minimum value'});
    await expect(lower).toHaveAttribute('aria-valuetext', '$200');
    lower.focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(lower).toHaveAttribute('aria-valuetext', '$210');
  },
}, {controls: ['label', 'valueDisplay'], source: formattedSource});

/** Vertical: ArrowUp increases; `aria-orientation="vertical"`. */
export const Vertical: Story = {
  args: {label: 'Gain', value: 30, orientation: 'vertical'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-slider');
    const thumb = canvas.getByRole('slider', {name: 'Gain'});
    await expect(thumb).toHaveAttribute('aria-orientation', 'vertical');
    thumb.focus();
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    await expect(now(thumb)).toBe(32);
  },
};

export const VerticalRange: Story = {args: {label: 'Band', value: [25, 75], orientation: 'vertical', valueDisplay: 'text'}};

/** Thumbs keep their tab stop (`aria-disabled`); keys and presses change nothing. */
export const Disabled: Story = {
  ...sized,
  args: {value: 30, isDisabled: true, htmlName: 'volume'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-slider');
    const changes = recordEvents(canvasElement, 'astryx-change');
    const thumb = canvas.getByRole('slider', {name: 'Volume'});
    await expect(thumb).toHaveAttribute('aria-disabled', 'true');
    await expect(canvasElement.querySelector('input[type="hidden"]')).toBeNull();
    await userEvent.tab();
    await expect(thumb).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}{End}');
    await expect(now(thumb)).toBe(30);
    await expect(changes).toHaveLength(0);
  },
};

/** The reason replaces the value tooltip, shows on keyboard focus and describes the thumb. */
export const DisabledWithMessage: Story = {
  ...sized,
  args: {value: 30, isDisabled: true, disabledMessage: 'Volume is locked while sharing your screen'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-slider');
    const thumb = canvas.getByRole('slider', {name: 'Volume'});
    await expect(thumb).toHaveAccessibleDescription(expect.stringContaining('Volume is locked while sharing your screen'));
    await userEvent.tab();
    await waitFor(() => expect(isShowing(canvasElement.querySelector('[role="tooltip"]'))).toBe(true));
  },
};

/** Required: the thumb is described by a visually hidden "Required" (`aria-required` is not valid on a slider). */
export const Required: Story = {
  ...sized,
  args: {label: 'Quality', value: 80, isRequired: true},
  play: async ({canvas}) => {
    const thumb = canvas.getByRole('slider', {name: /^Quality/});
    await expect(thumb).not.toHaveAttribute('aria-required');
    await expect(thumb).toHaveAccessibleDescription(expect.stringContaining('Required'));
  },
};

/** An error status: the thumb is `aria-invalid` and described by the detached message. */
export const ErrorStatus: Story = {
  ...sized,
  args: {label: 'Budget', value: 90, status: {type: 'error', message: 'Budget exceeds the plan limit'}},
  play: async ({canvas}) => {
    const thumb = canvas.getByRole('slider', {name: 'Budget'});
    await expect(thumb).toBeInvalid();
    await expect(thumb).toHaveAccessibleDescription(expect.stringContaining('Budget exceeds the plan limit'));
  },
};

export const SuccessStatus: Story = {...sized, args: {label: 'Volume', value: 60, status: {type: 'success', message: 'Within the recommended range'}}};
