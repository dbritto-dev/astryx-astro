import Toolbar from 'astryx-astro/components/Toolbar/Toolbar.astro';
import Demo from 'astryx-astro/components/Toolbar/Toolbar.demo.astro';
import demoSource from 'astryx-astro/components/Toolbar/Toolbar.demo.astro?raw';
import {expect, userEvent, waitFor, within} from 'storybook/test';
import {isShowing} from '../_lib/play';
import {astryx, composed, overview, type Meta} from '../_lib/story';
import ToolbarStory from './ToolbarStory.astro';
import storySource from './ToolbarStory.astro?raw';

const meta = {
  title: 'Action/Toolbar',
  component: Toolbar,
  ...astryx('Toolbar'),
  args: {label: 'Document actions'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Toolbar.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {controls: ['size', 'gap', 'orientation', 'variant', 'dividers', 'content', 'dir'], source: storySource};

const focusedName = () => {
  const el = document.activeElement;
  return el?.getAttribute('aria-label') ?? el?.textContent?.trim();
};
/** Resolves once the roving runtime has placed the toolbar's single tab stop. */
const ready = (toolbar: HTMLElement) =>
  waitFor(() => expect(toolbar.querySelectorAll(':is(button, a[href], input)[tabindex="0"]')).toHaveLength(1));

/**
 * Start and end slots. One Tab stop; the keyboard hint shows on the first keyboard entry and an
 * arrow dismisses it; arrows move across both slots and wrap, Home / End jump; Tab leaves and
 * Shift+Tab comes back to the last focused item.
 */
export const Default = composed(ToolbarStory, {
  args: {dividers: ['bottom']},
  play: async ({canvas, step}) => {
    const toolbar = canvas.getByRole('toolbar', {name: 'Document actions'});
    await expect(toolbar).toHaveAttribute('aria-orientation', 'horizontal');
    await ready(toolbar);

    await step('Tab enters on the first item and shows the keyboard hint', async () => {
      await userEvent.tab();
      await expect(focusedName()).toBe('Back');
      const hint = document.getElementById(toolbar.dataset.axKeyboardHint!);
      await waitFor(() => expect(isShowing(hint)).toBe(true));
      await userEvent.keyboard('{ArrowRight}');
      await expect(focusedName()).toBe('Search');
      await waitFor(() => expect(isShowing(hint)).toBe(false));
    });

    await step('Arrows cross the slots and wrap; Home and End jump', async () => {
      await userEvent.keyboard('{ArrowRight}');
      await expect(focusedName()).toBe('Share');
      await userEvent.keyboard('{End}');
      await expect(focusedName()).toBe('Publish');
      await userEvent.keyboard('{ArrowRight}');
      await expect(focusedName()).toBe('Back');
      await userEvent.keyboard('{ArrowLeft}');
      await expect(focusedName()).toBe('Publish');
      await userEvent.keyboard('{Home}');
      await expect(focusedName()).toBe('Back');
    });

    await step('Tab leaves; Shift+Tab returns to the last focused item', async () => {
      await userEvent.tab();
      await expect(toolbar.contains(document.activeElement)).toBe(false);
      await userEvent.tab({shift: true});
      await expect(focusedName()).toBe('Back');
    });
  },
}, options);

/** `size="sm"`: every Button and IconButton without its own size follows the toolbar. */
export const Small = composed(ToolbarStory, {
  args: {size: 'sm'},
  play: async ({canvas}) => {
    const toolbar = canvas.getByRole('toolbar', {name: 'Document actions'});
    await expect(toolbar).toHaveAttribute('data-size', 'sm');
    for (const button of within(toolbar).getAllByRole('button')) await expect(button).toHaveAttribute('data-size', 'sm');
  },
}, options);

export const Large = composed(ToolbarStory, {args: {size: 'lg'}}, options);

/**
 * `centerContent`, a ButtonGroup and a separator on a muted surface. The group keeps its own
 * arrow keys (they wrap inside it) and takes the toolbar's size.
 */
export const CenterContent = composed(ToolbarStory, {
  args: {content: 'editor', size: 'sm', variant: 'muted', dividers: ['bottom']},
  play: async ({canvas}) => {
    const toolbar = canvas.getByRole('toolbar', {name: 'Editor'});
    await ready(toolbar);
    const group = canvas.getByRole('group', {name: 'History'});
    await expect(group).toHaveAttribute('data-size', 'sm');
    canvas.getByRole('button', {name: 'Undo'}).focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(focusedName()).toBe('Redo');
    await userEvent.keyboard('{ArrowRight}');
    await expect(focusedName()).toBe('Undo');
  },
}, options);

/** A lone start slot fills the row; `gap={3}` spaces its items; the `section` surface. */
export const StartOnly = composed(ToolbarStory, {args: {content: 'bulk', gap: 3, variant: 'section'}}, options);

/**
 * A lone end slot sits at the end. In a text field the caret keys edit the text first: ArrowLeft
 * and End move the caret, and ArrowRight at the end of the text moves to the next item.
 */
export const EndOnlyWithField = composed(ToolbarStory, {
  args: {content: 'search', gap: 2},
  play: async ({canvas}) => {
    const toolbar = canvas.getByRole('toolbar', {name: 'Search'});
    await ready(toolbar);
    const field = canvas.getByRole('searchbox', {name: 'Search rows'}) as HTMLInputElement;
    await userEvent.type(field, 'abc');
    await userEvent.keyboard('{ArrowLeft}');
    await expect(field).toHaveFocus();
    await expect(field.selectionStart).toBe(2);
    await userEvent.keyboard('{End}');
    await expect(field).toHaveFocus();
    await expect(field.selectionStart).toBe(3);
    await userEvent.keyboard('{ArrowRight}');
    await expect(canvas.getByRole('button', {name: 'Apply'})).toHaveFocus();
  },
}, options);

/** Arrows skip disabled items, natively disabled or aria-disabled (a disabled item with a tooltip). */
export const DisabledItems = composed(ToolbarStory, {
  args: {content: 'disabled'},
  play: async ({canvas}) => {
    const toolbar = canvas.getByRole('toolbar', {name: 'Row actions'});
    await ready(toolbar);
    canvas.getByRole('button', {name: 'Edit'}).focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(focusedName()).toBe('Delete');
  },
}, options);

/** Vertical: the slots stack; ArrowDown / ArrowUp move across them, horizontal arrows are ignored. */
export const Vertical = composed(ToolbarStory, {
  args: {content: 'tools', orientation: 'vertical', dividers: ['end']},
  play: async ({canvas}) => {
    const toolbar = canvas.getByRole('toolbar', {name: 'Tools'});
    await expect(toolbar).toHaveAttribute('aria-orientation', 'vertical');
    await ready(toolbar);
    canvas.getByRole('button', {name: 'Select'}).focus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(focusedName()).toBe('Search');
    await userEvent.keyboard('{ArrowDown}');
    await expect(focusedName()).toBe('Settings');
    await userEvent.keyboard('{ArrowLeft}');
    await expect(focusedName()).toBe('Settings');
    await userEvent.keyboard('{ArrowUp}');
    await expect(focusedName()).toBe('Search');
  },
}, options);

/** Right-to-left: ArrowLeft moves forward, ArrowRight back. */
export const RightToLeft = composed(ToolbarStory, {
  args: {content: 'bulk', dir: 'rtl'},
  play: async ({canvas}) => {
    const toolbar = canvas.getByRole('toolbar', {name: 'Bulk actions'});
    await ready(toolbar);
    canvas.getByRole('button', {name: 'Select all'}).focus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(focusedName()).toBe('Archive');
    await userEvent.keyboard('{ArrowRight}');
    await expect(focusedName()).toBe('Select all');
  },
}, options);
