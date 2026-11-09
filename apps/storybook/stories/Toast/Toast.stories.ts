import Button from 'astryx-astro/components/Button/Button.astro';
import Toast from 'astryx-astro/components/Toast/Toast.astro';
import Demo from 'astryx-astro/components/Toast/Toast.demo.astro';
import demoSource from 'astryx-astro/components/Toast/Toast.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import ToastViewportStory from './ToastViewportStory.astro';
import viewportSource from './ToastViewportStory.astro?raw';

const meta = {
  title: 'Overlay/Toast',
  component: Toast,
  ...astryx('Toast'),
  args: {body: 'Changes saved'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Toast.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/**
 * `type="info"` (default), rendered in place: its own polite status region. The dismiss button
 * reports `astryx-dismiss {reason: 'manual'}` (the card stays until the app removes it).
 */
export const Info: Story = {
  args: {isAutoHide: false},
  play: async ({canvas, canvasElement}) => {
    const toast = await upgraded(canvasElement, 'ax-toast');
    const dismissed = recordEvents<{reason: string}>(canvasElement, 'astryx-dismiss');
    await expect(toast).toHaveAttribute('role', 'status');
    await expect(toast).toHaveAttribute('aria-live', 'polite');
    await expect(toast).toHaveTextContent('Changes saved');
    await userEvent.click(canvas.getByRole('button', {name: 'Dismiss notification'}));
    await expect(dismissed.map((e) => e.detail.reason)).toEqual(['manual']);
  },
};

/** `type="error"`: the error surface, an assertive alert that does not auto-hide by default. */
export const ErrorType: Story = {
  args: {type: 'error', body: 'Upload failed: the file is larger than 25 MB.'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-toast');
    const toast = canvas.getByRole('alert');
    await expect(toast).toHaveAttribute('aria-live', 'assertive');
    await expect(toast).toHaveAttribute('data-ax-auto-hide', 'false');
  },
};

/**
 * Auto-hide (`isAutoHide`, `autoHideDuration={1500}`): when the timer ends the toast reports
 * `astryx-dismiss {reason: 'auto'}`. The timer pauses while the pointer or focus is inside.
 */
export const AutoHide: Story = {
  args: {body: 'Draft saved', isAutoHide: true, autoHideDuration: 1500},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-toast');
    const dismissed = recordEvents<{reason: string}>(canvasElement, 'astryx-dismiss');
    // The timer also pauses while the window has no focus, and a test runner's background frame
    // has none: give it focus (or report that it gained it) so the timer runs.
    window.focus();
    if (!document.hasFocus()) window.dispatchEvent(new FocusEvent('focus'));
    await waitFor(() => expect(dismissed.map((e) => e.detail.reason)).toEqual(['auto']), {timeout: 5000});
  },
};

/** An action in the `endContent` slot, before the dismiss button. */
export const WithAction: Story = {
  args: {body: 'Message archived', isAutoHide: false, slots: {endContent: {component: Button, props: {label: 'Undo', variant: 'ghost', size: 'sm'}}}},
};

/** The `content` slot replaces the whole layout (no dismiss button: compose your own). */
export const CustomContent: Story = {
  args: {
    isAutoHide: false,
    slots: {content: '<div style="display:flex;gap:var(--spacing-3);align-items:center;padding:var(--spacing-1) 0"><strong>3 files uploaded</strong><span style="opacity:.8">Report.pdf, Budget.xlsx, Notes.md</span></div>'},
  },
};

/** A long message wraps inside the card. */
export const LongMessage: Story = {
  args: {isAutoHide: false, body: 'Your export is ready. It includes every invoice from the last fiscal year, grouped by customer, with totals in the currency of each account.'},
};

const viewportOptions = {controls: ['position', 'maxVisible'], source: viewportSource};
const viewportFrame = {docs: {story: {inline: false, height: '360px'}}};
/** The messages of the toasts in the stack, oldest first (rows on their way out excluded). */
const rows = (viewport: Element) => [...viewport.querySelectorAll('ax-toast:not([data-ax-exiting])')].map((t) => t.querySelector('.ax-toast-content')?.textContent?.trim());

/**
 * ToastViewport + `toast()`: toasts stack in a corner without taking focus; the viewport is a
 * named region while it holds toasts; at most `maxVisible` show (older ones wait); a dismiss
 * button removes one and the next older surfaces; F6 moves focus into the newest toast.
 */
export const Stacking = composed(ToastViewportStory, {
  parameters: viewportFrame,
  play: async ({canvas, canvasElement, step}) => {
    const viewport = await upgraded(canvasElement, 'ax-toast-viewport');
    const dismissAll = async () => {
      for (const button of [...viewport.querySelectorAll<HTMLElement>('[data-ax-toast-dismiss]')].reverse()) await userEvent.click(button);
      await waitFor(() => expect(viewport.querySelector('ax-toast')).toBeNull());
    };

    await step('A toast appears without taking focus; the viewport becomes a named region', async () => {
      const raise = canvas.getByRole('button', {name: 'Info toast'});
      await userEvent.click(raise);
      await waitFor(() => expect(rows(viewport)).toEqual(['Changes saved']));
      await expect(raise).toHaveFocus();
      await expect(viewport).toHaveAttribute('role', 'region');
      await expect(viewport).toHaveAccessibleName('Notifications');
    });

    await step('An error toast stacks with it; dismiss buttons remove them', async () => {
      await userEvent.click(canvas.getByRole('button', {name: 'Error toast'}));
      await waitFor(() => expect(rows(viewport)).toContain('Could not reach the server'));
      await dismissAll();
      await expect(viewport).not.toHaveAttribute('role');
    });

    await step('A burst shows the newest three (maxVisible); dismissing one surfaces the next older', async () => {
      await userEvent.click(canvas.getByRole('button', {name: 'Burst of four'}));
      await waitFor(() => expect(rows(viewport)).toEqual(['Notification 2 of 4', 'Notification 3 of 4', 'Notification 4 of 4']));
      const newest = [...viewport.querySelectorAll<HTMLElement>('[data-ax-toast-dismiss]')].at(-1)!;
      await userEvent.click(newest);
      await waitFor(() => expect(rows(viewport)).toEqual(['Notification 1 of 4', 'Notification 2 of 4', 'Notification 3 of 4']));
    });

    await step('F6 moves focus into the newest toast', async () => {
      canvas.getByRole('button', {name: 'Burst of four'}).focus();
      await userEvent.keyboard('{F6}');
      await waitFor(() => expect(viewport.contains(document.activeElement)).toBe(true));
      await dismissAll();
    });
  },
}, viewportOptions);

/** An action toast: Undo dismisses it and raises a replacement. */
export const UndoAction = composed(ToastViewportStory, {
  parameters: viewportFrame,
  play: async ({canvas, canvasElement}) => {
    const viewport = await upgraded(canvasElement, 'ax-toast-viewport');
    await userEvent.click(canvas.getByRole('button', {name: 'With Undo'}));
    await waitFor(() => expect(rows(viewport)).toEqual(['Message archived']));
    await userEvent.click(canvas.getByRole('button', {name: 'Undo'}));
    await waitFor(() => expect(rows(viewport)).toEqual(['Message restored']));
    // The archived toast's exit motion ends before the next step.
    await waitFor(() => expect(viewport.querySelectorAll('ax-toast')).toHaveLength(1), {timeout: 3000});
    await userEvent.click(canvas.getByRole('button', {name: 'Dismiss notification'}));
    await waitFor(() => expect(viewport.querySelector('ax-toast')).toBeNull());
  },
}, viewportOptions);

/** `position="topStart"` on the viewport: the stack grows from the top start corner. */
export const ViewportTopStart = composed(ToastViewportStory, {
  args: {position: 'topStart'},
  parameters: viewportFrame,
  play: async ({canvas, canvasElement}) => {
    const viewport = await upgraded(canvasElement, 'ax-toast-viewport');
    await userEvent.click(canvas.getByRole('button', {name: 'Error toast'}));
    await waitFor(() => expect(viewport.querySelector('ax-toast')).not.toBeNull());
    const card = viewport.querySelector('ax-toast')!.getBoundingClientRect();
    await expect(card.top).toBeLessThan(innerHeight / 2);
    await expect(card.left).toBeLessThan(innerWidth / 2);
    await userEvent.click(canvas.getByRole('button', {name: 'Dismiss notification'}));
    await waitFor(() => expect(viewport.querySelector('ax-toast')).toBeNull());
  },
}, viewportOptions);
