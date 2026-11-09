import Thumbnail from 'astryx-astro/components/Thumbnail/Thumbnail.astro';
import Demo from 'astryx-astro/components/Thumbnail/Thumbnail.demo.astro';
import demoSource from 'astryx-astro/components/Thumbnail/Thumbnail.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents} from '../_lib/play';
import {astryx, overview, type Meta, type Story} from '../_lib/story';

/** Inline SVG artwork (no external images), as in Thumbnail.demo.astro. */
const art = (a: string, b: string) =>
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="96" height="96" fill="url(#g)"/><circle cx="66" cy="30" r="10" fill="#fff" fill-opacity=".9"/><path d="M0 96 34 52l22 26 14-14 26 32z" fill="#fff" fill-opacity=".75"/></svg>`,
  );
/** A data URI that is not a decodable image: its `error` event swaps in the placeholder. */
const broken = 'data:image/png;base64,AAAA';
const opacity = (element: Element) => Number(getComputedStyle(element).opacity);

const meta = {
  title: 'Content/Thumbnail',
  component: Thumbnail,
  ...astryx('Thumbnail'),
  args: {src: art('#4facfe', '#00f2fe'), alt: 'Mountain lake', label: 'lake.png'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Thumbnail.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/** A group named "label — alt"; the label shows in a tooltip on hover. */
export const Default: Story = {
  play: async ({canvas, canvasElement}) => {
    const group = canvas.getByRole('group', {name: 'lake.png — Mountain lake'});
    await expect(canvas.getByRole('img', {name: 'Mountain lake'})).toBeVisible();
    await userEvent.hover(group);
    await waitFor(() => expect(isShowing(canvasElement.querySelector('[role="tooltip"]'))).toBe(true));
    await expect(canvasElement.querySelector('[role="tooltip"]')).toHaveTextContent('lake.png');
  },
};

/** No `alt`: the image is decorative and the label alone names the group. */
export const DecorativeImage: Story = {
  args: {src: art('#f093fb', '#f5576c'), alt: undefined, label: 'sunset.jpg'},
  play: async ({canvas, canvasElement}) => {
    await expect(canvas.getByRole('group', {name: 'sunset.jpg'})).toBeVisible();
    const image = canvasElement.querySelector('img')!;
    await expect(image).toHaveAttribute('alt', '');
    await expect(image).toHaveAttribute('aria-hidden', 'true');
  },
};

/** No `src`: a placeholder. */
export const Placeholder: Story = {
  args: {src: undefined, alt: undefined, label: 'notes.pdf'},
  play: async ({canvas, canvasElement}) => {
    await expect(canvas.getByRole('group', {name: 'notes.pdf'})).toBeVisible();
    await expect(canvasElement.querySelector('img')).toBeNull();
  },
};

/** The image fails to load: the placeholder replaces it. */
export const BrokenImage: Story = {
  args: {src: broken, alt: 'Broken upload', label: 'broken.png'},
  play: async ({canvasElement}) => {
    await waitFor(() => expect(canvasElement.querySelector('img')).toBeNull());
    await expect(canvasElement.querySelector('.ax-thumbnail-placeholder')).not.toBeNull();
  },
};

/** Loading without an image: a skeleton. */
export const LoadingSkeleton: Story = {
  args: {src: undefined, alt: undefined, label: 'uploading.png', isLoading: true},
  play: async ({canvasElement}) => {
    await expect(canvasElement.querySelector('img')).toBeNull();
    await expect(canvasElement.querySelector('.astryx-skeleton')).not.toBeNull();
  },
};

/** Loading with an image: a scrim with a spinner; the busy start is announced once ("Loading"). */
export const LoadingWithImage: Story = {
  args: {src: art('#43e97b', '#38f9d7'), alt: 'Uploading chart', label: undefined, isLoading: true},
  play: async ({canvasElement}) => {
    await expect(canvasElement.querySelector('img')).toBeVisible();
    await expect(canvasElement.querySelector('.astryx-spinner')).toHaveAttribute('aria-hidden', 'true');
    await waitFor(() => expect(document.querySelector('[data-astryx-live-region="polite"]')).toHaveTextContent('Loading'));
  },
};

/**
 * Remove shows on hover and at once when keyboard focus moves inside (always on touch
 * devices); its click dispatches `astryx-remove`.
 */
export const Removable: Story = {
  args: {src: art('#fa709a', '#fee140'), alt: 'Beach', label: 'beach.jpg', isRemovable: true},
  play: async ({canvas, canvasElement, step}) => {
    const removes = recordEvents(canvasElement, 'astryx-remove');
    const remove = canvas.getByRole('button', {name: 'Remove beach.jpg — Beach'});
    const slot = canvasElement.querySelector('.ax-thumbnail-remove-slot')!;
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
      await expect(opacity(slot)).toBe(0);
    }
    await step('Keyboard focus reveals the remove button', async () => {
      await userEvent.tab();
      await expect(remove).toHaveFocus();
      await waitFor(() => expect(opacity(slot)).toBe(1));
    });
    await step('Activating it dispatches astryx-remove', async () => {
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(removes).toHaveLength(1));
      await userEvent.click(remove);
      await waitFor(() => expect(removes).toHaveLength(2));
    });
  },
};

/** `showRemoveOn="always"`: the remove button is always visible. */
export const RemoveAlwaysShown: Story = {
  args: {src: art('#a18cd1', '#fbc2eb'), alt: 'Flowers', label: 'flowers.jpg', isRemovable: true, showRemoveOn: 'always'},
  play: async ({canvasElement}) => {
    await expect(opacity(canvasElement.querySelector('.ax-thumbnail-remove-slot')!)).toBe(1);
  },
};

/** `isClickable` adds an Open action (`astryx-click`); a remove click never opens. */
export const Clickable: Story = {
  args: {src: art('#30cfd0', '#330867'), alt: 'Night sky', label: 'night.png', isClickable: true, isRemovable: true},
  play: async ({canvas, canvasElement}) => {
    const clicks = recordEvents(canvasElement, 'astryx-click');
    const removes = recordEvents(canvasElement, 'astryx-remove');
    const open = canvas.getByRole('button', {name: 'Open night.png — Night sky'});
    await userEvent.click(open);
    await waitFor(() => expect(clicks).toHaveLength(1));
    open.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(clicks).toHaveLength(2));
    await userEvent.click(canvas.getByRole('button', {name: 'Remove night.png — Night sky'}));
    await waitFor(() => expect(removes).toHaveLength(1));
    await expect(clicks).toHaveLength(2);
  },
};

/** Disabled: Open and Remove stay mounted and focusable, `aria-disabled`, and inert. */
export const Disabled: Story = {
  args: {src: art('#667eea', '#764ba2'), alt: 'Abstract', label: 'abstract.png', isClickable: true, isRemovable: true, showRemoveOn: 'always', isDisabled: true},
  play: async ({canvas, canvasElement}) => {
    const clicks = recordEvents(canvasElement, 'astryx-click');
    const removes = recordEvents(canvasElement, 'astryx-remove');
    const open = canvas.getByRole('button', {name: 'Open abstract.png — Abstract'});
    const remove = canvas.getByRole('button', {name: 'Remove abstract.png — Abstract'});
    for (const button of [open, remove]) {
      await expect(button).toHaveAttribute('aria-disabled', 'true');
      button.focus();
      await expect(button).toHaveFocus();
      await userEvent.keyboard('{Enter}');
      button.click();
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect([...clicks, ...removes]).toHaveLength(0);
  },
};

/** Loading with an Open action: Open is inert until the upload finishes. */
export const LoadingClickable: Story = {
  args: {src: art('#f6d365', '#fda085'), alt: 'Processing', label: 'processing.png', isClickable: true, isLoading: true},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('button', {name: 'Open processing.png — Processing'})).toHaveAttribute('aria-disabled', 'true');
  },
};

/** Translated action names (`locale`). */
export const Localized: Story = {
  args: {src: art('#84fab0', '#8fd3f4'), alt: 'Diagram', label: 'diagram.svg', isRemovable: true, showRemoveOn: 'always', locale: 'es-ES'},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('button', {name: 'Quitar diagram.svg — Diagram'})).toBeVisible();
  },
};
