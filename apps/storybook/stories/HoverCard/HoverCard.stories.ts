import HoverCard from 'astryx-astro/components/HoverCard/HoverCard.astro';
import Demo from 'astryx-astro/components/HoverCard/HoverCard.demo.astro';
import demoSource from 'astryx-astro/components/HoverCard/HoverCard.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents} from '../_lib/play';
import {astryx, overview, type Meta, type Story} from '../_lib/story';

const avatar = 'display:inline-grid;place-items:center;width:40px;height:40px;border-radius:50%;background:var(--color-accent-muted);color:var(--color-text-accent);font-weight:var(--font-weight-semibold)';
const profile = `<span style="display:flex;gap:var(--spacing-3);align-items:center;width:240px">
  <span style="${avatar}">AL</span>
  <span style="display:grid;gap:2px">
    <strong>Ada Lovelace</strong>
    <span style="font-size:var(--font-size-sm);color:var(--color-text-secondary)">Analyst · London</span>
    <a href="#follow-ada" style="font-size:var(--font-size-sm)">Follow</a>
  </span>
</span>`;
const button = (label: string) => `<button type="button" style="font:inherit;font-size:var(--font-size-sm);padding:var(--spacing-1) var(--spacing-3);border:1px solid var(--color-border);border-radius:var(--radius-element);background:var(--color-background-surface);color:var(--color-text-primary);cursor:pointer">${label}</button>`;

/** A named profile card on a link. The first element of the default slot is the trigger. */
const profileCard = {label: 'Ada Lovelace', slots: {default: '<a href="#ada">@ada</a>', content: profile}};

const meta = {
  title: 'Overlay/Hover Card',
  component: HoverCard,
  ...astryx('HoverCard'),
  // Stories set every arg themselves: `slots` objects merge, so a meta-level content slot would
  // leak into the stories that use the `content` prop.
  parameters: {layout: 'centered'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (HoverCard.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const layer = (root: Element) => root.querySelector('ax-hover-card');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A named card (`label`: role dialog) on a link. Hover opens it after the delay and the trigger
 * advertises it; the pointer may move into the card; leaving closes it after the grace. Focus
 * opens it too, Tab moves into it, Escape closes it and returns focus to the trigger.
 */
export const Default: Story = {
  args: profileCard,
  play: async ({canvas, canvasElement, step}) => {
    const trigger = canvas.getByRole('link', {name: '@ada'});
    const card = layer(canvasElement)!;
    const changes = recordEvents<{isOpen: boolean}>(canvasElement, 'astryx-open-change');
    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await step('Hover opens the card; the trigger advertises it', async () => {
      await userEvent.hover(trigger);
      await waitFor(() => expect(isShowing(card)).toBe(true));
      await expect(card).toHaveAttribute('role', 'dialog');
      await expect(card).toHaveAccessibleName('Ada Lovelace');
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await expect(trigger).toHaveAttribute('aria-controls', card.id);
    });

    await step('The pointer can move into the card; leaving it closes the card', async () => {
      const follow = canvas.getByRole('link', {name: 'Follow'});
      await userEvent.hover(follow);
      await sleep(400);
      await expect(isShowing(card)).toBe(true);
      await userEvent.unhover(follow);
      await waitFor(() => expect(isShowing(card)).toBe(false));
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await expect(trigger).not.toHaveAttribute('aria-controls');
    });

    await step('Focus opens it, Tab moves into it, Escape closes it and focus returns', async () => {
      await userEvent.tab();
      await expect(trigger).toHaveFocus();
      await waitFor(() => expect(isShowing(card)).toBe(true));
      await userEvent.tab();
      await expect(canvas.getByRole('link', {name: 'Follow'})).toHaveFocus();
      await sleep(300);
      await expect(isShowing(card)).toBe(true);
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(card)).toBe(false));
      await expect(trigger).toHaveFocus();
    });
    await expect(changes.map((e) => e.detail.isOpen)).toEqual([true, false, true, false]);
  },
};

/**
 * Without `label` the card is an unnamed group that describes its trigger; a text trigger is
 * made focusable and gets the dashed hover indication.
 */
export const TextTrigger: Story = {
  args: {content: 'Edited by Grace Hopper on 3 November 2026, 14:02.', slots: {default: '3 days ago'}},
  play: async ({canvasElement}) => {
    const card = layer(canvasElement)!;
    const trigger = canvasElement.querySelector<HTMLElement>('[data-ax-hover-card]')!;
    await expect(card).toHaveAttribute('role', 'group');
    await expect(trigger).toHaveAccessibleDescription('Edited by Grace Hopper on 3 November 2026, 14:02.');
    await userEvent.tab();
    await expect(trigger).toHaveFocus();
    await waitFor(() => expect(isShowing(card)).toBe(true));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(card)).toBe(false));
  },
};

