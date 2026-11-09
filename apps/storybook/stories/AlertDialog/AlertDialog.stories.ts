import AlertDialog from 'astryx-astro/components/AlertDialog/AlertDialog.astro';
import Demo from 'astryx-astro/components/AlertDialog/AlertDialog.demo.astro';
import demoSource from 'astryx-astro/components/AlertDialog/AlertDialog.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import AlertDialogStory from './AlertDialogStory.astro';
import alertDialogSource from './AlertDialogStory.astro?raw';

const meta = {
  title: 'Overlay/Alert Dialog',
  component: AlertDialog,
  ...astryx('AlertDialog'),
  args: {
    title: 'Delete project?',
    description: 'The project, its 24 files and their history are removed for everyone. This cannot be undone.',
    actionLabel: 'Delete',
  },
} satisfies Meta;
export default meta;

/** Every example from the docs page (AlertDialog.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {
  controls: ['title', 'description', 'actionLabel', 'cancelLabel', 'actionVariant', 'isActionLoading', 'isOpen', 'width'],
  source: alertDialogSource,
};
const openOnLoad = {docs: {story: {inline: false, height: '360px'}}};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Open from the trigger: a modal `alertdialog` named by its title and described by the
 * consequence, Cancel takes focus, the page behind is inert, Tab stays inside, a backdrop press
 * does not dismiss, Escape cancels and focus returns to the trigger.
 */
export const Default = composed(AlertDialogStory, {
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-alert-dialog');
    const trigger = canvas.getByRole('button', {name: 'Delete project'});
    const outside = canvasElement.querySelector<HTMLElement>('[data-outside]')!;
    const dialog = canvasElement.querySelector('dialog')!;
    const changes = recordEvents<{isOpen: boolean; reason: string}>(canvasElement, 'astryx-open-change');

    await step('The trigger opens a modal alertdialog; Cancel (the least destructive action) takes focus', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(dialog.matches(':modal')).toBe(true));
      await expect(dialog).toHaveAttribute('role', 'alertdialog');
      await expect(dialog).toHaveAccessibleName('Delete project?');
      await expect(dialog).toHaveAccessibleDescription(/removed for everyone/);
      await waitFor(() => expect(canvas.getByRole('button', {name: 'Cancel'})).toHaveFocus());
      await expect(changes.at(-1)?.detail.isOpen).toBe(true);
    });

    await step('The page behind is inert and Tab stays inside', async () => {
      outside.focus();
      await expect(outside).not.toHaveFocus();
      const action = canvas.getByRole('button', {name: 'Delete'});
      action.focus();
      await userEvent.tab();
      await expect(dialog.contains(document.activeElement)).toBe(true);
    });

    await step('A backdrop press does not dismiss it (purpose form)', async () => {
      await userEvent.click(dialog);
      await sleep(300);
      await expect(dialog.matches(':modal')).toBe(true);
    });

    await step('Escape cancels and focus returns to the trigger', async () => {
      canvas.getByRole('button', {name: 'Cancel'}).focus();
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(dialog.open).toBe(false));
      await expect(trigger).toHaveFocus();
      await expect(changes.at(-1)?.detail).toEqual({isOpen: false, reason: 'escape'});
    });

    await step('Cancel closes it too', async () => {
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(dialog.open).toBe(true));
      await userEvent.click(canvas.getByRole('button', {name: 'Cancel'}));
      await waitFor(() => expect(dialog.open).toBe(false));
      await expect(trigger).toHaveFocus();
    });
  },
}, options);

/**
 * The action reports `astryx-action` and leaves the dialog open: the story's script sets
 * `actionLoading` (the busy action keeps focus) and hides the dialog when the work settles.
 */
export const ConfirmAction = composed(AlertDialogStory, {
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-alert-dialog');
    const trigger = canvas.getByRole('button', {name: 'Delete project'});
    const dialog = canvasElement.querySelector('dialog')!;
    const actions = recordEvents(canvasElement, 'astryx-action');
    await userEvent.click(trigger);
    await waitFor(() => expect(dialog.matches(':modal')).toBe(true));

    await step('Activating the action dispatches astryx-action; the dialog stays open, busy', async () => {
      canvas.getByRole('button', {name: 'Delete'}).focus();
      await userEvent.keyboard('{Enter}');
      await expect(actions).toHaveLength(1);
      const busy = dialog.querySelector('[data-ax-alert-action]')!;
      await waitFor(() => expect(busy).toHaveAttribute('aria-busy', 'true'));
      await expect(busy).toHaveFocus();
      await expect(dialog.open).toBe(true);
    });

    await step('A busy action ignores another Enter', async () => {
      await userEvent.keyboard('{Enter}');
      await expect(actions).toHaveLength(1);
    });

    await step('When the work settles the app hides it and focus returns', async () => {
      await waitFor(() => expect(dialog.open).toBe(false), {timeout: 3000});
      await expect(trigger).toHaveFocus();
      await expect(dialog.querySelector('[data-ax-alert-action]')).not.toHaveAttribute('aria-busy');
    });
  },
}, options);

/** Rendered open (`isOpen`): a modal on load, so docs show it in its own frame. */
export const OpenOnLoad = composed(AlertDialogStory, {
  args: {isOpen: true},
  parameters: openOnLoad,
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-alert-dialog');
    await waitFor(() => expect(canvasElement.querySelector('dialog')!.matches(':modal')).toBe(true));
  },
}, options);

/** A non-destructive confirmation: `actionVariant="primary"` and a custom `cancelLabel`. */
export const PrimaryAction = composed(AlertDialogStory, {
  args: {
    isOpen: true,
    title: 'Discard unsaved changes?',
    description: 'Your edits since 10:42 are lost.',
    actionLabel: 'Discard',
    actionVariant: 'primary',
    cancelLabel: 'Keep editing',
  },
  parameters: openOnLoad,
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-alert-dialog');
    await waitFor(() => expect(canvasElement.querySelector('dialog')!.open).toBe(true));
    await expect(canvas.getByRole('button', {name: 'Keep editing'})).toBeVisible();
  },
}, options);

/** `isActionLoading`: the action renders busy from the start (aria-busy, spinner). */
export const ActionLoading = composed(AlertDialogStory, {
  args: {isOpen: true, isActionLoading: true},
  parameters: openOnLoad,
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-alert-dialog');
    await waitFor(() => expect(canvasElement.querySelector('dialog')!.open).toBe(true));
    await expect(canvasElement.querySelector('dialog [data-ax-alert-action]')).toHaveAttribute('aria-busy', 'true');
  },
}, options);

/** `width={560}` (the default is 400). */
export const Wide = composed(AlertDialogStory, {args: {isOpen: true, width: 560}, parameters: openOnLoad}, options);

/** `isInline`: the dialog surface drawn in flow (role="group", no modality), for previews. */
export const Inline: Story = {
  args: {isInline: true, isOpen: true},
};
