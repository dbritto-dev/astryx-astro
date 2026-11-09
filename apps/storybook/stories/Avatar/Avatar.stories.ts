import Avatar from 'astryx-astro/components/Avatar/Avatar.astro';
import AvatarStatusDot from 'astryx-astro/components/Avatar/AvatarStatusDot.astro';
import Demo from 'astryx-astro/components/Avatar/Avatar.demo.astro';
import demoSource from 'astryx-astro/components/Avatar/Avatar.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import AvatarMatrix from './AvatarMatrix.astro';
import matrixSource from './AvatarMatrix.astro?raw';

const meta = {
  title: 'Content/Avatar',
  component: Avatar,
  ...astryx('Avatar'),
  args: {name: 'Ada Lovelace'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Avatar.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

// Inline SVG "photo" (no external images), as in Avatar.demo.astro.
const photo =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#30c48d"/><stop offset="1" stop-color="#2a8bd8"/></linearGradient></defs><rect width="96" height="96" fill="url(#g)"/><circle cx="48" cy="38" r="17" fill="#fff" fill-opacity=".85"/><path d="M14 96c4-22 18-32 34-32s30 10 34 32z" fill="#fff" fill-opacity=".85"/></svg>',
  );
/** A data URI that is not a decodable image: its `error` event drives the fallback chain. */
const broken = 'data:image/png;base64,AAAA';
const tooltipOf = (root: Element) => root.querySelector('[role="tooltip"]');

/** Sizes × shapes with an image and with initials, then each status dot variant at the three dot tiers. */
export const Matrix = composed(AvatarMatrix, {}, {source: matrixSource});

/** Initials from the name; the name is the accessible name and shows in a tooltip on hover and keyboard focus. */
export const Default: Story = {
  play: async ({canvas, canvasElement, step}) => {
    const avatar = canvas.getByRole('img', {name: 'Ada Lovelace'});
    await expect(avatar).toHaveTextContent('AL');
    await step('Hover shows the name, leaving hides it', async () => {
      await userEvent.hover(avatar);
      await waitFor(() => expect(isShowing(tooltipOf(canvasElement))).toBe(true));
      await expect(tooltipOf(canvasElement)).toHaveTextContent('Ada Lovelace');
      await userEvent.unhover(avatar);
      await waitFor(() => expect(isShowing(tooltipOf(canvasElement))).toBe(false));
    });
    await step('A tooltip makes it a tab stop; focus shows the tooltip, Escape hides it', async () => {
      await userEvent.tab();
      await expect(avatar).toHaveFocus();
      await waitFor(() => expect(isShowing(tooltipOf(canvasElement))).toBe(true));
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(tooltipOf(canvasElement))).toBe(false));
    });
  },
};

/** An image `src` (here an inline SVG data URI). */
export const WithImage: Story = {
  args: {src: photo, size: 'lg'},
  play: async ({canvas}) => {
    const avatar = canvas.getByRole('img', {name: 'Ada Lovelace'});
    const image = avatar.querySelector('img')!;
    await waitFor(() => expect(image.naturalWidth).toBeGreaterThan(0));
    await expect(avatar).not.toHaveTextContent('AL');
  },
};

/** `src` fails to load: the initials plate replaces the image. */
export const BrokenImage: Story = {
  args: {name: 'Grace Hopper', src: broken, size: 'lg'},
  play: async ({canvas}) => {
    const avatar = canvas.getByRole('img', {name: 'Grace Hopper'});
    await waitFor(() => expect(avatar.querySelector('img')).toBeNull());
    await expect(avatar).toHaveTextContent('GH');
  },
};

/** `src` fails, `fallbackSrc` loads instead. */
export const FallbackSource: Story = {
  args: {name: 'Grace Hopper', src: broken, fallbackSrc: photo, size: 'lg'},
  play: async ({canvas}) => {
    const avatar = canvas.getByRole('img', {name: 'Grace Hopper'});
    await waitFor(() => expect(avatar.querySelector('img')?.getAttribute('src')).toBe(photo));
    await waitFor(() => expect(avatar.querySelector('img')!.naturalWidth).toBeGreaterThan(0));
    await expect(avatar).not.toHaveTextContent('GH');
  },
};

