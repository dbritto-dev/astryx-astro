import ClickableCard from 'astryx-astro/components/ClickableCard/ClickableCard.astro';
import Demo from 'astryx-astro/components/ClickableCard/ClickableCard.demo.astro';
import demoSource from 'astryx-astro/components/ClickableCard/ClickableCard.demo.astro?raw';
import {expect, userEvent} from 'storybook/test';
import {astryx, composed, overview, type Meta, type Story, knownA11y} from '../_lib/story';
import ClickableCardMatrix from './ClickableCardMatrix.astro';
import matrixSource from './ClickableCardMatrix.astro?raw';
import ClickableCardNested from './ClickableCardNested.astro';
import nestedSource from './ClickableCardNested.astro?raw';

const content = (heading: string, text: string) =>
  `<p style="margin:0;font-weight:var(--font-weight-semibold)" data-testid="title">${heading}</p>` +
  `<p style="margin:var(--spacing-1) 0 0;font-size:var(--text-supporting-size);color:var(--color-text-secondary)">${text}</p>`;

const meta = {
  title: 'Container/Clickable Card',
  component: ClickableCard,
  ...astryx('ClickableCard'),
  args: {label: 'Open report', maxWidth: 320, slots: {default: content('Quarterly report', 'Click anywhere on the card to open it.')}},
} satisfies Meta;
export default meta;

/** Every example from the docs page (ClickableCard.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource, {parameters: knownA11y({
  "color-contrast": "A disabled card dims its content (50% opacity, as Astryx does) and its hidden control carries aria-disabled; WCAG 1.4.3 exempts inactive components."
})});

/** Clicks on the card's hidden control (the activation): every activation is exactly one of them. */
function activations(card: Element, control: Element) {
  const clicks: Event[] = [];
  card.addEventListener('click', (event) => event.target === control && clicks.push(event));
  return clicks;
}

/**
 * Without `href` the card is a button: a hidden `<button>` named by `label` carries the role and
 * the tab stop. A click anywhere on the surface, Enter or Space is one click on it.
 */
export const ButtonCard: Story = {
  play: async ({canvas, canvasElement, step}) => {
    const card = canvasElement.querySelector('.astryx-clickable-card')!;
    const control = canvas.getByRole('button', {name: 'Open report'});
    const clicks = activations(card, control);
    await expect(card).not.toHaveAttribute('role');
    await expect(card).not.toHaveAttribute('tabindex');

    await step('A click on the surface activates the card once', async () => {
      await userEvent.click(canvas.getByTestId('title'));
      await expect(clicks).toHaveLength(1);
    });
    await step('Tab reaches the hidden control; Enter and Space activate it', async () => {
      await userEvent.tab();
      await expect(control).toHaveFocus();
      await userEvent.keyboard('{Enter}');
      await userEvent.keyboard(' ');
      await expect(clicks).toHaveLength(3);
    });
  },
};

/** With `href` the hidden control is a link; a click on the surface goes through it (other pages are logged in Actions). */
export const LinkCard: Story = {
  args: {label: 'Team settings', href: '#team-settings', slots: {default: content('Team settings', 'Members, roles and billing.')}},
  play: async ({canvas, canvasElement}) => {
    const link = canvas.getByRole('link', {name: 'Team settings'});
    await expect(link).toHaveAttribute('href', '#team-settings');
    const clicks = activations(canvasElement.querySelector('.astryx-clickable-card')!, link);
    await userEvent.click(canvas.getByTestId('title'));
    await expect(clicks).toHaveLength(1);
  },
};

/** `target="_blank"`: opens in a new tab, with `rel="noopener noreferrer"`. */
export const NewTab: Story = {
  args: {label: 'Documentation', href: '/docs/', target: '_blank', variant: 'blue', slots: {default: content('Documentation', 'Opens in a new tab.')}},
  play: async ({canvas}) => {
    const link = canvas.getByRole('link', {name: 'Documentation'});
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link.getAttribute('rel')).toMatch(/noopener/);
    await expect(link.getAttribute('rel')).toMatch(/noreferrer/);
  },
};

