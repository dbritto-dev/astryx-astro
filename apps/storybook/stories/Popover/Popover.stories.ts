import Popover from 'astryx-astro/components/Popover/Popover.astro';
import Demo from 'astryx-astro/components/Popover/Popover.demo.astro';
import demoSource from 'astryx-astro/components/Popover/Popover.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import PopoverSibling from './PopoverSibling.astro';
import siblingSource from './PopoverSibling.astro?raw';
import PopoverStory from './PopoverStory.astro';
import popoverSource from './PopoverStory.astro?raw';

const meta = {
  title: 'Overlay/Popover',
  component: Popover,
  ...astryx('Popover'),
  args: {label: 'Share settings'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Popover.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {
  controls: ['label', 'placement', 'alignment', 'isOpen', 'isEnabled', 'width', 'padding', 'role', 'isModal', 'hasCloseButton', 'hasAutoFocus', 'hasLightDismiss', 'hasEscapeDismiss', 'presentation'],
  source: popoverSource,
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const layerOf = (root: HTMLElement) => root.querySelector<HTMLElement>('ax-popover')!;
const fallbackClose = (root: HTMLElement) => root.querySelector<HTMLElement>('[data-astryx-popover-fallback-close] button')!;

/**
 * Click opens a dialog named by `label` with focus on its first control; Tab stays inside
 * (`aria-modal`) and reaches the hidden close button; Escape closes and focus returns to the
 * trigger; the trigger toggles it; `aria-expanded` follows.
 */
export const Default = composed(PopoverStory, {
  play: async ({canvas, canvasElement, step}) => {
    const trigger = canvas.getByRole('button', {name: 'Share'});
    const layer = layerOf(canvasElement);
    const changes = recordEvents<{isOpen: boolean; reason: string}>(canvasElement, 'astryx-open-change');
    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await step('A click opens it; focus moves to the first control', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await waitFor(() => expect(canvas.getByRole('dialog', {name: 'Share settings'})).toBeVisible());
      await waitFor(() => expect(canvas.getByRole('button', {name: 'Copy link'})).toHaveFocus());
    });

    await step('Tab reaches the hidden close button, then wraps (aria-modal)', async () => {
      canvas.getByRole('button', {name: 'Done'}).focus();
      await userEvent.tab();
      await expect(fallbackClose(canvasElement)).toHaveFocus();
      await expect(fallbackClose(canvasElement)).toHaveAccessibleName('Close popover');
      await userEvent.tab();
      await expect(canvas.getByRole('button', {name: 'Copy link'})).toHaveFocus();
    });

    await step('Escape closes it and focus returns to the trigger', async () => {
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await expect(trigger).toHaveFocus();
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    await step('The trigger toggles it; the hidden close button closes it', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await userEvent.click(trigger);
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      fallbackClose(canvasElement).focus();
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await expect(trigger).toHaveFocus();
    });
    await expect(changes.map((e) => e.detail.isOpen)).toEqual([true, false, true, false, true, false]);
    // Known limitation: a light-dismiss press outside (popover="auto") is the browser's own,
    // and only a trusted pointer press triggers it; tools/tests/popover.test.mjs covers it.
  },
}, options);

/** Rendered open (`isOpen`): docs show it in its own frame so it cannot cover the page. */
export const Open = composed(PopoverStory, {
  args: {isOpen: true},
  parameters: {docs: {story: {inline: false, height: '260px'}}},
  play: async ({canvasElement}) => {
    await waitFor(() => expect(isShowing(layerOf(canvasElement))).toBe(true));
  },
}, options);

/**
 * The side of the trigger the surface sits on, as placement asks when it fits there; else the
 * opposite side (the layer flips at the viewport edges, so a small test viewport may flip it).
 */
const expectSide = (trigger: Element, surface: Element, side: 'above' | 'start' | 'end') => {
  const t = trigger.getBoundingClientRect();
  const s = surface.getBoundingClientRect();
  const fits = {above: t.top >= s.height, start: t.left >= s.width, end: innerWidth - t.right >= s.width}[side];
  const actual = s.bottom <= t.top + 1 ? 'above' : s.top >= t.bottom - 1 ? 'below' : s.right <= t.left + 1 ? 'start' : s.left >= t.right - 1 ? 'end' : 'overlapping';
  expect(actual).toBe(fits ? side : {above: 'below', start: 'end', end: 'start'}[side]);
};

/** Opens the popover from its trigger and checks the side it sits on. */
const placementPlay = (side: 'above' | 'start' | 'end'): Story['play'] => async ({canvas, canvasElement}) => {
  const trigger = canvas.getByRole('button', {name: 'Share'});
  const layer = layerOf(canvasElement);
  await userEvent.click(trigger);
  await waitFor(() => expect(isShowing(layer)).toBe(true));
  await waitFor(() => expectSide(trigger, layer.querySelector('[role="dialog"]')!, side));
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(isShowing(layer)).toBe(false));
};

export const PlacementAbove = composed(PopoverStory, {args: {placement: 'above', alignment: 'center'}, parameters: {layout: 'centered'}, play: placementPlay('above')}, options);

export const PlacementStart = composed(PopoverStory, {args: {placement: 'start'}, parameters: {layout: 'centered'}, play: placementPlay('start')}, options);

export const PlacementEnd = composed(PopoverStory, {args: {placement: 'end', alignment: 'center'}, parameters: {layout: 'centered'}, play: placementPlay('end')}, options);

/**
 * `alignment="end"`: below, the popover's end edge at the trigger's end edge (where it has room
 * to grow toward the start; otherwise it shifts to stay on screen).
 */
export const AlignEnd = composed(PopoverStory, {
  args: {alignment: 'end'},
  parameters: {layout: 'centered'},
  play: async ({canvas, canvasElement}) => {
    const trigger = canvas.getByRole('button', {name: 'Share'});
    const layer = layerOf(canvasElement);
    await userEvent.click(trigger);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    const surface = layer.querySelector('[role="dialog"]')!;
    await waitFor(() => {
      const t = trigger.getBoundingClientRect();
      const s = surface.getBoundingClientRect();
      if (t.right >= s.width) expect(Math.abs(s.right - t.right)).toBeLessThanOrEqual(2);
      else expect(s.left).toBeGreaterThanOrEqual(0);
    });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
  },
}, options);

/** `width={360}` and `padding={5}`: a fixed width (capped to the viewport) and a roomier surface. */
export const WidthAndPadding = composed(PopoverStory, {args: {isOpen: true, width: 360, padding: 5}, parameters: {docs: {story: {inline: false, height: '260px'}}}}, options);

/**
 * `role="none"` with a listbox as content, `padding={0}`, no auto focus and no close button:
 * the content owns its role, so the trigger advertises a generic popup.
 */
export const ContentRole = composed(PopoverStory, {
  args: {role: 'none', padding: 0, hasAutoFocus: false, hasCloseButton: false},
  play: async ({canvas, canvasElement}) => {
    const trigger = canvas.getByRole('button', {name: 'Sort by'});
    const layer = layerOf(canvasElement);
    await userEvent.click(trigger);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await waitFor(() => expect(canvas.getByRole('listbox', {name: 'Sort by'})).toBeVisible());
    await expect(canvasElement.querySelector('[role="dialog"]')).toBeNull();
    await expect(fallbackClose(canvasElement)).toBeNull();
    // hasAutoFocus={false}: focus stays on the trigger.
    await expect(trigger).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
  },
}, options);

/**
 * `hasLightDismiss={false}` and `hasEscapeDismiss={false}`: a coachmark that stays until its own
 * "Done" button closes it (a manual popover).
 */
export const ExplicitDismissOnly = composed(PopoverStory, {
  args: {hasLightDismiss: false, hasEscapeDismiss: false},
  play: async ({canvas, canvasElement}) => {
    const trigger = canvas.getByRole('button', {name: 'Share'});
    const layer = layerOf(canvasElement);
    await expect(layer).toHaveAttribute('popover', 'manual');
    await userEvent.click(trigger);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(canvasElement.querySelector<HTMLElement>('[data-outside]')!);
    await sleep(300);
    await expect(isShowing(layer)).toBe(true);
    await userEvent.click(canvas.getByRole('button', {name: 'Done'}));
    await waitFor(() => expect(isShowing(layer)).toBe(false));
  },
}, options);

/** `isModal={false}`: no `aria-modal` and no Tab containment, so Tab may leave the surface. */
export const NonModal = composed(PopoverStory, {
  args: {isModal: false},
  play: async ({canvas, canvasElement}) => {
    const trigger = canvas.getByRole('button', {name: 'Share'});
    await userEvent.click(trigger);
    const dialog = await canvas.findByRole('dialog', {name: 'Share settings'});
    await expect(dialog).not.toHaveAttribute('aria-modal');
    fallbackClose(canvasElement).focus();
    await userEvent.tab();
    await expect(dialog.contains(document.activeElement)).toBe(false);
  },
}, options);

/** `isEnabled={false}`: the trigger opens nothing. */
export const Disabled = composed(PopoverStory, {
  args: {isEnabled: false},
  play: async ({canvas, canvasElement}) => {
    await userEvent.click(canvas.getByRole('button', {name: 'Share'}));
    await sleep(300);
    await expect(isShowing(layerOf(canvasElement))).toBe(false);
  },
}, options);

/**
 * `presentation="bottom-sheet"`: the same content presented as a modal touch sheet with a
 * scrim; the page scroll locks, Tab stays inside, Escape closes it and focus returns.
 */
export const BottomSheetPresentation = composed(PopoverStory, {
  args: {presentation: 'bottom-sheet'},
  play: async ({canvas, canvasElement, step}) => {
    const trigger = canvas.getByRole('button', {name: 'Share'});
    const layer = layerOf(canvasElement);
    await step('The trigger opens a modal sheet', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await expect(layer).toHaveAttribute('data-ax-surface', 'bottom-sheet');
      const sheet = canvas.getByRole('dialog', {name: 'Share settings'});
      await expect(sheet).toHaveAttribute('aria-modal', 'true');
      await waitFor(() => expect(canvas.getByRole('button', {name: 'Copy link'})).toHaveFocus());
    });
    await step('Escape closes it and focus returns', async () => {
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await expect(trigger).toHaveFocus();
    });
  },
}, options);

/** Sibling mode: a trigger rendered elsewhere, wired with `attachPopover()` and `for`. */
export const SiblingTrigger = composed(PopoverSibling, {
  play: async ({canvas, canvasElement}) => {
    const trigger = canvas.getByRole('button', {name: 'Filters'});
    const layer = layerOf(canvasElement);
    await userEvent.click(trigger);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(Math.abs(layer.querySelector('[role="dialog"]')!.getBoundingClientRect().left - trigger.getBoundingClientRect().left)).toBeLessThanOrEqual(2));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
    await expect(trigger).toHaveFocus();
  },
}, {source: siblingSource});
