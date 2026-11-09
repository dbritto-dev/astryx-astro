import BottomSheet from 'astryx-astro/components/BottomSheet/BottomSheet.astro';
import Demo from 'astryx-astro/components/BottomSheet/BottomSheet.demo.astro';
import demoSource from 'astryx-astro/components/BottomSheet/BottomSheet.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta} from '../_lib/story';
import BottomSheetStack from './BottomSheetStack.astro';
import stackSource from './BottomSheetStack.astro?raw';
import BottomSheetStory from './BottomSheetStory.astro';
import sheetSource from './BottomSheetStory.astro?raw';

const meta = {
  title: 'Overlay/Bottom Sheet',
  component: BottomSheet,
  ...astryx('BottomSheet'),
  args: {label: 'Nearby places'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (BottomSheet.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {controls: ['isOpen', 'purpose', 'height', 'snapPoints', 'hasScrim', 'padding'], source: sheetSource};
const openOnLoad = {docs: {story: {inline: false, height: '480px'}}};
const closes = {timeout: 3000};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const parts = (root: HTMLElement) => ({
  dialog: root.querySelector('dialog')!,
  outside: root.querySelector<HTMLElement>('[data-outside]')!,
});

/**
 * Modal with a scrim (`purpose="info"`, `height="capped"`): named by `label`, focus moves in, the
 * page behind is inert and Tab stays inside; Escape, a scrim press and its Done button close it,
 * and focus returns to the trigger.
 */
export const Default = composed(BottomSheetStory, {
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-bottom-sheet');
    const trigger = canvas.getByRole('button', {name: 'Nearby places'});
    const {dialog, outside} = parts(canvasElement);
    const changes = recordEvents<{isOpen: boolean; reason: string}>(canvasElement, 'astryx-open-change');

    await step('The trigger opens a modal sheet; focus moves in', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(dialog.matches(':modal')).toBe(true));
      await expect(dialog).toHaveAccessibleName('Nearby places');
      await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
      await expect(changes.at(-1)?.detail.isOpen).toBe(true);
    });

    await step('The page behind is inert and Tab stays inside', async () => {
      outside.focus();
      await expect(outside).not.toHaveFocus();
      canvas.getByRole('button', {name: 'Done'}).focus();
      for (let i = 0; i < 3; i++) {
        await userEvent.tab();
        await expect(dialog.contains(document.activeElement)).toBe(true);
      }
    });

    await step('Escape closes it and focus returns to the trigger', async () => {
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(dialog.open).toBe(false), closes);
      await expect(trigger).toHaveFocus();
      await expect(changes.at(-1)?.detail).toEqual({isOpen: false, reason: 'escape'});
    });

    await step('A press on the scrim closes it (purpose info)', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(dialog.matches(':modal')).toBe(true));
      await userEvent.click(dialog);
      await waitFor(() => expect(dialog.open).toBe(false), closes);
      await expect(changes.at(-1)?.detail).toEqual({isOpen: false, reason: 'outside'});
    });

    await step('Its Done button closes it', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(dialog.matches(':modal')).toBe(true));
      await userEvent.click(canvas.getByRole('button', {name: 'Done'}));
      await waitFor(() => expect(dialog.open).toBe(false), closes);
      await expect(trigger).toHaveFocus();
    });
  },
}, options);

/** Rendered open (`isOpen`) at the default `capped` height (about 62% of the viewport). */
export const OpenOnLoad = composed(BottomSheetStory, {
  args: {isOpen: true},
  parameters: openOnLoad,
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-bottom-sheet');
    await waitFor(() => expect(canvasElement.querySelector('dialog')!.matches(':modal')).toBe(true));
  },
}, options);

/** `height="hug"`: fits its content (up to 92% of the viewport). */
export const HeightHug = composed(BottomSheetStory, {args: {isOpen: true, height: 'hug', padding: 0}, parameters: openOnLoad}, options);

/** `height="tall"`: about 92% of the viewport. */
export const HeightTall = composed(BottomSheetStory, {args: {isOpen: true, height: 'tall'}, parameters: openOnLoad}, options);

