import Drawer from 'astryx-astro/components/Drawer/Drawer.astro';
import Demo from 'astryx-astro/components/Drawer/Drawer.demo.astro';
import demoSource from 'astryx-astro/components/Drawer/Drawer.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta} from '../_lib/story';
import DrawerStory from './DrawerStory.astro';
import drawerSource from './DrawerStory.astro?raw';

const meta = {
  title: 'Overlay/Drawer',
  component: Drawer,
  ...astryx('Drawer'),
  args: {label: 'Host details: web-01'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Drawer.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {controls: ['isOpen', 'side', 'width', 'hasScrim', 'purpose', 'padding'], source: drawerSource};
const openOnLoad = {docs: {story: {inline: false, height: '420px'}}};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const parts = (canvasElement: HTMLElement) => ({
  dialog: canvasElement.querySelector('dialog')!,
  outside: canvasElement.querySelector<HTMLElement>('[data-outside]')!,
});

/**
 * Modal, sliding in from the end: named by `label`, focus on the `data-autofocus` control, the
 * page behind is inert, Tab stays inside, Escape and a scrim press close it, focus returns.
 */
export const Default = composed(DrawerStory, {
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-drawer');
    const trigger = canvas.getByRole('button', {name: 'Host details'});
    const {dialog, outside} = parts(canvasElement);
    const changes = recordEvents<{isOpen: boolean; reason: string}>(canvasElement, 'astryx-open-change');

    await step('The trigger opens a modal drawer; focus lands on the data-autofocus control', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(dialog.matches(':modal')).toBe(true));
      await expect(dialog).toHaveAccessibleName('Host details: web-01');
      await waitFor(() => expect(canvas.getByRole('button', {name: 'Restart'})).toHaveFocus());
      await expect(changes.at(-1)?.detail.isOpen).toBe(true);
    });

    await step('The page behind is inert and Tab stays inside', async () => {
      outside.focus();
      await expect(outside).not.toHaveFocus();
      const done = canvas.getByRole('button', {name: 'Done'});
      done.focus();
      await userEvent.tab();
      await expect(dialog.contains(document.activeElement)).toBe(true);
      await expect(done).not.toHaveFocus();
    });

    await step('Escape closes it and focus returns to the trigger', async () => {
      // Tab wrapped onto the header's close button, whose tooltip is the topmost layer while
      // shown: move to a control without one and let the tooltip close first.
      canvas.getByRole('button', {name: 'Restart'}).focus();
      await waitFor(() => expect(canvasElement.querySelector('[role="tooltip"]:popover-open')).toBeNull());
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(dialog.open).toBe(false));
      await expect(trigger).toHaveFocus();
      await expect(changes.at(-1)?.detail).toEqual({isOpen: false, reason: 'escape'});
    });

    await step('A press on the scrim closes it (purpose info)', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(dialog.matches(':modal')).toBe(true));
      await userEvent.click(dialog);
      await waitFor(() => expect(dialog.open).toBe(false));
      await expect(changes.at(-1)?.detail).toEqual({isOpen: false, reason: 'outside'});
    });

    await step('The footer button closes it', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(dialog.matches(':modal')).toBe(true));
      await userEvent.click(canvas.getByRole('button', {name: 'Done'}));
      await waitFor(() => expect(dialog.open).toBe(false));
      await expect(trigger).toHaveFocus();
    });
  },
}, options);

/** Rendered open (`isOpen`) from the default end side; docs show it in its own frame. */
export const OpenOnLoad = composed(DrawerStory, {
  args: {isOpen: true},
  parameters: openOnLoad,
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-drawer');
    await waitFor(() => expect(canvasElement.querySelector('dialog')!.matches(':modal')).toBe(true));
  },
}, options);

/** `side="start"`: slides from the inline start (the left in LTR, mirrored in RTL). */
export const SideStart = composed(DrawerStory, {
  args: {isOpen: true, side: 'start'},
  parameters: openOnLoad,
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-drawer');
    const dialog = canvasElement.querySelector('dialog')!;
    await waitFor(() => expect(dialog.open).toBe(true));
    await waitFor(() => expect(dialog.getBoundingClientRect().left).toBe(0));
  },
}, options);

/** `width={560}`: the desktop width budget (the default is 400). */
export const Wide = composed(DrawerStory, {args: {isOpen: true, width: 560}, parameters: openOnLoad}, options);

/** `padding={6}`: a larger content inset than the theme's drawer padding. */
export const LargePadding = composed(DrawerStory, {args: {isOpen: true, padding: 6}, parameters: openOnLoad}, options);

/** `purpose="form"`: Escape closes it, a scrim press does not. */
export const FormPurpose = composed(DrawerStory, {
  args: {purpose: 'form'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-drawer');
    const trigger = canvas.getByRole('button', {name: 'Host details'});
    const {dialog} = parts(canvasElement);
    await userEvent.click(trigger);
    await waitFor(() => expect(dialog.matches(':modal')).toBe(true));
    await userEvent.click(dialog);
    await sleep(300);
    await expect(dialog.open).toBe(true);
    canvas.getByRole('button', {name: 'Restart'}).focus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(dialog.open).toBe(false));
    await expect(trigger).toHaveFocus();
  },
}, options);

/** `purpose="required"`: role alertdialog; neither Escape nor the scrim closes it, only its own button. */
export const Required = composed(DrawerStory, {
  args: {purpose: 'required'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-drawer');
    const trigger = canvas.getByRole('button', {name: 'Host details'});
    const {dialog} = parts(canvasElement);
    await userEvent.click(trigger);
    await waitFor(() => expect(dialog.matches(':modal')).toBe(true));
    await expect(dialog).toHaveAttribute('role', 'alertdialog');
    canvas.getByRole('button', {name: 'Restart'}).focus();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(dialog);
    await sleep(300);
    await expect(dialog.open).toBe(true);
    await userEvent.click(canvas.getByRole('button', {name: 'Confirm'}));
    await waitFor(() => expect(dialog.open).toBe(false));
    await expect(trigger).toHaveFocus();
  },
}, options);

/**
 * `hasScrim={false}`: a non-modal `popover="manual"` panel. The page behind stays interactive,
 * Escape still closes it, and the trigger toggles it.
 */
export const NoScrim = composed(DrawerStory, {
  args: {hasScrim: false},
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-drawer');
    const trigger = canvas.getByRole('button', {name: 'Host details'});
    const {dialog, outside} = parts(canvasElement);
    const changes = recordEvents<{isOpen: boolean}>(canvasElement, 'astryx-open-change');

    await step('The trigger shows a non-modal panel; the page stays focusable', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(isShowing(dialog)).toBe(true));
      await expect(dialog.matches(':modal')).toBe(false);
      outside.focus();
      await expect(outside).toHaveFocus();
    });

    await step('Escape closes it through the layer stack', async () => {
      canvas.getByRole('button', {name: 'Restart'}).focus();
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(dialog)).toBe(false));
    });

    await step('The trigger toggles it open and closed', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(isShowing(dialog)).toBe(true));
      await userEvent.click(trigger);
      await waitFor(() => expect(isShowing(dialog)).toBe(false));
    });
    await expect(changes.map((e) => e.detail.isOpen)).toEqual([true, false, true, false]);
  },
}, options);
