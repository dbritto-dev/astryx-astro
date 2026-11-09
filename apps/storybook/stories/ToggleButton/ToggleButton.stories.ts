import ToggleButton from 'astryx-astro/components/ToggleButton/ToggleButton.astro';
import Demo from 'astryx-astro/components/ToggleButton/ToggleButton.demo.astro';
import demoSource from 'astryx-astro/components/ToggleButton/ToggleButton.demo.astro?raw';
import {expect, fn, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import ToggleButtonGroupStory from './ToggleButtonGroupStory.astro';
import groupSource from './ToggleButtonGroupStory.astro?raw';
import ToggleButtonMatrix from './ToggleButtonMatrix.astro';
import matrixSource from './ToggleButtonMatrix.astro?raw';

const meta = {
  title: 'Action/Toggle Button',
  component: ToggleButton,
  ...astryx('ToggleButton'),
  args: {label: 'Bold'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (ToggleButton.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

type Toggle = HTMLButtonElement & {isPressed: boolean};
type Group = HTMLElement & {value: string | null | string[]};

const starOutline = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>';
const starSolid = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>';

/**
 * A click or Space toggles `aria-pressed` reversibly and dispatches `astryx-pressed-change`
 * `{isPressed}`; `preventDefault()` keeps the state; pressing never changes the button's size;
 * `el.isPressed` gets and sets the state.
 */
export const Default: Story = {
  play: async ({canvas, canvasElement, step}) => {
    const toggle = canvas.getByRole('button', {name: 'Bold'}) as Toggle;
    const changes = recordEvents<{isPressed: boolean}>(canvasElement, 'astryx-pressed-change');
    const box = toggle.getBoundingClientRect();

    await step('A click presses it without changing its size', async () => {
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await userEvent.click(toggle);
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await expect(toggle.getBoundingClientRect().width).toBe(box.width);
      await expect(changes.at(-1)?.detail.isPressed).toBe(true);
    });

    await step('Space toggles it back', async () => {
      await userEvent.keyboard(' ');
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await expect(changes.map((e) => e.detail.isPressed)).toEqual([true, false]);
    });

    await step('preventDefault() on astryx-pressed-change keeps the state', async () => {
      toggle.addEventListener('astryx-pressed-change', (event) => event.preventDefault(), {once: true});
      await userEvent.click(toggle);
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    });

    await step('isPressed sets the state without an event', async () => {
      const before = changes.length;
      toggle.isPressed = true;
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await expect(toggle.isPressed).toBe(true);
      await expect(changes.length).toBe(before);
    });
  },
};

/** Sizes × pressed states (text, icon, icon-only), disabled and loading, every elevation. */
export const Matrix = composed(ToggleButtonMatrix, {}, {source: matrixSource});

/** `isPressed`: the pressed overlay and a semibold label. */
export const Pressed: Story = {
  args: {label: 'Italic', isPressed: true},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('button', {name: 'Italic'})).toHaveAttribute('aria-pressed', 'true');
  },
};

export const WithIcon: Story = {args: {label: 'Mute', icon: 'microphone'}};

/** Icon-only: `label` is the accessible name. */
export const IconOnly: Story = {
  args: {label: 'Filter', icon: 'funnel', isIconOnly: true},
  play: async ({canvas}) => {
    const toggle = canvas.getByRole('button', {name: 'Filter'});
    await expect(toggle.textContent?.trim()).toBe('');
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  },
};

/** `pressedIcon` swaps in while pressed (an outline star becomes a solid one). */
export const WithPressedIcon: Story = {
  args: {label: 'Favorite', icon: starOutline, pressedIcon: starSolid},
  play: async ({canvas, canvasElement}) => {
    const unpressed = canvasElement.querySelector('[data-ax-toggle-icon="unpressed"]')!;
    const pressed = canvasElement.querySelector('[data-ax-toggle-icon="pressed"]')!;
    await expect(getComputedStyle(pressed).display).toBe('none');
    await userEvent.click(canvas.getByRole('button', {name: 'Favorite'}));
    await expect(getComputedStyle(unpressed).display).toBe('none');
    await expect(getComputedStyle(pressed).display).not.toBe('none');
  },
};

export const Small: Story = {args: {size: 'sm', icon: 'check'}};

export const Large: Story = {args: {size: 'lg', icon: 'check'}};

/** Resting shadow for a floating toggle. */
export const Elevated: Story = {args: {label: 'Pin', icon: 'check', elevation: 'high'}};

export const Disabled: Story = {
  args: {isDisabled: true},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('button', {name: 'Bold'})).toBeDisabled();
  },
};

/** A tooltip keeps a disabled toggle focusable (aria-disabled); it still never toggles. */
export const DisabledWithTooltip: Story = {
  args: {isDisabled: true, tooltip: 'Formatting is locked in this document'},
  parameters: {layout: 'centered'},
  play: async ({canvas, canvasElement}) => {
    const toggle = canvas.getByRole('button', {name: 'Bold'});
    const changes = recordEvents(canvasElement, 'astryx-pressed-change');
    await expect(toggle).toHaveAttribute('aria-disabled', 'true');
    await userEvent.tab();
    await expect(toggle).toHaveFocus();
    await userEvent.keyboard(' ');
    toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(changes).toHaveLength(0);
  },
};

