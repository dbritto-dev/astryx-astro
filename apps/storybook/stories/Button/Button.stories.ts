import Button from 'astryx-astro/components/Button/Button.astro';
import Demo from 'astryx-astro/components/Button/Button.demo.astro';
import demoSource from 'astryx-astro/components/Button/Button.demo.astro?raw';
import Badge from 'astryx-astro/components/Badge/Badge.astro';
import Icon from 'astryx-astro/components/Icon/Icon.astro';
import {expect, fn, userEvent, waitFor} from 'storybook/test';
import {isShowing} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import ButtonMatrix from './ButtonMatrix.astro';
import matrixSource from './ButtonMatrix.astro?raw';

const meta = {
  title: 'Action/Button',
  component: Button,
  ...astryx('Button'),
  args: {label: 'Save'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Button.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/** Variants × sizes, with the icon, icon-only, loading and disabled state of each variant. */
export const Matrix = composed(ButtonMatrix, {}, {source: matrixSource});

export const Primary: Story = {
  args: {variant: 'primary'},
  play: async ({canvas}) => {
    const button = canvas.getByRole('button', {name: 'Save'});
    const onClick = fn();
    button.addEventListener('click', onClick);
    await userEvent.click(button);
    await userEvent.keyboard('{Enter}');
    await expect(onClick).toHaveBeenCalledTimes(2);
  },
};

export const Secondary: Story = {args: {variant: 'secondary'}};

export const Ghost: Story = {args: {variant: 'ghost'}};

export const Destructive: Story = {args: {variant: 'destructive', label: 'Delete'}};

export const Small: Story = {args: {size: 'sm'}};

export const Large: Story = {args: {size: 'lg'}};

/** `icon` takes a semantic name, resolved from the theme's icon set. */
export const WithIcon: Story = {args: {variant: 'primary', icon: 'check'}};

/** The label becomes the accessible name of a square, icon-only button. */
export const IconOnly: Story = {
  args: {label: 'More actions', icon: 'moreHorizontal', isIconOnly: true},
  play: async ({canvas}) => {
    const button = canvas.getByRole('button', {name: 'More actions'});
    await expect(button.textContent?.trim()).toBe('');
  },
};

/** The `icon` slot: an Icon passed as a configured component (`args.slots.icon`). */
export const IconSlot: Story = {
  args: {label: 'Upload', variant: 'ghost', slots: {icon: {component: Icon, props: {icon: 'upload'}}}},
  play: async ({canvasElement}) => {
    // Button stamps its default icon size onto slotted Icons (sm for md buttons).
    await expect(canvasElement.querySelector('.ax-button-icon .astryx-icon')).toHaveAttribute('data-size', 'sm');
  },
};

/** `endContent` as a slot holding a Badge. */
export const EndContentBadge: Story = {
  args: {label: 'Messages', variant: 'primary', slots: {endContent: {component: Badge, props: {label: 3}}}},
};

/** `endContent` as an icon name. */
export const EndContentIcon: Story = {args: {label: 'Options', endContent: 'chevronDown'}};

/** Visible content that differs from the label (default slot); the label stays the accessible name. */
export const CustomContent: Story = {
  args: {label: 'Save draft', slots: {default: '<strong>Save</strong>&nbsp;draft'}},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('button', {name: 'Save draft'})).toBeVisible();
  },
};

/** Keeps its size and name, shows a spinner, is busy and inert but still focusable. */
export const Loading: Story = {
  args: {label: 'Saving changes', variant: 'primary', isLoading: true},
  play: async ({canvas}) => {
    const button = canvas.getByRole('button', {name: 'Saving changes'});
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    const onClick = fn();
    button.addEventListener('click', onClick);
    await userEvent.click(button);
    await expect(onClick).not.toHaveBeenCalled();
  },
};

export const Disabled: Story = {
  args: {isDisabled: true},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('button', {name: 'Save'})).toBeDisabled();
  },
};

/** A tooltip keeps a disabled button focusable (aria-disabled) so the reason can be read. */
export const DisabledWithTooltip: Story = {
  args: {isDisabled: true, tooltip: 'Unavailable on this plan'},
  play: async ({canvas}) => {
    const button = canvas.getByRole('button', {name: 'Save'});
    await expect(button).not.toBeDisabled();
    await expect(button).toHaveAttribute('aria-disabled', 'true');
  },
};

/** Shown above the button on hover and keyboard focus; Escape hides it. */
export const WithTooltip: Story = {
  args: {label: 'Archive', icon: 'upload', tooltip: 'Moves the thread out of your inbox'},
  play: async ({canvas, canvasElement}) => {
    const button = canvas.getByRole('button', {name: 'Archive'});
    const tooltip = canvasElement.querySelector('[role="tooltip"]');
    await expect(button).toHaveAccessibleDescription('Moves the thread out of your inbox');
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await waitFor(() => expect(isShowing(tooltip)).toBe(true));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(tooltip)).toBe(false));
  },
};

/** `href` renders a link styled as a button (clicks are logged in Actions instead of navigating). */
export const AsLink: Story = {
  args: {label: 'Read the docs', href: '/components/link/', variant: 'primary'},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('link', {name: 'Read the docs'})).toHaveAttribute('href', '/components/link/');
  },
};

/** A floating action button: icon-only, large, high elevation. */
export const Elevated: Story = {args: {label: 'Add', icon: 'arrowUp', isIconOnly: true, variant: 'primary', size: 'lg', elevation: 'high'}};

export const FullWidth: Story = {args: {label: 'Continue', variant: 'primary', width: '100%'}};

/** Pinned to dark mode with story globals (the toolbar can still change it). */
export const PrimaryDark: Story = {
  args: {variant: 'primary'},
  globals: {astryxMode: 'dark'},
  play: async () => {
    await expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  },
};
