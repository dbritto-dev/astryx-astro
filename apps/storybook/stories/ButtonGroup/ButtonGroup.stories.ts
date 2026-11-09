import ButtonGroup from 'astryx-astro/components/ButtonGroup/ButtonGroup.astro';
import Demo from 'astryx-astro/components/ButtonGroup/ButtonGroup.demo.astro';
import demoSource from 'astryx-astro/components/ButtonGroup/ButtonGroup.demo.astro?raw';
import {expect, fn, userEvent, waitFor, within} from 'storybook/test';
import {isShowing} from '../_lib/play';
import {astryx, composed, overview, type Meta} from '../_lib/story';
import ButtonGroupMatrix from './ButtonGroupMatrix.astro';
import matrixSource from './ButtonGroupMatrix.astro?raw';
import ButtonGroupStory from './ButtonGroupStory.astro';
import storySource from './ButtonGroupStory.astro?raw';

const meta = {
  title: 'Action/Button Group',
  component: ButtonGroup,
  ...astryx('ButtonGroup'),
  args: {label: 'Clipboard'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (ButtonGroup.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {controls: ['orientation', 'size', 'elevation', 'isDisabled', 'members', 'dir'], source: storySource};

/** The members' tab stops (`0` = the group's single stop). */
const stops = (group: HTMLElement) => [...group.querySelectorAll(':scope > .astryx-button')].map((b) => b.getAttribute('tabindex'));
const focusedName = () => {
  const el = document.activeElement;
  return el?.getAttribute('aria-label') ?? el?.textContent?.trim();
};

/**
 * One Tab stop; ArrowLeft / ArrowRight move between members and wrap, Home / End jump, vertical
 * arrows do nothing in a horizontal group, and Tab leaves the group.
 */
export const Default = composed(ButtonGroupStory, {
  play: async ({canvas, step}) => {
    const group = canvas.getByRole('group', {name: 'Clipboard'});
    await waitFor(() => expect(stops(group)).toEqual(['0', '-1', '-1']));

    await step('Tab enters on the first member', async () => {
      await userEvent.tab();
      await expect(canvas.getByRole('button', {name: 'Copy'})).toHaveFocus();
    });

    await step('Arrows move, the tab stop follows, the ends wrap', async () => {
      await userEvent.keyboard('{ArrowRight}');
      await expect(focusedName()).toBe('Cut');
      await expect(stops(group)).toEqual(['-1', '0', '-1']);
      await userEvent.keyboard('{End}');
      await expect(focusedName()).toBe('Paste');
      await userEvent.keyboard('{ArrowRight}');
      await expect(focusedName()).toBe('Copy');
      await userEvent.keyboard('{ArrowLeft}');
      await expect(focusedName()).toBe('Paste');
      await userEvent.keyboard('{Home}');
      await expect(focusedName()).toBe('Copy');
    });

    await step('Vertical arrows are ignored in a horizontal group', async () => {
      await userEvent.keyboard('{ArrowDown}');
      await expect(focusedName()).toBe('Copy');
    });

    await step('Tab leaves the group', async () => {
      await userEvent.tab();
      await expect(group.contains(document.activeElement)).toBe(false);
    });
  },
}, options);

/** Vertical: ArrowDown / ArrowUp move; horizontal arrows are ignored. */
export const Vertical = composed(ButtonGroupStory, {
  args: {orientation: 'vertical'},
  play: async ({canvas}) => {
    const group = canvas.getByRole('group', {name: 'Clipboard'});
    await waitFor(() => expect(stops(group)[0]).toBe('0'));
    canvas.getByRole('button', {name: 'Copy'}).focus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(focusedName()).toBe('Cut');
    await userEvent.keyboard('{ArrowUp}');
    await expect(focusedName()).toBe('Copy');
    await userEvent.keyboard('{ArrowRight}');
    await expect(focusedName()).toBe('Copy');
  },
}, options);

/** IconButton members. */
export const IconButtons = composed(ButtonGroupStory, {args: {members: 'icons'}}, options);

/** A split button: a primary action and its menu chevron. */
export const SplitButton = composed(ButtonGroupStory, {args: {members: 'split'}}, options);

/** Every size × orientation and every elevation. */
export const Matrix = composed(ButtonGroupMatrix, {}, {source: matrixSource});

/** `size="sm"`: members without their own size (and their icons) follow the group. */
export const Small = composed(ButtonGroupStory, {
  args: {size: 'sm', members: 'icons'},
  play: async ({canvas}) => {
    const group = canvas.getByRole('group', {name: 'History'});
    await expect(group).toHaveAttribute('data-size', 'sm');
    for (const button of within(group).getAllByRole('button')) await expect(button).toHaveAttribute('data-size', 'sm');
  },
}, options);

export const Large = composed(ButtonGroupStory, {args: {size: 'lg'}}, options);

/** One shadow lifts the group as a unit; its members paint none. */
export const Elevated = composed(ButtonGroupStory, {
  args: {elevation: 'high', members: 'split'},
  play: async ({canvas}) => {
    const group = canvas.getByRole('group', {name: 'Approve action'});
    await expect(group).toHaveAttribute('data-elevation', 'high');
    for (const button of within(group).getAllByRole('button')) await expect(button).toHaveAttribute('data-elevation', 'none');
  },
}, options);

/** Arrow keys skip a disabled member and a busy one (aria-disabled while loading). */
export const WithDisabledMember = composed(ButtonGroupStory, {
  args: {members: 'partial'},
  play: async ({canvas}) => {
    const group = canvas.getByRole('group', {name: 'Partially available'});
    await waitFor(() => expect(stops(group)[0]).toBe('0'));
    canvas.getByRole('button', {name: 'First'}).focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(focusedName()).toBe('Third');
    await userEvent.keyboard('{ArrowRight}');
    await expect(focusedName()).toBe('First');
  },
}, options);

/** Members with tooltips: the tooltip layers sit between members and arrows still move across them. */
export const WithTooltips = composed(ButtonGroupStory, {
  args: {members: 'tooltips'},
  play: async ({canvas, canvasElement}) => {
    const grid = canvas.getByRole('button', {name: 'Grid'});
    await waitFor(() => expect(grid).toHaveAttribute('tabindex', '0'));
    await userEvent.tab();
    await expect(grid).toHaveFocus();
    await waitFor(() => expect(isShowing(canvasElement.querySelector(`#${grid.dataset.axTooltip}`))).toBe(true));
    await userEvent.keyboard('{ArrowRight}');
    const list = canvas.getByRole('button', {name: 'List'});
    await expect(list).toHaveFocus();
    await expect(list).toHaveAccessibleDescription('Show as a list');
    await waitFor(() => expect(isShowing(canvasElement.querySelector(`#${list.dataset.axTooltip}`))).toBe(true));
  },
}, options);

/** Link members (`href`) take part in the arrow keys like buttons. */
export const LinkMembers = composed(ButtonGroupStory, {
  args: {members: 'links'},
  play: async ({canvas}) => {
    const guides = canvas.getByRole('link', {name: 'Guides'});
    await waitFor(() => expect(guides).toHaveAttribute('tabindex', '0'));
    guides.focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(canvas.getByRole('link', {name: 'Components'})).toHaveFocus();
  },
}, options);

/**
 * `isDisabled` disables every member: native `disabled`, except a member with a tooltip, which
 * stays focusable through aria-disabled; a link member renders a button; nothing activates.
 */
export const Disabled = composed(ButtonGroupStory, {
  args: {isDisabled: true, members: 'locked'},
  play: async ({canvas}) => {
    const group = canvas.getByRole('group', {name: 'Locked actions'});
    await expect(group).toHaveAttribute('aria-disabled', 'true');
    await expect(canvas.getByRole('button', {name: 'Archive'})).toBeDisabled();
    await expect(canvas.getByRole('button', {name: 'Open'})).toBeDisabled();
    await expect(canvas.queryByRole('link')).toBeNull();
    await expect(canvas.getByRole('button', {name: 'Sync'})).toBeDisabled();
    const move = canvas.getByRole('button', {name: 'Move'});
    await expect(move).not.toBeDisabled();
    await expect(move).toHaveAttribute('aria-disabled', 'true');
    const onClick = fn();
    group.addEventListener('click', onClick);
    move.focus();
    await expect(move).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    move.click();
    await expect(onClick).not.toHaveBeenCalled();
  },
}, options);

/** Right-to-left: ArrowLeft moves forward, ArrowRight back. */
export const RightToLeft = composed(ButtonGroupStory, {
  args: {dir: 'rtl'},
  play: async ({canvas}) => {
    const group = canvas.getByRole('group', {name: 'Clipboard'});
    await waitFor(() => expect(stops(group)[0]).toBe('0'));
    canvas.getByRole('button', {name: 'Copy'}).focus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(focusedName()).toBe('Cut');
    await userEvent.keyboard('{ArrowRight}');
    await expect(focusedName()).toBe('Copy');
  },
}, options);
