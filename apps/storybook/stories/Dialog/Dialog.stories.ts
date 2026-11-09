import Dialog from 'astryx-astro/components/Dialog/Dialog.astro';
import Demo from 'astryx-astro/components/Dialog/Dialog.demo.astro';
import demoSource from 'astryx-astro/components/Dialog/Dialog.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import DialogStory from './DialogStory.astro';
import dialogSource from './DialogStory.astro?raw';

const meta = {
  title: 'Overlay/Dialog',
  component: Dialog,
  ...astryx('Dialog'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Dialog.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {controls: ['isOpen', 'variant', 'purpose', 'width'], source: dialogSource};

/** Open from the trigger, then close with Escape: modal, focus moves in, Tab stays in, the page behind is inert, focus returns. */
export const Modal = composed(DialogStory, {
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-dialog');
    const trigger = canvas.getByRole('button', {name: 'Rename file'});
    const outside = canvasElement.querySelector<HTMLElement>('[data-outside]')!;
    const dialog = canvasElement.querySelector('dialog')!;
    const changes = recordEvents<{isOpen: boolean; reason: string}>(canvasElement, 'astryx-open-change');

    await step('The trigger opens it as a modal named by its title', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(dialog.matches(':modal')).toBe(true));
      await expect(dialog).toHaveAccessibleName('Rename file');
      await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
      await expect(changes.at(-1)?.detail.isOpen).toBe(true);
    });

    await step('The page behind is inert: it cannot take focus', async () => {
      outside.focus();
      await expect(outside).not.toHaveFocus();
      await expect(dialog.contains(document.activeElement)).toBe(true);
    });

    await step('Tab from the last control wraps to the first', async () => {
      const rename = canvas.getByRole('button', {name: 'Rename'});
      rename.focus();
      await userEvent.tab();
      await expect(dialog.contains(document.activeElement)).toBe(true);
      await expect(rename).not.toHaveFocus();
    });

    await step('Escape closes it and focus returns to the trigger', async () => {
      // From the field: on the close button, Escape first closes that button's tooltip (the
      // topmost layer), as it should.
      await userEvent.click(canvas.getByRole('textbox', {name: 'File name'}));
      await waitFor(() => expect(canvasElement.querySelector('[role="tooltip"]:popover-open')).toBeNull());
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(dialog.open).toBe(false));
      await expect(trigger).toHaveFocus();
      await expect(changes.at(-1)?.detail.isOpen).toBe(false);
    });
  },
}, options);

/** `purpose="required"`: Escape and the backdrop do not dismiss it (role alertdialog). */
export const Required = composed(DialogStory, {
  args: {purpose: 'required'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-dialog');
    const dialog = canvasElement.querySelector('dialog')!;
    await userEvent.click(canvas.getByRole('button', {name: 'Rename file'}));
    await waitFor(() => expect(dialog.open).toBe(true));
    await expect(dialog).toHaveAttribute('role', 'alertdialog');
    await userEvent.click(canvas.getByRole('textbox', {name: 'File name'}));
    await userEvent.keyboard('{Escape}');
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(dialog.open).toBe(true);
    await userEvent.click(canvas.getByRole('button', {name: 'Cancel'}));
    await waitFor(() => expect(dialog.open).toBe(false));
  },
}, options);

/** Rendered open (`isOpen`); docs show it in its own frame, since a modal blocks the page. */
export const OpenOnLoad = composed(DialogStory, {
  args: {isOpen: true},
  parameters: {docs: {story: {inline: false, height: '420px'}}},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-dialog');
    await waitFor(() => expect(canvasElement.querySelector('dialog')!.open).toBe(true));
  },
}, options);

export const Wide = composed(DialogStory, {args: {isOpen: true, width: 640}, parameters: {docs: {story: {inline: false, height: '420px'}}}}, options);

export const Fullscreen = composed(DialogStory, {args: {isOpen: true, variant: 'fullscreen'}, parameters: {docs: {story: {inline: false, height: '420px'}}}}, options);

/** `isInline` draws the dialog in flow for previews, with no modality: what this story shows as `args`. */
export const Inline: Story = {
  args: {isInline: true, isOpen: true, width: 420, slots: {default: '<p style="margin:0">An inline preview of the dialog surface.</p>'}},
};
