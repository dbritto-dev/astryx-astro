import Lightbox from 'astryx-astro/components/Lightbox/Lightbox.astro';
import Demo from 'astryx-astro/components/Lightbox/Lightbox.demo.astro';
import demoSource from 'astryx-astro/components/Lightbox/Lightbox.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta} from '../_lib/story';
import LightboxStory from './LightboxStory.astro';
import lightboxSource from './LightboxStory.astro?raw';

const meta = {
  title: 'Overlay/Lightbox',
  component: Lightbox,
  ...astryx('Lightbox'),
  // `media` is required: one photo (an inline SVG, no image request). The stories render through
  // LightboxStory, which builds its own photos.
  args: {media: {src: `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 10"><rect width="16" height="10" fill="#4f7cff"/></svg>')}`, alt: 'Harbour at noon'}},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Lightbox.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {controls: ['items', 'hasZoom', 'isOpen', 'defaultIndex'], source: lightboxSource};
const parts = (root: HTMLElement) => {
  const dialog = root.querySelector('dialog')!;
  return {
    dialog,
    counter: () => dialog.querySelector('.ax-lightbox-counter')?.textContent,
    button: (name: string) => dialog.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!,
  };
};

/**
 * A gallery opened from its thumbnails (useLightbox triggers): Enter on a thumbnail opens a modal
 * viewer at that photo, named by its alt text, focus inside; arrows and the Previous / Next
 * buttons move (disabled at the ends, a counter shows the position); Tab stays inside; Escape
 * closes and focus returns to the thumbnail.
 */
export const Gallery = composed(LightboxStory, {
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-lightbox');
    const {dialog, counter, button} = parts(canvasElement);
    const opens = recordEvents<{isOpen: boolean}>(canvasElement, 'astryx-open-change');
    const moves = recordEvents<{index: number}>(canvasElement, 'astryx-index-change');
    const thumbnail = canvas.getByRole('button', {name: 'Dunes at dusk'});
    await expect(thumbnail).toHaveAttribute('aria-haspopup', 'dialog');

    await step('Enter on a thumbnail opens the viewer at that photo', async () => {
      thumbnail.focus();
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(dialog.matches(':modal')).toBe(true));
      await expect(dialog).toHaveAccessibleName('Dunes at dusk');
      await expect(counter()).toBe('2 / 4');
      await expect(dialog).toHaveTextContent('Late light over the dunes.');
      await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
      await expect(opens.map((e) => e.detail.isOpen)).toEqual([true]);
    });

    await step('ArrowRight moves on; a photo without alt text names the viewer "Media viewer"', async () => {
      await userEvent.keyboard('{ArrowRight}');
      await expect(counter()).toBe('3 / 4');
      await expect(dialog).toHaveAccessibleName('Night ridge');
      await userEvent.keyboard('{ArrowRight}');
      await expect(dialog).toHaveAccessibleName('Media viewer');
      await expect(button('Next')).toBeDisabled();
      await userEvent.keyboard('{ArrowRight}');
      await expect(counter()).toBe('4 / 4');
      await expect(moves.map((e) => e.detail.index)).toEqual([2, 3]);
    });

    await step('The Previous button moves back; at the first photo it is disabled', async () => {
      await userEvent.click(button('Previous'));
      await expect(counter()).toBe('3 / 4');
      await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
      await expect(counter()).toBe('1 / 4');
      await expect(button('Previous')).toBeDisabled();
    });

    await step('Tab stays inside the viewer', async () => {
      button('Close').focus();
      for (let i = 0; i < 4; i++) {
        await userEvent.tab();
        await expect(dialog.contains(document.activeElement)).toBe(true);
      }
    });

    await step('Escape closes it and focus returns to the thumbnail', async () => {
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(dialog.open).toBe(false));
      await expect(thumbnail).toHaveFocus();
      await expect(opens.map((e) => e.detail.isOpen)).toEqual([true, false]);
    });
  },
}, options);

/**
 * `hasZoom`: the image is a "Zoom" toggle button. Enter, `+` / `-` and a double-click zoom it to
 * 2×; while zoomed the arrows pan instead of moving to another photo.
 */
export const Zoom = composed(LightboxStory, {
  args: {hasZoom: true},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-lightbox');
    const {dialog, counter} = parts(canvasElement);
    await userEvent.click(canvas.getByRole('button', {name: 'Harbour at noon'}));
    await waitFor(() => expect(dialog.open).toBe(true));
    const zoom = dialog.querySelector<HTMLElement>('[role="button"][aria-label="Zoom"]')!;
    await expect(zoom).toHaveAttribute('aria-pressed', 'false');
    zoom.focus();
    await userEvent.keyboard('{Enter}');
    await expect(zoom).toHaveAttribute('aria-pressed', 'true');
    await userEvent.keyboard('{ArrowRight}');
    await expect(counter()).toBe('1 / 4');
    await userEvent.keyboard('-');
    await expect(zoom).toHaveAttribute('aria-pressed', 'false');
    await userEvent.keyboard('+');
    await expect(zoom).toHaveAttribute('aria-pressed', 'true');
    await userEvent.dblClick(zoom);
    await expect(zoom).toHaveAttribute('aria-pressed', 'false');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(dialog.open).toBe(false));
  },
}, options);

/**
 * A single photo opened from a button: no counter or navigation. The close button closes it and
 * returns focus; a press on the backdrop around the photo closes it too.
 */
export const SingleImage = composed(LightboxStory, {
  args: {items: 'single'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-lightbox');
    const {dialog, counter, button} = parts(canvasElement);
    const trigger = canvas.getByRole('button', {name: 'View photo'});
    await userEvent.click(trigger);
    await waitFor(() => expect(dialog.matches(':modal')).toBe(true));
    await expect(counter()).toBeUndefined();
    await expect(dialog.querySelector('button[aria-label="Next"]')).toBeNull();
    await userEvent.click(button('Close'));
    await waitFor(() => expect(dialog.open).toBe(false));
    await expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await waitFor(() => expect(dialog.open).toBe(true));
    await userEvent.click(dialog.querySelector<HTMLElement>('.ax-lightbox-container')!);
    await waitFor(() => expect(dialog.open).toBe(false));
  },
}, options);

/** Rendered open (`isOpen`) at the third photo (`defaultIndex={2}`); docs show it in its own frame. */
export const OpenOnLoad = composed(LightboxStory, {
  args: {isOpen: true, defaultIndex: 2},
  parameters: {docs: {story: {inline: false, height: '420px'}}},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-lightbox');
    const {dialog, counter} = parts(canvasElement);
    await waitFor(() => expect(dialog.open).toBe(true));
    await expect(counter()).toBe('3 / 4');
  },
}, options);