/** `isDisabled`: dimmed, keeps its tab stop with aria-disabled, and never activates. */
export const Disabled: Story = {
  parameters: knownA11y({
    "color-contrast": "A disabled card dims its content (50% opacity, as Astryx does) and its hidden control carries aria-disabled; WCAG 1.4.3 exempts inactive components."
  }),
  args: {isDisabled: true},
  play: async ({canvas, canvasElement}) => {
    const control = canvas.getByRole('button', {name: 'Open report'});
    const clicks = activations(canvasElement.querySelector('.astryx-clickable-card')!, control);
    await expect(control).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(canvas.getByTestId('title'));
    await userEvent.tab();
    await expect(control).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(clicks).toHaveLength(0);
  },
};

/** A disabled link card renders no destination (a focusable, aria-disabled link without href). */
export const DisabledLink: Story = {
  parameters: knownA11y({
    "color-contrast": "A disabled card dims its content (50% opacity, as Astryx does) and its hidden control carries aria-disabled; WCAG 1.4.3 exempts inactive components."
  }),
  args: {label: 'Team settings', href: '#team-settings', isDisabled: true, slots: {default: content('Team settings', 'You need admin rights.')}},
  play: async ({canvasElement}) => {
    const link = canvasElement.querySelector('a.ax-clickable-card-action')!;
    await expect(link).not.toHaveAttribute('href');
    await expect(link).toHaveAttribute('aria-disabled', 'true');
    await expect(link).toHaveAttribute('role', 'link');
  },
};

/** An unsafe destination (`javascript:`) is dropped: the hidden link is named and `aria-disabled`, the card keeps its look. */
export const BlockedDestination: Story = {
  args: {label: 'Blocked', href: 'javascript:void(0)', slots: {default: content('Blocked destination', 'The unsafe URL is not rendered.')}},
  play: async ({canvas}) => {
    // A named link that goes nowhere (a deliberate deviation from Astryx: docs/accessibility.md).
    const link = canvas.getByRole('link', {name: 'Blocked'});
    await expect(link).not.toHaveAttribute('href');
    await expect(link).toHaveAttribute('aria-disabled', 'true');
  },
};

/** `padding`, `width` and `elevation="high"`. */
export const PaddingAndElevation: Story = {args: {padding: 6, width: 280, maxWidth: undefined, elevation: 'high'}};

/** Nested controls keep their own clicks and never activate the card. */
export const NestedControls = composed(ClickableCardNested, {
  play: async ({canvas, step}) => {
    const buttonCard = canvas.getByTestId('button-card');
    const linkCard = canvas.getByTestId('link-card');
    const buttonClicks = activations(buttonCard, canvas.getByRole('button', {name: 'Open details'}));
    const linkClicks = activations(linkCard, canvas.getByRole('link', {name: 'Team settings'}));

    await step('A nested Button keeps its own click', async () => {
      await userEvent.click(canvas.getByRole('button', {name: 'Share'}));
      await expect(buttonClicks).toHaveLength(0);
    });
    await step('A nested link follows itself, not the card', async () => {
      await userEvent.click(canvas.getByRole('link', {name: 'Download'}));
      await expect(buttonClicks).toHaveLength(0);
    });
    await step('A nested Button in a link card does not navigate', async () => {
      await userEvent.click(canvas.getByRole('button', {name: 'Invite'}));
      await expect(linkClicks).toHaveLength(0);
    });
    await step('The surface still activates each card', async () => {
      await userEvent.click(buttonCard);
      await userEvent.click(linkCard);
      await expect(buttonClicks).toHaveLength(1);
      await expect(linkClicks).toHaveLength(1);
    });
  },
}, {controls: ['variant', 'elevation'], source: nestedSource});

/** Every `variant` and `elevation`, as live button cards. */
export const Matrix = composed(ClickableCardMatrix, {}, {source: matrixSource});