/**
 * Focus the trigger and check the side the card sits on: the requested one where it fits, else
 * the opposite (the layer flips at the viewport edges).
 */
const placementPlay = (side: 'below' | 'start' | 'end'): Story['play'] => async ({canvas, canvasElement}) => {
  const trigger = canvas.getByRole('button');
  const card = layer(canvasElement)!;
  trigger.focus();
  await waitFor(() => expect(isShowing(card)).toBe(true));
  await waitFor(() => {
    const t = trigger.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const fits = {below: innerHeight - t.bottom >= c.height, start: t.left >= c.width, end: innerWidth - t.right >= c.width}[side];
    const actual = c.top >= t.bottom - 1 ? 'below' : c.bottom <= t.top + 1 ? 'above' : c.right <= t.left + 1 ? 'start' : c.left >= t.right - 1 ? 'end' : 'overlapping';
    expect(actual).toBe(fits ? side : {below: 'above', start: 'end', end: 'start'}[side]);
  });
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(isShowing(card)).toBe(false));
};

export const PlacementBelowAlignStart: Story = {
  args: {content: 'Below, aligned to the start', placement: 'below', alignment: 'start', slots: {default: button('Hover or focus me')}},
  play: placementPlay('below'),
};

export const PlacementStart: Story = {
  args: {content: 'Start side', placement: 'start', slots: {default: button('Hover or focus me')}},
  play: placementPlay('start'),
};

export const PlacementEndAlignEnd: Story = {
  args: {content: 'End side, aligned to the end', placement: 'end', alignment: 'end', slots: {default: button('Hover or focus me')}},
  play: placementPlay('end'),
};

/** `focusTrigger="never"`: keyboard focus does not open it; hover still does. */
export const FocusTriggerNever: Story = {
  args: {content: 'Hover only', focusTrigger: 'never', slots: {default: button('Hover me')}},
  play: async ({canvas, canvasElement}) => {
    const trigger = canvas.getByRole('button', {name: 'Hover me'});
    const card = layer(canvasElement)!;
    await userEvent.tab();
    await expect(trigger).toHaveFocus();
    await sleep(400);
    await expect(isShowing(card)).toBe(false);
    await userEvent.hover(trigger);
    await waitFor(() => expect(isShowing(card)).toBe(true));
    await userEvent.unhover(trigger);
    await waitFor(() => expect(isShowing(card)).toBe(false));
  },
};

/** `isEnabled={false}`: neither hover nor focus opens it. */
export const Disabled: Story = {
  args: {content: 'Never shown', isEnabled: false, slots: {default: button('Disabled card')}},
  play: async ({canvas, canvasElement}) => {
    const trigger = canvas.getByRole('button', {name: 'Disabled card'});
    await userEvent.hover(trigger);
    trigger.focus();
    await sleep(500);
    await expect(isShowing(layer(canvasElement))).toBe(false);
  },
};

/** `isDefaultOpen`: shown on load and still dismissible (Escape). */
export const DefaultOpen: Story = {
  args: {...profileCard, isDefaultOpen: true},
  parameters: {docs: {story: {inline: false, height: '220px'}}},
  play: async ({canvasElement}) => {
    const card = layer(canvasElement)!;
    await waitFor(() => expect(isShowing(card)).toBe(true));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(card)).toBe(false));
  },
};

/** Controlled `isOpen`: always shown; `class` / `style` style the card surface. */
export const ControlledOpen: Story = {
  args: {...profileCard, isOpen: true, style: 'max-width:300px'},
  parameters: {docs: {story: {inline: false, height: '220px'}}},
  play: async ({canvasElement}) => {
    await waitFor(() => expect(isShowing(layer(canvasElement))).toBe(true));
  },
};
