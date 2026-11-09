import MoreMenu from 'astryx-astro/components/MoreMenu/MoreMenu.astro';
import Demo from 'astryx-astro/components/MoreMenu/MoreMenu.demo.astro';
import demoSource from 'astryx-astro/components/MoreMenu/MoreMenu.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import MoreMenuMatrix from './MoreMenuMatrix.astro';
import matrixSource from './MoreMenuMatrix.astro?raw';
import MoreMenuToolbar from './MoreMenuToolbar.astro';
import toolbarSource from './MoreMenuToolbar.astro?raw';

const items = [
  {label: 'Edit', icon: 'wrench', id: 'edit'},
  {label: 'Duplicate', icon: 'copy', id: 'duplicate'},
  {type: 'divider'},
  {type: 'section', title: 'Danger zone', items: [{label: 'Delete', variant: 'destructive', id: 'delete'}]},
];

const meta = {
  title: 'Action/More Menu',
  component: MoreMenu,
  ...astryx('MoreMenu'),
  args: {items},
} satisfies Meta;
export default meta;

/** Every example from the docs page (MoreMenu.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const layerOf = (root: HTMLElement) => root.querySelector<HTMLElement>('ax-menu')!;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The icon-only trigger is named by its label ("More options", also its tooltip, which does not
 * describe it). Keyboard: Enter opens on the first row, arrows move, Enter activates and closes,
 * focus returns; a click opens, Escape closes.
 */
export const Default: Story = {
  play: async ({canvas, canvasElement, step}) => {
    const trigger = canvas.getByRole('button', {name: 'More options'});
    const layer = layerOf(canvasElement);
    const selected = recordEvents(canvasElement, 'astryx-select');
    await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    await expect(trigger).not.toHaveAttribute('aria-describedby');

    await step('Enter opens the menu on its first row', async () => {
      trigger.focus();
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await expect(canvas.getByRole('menu', {name: 'More options'})).toBeInTheDocument();
      await waitFor(() => expect(canvas.getByRole('menuitem', {name: 'Edit'})).toHaveFocus());
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });

    await step('ArrowDown moves; Enter activates the row, closes and returns focus', async () => {
      await userEvent.keyboard('{ArrowDown}');
      await expect(canvas.getByRole('menuitem', {name: 'Duplicate'})).toHaveFocus();
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await expect(selected.map((e) => (e.target as HTMLElement).dataset.id)).toEqual(['duplicate']);
      await expect(trigger).toHaveFocus();
    });

    await step('A click opens it; the section is a named group; Escape closes', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await expect(canvas.getByRole('group', {name: 'Danger zone'})).toContainElement(canvas.getByRole('menuitem', {name: 'Delete'}));
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await expect(trigger).toHaveFocus();
    });
  },
};

/** Every size × variant, a custom icon and the disabled trigger. */
export const Matrix = composed(MoreMenuMatrix, {}, {source: matrixSource});

/** `alignment="end"`: the menu's end edge lines up with the trigger's (card headers, row ends). */
export const AlignEnd: Story = {
  args: {alignment: 'end'},
  parameters: {layout: 'centered'},
  play: async ({canvas, canvasElement}) => {
    const trigger = canvas.getByRole('button', {name: 'More options'});
    const layer = layerOf(canvasElement);
    await userEvent.click(trigger);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    const menu = canvas.getByRole('menu');
    await waitFor(() => {
      const t = trigger.getBoundingClientRect();
      const m = menu.getBoundingClientRect();
      // Where the viewport leaves room toward the start; otherwise it shifts to stay on screen.
      if (t.right >= m.width) expect(Math.abs(m.right - t.right)).toBeLessThanOrEqual(2);
      else expect(m.left).toBeGreaterThanOrEqual(0);
    });
    await userEvent.keyboard('{Escape}');
  },
};

export const PlacementAbove: Story = {args: {placement: 'above'}, parameters: {layout: 'centered'}};

/** A custom `label` (aria-label and tooltip) and `icon`. */
export const CustomLabelAndIcon: Story = {
  args: {label: 'Row actions', icon: 'menu', variant: 'secondary'},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('button', {name: 'Row actions'})).toBeInTheDocument();
  },
};

/** `isDisabled`: aria-disabled (it keeps its tooltip); click, Enter and ArrowDown open nothing. */
export const Disabled: Story = {
  args: {isDisabled: true},
  play: async ({canvas, canvasElement}) => {
    const trigger = canvas.getByRole('button', {name: 'More options'});
    const layer = layerOf(canvasElement);
    await expect(trigger).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(trigger);
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{ArrowDown}');
    await sleep(300);
    await expect(isShowing(layer)).toBe(false);
  },
};

/** Rendered open (`isMenuOpen`); docs show it in its own frame. */
export const Open: Story = {
  args: {isMenuOpen: true},
  parameters: {docs: {story: {inline: false, height: '260px'}}},
  play: async ({canvasElement}) => {
    await waitFor(() => expect(isShowing(layerOf(canvasElement))).toBe(true));
  },
};

/** In a small Toolbar: without its own `size` the trigger and its rows take the toolbar's. */
export const InToolbar = composed(MoreMenuToolbar, {
  play: async ({canvas, canvasElement}) => {
    const trigger = canvas.getByRole('button', {name: 'Table options'});
    await userEvent.click(trigger);
    await waitFor(() => expect(isShowing(layerOf(canvasElement))).toBe(true));
    await expect(canvas.getByRole('menuitem', {name: 'Export as CSV'})).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
  },
}, {source: toolbarSource});