/**
 * `snapPoints={[0.5]}` on a tall sheet: drag the grab handle (or pull the content down at its
 * top) between half the screen and full; a release past the shortest stop dismisses it.
 * The drag is a pointer gesture the play function does not replay (tools/tests covers it).
 */
export const SnapPoints = composed(BottomSheetStory, {args: {isOpen: true, height: 'tall', snapPoints: [0.5]}, parameters: openOnLoad}, options);

/** `purpose="form"`: Escape closes it, a scrim press does not. */
export const FormPurpose = composed(BottomSheetStory, {
  args: {purpose: 'form'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-bottom-sheet');
    const trigger = canvas.getByRole('button', {name: 'Nearby places'});
    const {dialog} = parts(canvasElement);
    await userEvent.click(trigger);
    await waitFor(() => expect(dialog.matches(':modal')).toBe(true));
    await userEvent.click(dialog);
    await sleep(300);
    await expect(dialog.open).toBe(true);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(dialog.open).toBe(false), closes);
    await expect(trigger).toHaveFocus();
  },
}, options);

/** `purpose="required"`: role alertdialog; neither Escape nor the scrim closes it, only its button. */
export const Required = composed(BottomSheetStory, {
  args: {purpose: 'required', height: 'hug'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-bottom-sheet');
    const trigger = canvas.getByRole('button', {name: 'Nearby places'});
    const {dialog} = parts(canvasElement);
    await userEvent.click(trigger);
    await waitFor(() => expect(dialog.matches(':modal')).toBe(true));
    await expect(dialog).toHaveAttribute('role', 'alertdialog');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(dialog);
    await sleep(300);
    await expect(dialog.open).toBe(true);
    await userEvent.click(canvas.getByRole('button', {name: 'Accept'}));
    await waitFor(() => expect(dialog.open).toBe(false), closes);
    await expect(trigger).toHaveFocus();
  },
}, options);

/**
 * `hasScrim={false}`: a non-modal `popover="manual"` sheet. No scrim, no focus trap, no scroll
 * lock: the page behind stays interactive. Escape still closes it.
 */
export const NoScrim = composed(BottomSheetStory, {
  args: {hasScrim: false, height: 'hug'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-bottom-sheet');
    const trigger = canvas.getByRole('button', {name: 'Nearby places'});
    const {dialog, outside} = parts(canvasElement);
    await userEvent.click(trigger);
    await waitFor(() => expect(isShowing(dialog)).toBe(true));
    await expect(dialog.matches(':modal')).toBe(false);
    outside.focus();
    await expect(outside).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(dialog)).toBe(false), closes);
  },
}, options);

/**
 * Stacking: a sheet opened from inside another sits on top of it; the one below stays open under
 * the one scrim. Escape closes only the top sheet and focus returns to its opener inside the
 * revealed sheet; the next Escape closes that one too.
 */
export const Stacked = composed(BottomSheetStack, {
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-bottom-sheet');
    const [orders, order] = [...canvasElement.querySelectorAll('dialog')] as [HTMLDialogElement, HTMLDialogElement];
    const trigger = canvas.getByRole('button', {name: 'Orders'});

    await step('A sheet opens over another', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(orders.matches(':modal')).toBe(true));
      const opener = canvas.getByRole('button', {name: '#1042 · Espresso beans'});
      await userEvent.click(opener);
      await waitFor(() => expect(order.matches(':modal')).toBe(true));
      await expect(order).toHaveAccessibleName('Order #1042');
      await expect(orders.open).toBe(true);
    });

    await step('Escape closes only the top sheet; focus returns into the revealed one', async () => {
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(order.open).toBe(false), closes);
      await expect(orders.open).toBe(true);
      await expect(canvas.getByRole('button', {name: '#1042 · Espresso beans'})).toHaveFocus();
    });

    await step('The next Escape closes the bottom sheet; focus returns to the page', async () => {
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(orders.open).toBe(false), closes);
      await expect(trigger).toHaveFocus();
    });
  },
}, {source: stackSource});
