import DropdownMenu from 'astryx-astro/components/DropdownMenu/DropdownMenu.astro';
import Demo from 'astryx-astro/components/DropdownMenu/DropdownMenu.demo.astro';
import demoSource from 'astryx-astro/components/DropdownMenu/DropdownMenu.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import DropdownMenuCompound from './DropdownMenuCompound.astro';
import compoundSource from './DropdownMenuCompound.astro?raw';

const actions = [
  {id: 'edit', label: 'Edit', icon: 'wrench', description: 'Rename or move'},
  {id: 'duplicate', label: 'Duplicate', icon: 'copy'},
  {id: 'archive', label: 'Archive', isDisabled: true},
  {type: 'divider'},
  {id: 'delete', label: 'Delete', icon: 'close', variant: 'destructive'},
];

const meta = {
  title: 'Action/Dropdown Menu',
  component: DropdownMenu,
  ...astryx('DropdownMenu'),
  args: {button: {label: 'Actions'}, items: actions},
} satisfies Meta;
export default meta;

/** Every example from the docs page (DropdownMenu.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/**
 * Data-driven rows. Keyboard: Enter opens on the first row, arrows move (disabled rows are
 * skipped), Enter activates and closes, focus returns to the trigger; Escape closes.
 */
export const Default: Story = {
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-menu');
    const trigger = canvas.getByRole('button', {name: 'Actions'});
    const layer = canvasElement.querySelector('ax-menu [popover]') ?? canvasElement.querySelector('[popover]');
    const selected = recordEvents<{event: Event}>(canvasElement, 'astryx-select');

    await step('Enter opens the menu on the first row', async () => {
      trigger.focus();
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await waitFor(() => expect(canvas.getByRole('menuitem', {name: /Edit/})).toHaveFocus());
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });

    await step('ArrowDown moves to the next row; Enter activates it and closes', async () => {
      await userEvent.keyboard('{ArrowDown}');
      await expect(canvas.getByRole('menuitem', {name: 'Duplicate'})).toHaveFocus();
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await expect(selected.map((e) => (e.target as HTMLElement).dataset.id)).toEqual(['duplicate']);
      await expect(trigger).toHaveFocus();
    });

    await step('Escape closes and returns focus', async () => {
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await expect(trigger).toHaveFocus();
    });
  },
};

export const PrimaryTrigger: Story = {args: {button: {label: 'Create', variant: 'primary', icon: 'upload'}}};

export const IconOnlyTrigger: Story = {args: {button: {label: 'More actions', icon: 'moreHorizontal', isIconOnly: true}, hasChevron: false}};

export const SmallSize: Story = {args: {button: {label: 'Actions', size: 'sm'}}};

export const PlacementAbove: Story = {args: {placement: 'above'}, parameters: {layout: 'centered'}};

export const AlignEnd: Story = {args: {alignment: 'end'}, parameters: {layout: 'centered'}};

/**
 * Rendered open (`isMenuOpen`): the menu is in the top layer from the start. Docs show it in its
 * own frame so it cannot cover the page.
 */
export const Open: Story = {
  args: {isMenuOpen: true},
  parameters: {layout: 'padded', docs: {story: {inline: false, height: '320px'}}},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-menu');
    await expect(isShowing(canvasElement.querySelector('[popover]'))).toBe(true);
  },
};

/** Compound rows: checkbox rows, a radio group, a group with a sub-menu (a story wrapper). */
export const CompoundRows = composed(DropdownMenuCompound, {
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-menu');
    const changes = recordEvents<{value: unknown}>(canvasElement, 'astryx-change');
    await step('A checkbox row toggles and keeps the menu open', async () => {
      await userEvent.click(canvas.getByRole('button', {name: 'View'}));
      const rulers = await canvas.findByRole('menuitemcheckbox', {name: 'Show rulers'});
      await expect(rulers).toHaveAttribute('aria-checked', 'false');
      await userEvent.click(rulers);
      await expect(rulers).toHaveAttribute('aria-checked', 'true');
      await expect(changes.at(-1)?.detail.value).toBe(true);
      await expect(isShowing(canvasElement.querySelector('[popover]'))).toBe(true);
    });
    await step('A radio row selects and closes the menu', async () => {
      await userEvent.click(canvas.getByRole('menuitemradio', {name: 'Oldest first'}));
      await expect(changes.at(-1)?.detail.value).toBe('oldest');
      await waitFor(() => expect(isShowing(canvasElement.querySelector('[popover]'))).toBe(false));
    });
  },
}, {controls: ['placement', 'isMenuOpen'], source: compoundSource});
