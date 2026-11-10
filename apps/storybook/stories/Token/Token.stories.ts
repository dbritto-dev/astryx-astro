import Token from 'astryx-astro/components/Token/Token.astro';
import Demo from 'astryx-astro/components/Token/Token.demo.astro';
import demoSource from 'astryx-astro/components/Token/Token.demo.astro?raw';
import Badge from 'astryx-astro/components/Badge/Badge.astro';
import Icon from 'astryx-astro/components/Icon/Icon.astro';
import {expect, fn, userEvent, waitFor} from 'storybook/test';
import {recordEvents} from '../_lib/play';
import {astryx, composed, frame, overview, type Meta, type Story, knownA11y} from '../_lib/story';
import TokenMatrix from './TokenMatrix.astro';
import matrixSource from './TokenMatrix.astro?raw';

const meta = {
  title: 'Content/Token',
  component: Token,
  ...astryx('Token'),
  args: {label: 'Design'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Token.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource, {parameters: knownA11y({
  "color-contrast": "A disabled token uses Astryx's disabled colour; colours are kept as Astryx ships them (docs/accessibility.md). An interactive one also carries aria-disabled (WCAG 1.4.3 exempts it)."
})});

/** Every colour × size, then removable and disabled tokens of each size. */
export const Matrix = composed(TokenMatrix, {
  parameters: knownA11y({
    "color-contrast": "A disabled token uses Astryx's disabled colour; colours are kept as Astryx ships them (docs/accessibility.md). An interactive one also carries aria-disabled (WCAG 1.4.3 exempts it)."
  }),}, {source: matrixSource});

/** A static chip: a plain span with no tab stop. */
export const Default: Story = {
  play: async ({canvasElement}) => {
    const token = canvasElement.querySelector('.astryx-token')!;
    await expect(token.tagName).toBe('SPAN');
    await expect(token).not.toHaveAttribute('tabindex');
    await expect(token.querySelector('button, a')).toBeNull();
  },
};

export const Purple: Story = {args: {color: 'purple'}};

export const Small: Story = {args: {size: 'sm'}};

export const Large: Story = {args: {size: 'lg'}};

/** `icon` takes a semantic icon name. */
export const WithIcon: Story = {args: {label: 'Filters', icon: 'funnel'}};

/** An Icon in the `icon` slot (a configured component). */
export const IconSlot: Story = {
  args: {label: 'Approved', color: 'green', slots: {icon: {component: Icon, props: {icon: 'check', size: 'sm'}}}},
};

/** A Badge in the `endContent` slot. */
export const EndContentSlot: Story = {
  args: {label: 'Inbox', color: 'purple', slots: {endContent: {component: Badge, props: {label: 4, variant: 'purple'}}}},
};

/** The label is visually hidden but stays the accessible name. */
export const LabelHidden: Story = {
  args: {label: 'Status: active', color: 'teal', isLabelHidden: true, icon: 'success'},
  play: async ({canvasElement}) => {
    await expect(canvasElement.querySelector('.astryx-token')).toHaveAttribute('aria-label', 'Status: active');
  },
};

/** `description` becomes the token's accessible description. */
export const WithDescription: Story = {
  args: {label: 'Owner', color: 'cyan', description: 'Can edit and delete'},
  play: async ({canvasElement}) => {
    await expect(canvasElement.querySelector('.astryx-token')).toHaveAttribute('aria-description', 'Can edit and delete');
  },
};

/** The remove button is named "Remove {label}"; a click or Enter dispatches `astryx-remove` (removing the token is the caller's job). */
export const Removable: Story = {
  args: {label: 'Ada Lovelace', isRemovable: true},
  play: async ({canvas, canvasElement}) => {
    const removes = recordEvents<{event: Event}>(canvasElement, 'astryx-remove');
    const remove = canvas.getByRole('button', {name: 'Remove Ada Lovelace'});
    await userEvent.click(remove);
    await waitFor(() => expect(removes).toHaveLength(1));
    remove.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(removes).toHaveLength(2));
    await expect(removes[0].target).toBe(canvasElement.querySelector('.astryx-token'));
  },
};

/** A link token (clicks are logged in Actions instead of navigating). */
export const AsLink: Story = {
  args: {label: 'Docs', color: 'blue', href: '/components/link/'},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('link', {name: 'Docs'})).toHaveAttribute('href', '/components/link/');
  },
};

/** A link with a remove button: the link and the button are siblings inside the token. */
export const LinkRemovable: Story = {
  args: {label: 'Docs', color: 'blue', href: '/components/link/', isRemovable: true},
  play: async ({canvas, canvasElement}) => {
    const removes = recordEvents(canvasElement, 'astryx-remove');
    const link = canvas.getByRole('link', {name: 'Docs'});
    const remove = canvas.getByRole('button', {name: 'Remove Docs'});
    await expect(link.contains(remove)).toBe(false);
    const onLinkClick = fn();
    link.addEventListener('click', (event) => {
      event.preventDefault();
      onLinkClick();
    });
    await userEvent.click(remove);
    await waitFor(() => expect(removes).toHaveLength(1));
    await expect(onLinkClick).not.toHaveBeenCalled();
  },
};

/** `interactiveRole="button"`: an inner button is the token's action; a click anywhere on the surface reaches it once. */
export const Clickable: Story = {
  args: {label: 'Open filter', color: 'orange', interactiveRole: 'button', icon: 'funnel'},
  play: async ({canvas, canvasElement}) => {
    const action = canvas.getByRole('button', {name: 'Open filter'});
    const onAction = fn();
    action.addEventListener('click', onAction);
    await userEvent.click(canvasElement.querySelector<HTMLElement>('.astryx-token .astryx-icon')!);
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    action.focus();
    await userEvent.keyboard(' ');
    await expect(onAction).toHaveBeenCalledTimes(2);
  },
};

/** Disabled: half opacity; the remove button stays focusable but inert. */
export const Disabled: Story = {
  parameters: knownA11y({
    "color-contrast": "A disabled token uses Astryx's disabled colour; colours are kept as Astryx ships them (docs/accessibility.md). An interactive one also carries aria-disabled (WCAG 1.4.3 exempts it)."
  }),
  args: {label: 'Locked', isDisabled: true, isRemovable: true},
  play: async ({canvas, canvasElement}) => {
    const removes = recordEvents(canvasElement, 'astryx-remove');
    const remove = canvas.getByRole('button', {name: 'Remove Locked'});
    await expect(remove).toHaveAttribute('aria-disabled', 'true');
    remove.focus();
    await expect(remove).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    // The token has pointer-events: none, so a pointer cannot reach it; a scripted click can.
    remove.click();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(removes).toHaveLength(0);
  },
};

/** A disabled link: focusable, `aria-disabled`, no destination. */
export const DisabledLink: Story = {
  args: {label: 'Docs', href: '/components/link/', isDisabled: true},
  play: async ({canvas}) => {
    const link = canvas.getByRole('link', {name: 'Docs'});
    await expect(link).toHaveAttribute('aria-disabled', 'true');
    await expect(link).not.toHaveAttribute('href');
  },
};

/** A label longer than its container is truncated. */
export const Truncated: Story = {
  args: {label: 'A long token label that does not fit', isRemovable: true},
  decorators: [frame({width: 160})],
};
