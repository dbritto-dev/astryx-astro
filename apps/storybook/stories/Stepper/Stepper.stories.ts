import Stepper from 'astryx-astro/components/Stepper/Stepper.astro';
import Demo from 'astryx-astro/components/Stepper/Stepper.demo.astro';
import demoSource from 'astryx-astro/components/Stepper/Stepper.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {recordEvents} from '../_lib/play';
import {astryx, composed, frame, overview, type Meta, knownA11y} from '../_lib/story';
import StepperStory from './StepperStory.astro';
import storySource from './StepperStory.astro?raw';

const meta = {
  title: 'Navigation/Stepper',
  component: Stepper,
  ...astryx('Stepper', knownA11y({
    "label-content-name-mismatch": "The name (\"Go to step N: <label>\", Astryx's string) contains the visible label; the visible description and Optional marker describe the button (aria-describedby)."
  })),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Stepper.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {
  controls: ['activeStep', 'orientation', 'isNonLinear', 'label', 'density', 'indicatorPosition', 'horizontalOptions', 'steps'],
  source: storySource,
};

type StepperList = HTMLOListElement & {activeStep: number};
const list = (root: HTMLElement) => root.querySelector<StepperList>('ol.astryx-stepper')!;
const currentIndex = (ol: Element) => [...ol.children].findIndex((li) => li.getAttribute('aria-current') === 'step');
const progress = (ol: Element) => [...ol.children].map((li) => (li as HTMLElement).dataset.progress);

/**
 * A linear stepper: an `<ol>` named "Progress" with exactly one `aria-current="step"`; steps before
 * it are completed. Setting `ol.activeStep` moves it and every step re-derives.
 */
export const Default = composed(StepperStory, {
  play: async ({canvas, canvasElement}) => {
    const ol = list(canvasElement);
    await expect(canvas.getByRole('list', {name: 'Progress'})).toBe(ol);
    await expect(currentIndex(ol)).toBe(1);
    await expect(ol.querySelectorAll('[aria-current]')).toHaveLength(1);
    await expect(progress(ol)).toEqual(['completed', 'in-progress', 'not-started', 'not-started']);
    await expect(ol.querySelector('[data-ax-step-button]')).toBeNull();
    ol.activeStep = 3;
    await waitFor(() => expect(currentIndex(ol)).toBe(3));
    await expect(progress(ol)).toEqual(['completed', 'completed', 'completed', 'in-progress']);
  },
}, options);

/**
 * `isNonLinear`: steps are buttons named "Go to step N: Label[, status]". Activating one dispatches
 * `astryx-step-click` `{index}` (cancelable) and moves there; a disabled step stays focusable and inert.
 */
export const NonLinear = composed(StepperStory, {
  args: {steps: 'wizard', isNonLinear: true},
  play: async ({canvas, canvasElement, step}) => {
    const ol = list(canvasElement);
    const clicks = recordEvents<{index: number}>(canvasElement, 'astryx-step-click');

    await step('Steps are named buttons; descriptions describe them', async () => {
      const account = canvas.getByRole('button', {name: 'Go to step 1: Account, completed'});
      await expect(account).toHaveAccessibleDescription(/Email and password/);
      await expect(canvas.getByRole('button', {name: 'Go to step 3: Billing, error'})).toBeVisible();
    });

    await step('A click moves to the step', async () => {
      await userEvent.click(canvas.getByRole('button', {name: /Go to step 1: Account/}));
      await expect(clicks.map((e) => e.detail.index)).toEqual([0]);
      await waitFor(() => expect(currentIndex(ol)).toBe(0));
    });

    await step('Enter on a focused step moves there too', async () => {
      canvas.getByRole('button', {name: /Go to step 4: Team/}).focus();
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(currentIndex(ol)).toBe(3));
    });

    await step('preventDefault() keeps the current step', async () => {
      ol.addEventListener('astryx-step-click', (event) => event.preventDefault(), {once: true});
      await userEvent.click(canvas.getByRole('button', {name: /Go to step 2: Profile/}));
      await expect(currentIndex(ol)).toBe(3);
    });

    await step('A disabled step keeps focus and does nothing', async () => {
      const review = canvas.getByRole('button', {name: /Go to step 5: Review/});
      await expect(review).toHaveAttribute('aria-disabled', 'true');
      review.focus();
      await expect(review).toHaveFocus();
      const before = clicks.length;
      review.click();
      await userEvent.keyboard('{Enter}');
      await expect(clicks.length).toBe(before);
      await expect(currentIndex(ol)).toBe(3);
    });
  },
}, options);