/** Loading is always interruptible: busy, with a spinner, but it still toggles. */
export const Loading: Story = {
  args: {label: 'Sync', icon: 'arrowsUpDown', isLoading: true},
  play: async ({canvas}) => {
    const toggle = canvas.getByRole('button', {name: 'Sync'});
    await expect(toggle).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  },
};

/** Shown above on hover and keyboard focus. */
export const WithTooltip: Story = {
  args: {label: 'Bold', icon: 'check', isIconOnly: true, tooltip: 'Bold (Ctrl+B)'},
  parameters: {layout: 'centered'},
  play: async ({canvas, canvasElement}) => {
    const toggle = canvas.getByRole('button', {name: 'Bold'});
    await expect(toggle).toHaveAccessibleDescription('Bold (Ctrl+B)');
    await userEvent.hover(toggle);
    await waitFor(() => expect(isShowing(canvasElement.querySelector('[role="tooltip"]'))).toBe(true));
  },
};

const groupOptions = {controls: ['type', 'value', 'orientation', 'size', 'isDisabled', 'members'], source: groupSource};

/**
 * ToggleButtonGroup, single selection: a click selects, another switches, re-clicking the active
 * member deselects (`value` null); the group dispatches `astryx-change` `{value}` (cancelable),
 * members dispatch nothing of their own; the `value` property gets and sets the selection.
 */
export const GroupSingle = composed(ToggleButtonGroupStory, {
  play: async ({canvas, canvasElement, step}) => {
    const group = canvas.getByRole('group', {name: 'View mode'}) as Group;
    const changes = recordEvents<{value: string | null}>(canvasElement, 'astryx-change');
    const pressed = recordEvents(canvasElement, 'astryx-pressed-change');
    const member = (name: string) => canvas.getByRole('button', {name});

    await step('The group value is pressed', async () => {
      await expect(member('Grid')).toHaveAttribute('aria-pressed', 'true');
      await expect(member('List')).toHaveAttribute('aria-pressed', 'false');
    });

    await step('Selecting another member switches; re-clicking it deselects', async () => {
      await userEvent.click(member('List'));
      await expect(member('List')).toHaveAttribute('aria-pressed', 'true');
      await expect(member('Grid')).toHaveAttribute('aria-pressed', 'false');
      await userEvent.click(member('List'));
      await expect(member('List')).toHaveAttribute('aria-pressed', 'false');
      await expect(changes.map((e) => e.detail.value)).toEqual(['list', null]);
      await expect(pressed).toHaveLength(0);
    });

    await step('The value property sets the selection', async () => {
      group.value = 'board';
      await expect(member('Board')).toHaveAttribute('aria-pressed', 'true');
      await expect(group.value).toBe('board');
    });

    await step('preventDefault() on astryx-change keeps the selection', async () => {
      group.addEventListener('astryx-change', (event) => event.preventDefault(), {once: true});
      await userEvent.click(member('Grid'));
      await expect(member('Grid')).toHaveAttribute('aria-pressed', 'false');
      await expect(member('Board')).toHaveAttribute('aria-pressed', 'true');
    });
  },
}, groupOptions);

/** Multiple selection: each click adds or removes its value; members follow the group size unless they set their own. */
export const GroupMultiple = composed(ToggleButtonGroupStory, {
  args: {type: 'multiple', size: 'sm', members: 'formatting'},
  play: async ({canvas, canvasElement}) => {
    const group = canvas.getByRole('group', {name: 'Formatting'}) as Group;
    const changes = recordEvents<{value: string[]}>(canvasElement, 'astryx-change');
    await expect(canvas.getByRole('button', {name: 'Bold'})).toHaveAttribute('data-size', 'sm');
    await expect(canvas.getByRole('button', {name: 'Code'})).toHaveAttribute('data-size', 'lg');
    await userEvent.click(canvas.getByRole('button', {name: 'Italic'}));
    await userEvent.click(canvas.getByRole('button', {name: 'Bold'}));
    await expect(changes.map((e) => e.detail.value)).toEqual([['bold', 'underline', 'italic'], ['underline', 'italic']]);
    await expect(group.value).toEqual(['underline', 'italic']);
  },
}, groupOptions);

/** Vertical, large, icon-only members. */
export const GroupVertical = composed(ToggleButtonGroupStory, {args: {orientation: 'vertical', size: 'lg', members: 'tools'}}, groupOptions);

/** A disabled group disables every member (aria-disabled for the one with a tooltip); nothing changes. */
export const GroupDisabled = composed(ToggleButtonGroupStory, {
  args: {isDisabled: true, members: 'alignment'},
  play: async ({canvas, canvasElement}) => {
    const changes = recordEvents(canvasElement, 'astryx-change');
    await expect(canvas.getByRole('button', {name: 'Start'})).toBeDisabled();
    await expect(canvas.getByRole('button', {name: 'End'})).toBeDisabled();
    const center = canvas.getByRole('button', {name: 'Center'});
    await expect(center).toHaveAttribute('aria-disabled', 'true');
    const onClick = fn();
    center.addEventListener('click', onClick);
    center.focus();
    await userEvent.keyboard('{Enter}');
    center.click();
    await expect(onClick).not.toHaveBeenCalled();
    await expect(changes).toHaveLength(0);
    await expect(center).toHaveAttribute('aria-pressed', 'false');
  },
}, groupOptions);
