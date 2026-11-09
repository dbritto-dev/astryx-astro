import IconButton from 'astryx-astro/components/IconButton/IconButton.astro';
import Demo from 'astryx-astro/components/IconButton/IconButton.demo.astro';
import demoSource from 'astryx-astro/components/IconButton/IconButton.demo.astro?raw';
import Icon from 'astryx-astro/components/Icon/Icon.astro';
import {expect, fn, userEvent, waitFor} from 'storybook/test';
import {isShowing} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import IconButtonMatrix from './IconButtonMatrix.astro';
import matrixSource from './IconButtonMatrix.astro?raw';

const meta = {
  title: 'Action/Icon Button',
  component: IconButton,
  ...astryx('IconButton'),
  args: {label: 'Settings', icon: 'wrench'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (IconButton.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/** Variants × sizes, with the loading and disabled state of each variant and the four elevations. */
export const Matrix = composed(IconButtonMatrix, {}, {source: matrixSource});

/** Square, no visible text: `label` is the accessible name. Click, Enter and Space activate it. */
export const Default: Story = {
  play: async ({canvas}) => {
    const button = canvas.getByRole('button', {name: 'Settings'});
    await expect(button.textContent?.trim()).toBe('');
    const onClick = fn();
    button.addEventListener('click', onClick);
    await userEvent.click(button);
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    await expect(onClick).toHaveBeenCalledTimes(3);
  },
};

export const Primary: Story = {args: {variant: 'primary', label: 'Add item', icon: 'arrowUp'}};

export const Ghost: Story = {args: {variant: 'ghost', label: 'Search', icon: 'search'}};

export const Destructive: Story = {args: {variant: 'destructive', label: 'Delete', icon: 'close'}};

export const Small: Story = {args: {size: 'sm'}};

export const Large: Story = {args: {size: 'lg'}};

/** The `icon` slot: an Icon passed as a configured component; it gets the button's icon size. */
export const IconSlot: Story = {
  args: {label: 'Close', slots:{icon: {component: Icon, props: {icon: 'close'}}}},
  play: async ({canvas, canvasElement}) => {
    await expect(canvas.getByRole('button', {name: 'Close'})).toBeVisible();
    await expect(canvasElement.querySelector('.astryx-button .astryx-icon')).toHaveAttribute('data-size', 'sm');
  },
};

/** Busy: a spinner replaces the icon; it keeps its name and focus but ignores clicks. */
export const Loading: Story = {
  args: {label: 'Refreshing', icon: 'arrowsUpDown', isLoading: true},
  play: async ({canvas}) => {
    const button = canvas.getByRole('button', {name: 'Refreshing'});
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    const onClick = fn();
    button.addEventListener('click', onClick);
    await userEvent.click(button);
    await expect(onClick).not.toHaveBeenCalled();
  },
};

export const Disabled: Story = {
  args: {label: 'Delete', icon: 'close', variant: 'destructive', isDisabled: true},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('button', {name: 'Delete'})).toBeDisabled();
  },
};

/** Shown above on hover and keyboard focus, and describes the button; Escape hides it. */
export const WithTooltip: Story = {
  args: {label: 'Copy', icon: 'copy', variant: 'ghost', tooltip: 'Copy to clipboard'},
  parameters: {layout: 'centered'},
  play: async ({canvas, canvasElement}) => {
    const button = canvas.getByRole('button', {name: 'Copy'});
    const tooltip = canvasElement.querySelector('[role="tooltip"]');
    await expect(button).toHaveAccessibleDescription('Copy to clipboard');
    await userEvent.hover(button);
    await waitFor(() => expect(isShowing(tooltip)).toBe(true));
    await userEvent.unhover(button);
    await waitFor(() => expect(isShowing(tooltip)).toBe(false));
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await waitFor(() => expect(isShowing(tooltip)).toBe(true));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(tooltip)).toBe(false));
  },
};

/** A tooltip keeps a disabled icon button focusable (aria-disabled), so the reason can be read. */
export const DisabledWithTooltip: Story = {
  args: {label: 'Copy', icon: 'copy', tooltip: 'Copying is turned off for this file', isDisabled: true},
  parameters: {layout: 'centered'},
  play: async ({canvas}) => {
    const button = canvas.getByRole('button', {name: 'Copy'});
    await expect(button).not.toBeDisabled();
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    const onClick = fn();
    button.addEventListener('click', onClick);
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(onClick).not.toHaveBeenCalled();
  },
};

/** `href` renders a link styled as an icon button (the click is logged in Actions). */
export const AsLink: Story = {
  args: {label: 'Open docs', icon: 'externalLink', variant: 'ghost', href: '/components/link/'},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('link', {name: 'Open docs'})).toHaveAttribute('href', '/components/link/');
  },
};

/** A floating action button: large, primary, high elevation. */
export const Elevated: Story = {args: {label: 'Add', icon: 'arrowUp', variant: 'primary', size: 'lg', elevation: 'high'}};

/** `width` overrides the square shape. */
export const CustomWidth: Story = {args: {label: 'Menu', icon: 'menu', width: 64}};
