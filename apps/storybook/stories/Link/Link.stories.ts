import Link from 'astryx-astro/components/Link/Link.astro';
import Demo from 'astryx-astro/components/Link/Link.demo.astro';
import demoSource from 'astryx-astro/components/Link/Link.demo.astro?raw';
import Icon from 'astryx-astro/components/Icon/Icon.astro';
import {expect, fn, userEvent, waitFor} from 'storybook/test';
import {isShowing} from '../_lib/play';
import {astryx, composed, frame, overview, type Meta, type Story, knownA11y} from '../_lib/story';
import LinkColors from './LinkColors.astro';
import colorsSource from './LinkColors.astro?raw';
import LinkCustomComponent from './LinkCustomComponent.astro';
import customSource from './LinkCustomComponent.astro?raw';
import LinkInText from './LinkInText.astro';
import inTextSource from './LinkInText.astro?raw';

const meta = {
  title: 'Action/Link',
  component: Link,
  ...astryx('Link'),
  args: {slots: {default: 'Account settings'}},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Link.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource, {parameters: knownA11y({
  "color-contrast": "color=\"disabled\" is Astryx's grey colour option; colours are kept as Astryx ships them (docs/accessibility.md)."
})});

/** Accent link; underlined on hover. Clicking it changes the hash only (other destinations are logged in Actions). */
export const Default: Story = {
  args: {href: '#settings'},
  play: async ({canvas}) => {
    const link = canvas.getByRole('link', {name: 'Account settings'});
    await expect(link).toHaveAttribute('href', '#settings');
    await expect(link).not.toHaveAttribute('target');
    await userEvent.tab();
    await expect(link).toHaveFocus();
  },
};

/** Every `color`: standalone, always underlined and inline. */
export const Colors = composed(LinkColors, {
  parameters: knownA11y({
    "color-contrast": "color=\"disabled\" is Astryx's grey colour option; colours are kept as Astryx ships them (docs/accessibility.md)."
  }),}, {source: colorsSource});

/** Inside running text, `type="inherit"` adopts the paragraph's type. */
export const InText = composed(LinkInText, {}, {controls: ['hasUnderline'], source: inTextSource});

/** `hasUnderline`: underlined at rest, not only on hover. */
export const WithUnderline: Story = {args: {href: '#settings', hasUnderline: true}};

/** `isStandalone`: body size outside running text. */
export const Standalone: Story = {args: {href: '#settings', isStandalone: true}};

export const Bold: Story = {args: {href: '#settings', isStandalone: true, weight: 'bold'}};

export const SmallSize: Story = {args: {href: '#settings', size: 'sm'}};

/** `isExternalLink`: opens in a new tab with safe rel tokens, an icon and screen-reader text. */
export const ExternalLink: Story = {
  args: {href: 'https://example.com/changelog', isExternalLink: true, slots: {default: 'Changelog'}},
  play: async ({canvas, canvasElement}) => {
    const link = canvas.getByRole('link', {name: /Changelog/});
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(link).toHaveAccessibleName(/^Changelog\s*\(opens in new tab\)$/);
    await expect(canvasElement.querySelector('.astryx-link .astryx-icon')).not.toBeNull();
  },
};

/** `target="_blank"` merges `noopener noreferrer` into the caller's `rel`. */
export const TargetBlank: Story = {
  args: {href: '/components/button/', target: '_blank', rel: 'author', slots: {default: 'Button docs'}},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('link', {name: 'Button docs'})).toHaveAttribute('rel', 'author noopener noreferrer');
  },
};

/** Without `href` it renders a `<button>` with link styling; attach a click listener. */
export const WithoutHref: Story = {
  args: {slots: {default: 'Show details'}},
  play: async ({canvas}) => {
    const button = canvas.getByRole('button', {name: 'Show details'});
    await expect(button).toHaveAttribute('type', 'button');
    const onClick = fn();
    button.addEventListener('click', onClick);
    await userEvent.click(button);
    await userEvent.keyboard('{Enter}');
    await expect(onClick).toHaveBeenCalledTimes(2);
  },
};

