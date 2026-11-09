import BottomSheetSwitcher from 'astryx-astro/components/BottomSheet/BottomSheetSwitcher.astro';
import Demo from 'astryx-astro/components/BottomSheet/BottomSheetSwitcher.demo.astro';
import demoSource from 'astryx-astro/components/BottomSheet/BottomSheetSwitcher.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta} from '../_lib/story';
import BottomSheetSwitcherStory from './BottomSheetSwitcherStory.astro';
import switcherSource from './BottomSheetSwitcherStory.astro?raw';

const meta = {
  title: 'Overlay/Bottom Sheet Switcher',
  component: BottomSheetSwitcher,
  ...astryx('BottomSheetSwitcher'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (BottomSheetSwitcher.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {controls: ['activeSheet', 'hasScrim'], source: switcherSource};
const settled = {timeout: 3000};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type Switcher = HTMLElement & {activeSheet: string | null};
const parts = (root: HTMLElement) => {
  const [details, confirm] = [...root.querySelectorAll('dialog')] as [HTMLDialogElement, HTMLDialogElement];
  return {details, confirm, switcher: root.querySelector<Switcher>('ax-bottom-sheet-switcher')!};
};

/**
 * A modal flow: the trigger opens the first step; "Continue" hands off to the next step (it
 * enters above the previous one, which then leaves), focus follows. The form step ignores a scrim
 * press; Escape closes the flow and focus returns to the trigger. `astryx-active-sheet-change`
 * reports every step.
 */
export const Default = composed(BottomSheetSwitcherStory, {
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-bottom-sheet-switcher');
    const {details, confirm, switcher} = parts(canvasElement);
    const trigger = canvas.getByRole('button', {name: 'Start checkout'});
    const steps = recordEvents<{activeSheet: string | null}>(canvasElement, 'astryx-active-sheet-change');

    await step('The trigger opens the first step as a modal sheet', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(details.matches(':modal')).toBe(true));
      await expect(details).toHaveAccessibleName('Delivery details');
      await waitFor(() => expect(switcher.activeSheet).toBe('details'));
      await waitFor(() => expect(details.contains(document.activeElement)).toBe(true));
    });

    await step('Continue hands off to the next step; focus moves into it', async () => {
      await userEvent.click(canvas.getByRole('button', {name: 'Continue'}));
      await waitFor(() => expect(confirm.matches(':modal')).toBe(true));
      await expect(switcher.activeSheet).toBe('confirm');
      await waitFor(() => expect(confirm.contains(document.activeElement)).toBe(true));
      await waitFor(() => expect(details.open).toBe(false), settled);
    });

    await step('The form step ignores a scrim press; Escape closes the flow, focus returns', async () => {
      await userEvent.click(confirm);
      await sleep(300);
      await expect(confirm.open).toBe(true);
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(confirm.open).toBe(false), settled);
      await expect(switcher.activeSheet).toBeNull();
      await expect(trigger).toHaveFocus();
    });
    await expect(steps.map((e) => e.detail.activeSheet)).toEqual(['details', 'confirm', null]);
  },
}, options);

/** "Back" returns to the previous step; "Place order" (`data-ax-switch-to=""`) closes the flow. */
export const BackAndFinish = composed(BottomSheetSwitcherStory, {
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-bottom-sheet-switcher');
    const {details, confirm, switcher} = parts(canvasElement);
    const trigger = canvas.getByRole('button', {name: 'Start checkout'});
    await userEvent.click(trigger);
    await waitFor(() => expect(details.open).toBe(true));
    await userEvent.click(canvas.getByRole('button', {name: 'Continue'}));
    await waitFor(() => expect(details.open).toBe(false), settled);
    await userEvent.click(canvas.getByRole('button', {name: 'Back'}));
    await waitFor(() => expect(switcher.activeSheet).toBe('details'));
    await waitFor(() => expect(confirm.open).toBe(false), settled);
    await expect(details.open).toBe(true);
    await userEvent.click(canvas.getByRole('button', {name: 'Continue'}));
    await waitFor(() => expect(details.open).toBe(false), settled);
    await userEvent.click(canvas.getByRole('button', {name: 'Place order'}));
    await waitFor(() => expect(confirm.open).toBe(false), settled);
    await expect(switcher.activeSheet).toBeNull();
    await expect(trigger).toHaveFocus();
  },
}, options);

/** `activeSheet="confirm"`: the flow is open on load at that step; docs show it in its own frame. */
export const ActiveSheetOnLoad = composed(BottomSheetSwitcherStory, {
  args: {activeSheet: 'confirm'},
  parameters: {docs: {story: {inline: false, height: '420px'}}},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-bottom-sheet-switcher');
    const {details, confirm} = parts(canvasElement);
    await waitFor(() => expect(confirm.matches(':modal')).toBe(true));
    await expect(details.open).toBe(false);
  },
}, options);

/** `hasScrim={false}`: the steps are non-modal manual popovers; the page stays interactive. */
export const NoScrim = composed(BottomSheetSwitcherStory, {
  args: {hasScrim: false},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-bottom-sheet-switcher');
    const {details, confirm, switcher} = parts(canvasElement);
    await userEvent.click(canvas.getByRole('button', {name: 'Start checkout'}));
    await waitFor(() => expect(isShowing(details)).toBe(true));
    await expect(details.matches(':modal')).toBe(false);
    await userEvent.click(canvas.getByRole('button', {name: 'Continue'}));
    await waitFor(() => expect(isShowing(confirm)).toBe(true));
    await waitFor(() => expect(isShowing(details)).toBe(false), settled);
    await userEvent.click(canvas.getByRole('button', {name: 'Place order'}));
    await waitFor(() => expect(isShowing(confirm)).toBe(false), settled);
    await expect(switcher.activeSheet).toBeNull();
  },
}, options);