/** No name and no image: a person icon, and the avatar is decorative (hidden from assistive technology, no tab stop). */
export const PersonIcon: Story = {
  args: {name: '', size: 'lg'},
  play: async ({canvasElement}) => {
    const avatar = canvasElement.querySelector('.astryx-avatar')!;
    await expect(avatar).toHaveAttribute('role', 'presentation');
    await expect(avatar).toHaveAttribute('aria-hidden', 'true');
    await expect(avatar).not.toHaveAttribute('tabindex');
    await expect(avatar.querySelector('svg')).not.toBeNull();
  },
};

export const ExtraSmall: Story = {args: {size: 'xsm'}};

export const Large: Story = {args: {size: 'lg'}};

export const ExtraLarge: Story = {args: {size: 'xl', src: photo}};

/** A numeric size in px (16, 20, 24, 32, 36, 40, 48, 60, 64, 72, 96, 128, 144, 180). */
export const NumericSize: Story = {args: {size: 96}};

export const Rounded: Story = {args: {shape: 'rounded', size: 'lg', src: photo}};

export const Square: Story = {args: {shape: 'square', size: 'lg'}};

/** An AvatarStatusDot in the `status` slot: its label joins the avatar's accessible name. */
export const WithStatus: Story = {
  args: {name: 'Jane Doe', size: 'lg', slots: {status: {component: AvatarStatusDot, props: {variant: 'success', label: 'Online'}}}},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('img', {name: 'Jane Doe, Online'})).toBeVisible();
  },
};

/** The neutral status dot is a ring, so status does not rely on colour alone. */
export const StatusNeutral: Story = {
  args: {name: 'Sam Lee', size: 'lg', slots: {status: {component: AvatarStatusDot, props: {variant: 'neutral', label: 'Away'}}}},
};

/** The error status dot is a minus bar. */
export const StatusError: Story = {
  args: {name: 'Kim Park', size: 'xl', slots: {status: {component: AvatarStatusDot, props: {variant: 'error', label: 'Busy'}}}},
};

/** A custom tooltip string describes the avatar (aria-describedby) instead of repeating the name. */
export const CustomTooltip: Story = {
  args: {name: 'jsmith', tooltip: 'Jane Smith, Staff Engineer', size: 'lg'},
  play: async ({canvas, canvasElement}) => {
    const avatar = canvas.getByRole('img', {name: 'jsmith'});
    await expect(avatar).toHaveAccessibleDescription('Jane Smith, Staff Engineer');
    avatar.focus();
    await waitFor(() => expect(isShowing(tooltipOf(canvasElement))).toBe(true));
  },
};

/** `tooltip={false}`: no tooltip, so a static avatar is not a tab stop. */
export const NoTooltip: Story = {
  args: {tooltip: false},
  play: async ({canvas, canvasElement}) => {
    const avatar = canvas.getByRole('img', {name: 'Ada Lovelace'});
    await expect(avatar).not.toHaveAttribute('tabindex');
    await expect(tooltipOf(canvasElement)).toBeNull();
  },
};

/** `href` renders a link named by the avatar (clicks are logged in Actions instead of navigating). */
export const AsLink: Story = {
  args: {href: '/people/ada-lovelace', src: photo, size: 'lg'},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('link', {name: 'Ada Lovelace'})).toHaveAttribute('href', '/people/ada-lovelace');
  },
};

/** `isClickable` renders a button; every click, by pointer or keyboard, dispatches `astryx-click`. */
export const Clickable: Story = {
  args: {isClickable: true, size: 'lg'},
  play: async ({canvas, canvasElement}) => {
    const clicks = recordEvents<{event: MouseEvent}>(canvasElement, 'astryx-click');
    const button = canvas.getByRole('button', {name: 'Ada Lovelace'});
    await expect(button).toHaveAttribute('type', 'button');
    await userEvent.click(button);
    await waitFor(() => expect(clicks).toHaveLength(1));
    button.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(clicks).toHaveLength(2));
    await expect(clicks[0].detail.event).toBeInstanceOf(MouseEvent);
  },
};