/** Statuses recolour the indicator (success, warning, accent) and add hidden status text. */
export const Statuses = composed(StepperStory, {
  args: {steps: 'shipping', activeStep: 2},
  play: async ({canvasElement}) => {
    const ol = list(canvasElement);
    await expect(ol.children[0].querySelector('[data-ax-step-status]')).toHaveTextContent('completed');
    await expect(ol.children[1].querySelector('[data-ax-step-status]')).toHaveTextContent('warning');
  },
}, options);

/** `indicatorPosition="on-track"`: the indicators are nodes on the track. */
export const OnTrack = composed(StepperStory, {args: {steps: 'shipping', activeStep: 2, indicatorPosition: 'on-track', isNonLinear: true}}, options);

/** Indicator presets: `number`, `auto`, `none` and custom markup in the `indicator` slot; compact density. */
export const IndicatorPresets = composed(StepperStory, {args: {steps: 'presets', density: 'compact', label: 'Indicator presets'}}, options);

/** `density="spacious"` on the track. */
export const Spacious = composed(StepperStory, {args: {density: 'spacious', indicatorPosition: 'on-track', label: 'Onboarding'}}, options);

/** Vertical, with step content (the default slot) under each label; non-linear. */
export const Vertical = composed(StepperStory, {
  args: {steps: 'content', orientation: 'vertical', isNonLinear: true, label: 'Project setup'},
  play: async ({canvas, canvasElement}) => {
    const ol = list(canvasElement);
    await expect(ol).toHaveAttribute('data-orientation', 'vertical');
    await userEvent.click(canvas.getByRole('button', {name: /Go to step 3: Deploy/}));
    await waitFor(() => expect(currentIndex(ol)).toBe(2));
  },
}, options);

/** Vertical with on-track indicators: the content continues the rail. */
export const VerticalOnTrack = composed(StepperStory, {args: {steps: 'content', activeStep: 2, orientation: 'vertical', indicatorPosition: 'on-track', label: 'Project setup'}}, options);

/**
 * In a narrow container a horizontal stepper turns compact: labels leave the layout (names stay
 * for assistive technology) and a summary row names the current step, with previous / next
 * controls that skip disabled steps.
 */
export const Compact = composed(StepperStory, {
  args: {steps: 'narrow', isNonLinear: true, label: 'Checkout'},
  decorators: [frame({width: 320})],
  play: async ({canvas, canvasElement}) => {
    const ol = list(canvasElement);
    await waitFor(() => expect(ol).toHaveAttribute('data-ax-compact'));
    const summary = canvasElement.querySelector<HTMLElement>('[data-ax-stepper-summary]')!;
    await expect(summary).toBeVisible();
    await expect(summary).toHaveTextContent('Address');
    const clicks = recordEvents<{index: number}>(canvasElement, 'astryx-step-click');
    await userEvent.click(canvas.getByRole('button', {name: 'Next step'}));
    await expect(clicks.map((e) => e.detail.index)).toEqual([3]);
    await waitFor(() => expect(currentIndex(ol)).toBe(3));
    await expect(canvas.getByRole('button', {name: 'Next step'})).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(canvas.getByRole('button', {name: 'Previous step'}));
    await waitFor(() => expect(currentIndex(ol)).toBe(1));
  },
}, options);

/** Compact with `collapsedVariant: 'withLabel'`: the summary names the step, no controls. */
export const CompactWithLabel = composed(StepperStory, {
  args: {steps: 'narrow', activeStep: 3, indicatorPosition: 'on-track', horizontalOptions: {minimumStepWidth: 112, collapsedVariant: 'withLabel'}, label: 'Checkout'},
  decorators: [frame({width: 320})],
}, options);

/** Compact with `collapsedVariant: 'hiddenLabel'`: the bare track. */
export const CompactHiddenLabel = composed(StepperStory, {
  args: {steps: 'narrow', horizontalOptions: {minimumStepWidth: 112, collapsedVariant: 'hiddenLabel'}, label: 'Checkout'},
  decorators: [frame({width: 320})],
}, options);