/** No destination, still a tab stop announced as a disabled link; click, Enter and Space do nothing. */
export const Disabled: Story = {
  args: {href: '#settings', isDisabled: true},
  play: async ({canvas}) => {
    const link = canvas.getByRole('link', {name: 'Account settings'});
    await expect(link).toHaveAttribute('aria-disabled', 'true');
    await expect(link).not.toHaveAttribute('href');
    const onClick = fn();
    link.addEventListener('click', onClick);
    await userEvent.tab();
    await expect(link).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    link.click();
    await expect(onClick).not.toHaveBeenCalled();
  },
};

/** Disabled without `href`: a `<button>` with aria-disabled that stays focusable and inert. */
export const DisabledWithoutHref: Story = {
  args: {isDisabled: true, slots: {default: 'Show details'}},
  play: async ({canvas}) => {
    const button = canvas.getByRole('button', {name: 'Show details'});
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    const onClick = fn();
    button.addEventListener('click', onClick);
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    button.click();
    await expect(onClick).not.toHaveBeenCalled();
  },
};

/** A blocked destination (`javascript:`) renders an inert `<a>` without `href`. */
export const BlockedHref: Story = {
  args: {href: 'javascript:alert(1)', slots: {default: 'Blocked destination'}},
  play: async ({canvasElement}) => {
    const link = canvasElement.querySelector('.astryx-link')!;
    await expect(link.tagName).toBe('A');
    await expect(link).not.toHaveAttribute('href');
  },
};

export const Download: Story = {
  args: {href: '#report', download: 'report.csv', slots: {default: 'Download report'}},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('link', {name: 'Download report'})).toHaveAttribute('download', 'report.csv');
  },
};

/** Shown above on hover and keyboard focus, and describes the link. */
export const WithTooltip: Story = {
  args: {href: '#settings', tooltip: 'Plan, payment method and invoices'},
  parameters: {layout: 'centered'},
  play: async ({canvas, canvasElement}) => {
    const link = canvas.getByRole('link', {name: 'Account settings'});
    const tooltip = canvasElement.querySelector('[role="tooltip"]');
    await expect(link).toHaveAccessibleDescription('Plan, payment method and invoices');
    await userEvent.hover(link);
    await waitFor(() => expect(isShowing(tooltip)).toBe(true));
    await userEvent.unhover(link);
    await waitFor(() => expect(isShowing(tooltip)).toBe(false));
    await userEvent.tab();
    await waitFor(() => expect(isShowing(tooltip)).toBe(true));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(tooltip)).toBe(false));
  },
};

/** Icon-only content: `label` becomes the aria-label. */
export const IconOnly: Story = {
  args: {href: '#home', label: 'Home', slots: {default: {component: Icon, props: {icon: 'chevronLeft', size: 'md'}}}},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('link', {name: 'Home'})).toBeVisible();
  },
};

/** `maxLines={1}` with `display="block"` truncates with an ellipsis in a narrow box. */
export const Truncated: Story = {
  args: {href: '#settings', maxLines: 1, display: 'block', slots: {default: 'Workspace settings, members, roles and billing'}},
  decorators: [frame({width: 200})],
};

/** `as`: a custom link component receives the checked href; a blocked destination never reaches it. */
export const CustomLinkComponent = composed(LinkCustomComponent, {
  play: async ({canvas}) => {
    const routed = canvas.getByRole('link', {name: 'Button docs'});
    await expect(routed).toHaveAttribute('href', '/components/button/');
    await expect(routed).toHaveAttribute('data-demo-router');
    const blocked = canvas.getByText('Blocked destination').closest('a')!;
    await expect(blocked).not.toHaveAttribute('href');
    await expect(blocked).not.toHaveAttribute('data-demo-router');
  },
}, {source: customSource});
